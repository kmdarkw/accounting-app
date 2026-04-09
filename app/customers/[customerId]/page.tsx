"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useParams } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/app/lib/firebase";
import { writeAuditLog } from "@/app/lib/audit";
import { formatCurrencyKwd, formatGregorianDate } from "@/app/lib/formatters";
import { ensureUserProfile } from "@/app/lib/users";
import type { AppUserRole } from "@/app/lib/users";
import {
  ACCOUNT_GROUP_ID,
  CLIENT_EXPENSE_GROUP_ID,
} from "@/app/lib/category-groups";

type CustomerItem = {
  id: string;
  name: string;
  contractNumber: string;
  phone: string;
  customerCategoryName: string;
  contractTypeCategoryId: string;
  contractTypeCategoryName: string;
};

type ReceiptItem = {
  id: string;
  date: string;
  amount: number;
  receiptCategoryName: string;
  accountCategoryName: string;
  notes: string;
};

type ExpenseItem = {
  id: string;
  date: string;
  amount: number;
  expenseCategoryName: string;
  accountCategoryName: string;
  notes: string;
  isOutsideTemplate: boolean;
  isRepeatedExpense: boolean;
  repeatIndex: number;
};

type CategoryItem = {
  id: string;
  name: string;
  groupId: string;
};

type TemplateItem = {
  contractTypeCategoryId: string;
  expenseCategoryId: string;
};

type ExpectedExpenseItem = {
  id: string;
  expenseCategoryId: string;
  expenseCategoryName: string;
  status: "pending" | "recorded";
  expectedFromContractType: boolean;
  totalSpentAmount: number;
  lastExpenseDate: string;
};

type NewExpenseForm = {
  amount: string;
  expenseCategoryId: string;
  accountCategoryId: string;
  date: string;
  notes: string;
  overrideOutsideTemplate: boolean;
  outsideTemplateReason: string;
};

const initialNewExpenseForm: NewExpenseForm = {
  amount: "",
  expenseCategoryId: "",
  accountCategoryId: "",
  date: new Date().toISOString().slice(0, 10),
  notes: "",
  overrideOutsideTemplate: false,
  outsideTemplateReason: "",
};

