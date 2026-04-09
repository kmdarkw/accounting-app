"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
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
import {
  ACCOUNT_GROUP_ID,
  CLIENT_EXPENSE_GROUP_ID,
  COMPANY_EXPENSE_GROUP_ID,
} from "@/app/lib/category-groups";
import { writeAuditLog } from "@/app/lib/audit";
import { formatCurrencyKwd, formatGregorianDate } from "@/app/lib/formatters";
import { ensureUserProfile } from "@/app/lib/users";
import type { AppUserRole } from "@/app/lib/users";

type ExpenseScope = "company" | "customer";

type CustomerOption = {
  id: string;
  name: string;
  contractNumber: string;
  contractTypeCategoryId: string;
  contractTypeCategoryName: string;
};

type CategoryOption = {
  id: string;
  name: string;
  groupId: string;
};

type ContractTypeExpenseTemplate = {
  contractTypeCategoryId: string;
  expenseCategoryId: string;
};

type ExpenseFormState = {
  scope: ExpenseScope;
  customerId: string;
  amount: string;
  expenseCategoryId: string;
  accountCategoryId: string;
  date: string;
  notes: string;
  overrideOutsideTemplate: boolean;
  outsideTemplateReason: string;
};

const initialExpenseForm: ExpenseFormState = {
  scope: "company",
  customerId: "",
  amount: "",
  expenseCategoryId: "",
  accountCategoryId: "",
  date: new Date().toISOString().slice(0, 10),
  notes: "",
  overrideOutsideTemplate: false,
  outsideTemplateReason: "",
};