export default function CustomerDetailsPage() {
  const params = useParams<{ customerId: string }>();
  const customerId = params?.customerId ?? "";

  const [customer, setCustomer] = useState<CustomerItem | null>(null);
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(true);
  const [isCustomerMissing, setIsCustomerMissing] = useState(false);

  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [expectedExpenses, setExpectedExpenses] = useState<ExpectedExpenseItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);

  const [form, setForm] = useState(initialNewExpenseForm);
  const [currentUserRole, setCurrentUserRole] = useState<AppUserRole | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCurrentUserRole(null);
        return;
      }

      const profile = await ensureUserProfile(user);
      setCurrentUserRole(profile?.role ?? null);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!customerId) {
      setCustomer(null);
      setIsCustomerMissing(true);
      setIsLoadingCustomer(false);
      return;
    }

    const unsubscribe = onSnapshot(doc(db, "customers", customerId), (snapshot) => {
      if (!snapshot.exists()) {
        setCustomer(null);
        setIsCustomerMissing(true);
        setIsLoadingCustomer(false);
        return;
      }

      const data = snapshot.data() as {
        name?: string;
        contractNumber?: string;
        phone?: string;
        customerCategoryName?: string;
        contractTypeCategoryId?: string;
        contractTypeCategoryName?: string;
      };

      if (!data.name) {
        setCustomer(null);
        setIsCustomerMissing(true);
        setIsLoadingCustomer(false);
        return;
      }

      setCustomer({
        id: snapshot.id,
        name: data.name,
        contractNumber: data.contractNumber ?? "-",
        phone: data.phone ?? "-",
        customerCategoryName: data.customerCategoryName ?? "-",
        contractTypeCategoryId: data.contractTypeCategoryId ?? "",
        contractTypeCategoryName: data.contractTypeCategoryName ?? "-",
      });
      setIsCustomerMissing(false);
      setIsLoadingCustomer(false);
    });

    return () => unsubscribe();
  }, [customerId]);

  useEffect(() => {
    if (!customerId) {
      setReceipts([]);
      return;
    }

    const receiptsQuery = query(collection(db, "receipts"), where("customerId", "==", customerId));
    const unsubscribe = onSnapshot(receiptsQuery, (snapshot) => {
      const nextItems = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as {
            date?: string;
            amount?: number;
            receiptCategoryName?: string;
            accountCategoryName?: string;
            notes?: string;
          };
          if (!data.date || typeof data.amount !== "number") {
            return null;
          }

          return {
            id: docItem.id,
            date: data.date,
            amount: data.amount,
            receiptCategoryName: data.receiptCategoryName ?? "-",
            accountCategoryName: data.accountCategoryName ?? "-",
            notes: data.notes ?? "",
          } satisfies ReceiptItem;
        })
        .filter((item): item is ReceiptItem => item !== null)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setReceipts(nextItems);
    });

    return () => unsubscribe();
  }, [customerId]);

  useEffect(() => {
    if (!customerId) {
      setExpenses([]);
      return;
    }

    const expensesQuery = query(
      collection(db, "expenses"),
      where("scope", "==", "customer"),
      where("customerId", "==", customerId),
    );
    const unsubscribe = onSnapshot(expensesQuery, (snapshot) => {
      const nextItems = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as {
            date?: string;
            amount?: number;
            expenseCategoryName?: string;
            accountCategoryName?: string;
            notes?: string;
            isOutsideTemplate?: boolean;
            isRepeatedExpense?: boolean;
            repeatIndex?: number;
          };
          if (!data.date || typeof data.amount !== "number") {
            return null;
          }

          return {
            id: docItem.id,
            date: data.date,
            amount: data.amount,
            expenseCategoryName: data.expenseCategoryName ?? "-",
            accountCategoryName: data.accountCategoryName ?? "-",
            notes: data.notes ?? "",
            isOutsideTemplate: data.isOutsideTemplate ?? false,
            isRepeatedExpense: data.isRepeatedExpense ?? false,
            repeatIndex: data.repeatIndex ?? 1,
          } satisfies ExpenseItem;
        })
        .filter((item): item is ExpenseItem => item !== null)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setExpenses(nextItems);
    });

    return () => unsubscribe();
  }, [customerId]);

  useEffect(() => {
    if (!customerId) {
      setExpectedExpenses([]);
      return;
    }

    const expectedQuery = query(
      collection(db, "customerExpectedExpenses"),
      where("customerId", "==", customerId),
    );
    const unsubscribe = onSnapshot(expectedQuery, (snapshot) => {
      const nextItems = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as {
            expenseCategoryId?: string;
            expenseCategoryName?: string;
            status?: "pending" | "recorded";
            expectedFromContractType?: boolean;
            totalSpentAmount?: number;
            lastExpenseDate?: string;
          };
          if (!data.expenseCategoryId || !data.expenseCategoryName) {
            return null;
          }

          return {
            id: docItem.id,
            expenseCategoryId: data.expenseCategoryId,
            expenseCategoryName: data.expenseCategoryName,
            status: data.status === "recorded" ? "recorded" : "pending",
            expectedFromContractType: data.expectedFromContractType ?? false,
            totalSpentAmount: data.totalSpentAmount ?? 0,
            lastExpenseDate: data.lastExpenseDate ?? "",
          } satisfies ExpectedExpenseItem;
        })
        .filter((item): item is ExpectedExpenseItem => item !== null)
        .sort((a, b) => a.expenseCategoryName.localeCompare(b.expenseCategoryName, "ar"));

      setExpectedExpenses(nextItems);
    });

    return () => unsubscribe();
  }, [customerId]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "categories"), (snapshot) => {
      const nextCategories = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as { name?: string; groupId?: string };
          if (!data.name || !data.groupId) {
            return null;
          }

          return {
            id: docItem.id,
            name: data.name,
            groupId: data.groupId,
          } satisfies CategoryItem;
        })
        .filter((item): item is CategoryItem => item !== null);

      setCategories(nextCategories);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "contractTypeExpenseTemplates"), (snapshot) => {
      const nextTemplates = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as {
            contractTypeCategoryId?: string;
            expenseCategoryId?: string;
          };
          if (!data.contractTypeCategoryId || !data.expenseCategoryId) {
            return null;
          }

          return {
            contractTypeCategoryId: data.contractTypeCategoryId,
            expenseCategoryId: data.expenseCategoryId,
          } satisfies TemplateItem;
        })
        .filter((item): item is TemplateItem => item !== null);

      setTemplates(nextTemplates);
    });

    return () => unsubscribe();
  }, []);

  const isSuperAdmin = currentUserRole === "super_admin";
  const accountCategories = useMemo(
    () => categories.filter((category) => category.groupId === ACCOUNT_GROUP_ID),
    [categories],
  );
  const clientExpenseCategories = useMemo(
    () => categories.filter((category) => category.groupId === CLIENT_EXPENSE_GROUP_ID),
    [categories],
  );

  const allowedExpenseCategoryIds = useMemo(() => {
    if (!customer?.contractTypeCategoryId) {
      return [];
    }

    return templates
      .filter((item) => item.contractTypeCategoryId === customer.contractTypeCategoryId)
      .map((item) => item.expenseCategoryId);
  }, [customer?.contractTypeCategoryId, templates]);

  const hasTemplateForContractType = useMemo(
    () => allowedExpenseCategoryIds.length > 0,
    [allowedExpenseCategoryIds],
  );

  const selectableExpenseCategories = useMemo(() => {
    if (!customer?.contractTypeCategoryId) {
      return isSuperAdmin ? clientExpenseCategories : [];
    }

    if (!allowedExpenseCategoryIds.length) {
      return isSuperAdmin ? clientExpenseCategories : [];
    }

    const allowedIds = new Set(allowedExpenseCategoryIds);
    return clientExpenseCategories.filter((category) => allowedIds.has(category.id));
  }, [
    allowedExpenseCategoryIds,
    clientExpenseCategories,
    customer?.contractTypeCategoryId,
    isSuperAdmin,
  ]);

  const totalReceipts = useMemo(
    () => receipts.reduce((sum, item) => sum + item.amount, 0),
    [receipts],
  );
  const totalExpenses = useMemo(
    () => expenses.reduce((sum, item) => sum + item.amount, 0),
    [expenses],
  );
  const netAmount = totalReceipts - totalExpenses;

  async function handleSaveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!customer) {
      setError("تعذر تحديد بيانات العميل.");
      return;
    }

    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("يرجى إدخال قيمة صحيحة أكبر من صفر.");
      return;
    }

    if (!form.expenseCategoryId.trim() || !form.accountCategoryId.trim() || !form.date.trim()) {
      setError("يرجى تعبئة الحقول الإلزامية قبل الحفظ.");
      return;
    }

    const selectedExpenseCategory = selectableExpenseCategories.find(
      (item) => item.id === form.expenseCategoryId,
    );
    const selectedAccountCategory = accountCategories.find(
      (item) => item.id === form.accountCategoryId,
    );

    if (!selectedExpenseCategory || !selectedAccountCategory) {
      setError("تصنيف المصروف أو الحساب المختار غير صالح.");
      return;
    }

    const isInTemplate = allowedExpenseCategoryIds.includes(selectedExpenseCategory.id);
    const isOutsideTemplate =
      !customer.contractTypeCategoryId || !hasTemplateForContractType || !isInTemplate;

    let outsideTemplateReason = "";
    if (isOutsideTemplate) {
      if (!isSuperAdmin) {
        setError("غير مسموح تسجيل مصروف خارج القالب إلا للسوبر أدمن.");
        return;
      }

      if (!form.overrideOutsideTemplate) {
        setError("يرجى تفعيل خيار الاستثناء لتسجيل بند خارج القالب.");
        return;
      }

      outsideTemplateReason = form.outsideTemplateReason.trim();
      if (!outsideTemplateReason) {
        setError("يرجى كتابة سبب تسجيل المصروف خارج القالب.");
        return;
      }
    }

    try {
      setIsSaving(true);

      const repeatedExpenseQuery = query(
        collection(db, "expenses"),
        where("scope", "==", "customer"),
        where("customerId", "==", customer.id),
        where("expenseCategoryId", "==", selectedExpenseCategory.id),
      );
      const repeatedExpenseSnapshot = await getDocs(repeatedExpenseQuery);
      const isRepeatedExpense = !repeatedExpenseSnapshot.empty;
      const repeatIndex = repeatedExpenseSnapshot.size + 1;

      const expenseRef = await addDoc(collection(db, "expenses"), {
        scope: "customer",
        customerId: customer.id,
        customerName: customer.name,
        customerContractNumber: customer.contractNumber,
        amount,
        expenseCategoryId: selectedExpenseCategory.id,
        expenseCategoryName: selectedExpenseCategory.name,
        accountCategoryId: selectedAccountCategory.id,
        accountCategoryName: selectedAccountCategory.name,
        date: form.date,
        notes: form.notes.trim(),
        isOutsideTemplate,
        outsideTemplateReason: isOutsideTemplate ? outsideTemplateReason : "",
        isRepeatedExpense,
        repeatIndex,
        createdByUid: auth.currentUser?.uid ?? "",
        createdByEmail: auth.currentUser?.email ?? "",
        updatedByUid: auth.currentUser?.uid ?? "",
        updatedByEmail: auth.currentUser?.email ?? "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const expectedExpenseQuery = query(
        collection(db, "customerExpectedExpenses"),
        where("customerId", "==", customer.id),
        where("expenseCategoryId", "==", selectedExpenseCategory.id),
        limit(1),
      );
      const expectedExpenseSnapshot = await getDocs(expectedExpenseQuery);

      if (!expectedExpenseSnapshot.empty) {
        const expectedDoc = expectedExpenseSnapshot.docs[0];
        await updateDoc(doc(db, "customerExpectedExpenses", expectedDoc.id), {
          status: "recorded",
          totalSpentAmount: increment(amount),
          lastExpenseDate: form.date,
          updatedByUid: auth.currentUser?.uid ?? "",
          updatedByEmail: auth.currentUser?.email ?? "",
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "customerExpectedExpenses"), {
          customerId: customer.id,
          customerName: customer.name,
          customerContractNumber: customer.contractNumber,
          contractTypeCategoryId: customer.contractTypeCategoryId,
          contractTypeCategoryName: customer.contractTypeCategoryName,
          expenseCategoryId: selectedExpenseCategory.id,
          expenseCategoryName: selectedExpenseCategory.name,
          status: "recorded",
          expectedFromContractType: false,
          totalSpentAmount: amount,
          lastExpenseDate: form.date,
          createdByUid: auth.currentUser?.uid ?? "",
          createdByEmail: auth.currentUser?.email ?? "",
          updatedByUid: auth.currentUser?.uid ?? "",
          updatedByEmail: auth.currentUser?.email ?? "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      void writeAuditLog({
        action: "create",
        entity: "expense",
        entityId: expenseRef.id,
        details: {
          scope: "customer",
          customerId: customer.id,
          amount,
          expenseCategoryId: selectedExpenseCategory.id,
          isOutsideTemplate,
          isRepeatedExpense,
          repeatIndex,
        },
      });

      setForm((prev) => ({
        ...prev,
        amount: "",
        notes: "",
        overrideOutsideTemplate: false,
        outsideTemplateReason: "",
      }));

      setSuccess("تم تسجيل المصروف بنجاح من داخل بطاقة العميل.");
    } catch {
      setError("تعذر حفظ المصروف حالياً. حاول مرة أخرى.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoadingCustomer) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        جاري تحميل بيانات العميل...
      </section>
    );
  }

  if (isCustomerMissing || !customer) {
    return (
      <section className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <p className="text-sm text-amber-800">لم يتم العثور على العميل المطلوب.</p>
        <Link
          href="/customers"
          className="inline-flex rounded-xl border border-amber-300 px-3 py-2 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
        >
          الرجوع إلى العملاء
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{customer.name}</h1>
            <p className="mt-1 text-sm text-slate-500">بطاقة العميل: مراجعة كاملة + تسجيل مصروف جديد.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/customers"
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
            >
              كل العملاء
            </Link>
            <Link
              href={`/expenses?scope=customer&customerId=${customer.id}`}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
            >
              فتح شاشة المصروفات العامة
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">رقم العقد</p>
          <p className="mt-2 text-base font-semibold text-slate-900">{customer.contractNumber}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">تصنيف العميل</p>
          <p className="mt-2 text-base font-semibold text-slate-900">{customer.customerCategoryName}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">نوع العقد</p>
          <p className="mt-2 text-base font-semibold text-slate-900">{customer.contractTypeCategoryName}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">الهاتف</p>
          <p className="mt-2 text-base font-semibold text-slate-900">{customer.phone}</p>
        </article>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">إجمالي المقبوضات</p>
          <p className="mt-3 text-2xl font-bold text-emerald-600">{formatCurrencyKwd(totalReceipts)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">إجمالي المصروفات</p>
          <p className="mt-3 text-2xl font-bold text-rose-600">{formatCurrencyKwd(totalExpenses)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">صافي العميل</p>
          <p className={`mt-3 text-2xl font-bold ${netAmount >= 0 ? "text-blue-600" : "text-rose-600"}`}>
            {formatCurrencyKwd(netAmount)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">عدد قيود المصروف</p>
          <p className="mt-3 text-2xl font-bold text-slate-900">{expenses.length}</p>
        </article>
      </section>

      <section id="new-expense" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">قيد مصروف جديد لهذا العميل</h2>
        <p className="mt-1 text-sm text-slate-500">
          العميل مثبت تلقائياً. أضف القيد مباشرة بدون إعادة البحث عن الاسم.
        </p>

        <form onSubmit={handleSaveExpense} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">القيمة (KWD)</span>
            <input
              type="number"
              min="0"
              step="0.001"
              value={form.amount}
              onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
              placeholder="0.000"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">تصنيف مصروف العميل</span>
            <select
              value={form.expenseCategoryId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, expenseCategoryId: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="">اختر تصنيف المصروف</option>
              {selectableExpenseCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          {!isSuperAdmin &&
          customer.contractTypeCategoryId &&
          !hasTemplateForContractType &&
          !selectableExpenseCategories.length ? (
            <p className="md:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              نوع عقد هذا العميل لا يحتوي على قالب مصروفات. لا يمكن التسجيل إلا بعد إعداد القالب.
            </p>
          ) : null}

          {isSuperAdmin ? (
            <div className="md:col-span-2 space-y-2 rounded-xl border border-slate-200 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.overrideOutsideTemplate}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      overrideOutsideTemplate: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span>استثناء مدير النظام: السماح بالتسجيل خارج القالب</span>
              </label>

              {form.overrideOutsideTemplate ? (
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-slate-700">سبب الاستثناء</span>
                  <textarea
                    value={form.outsideTemplateReason}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        outsideTemplateReason: event.target.value,
                      }))
                    }
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                    placeholder="اذكر سبب تسجيل البند خارج القالب"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">الحساب الذي تم الصرف منه</span>
            <select
              value={form.accountCategoryId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, accountCategoryId: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="">اختر الحساب</option>
              {accountCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">التاريخ</span>
            <input
              type="date"
              value={form.date}
              onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium text-slate-700">ملاحظة (اختياري)</span>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
              placeholder="أي تفاصيل إضافية عن المصروف"
            />
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-70"
            >
              {isSaving ? "جاري الحفظ..." : "حفظ المصروف"}
            </button>
          </div>
        </form>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
        {success ? <p className="mt-4 text-sm text-emerald-600">{success}</p> : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">البنود المتوقعة لهذا العميل</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-right">
            <thead className="bg-slate-50 text-sm text-slate-600">
              <tr>
                <th className="px-5 py-3 font-medium">البند</th>
                <th className="px-5 py-3 font-medium">الحالة</th>
                <th className="px-5 py-3 font-medium">مصروف فعلي</th>
                <th className="px-5 py-3 font-medium">آخر تاريخ صرف</th>
                <th className="px-5 py-3 font-medium">المصدر</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-700">
              {!expectedExpenses.length ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-slate-500">
                    لا توجد بنود متوقعة مسجلة لهذا العميل.
                  </td>
                </tr>
              ) : (
                expectedExpenses.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-5 py-3">{item.expenseCategoryName}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          item.status === "recorded"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {item.status === "recorded" ? "تم الصرف" : "معلق"}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-semibold">
                      {formatCurrencyKwd(item.totalSpentAmount)}
                    </td>
                    <td className="px-5 py-3">
                      {item.lastExpenseDate ? formatGregorianDate(item.lastExpenseDate) : "-"}
                    </td>
                    <td className="px-5 py-3">
                      {item.expectedFromContractType ? "من قالب نوع العقد" : "إضافة فعلية"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">آخر مصروفات العميل</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-right">
            <thead className="bg-slate-50 text-sm text-slate-600">
              <tr>
                <th className="px-5 py-3 font-medium">التاريخ</th>
                <th className="px-5 py-3 font-medium">البند</th>
                <th className="px-5 py-3 font-medium">الحساب</th>
                <th className="px-5 py-3 font-medium">الوسوم</th>
                <th className="px-5 py-3 font-medium">المبلغ</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-700">
              {!expenses.length ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-slate-500">
                    لا توجد مصروفات مسجلة لهذا العميل.
                  </td>
                </tr>
              ) : (
                expenses.slice(0, 20).map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-5 py-3">{formatGregorianDate(item.date)}</td>
                    <td className="px-5 py-3">
                      <div>
                        <p>{item.expenseCategoryName}</p>
                        {item.notes ? <p className="mt-1 text-xs text-slate-500">{item.notes}</p> : null}
                      </div>
                    </td>
                    <td className="px-5 py-3">{item.accountCategoryName}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-2">
                        {item.isOutsideTemplate ? (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                            خارج القالب
                          </span>
                        ) : null}
                        {item.isRepeatedExpense || item.repeatIndex > 1 ? (
                          <span className="rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700">
                            مكرر #{item.repeatIndex}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-semibold">{formatCurrencyKwd(item.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">آخر مقبوضات العميل</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-right">
            <thead className="bg-slate-50 text-sm text-slate-600">
              <tr>
                <th className="px-5 py-3 font-medium">التاريخ</th>
                <th className="px-5 py-3 font-medium">البند</th>
                <th className="px-5 py-3 font-medium">الحساب</th>
                <th className="px-5 py-3 font-medium">المبلغ</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-700">
              {!receipts.length ? (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-slate-500">
                    لا توجد مقبوضات مسجلة لهذا العميل.
                  </td>
                </tr>
              ) : (
                receipts.slice(0, 20).map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-5 py-3">{formatGregorianDate(item.date)}</td>
                    <td className="px-5 py-3">
                      <div>
                        <p>{item.receiptCategoryName}</p>
                        {item.notes ? <p className="mt-1 text-xs text-slate-500">{item.notes}</p> : null}
                      </div>
                    </td>
                    <td className="px-5 py-3">{item.accountCategoryName}</td>
                    <td className="px-5 py-3 font-semibold text-emerald-700">
                      {formatCurrencyKwd(item.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