export default function ExpensesPage() {
  const [form, setForm] = useState(initialExpenseForm);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [templates, setTemplates] = useState<ContractTypeExpenseTemplate[]>([]);
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
    const unsubscribe = onSnapshot(collection(db, "customers"), (snapshot) => {
      const nextCustomers = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as {
            name?: string;
            contractNumber?: string;
            contractTypeCategoryId?: string;
            contractTypeCategoryName?: string;
          };
          if (!data.name) {
            return null;
          }

          return {
            id: docItem.id,
            name: data.name,
            contractNumber: data.contractNumber ?? "",
            contractTypeCategoryId: data.contractTypeCategoryId ?? "",
            contractTypeCategoryName: data.contractTypeCategoryName ?? "",
          } satisfies CustomerOption;
        })
        .filter((item): item is CustomerOption => item !== null);

      setCustomers(nextCustomers);
    });

    return () => unsubscribe();
  }, []);

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
          } satisfies CategoryOption;
        })
        .filter((item): item is CategoryOption => item !== null);

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
          } satisfies ContractTypeExpenseTemplate;
        })
        .filter((item): item is ContractTypeExpenseTemplate => item !== null);

      setTemplates(nextTemplates);
    });

    return () => unsubscribe();
  }, []);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.groupId === CLIENT_EXPENSE_GROUP_ID),
    [categories],
  );

  const companyExpenseCategories = useMemo(
    () => categories.filter((category) => category.groupId === COMPANY_EXPENSE_GROUP_ID),
    [categories],
  );

  const accountCategories = useMemo(
    () => categories.filter((category) => category.groupId === ACCOUNT_GROUP_ID),
    [categories],
  );
  const isSuperAdmin = currentUserRole === "super_admin";

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === form.customerId),
    [customers, form.customerId],
  );

  const hasTemplateForSelectedCustomerContractType = useMemo(() => {
    if (!selectedCustomer?.contractTypeCategoryId) {
      return false;
    }

    return templates.some(
      (template) =>
        template.contractTypeCategoryId === selectedCustomer.contractTypeCategoryId,
    );
  }, [selectedCustomer, templates]);

  const allowedExpenseCategoryIdsForSelectedCustomer = useMemo(() => {
    if (!selectedCustomer?.contractTypeCategoryId) {
      return [];
    }

    return templates
      .filter(
        (template) =>
          template.contractTypeCategoryId === selectedCustomer.contractTypeCategoryId,
      )
      .map((template) => template.expenseCategoryId);
  }, [selectedCustomer, templates]);

  const customerScopeExpenseCategories = useMemo(() => {
    if (!selectedCustomer?.contractTypeCategoryId) {
      return isSuperAdmin ? expenseCategories : [];
    }

    if (!hasTemplateForSelectedCustomerContractType) {
      return isSuperAdmin ? expenseCategories : [];
    }

    if (!allowedExpenseCategoryIdsForSelectedCustomer.length) {
      return isSuperAdmin ? expenseCategories : [];
    }

    if (!hasTemplateForSelectedCustomerContractType) {
      return expenseCategories;
    }

    const allowedIds = new Set(allowedExpenseCategoryIdsForSelectedCustomer);
    return expenseCategories.filter((category) => allowedIds.has(category.id));
  }, [
    isSuperAdmin,
    allowedExpenseCategoryIdsForSelectedCustomer,
    expenseCategories,
    hasTemplateForSelectedCustomerContractType,
    selectedCustomer?.contractTypeCategoryId,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("يرجى إدخال قيمة صحيحة أكبر من صفر.");
      return;
    }

    if (!form.accountCategoryId.trim() || !form.date.trim()) {
      setError("يرجى تعبئة الحقول الإلزامية قبل الحفظ.");
      return;
    }

    const selectedAccountCategory = accountCategories.find(
      (item) => item.id === form.accountCategoryId,
    );
    if (!selectedAccountCategory) {
      setError("الحساب المختار غير صالح.");
      return;
    }

    let selectedCustomer: CustomerOption | undefined;
    let selectedExpenseCategory: CategoryOption | undefined;
    let selectedCompanyExpenseCategory: CategoryOption | undefined;
    let isOutsideTemplate = false;
    let outsideTemplateReason = "";
    let isRepeatedExpense = false;
    let repeatIndex = 1;

    if (form.scope === "customer") {
      if (!form.customerId.trim() || !form.expenseCategoryId.trim()) {
        setError("عند الصرف على عميل يجب اختيار العميل وتصنيف المصروف.");
        return;
      }

      selectedCustomer = customers.find((item) => item.id === form.customerId);
      selectedExpenseCategory = customerScopeExpenseCategories.find(
        (item) => item.id === form.expenseCategoryId,
      );

      if (!selectedCustomer || !selectedExpenseCategory) {
        setError("اختيارات العميل أو تصنيف المصروف غير صالحة.");
        return;
      }

      const categoryInTemplate = allowedExpenseCategoryIdsForSelectedCustomer.includes(
        selectedExpenseCategory.id,
      );

      isOutsideTemplate =
        !selectedCustomer.contractTypeCategoryId ||
        !hasTemplateForSelectedCustomerContractType ||
        !categoryInTemplate;

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

      const repeatedExpenseQuery = query(
        collection(db, "expenses"),
        where("scope", "==", "customer"),
        where("customerId", "==", selectedCustomer.id),
        where("expenseCategoryId", "==", selectedExpenseCategory.id),
      );
      const repeatedExpenseSnapshot = await getDocs(repeatedExpenseQuery);
      isRepeatedExpense = !repeatedExpenseSnapshot.empty;
      repeatIndex = repeatedExpenseSnapshot.size + 1;
    } else {
      if (!form.expenseCategoryId.trim()) {
        setError("عند الصرف العام يجب اختيار تصنيف مصروفات الشركة.");
        return;
      }

      selectedCompanyExpenseCategory = companyExpenseCategories.find(
        (item) => item.id === form.expenseCategoryId,
      );
      if (!selectedCompanyExpenseCategory) {
        setError("تصنيف مصروفات الشركة غير صالح.");
        return;
      }
    }

    try {
      setIsSaving(true);
      const expenseRef = await addDoc(collection(db, "expenses"), {
        scope: form.scope,
        amount,
        accountCategoryId: selectedAccountCategory.id,
        accountCategoryName: selectedAccountCategory.name,
        date: form.date,
        notes: form.notes.trim(),
        customerId: selectedCustomer?.id ?? "",
        customerName: selectedCustomer?.name ?? "",
        customerContractNumber: selectedCustomer?.contractNumber ?? "",
        expenseCategoryId:
          selectedExpenseCategory?.id ?? selectedCompanyExpenseCategory?.id ?? "",
        expenseCategoryName:
          selectedExpenseCategory?.name ?? selectedCompanyExpenseCategory?.name ?? "",
        isOutsideTemplate,
        outsideTemplateReason: isOutsideTemplate ? outsideTemplateReason : "",
        isRepeatedExpense: form.scope === "customer" ? isRepeatedExpense : false,
        repeatIndex: form.scope === "customer" ? repeatIndex : 1,
        createdByUid: auth.currentUser?.uid ?? "",
        createdByEmail: auth.currentUser?.email ?? "",
        updatedByUid: auth.currentUser?.uid ?? "",
        updatedByEmail: auth.currentUser?.email ?? "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      void writeAuditLog({
        action: "create",
        entity: "expense",
        entityId: expenseRef.id,
        details: {
          scope: form.scope,
          amount,
          customerId: selectedCustomer?.id ?? "",
          expenseCategoryId:
            selectedExpenseCategory?.id ?? selectedCompanyExpenseCategory?.id ?? "",
          isOutsideTemplate,
          isRepeatedExpense,
          repeatIndex,
        },
      });

      if (form.scope === "customer" && selectedCustomer && selectedExpenseCategory) {
        const expectedExpenseQuery = query(
          collection(db, "customerExpectedExpenses"),
          where("customerId", "==", selectedCustomer.id),
          where("expenseCategoryId", "==", selectedExpenseCategory.id),
          limit(1),
        );
        const expectedExpenseSnapshot = await getDocs(expectedExpenseQuery);

        if (!expectedExpenseSnapshot.empty) {
          const expectedExpenseDoc = expectedExpenseSnapshot.docs[0];
          await updateDoc(doc(db, "customerExpectedExpenses", expectedExpenseDoc.id), {
            status: "recorded",
            totalSpentAmount: increment(amount),
            lastExpenseDate: form.date,
            updatedByUid: auth.currentUser?.uid ?? "",
            updatedByEmail: auth.currentUser?.email ?? "",
            updatedAt: serverTimestamp(),
          });
        } else {
          await addDoc(collection(db, "customerExpectedExpenses"), {
            customerId: selectedCustomer.id,
            customerName: selectedCustomer.name,
            customerContractNumber: selectedCustomer.contractNumber,
            contractTypeCategoryId: selectedCustomer.contractTypeCategoryId,
            contractTypeCategoryName: selectedCustomer.contractTypeCategoryName,
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
      }

      setForm((prev) => ({
        ...initialExpenseForm,
        date: prev.date,
      }));
      const flags = [
        isOutsideTemplate ? "خارج القالب" : "",
        isRepeatedExpense ? "مكرر" : "",
      ].filter(Boolean);
      setSuccess(
        flags.length
          ? `تم تسجيل المصروف بنجاح (${flags.join(" - ")}).`
          : "تم تسجيل المصروف بنجاح.",
      );
    } catch {
      setError("تعذر حفظ المصروف حالياً. حاول مرة أخرى.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">تسجيل مصروف</h1>
        <p className="mt-1 text-sm text-slate-500">
          اختر نوع المصروف (عام للشركة أو عن عميل) ثم أكمل بيانات الصرف.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium text-slate-700">نوع المصروف</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    scope: "company",
                    customerId: "",
                    expenseCategoryId: "",
                    overrideOutsideTemplate: false,
                    outsideTemplateReason: "",
                  }))
                }
                className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                  form.scope === "company"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                عام للشركة
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    scope: "customer",
                    expenseCategoryId: "",
                    overrideOutsideTemplate: false,
                    outsideTemplateReason: "",
                  }))
                }
                className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                  form.scope === "customer"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                عن عميل
              </button>
            </div>
          </div>

          {form.scope === "customer" ? (
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">العميل</span>
              <select
                value={form.customerId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, customerId: event.target.value }))
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
              >
                <option value="">اختر العميل</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">القيمة (KWD)</span>
            <input
              type="number"
              min="0"
              step="0.001"
              value={form.amount}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, amount: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
              placeholder="0.000"
            />
          </label>

          {form.scope === "customer" ? (
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">
                سبب الصرف (تصنيف المصروفات)
              </span>
              <select
                value={form.expenseCategoryId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    expenseCategoryId: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
              >
                <option value="">اختر تصنيف المصروف</option>
                {customerScopeExpenseCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {form.scope === "customer" &&
          !isSuperAdmin &&
          !hasTemplateForSelectedCustomerContractType &&
          !customerScopeExpenseCategories.length ? (
            <p className="md:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              نوع عقد هذا العميل لا يحتوي على قالب مصروفات. لا يمكن التسجيل إلا بعد إعداد القالب.
            </p>
          ) : null}

          {form.scope === "customer" && isSuperAdmin ? (
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

          {form.scope === "company" ? (
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">
                سبب الصرف (تصنيف مصروفات الشركة)
              </span>
              <select
                value={form.expenseCategoryId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    expenseCategoryId: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
              >
                <option value="">اختر تصنيف مصروفات الشركة</option>
                {companyExpenseCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">
              الحساب الذي تم الصرف منه
            </span>
            <select
              value={form.accountCategoryId}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  accountCategoryId: event.target.value,
                }))
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
              onChange={(event) =>
                setForm((prev) => ({ ...prev, date: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium text-slate-700">ملاحظة (اختياري)</span>
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, notes: event.target.value }))
              }
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
              placeholder="أي تفاصيل إضافية عن المصروف"
            />
          </label>

          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-70"
            >
              {isSaving ? "جاري الحفظ..." : "حفظ المصروف"}
            </button>

            {form.amount ? (
              <span className="text-sm text-slate-600">
                القيمة: {formatCurrencyKwd(Number(form.amount || 0))}
              </span>
            ) : null}
            {form.date ? (
              <span className="text-sm text-slate-600">
                التاريخ: {formatGregorianDate(form.date)}
              </span>
            ) : null}
          </div>
        </form>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
        {success ? <p className="mt-4 text-sm text-emerald-600">{success}</p> : null}
      </section>
    </div>
  );
}
