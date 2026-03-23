"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/app/lib/firebase";
import {
  ACCOUNT_GROUP_ID,
  CLIENT_EXPENSE_GROUP_ID,
  CLIENT_RECEIPT_GROUP_ID,
  COMPANY_EXPENSE_GROUP_ID,
} from "@/app/lib/category-groups";
import { formatCurrencyKwd, formatGregorianDate } from "@/app/lib/formatters";
import { writeAuditLog } from "@/app/lib/audit";

type Direction = "inflow" | "outflow";
type RelatedTo = "customer" | "company" | "external";
type ScheduleType = "one_time" | "monthly";

type CustomerOption = {
  id: string;
  name: string;
  contractNumber: string;
};

type CategoryOption = {
  id: string;
  name: string;
  groupId: string;
};

type ObligationItem = {
  id: string;
  direction: Direction;
  relatedTo: RelatedTo;
  title: string;
  customerName: string;
  partyName: string;
  dueDate: string;
  amount: number;
  categoryName: string;
  accountCategoryName: string;
  status: "pending" | "settled";
};

type ObligationFormState = {
  direction: Direction;
  relatedTo: RelatedTo;
  customerId: string;
  partyName: string;
  title: string;
  amount: string;
  startDate: string;
  scheduleType: ScheduleType;
  installmentsCount: string;
  categoryId: string;
  accountCategoryId: string;
  notes: string;
};

const initialFormState: ObligationFormState = {
  direction: "outflow",
  relatedTo: "company",
  customerId: "",
  partyName: "",
  title: "",
  amount: "",
  startDate: new Date().toISOString().slice(0, 10),
  scheduleType: "one_time",
  installmentsCount: "12",
  categoryId: "",
  accountCategoryId: "",
  notes: "",
};

function dateToIsoLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonths(dateString: string, months: number) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return dateToIsoLocal(date);
}

export default function ObligationsPage() {
  const [form, setForm] = useState(initialFormState);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [obligationItems, setObligationItems] = useState<ObligationItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "customers"), (snapshot) => {
      const nextCustomers = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as { name?: string; contractNumber?: string };
          if (!data.name) {
            return null;
          }

          return {
            id: docItem.id,
            name: data.name,
            contractNumber: data.contractNumber ?? "",
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
    const unsubscribe = onSnapshot(collection(db, "obligationItems"), (snapshot) => {
      const nextItems = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as {
            direction?: Direction;
            relatedTo?: RelatedTo;
            title?: string;
            customerName?: string;
            partyName?: string;
            dueDate?: string;
            amount?: number;
            categoryName?: string;
            accountCategoryName?: string;
            status?: "pending" | "settled";
          };

          if (!data.dueDate || typeof data.amount !== "number" || !data.direction) {
            return null;
          }

          return {
            id: docItem.id,
            direction: data.direction,
            relatedTo: data.relatedTo ?? "company",
            title: data.title ?? "",
            customerName: data.customerName ?? "",
            partyName: data.partyName ?? "",
            dueDate: data.dueDate,
            amount: data.amount,
            categoryName: data.categoryName ?? "",
            accountCategoryName: data.accountCategoryName ?? "",
            status: data.status ?? "pending",
          } satisfies ObligationItem;
        })
        .filter((item): item is ObligationItem => item !== null);

      setObligationItems(nextItems);
    });

    return () => unsubscribe();
  }, []);

  const receiptCategories = useMemo(
    () => categories.filter((item) => item.groupId === CLIENT_RECEIPT_GROUP_ID),
    [categories],
  );

  const clientExpenseCategories = useMemo(
    () => categories.filter((item) => item.groupId === CLIENT_EXPENSE_GROUP_ID),
    [categories],
  );

  const companyExpenseCategories = useMemo(
    () => categories.filter((item) => item.groupId === COMPANY_EXPENSE_GROUP_ID),
    [categories],
  );

  const accountCategories = useMemo(
    () => categories.filter((item) => item.groupId === ACCOUNT_GROUP_ID),
    [categories],
  );

  const todayString = dateToIsoLocal(new Date());
  const plus30String = addMonths(todayString, 1);
  const plus90String = addMonths(todayString, 3);

  const pendingItems = useMemo(
    () =>
      obligationItems
        .filter((item) => item.status === "pending")
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [obligationItems],
  );

  const cards = useMemo(() => {
    const dueIn30Outflow = pendingItems
      .filter(
        (item) =>
          item.direction === "outflow" &&
          item.dueDate >= todayString &&
          item.dueDate <= plus30String,
      )
      .reduce((sum, item) => sum + item.amount, 0);

    const dueIn30Inflow = pendingItems
      .filter(
        (item) =>
          item.direction === "inflow" &&
          item.dueDate >= todayString &&
          item.dueDate <= plus30String,
      )
      .reduce((sum, item) => sum + item.amount, 0);

    const inflow90 = pendingItems
      .filter(
        (item) =>
          item.direction === "inflow" &&
          item.dueDate >= todayString &&
          item.dueDate <= plus90String,
      )
      .reduce((sum, item) => sum + item.amount, 0);

    const outflow90 = pendingItems
      .filter(
        (item) =>
          item.direction === "outflow" &&
          item.dueDate >= todayString &&
          item.dueDate <= plus90String,
      )
      .reduce((sum, item) => sum + item.amount, 0);

    const overdueCount = pendingItems.filter((item) => item.dueDate < todayString).length;

    return {
      dueIn30Outflow,
      dueIn30Inflow,
      net90: inflow90 - outflow90,
      overdueCount,
    };
  }, [pendingItems, plus30String, plus90String, todayString]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const title = form.title.trim();
    const amount = Number(form.amount);
    const startDate = form.startDate.trim();
    const customerId = form.customerId.trim();
    const categoryId = form.categoryId.trim();
    const accountCategoryId = form.accountCategoryId.trim();
    const partyName = form.partyName.trim();

    if (!title || !Number.isFinite(amount) || amount <= 0 || !startDate) {
      setError("يرجى تعبئة عنوان الالتزام وتاريخه وقيمته بشكل صحيح.");
      return;
    }

    if (!categoryId || !accountCategoryId) {
      setError("يرجى اختيار التصنيف والحساب.");
      return;
    }

    if (form.relatedTo === "customer" && !customerId) {
      setError("يرجى اختيار العميل.");
      return;
    }

    if (form.relatedTo === "external" && !partyName) {
      setError("يرجى كتابة اسم الجهة الخارجية.");
      return;
    }

    const installmentsCount =
      form.scheduleType === "monthly" ? Number.parseInt(form.installmentsCount, 10) : 1;
    if (!Number.isInteger(installmentsCount) || installmentsCount < 1) {
      setError("عدد الدفعات غير صالح.");
      return;
    }

    const selectedCustomer = customers.find((item) => item.id === customerId);
    if (form.relatedTo === "customer" && !selectedCustomer) {
      setError("العميل المختار غير صالح.");
      return;
    }

    const selectedAccount = accountCategories.find((item) => item.id === accountCategoryId);
    if (!selectedAccount) {
      setError("الحساب المختار غير صالح.");
      return;
    }

    const availableCategories =
      form.direction === "inflow"
        ? receiptCategories
        : form.relatedTo === "customer"
          ? clientExpenseCategories
          : companyExpenseCategories;
    const selectedCategory = availableCategories.find((item) => item.id === categoryId);
    if (!selectedCategory) {
      setError("التصنيف المختار غير صالح.");
      return;
    }

    try {
      setIsSaving(true);

      const obligationRef = await addDoc(collection(db, "obligations"), {
        direction: form.direction,
        relatedTo: form.relatedTo,
        title,
        totalAmount: amount,
        scheduleType: form.scheduleType,
        installmentsCount,
        startDate,
        customerId: selectedCustomer?.id ?? "",
        customerName: selectedCustomer?.name ?? "",
        customerContractNumber: selectedCustomer?.contractNumber ?? "",
        partyName: form.relatedTo === "external" ? partyName : "",
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.name,
        accountCategoryId: selectedAccount.id,
        accountCategoryName: selectedAccount.name,
        notes: form.notes.trim(),
        status: "active",
        createdByUid: auth.currentUser?.uid ?? "",
        createdByEmail: auth.currentUser?.email ?? "",
        updatedByUid: auth.currentUser?.uid ?? "",
        updatedByEmail: auth.currentUser?.email ?? "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const totalMils = Math.round(amount * 1000);
      const eachInstallmentMils = Math.floor(totalMils / installmentsCount);
      const lastInstallmentAdjustment = totalMils - eachInstallmentMils * installmentsCount;

      const batch = writeBatch(db);
      const obligationItemsRef = collection(db, "obligationItems");

      for (let index = 0; index < installmentsCount; index += 1) {
        const itemMils =
          index === installmentsCount - 1
            ? eachInstallmentMils + lastInstallmentAdjustment
            : eachInstallmentMils;
        const itemAmount = itemMils / 1000;
        const dueDate =
          form.scheduleType === "monthly" ? addMonths(startDate, index) : startDate;

        const itemRef = doc(obligationItemsRef);
        batch.set(itemRef, {
          obligationId: obligationRef.id,
          direction: form.direction,
          relatedTo: form.relatedTo,
          title,
          customerId: selectedCustomer?.id ?? "",
          customerName: selectedCustomer?.name ?? "",
          customerContractNumber: selectedCustomer?.contractNumber ?? "",
          partyName: form.relatedTo === "external" ? partyName : "",
          categoryId: selectedCategory.id,
          categoryName: selectedCategory.name,
          accountCategoryId: selectedAccount.id,
          accountCategoryName: selectedAccount.name,
          dueDate,
          amount: itemAmount,
          installmentNumber: index + 1,
          installmentsCount,
          status: "pending",
          notes: form.notes.trim(),
          createdByUid: auth.currentUser?.uid ?? "",
          createdByEmail: auth.currentUser?.email ?? "",
          updatedByUid: auth.currentUser?.uid ?? "",
          updatedByEmail: auth.currentUser?.email ?? "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();

      void writeAuditLog({
        action: "create",
        entity: "obligation",
        entityId: obligationRef.id,
        details: {
          direction: form.direction,
          relatedTo: form.relatedTo,
          totalAmount: amount,
          installmentsCount,
        },
      });

      setForm((prev) => ({
        ...initialFormState,
        startDate: prev.startDate,
        direction: prev.direction,
      }));
      setSuccess("تمت جدولة الالتزام بنجاح.");
    } catch {
      setError("تعذر حفظ الالتزام حالياً. حاول مرة أخرى.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSettleItem(item: ObligationItem) {
    try {
      setUpdatingItemId(item.id);
      await updateDoc(doc(db, "obligationItems", item.id), {
        status: "settled",
        settledAt: serverTimestamp(),
        updatedByUid: auth.currentUser?.uid ?? "",
        updatedByEmail: auth.currentUser?.email ?? "",
        updatedAt: serverTimestamp(),
      });
      void writeAuditLog({
        action: "update",
        entity: "obligationItem",
        entityId: item.id,
        details: {
          status: "settled",
          direction: item.direction,
        },
      });
    } finally {
      setUpdatingItemId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">مستحق علينا خلال 30 يوم</p>
          <p className="mt-3 text-2xl font-bold text-rose-600">
            {formatCurrencyKwd(cards.dueIn30Outflow)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">مستحق لنا خلال 30 يوم</p>
          <p className="mt-3 text-2xl font-bold text-emerald-600">
            {formatCurrencyKwd(cards.dueIn30Inflow)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">صافي متوقع خلال 90 يوم</p>
          <p
            className={`mt-3 text-2xl font-bold ${
              cards.net90 >= 0 ? "text-blue-600" : "text-rose-600"
            }`}
          >
            {formatCurrencyKwd(cards.net90)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">التزامات متأخرة</p>
          <p className="mt-3 text-2xl font-bold text-amber-600">{cards.overdueCount}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">جدولة التزامات مستقبلية</h1>
        <p className="mt-1 text-sm text-slate-500">
          سجل الالتزامات المتوقعة على الشركة أو لها، مرة واحدة أو بدفعات شهرية.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">اتجاه الالتزام</span>
            <select
              value={form.direction}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  direction: event.target.value as Direction,
                  categoryId: "",
                }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="outflow">التزام علينا (مصروف مستقبلي)</option>
              <option value="inflow">التزام لنا (مقبوض مستقبلي)</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">مرتبط بـ</span>
            <select
              value={form.relatedTo}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  relatedTo: event.target.value as RelatedTo,
                  customerId: "",
                  partyName: "",
                  categoryId: "",
                }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="company">الشركة</option>
              <option value="customer">عميل</option>
              <option value="external">جهة خارجية</option>
            </select>
          </label>

          {form.relatedTo === "customer" ? (
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

          {form.relatedTo === "external" ? (
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">اسم الجهة الخارجية</span>
              <input
                type="text"
                value={form.partyName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, partyName: event.target.value }))
                }
                placeholder="مثال: شركة مقاولات"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
              />
            </label>
          ) : null}

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">عنوان الالتزام</span>
            <input
              type="text"
              value={form.title}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder="مثال: دفعات عقد استشاري"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">القيمة الإجمالية (KWD)</span>
            <input
              type="number"
              min="0"
              step="0.001"
              value={form.amount}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, amount: event.target.value }))
              }
              placeholder="0.000"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">نوع الجدولة</span>
            <select
              value={form.scheduleType}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  scheduleType: event.target.value as ScheduleType,
                }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="one_time">مرة واحدة</option>
              <option value="monthly">دفعات شهرية</option>
            </select>
          </label>

          {form.scheduleType === "monthly" ? (
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">عدد الدفعات الشهرية</span>
              <input
                type="number"
                min="1"
                step="1"
                value={form.installmentsCount}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    installmentsCount: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
              />
            </label>
          ) : null}

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">تاريخ أول استحقاق</span>
            <input
              type="date"
              value={form.startDate}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, startDate: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">التصنيف</span>
            <select
              value={form.categoryId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, categoryId: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="">اختر التصنيف</option>
              {(form.direction === "inflow"
                ? receiptCategories
                : form.relatedTo === "customer"
                  ? clientExpenseCategories
                  : companyExpenseCategories
              ).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">الحساب</span>
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

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium text-slate-700">ملاحظة (اختياري)</span>
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, notes: event.target.value }))
              }
              rows={3}
              placeholder="تفاصيل إضافية عن الالتزام"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
          </label>

          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-70"
            >
              {isSaving ? "جاري الحفظ..." : "حفظ الالتزام"}
            </button>
            {form.amount ? (
              <span className="text-sm text-slate-600">
                القيمة: {formatCurrencyKwd(Number(form.amount || 0))}
              </span>
            ) : null}
            {form.startDate ? (
              <span className="text-sm text-slate-600">
                أول استحقاق: {formatGregorianDate(form.startDate)}
              </span>
            ) : null}
          </div>
        </form>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
        {success ? <p className="mt-4 text-sm text-emerald-600">{success}</p> : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">الالتزامات القادمة</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-right">
            <thead className="bg-slate-50 text-sm text-slate-600">
              <tr>
                <th className="px-5 py-3 font-medium">الاستحقاق</th>
                <th className="px-5 py-3 font-medium">العنوان</th>
                <th className="px-5 py-3 font-medium">الجهة</th>
                <th className="px-5 py-3 font-medium">التصنيف</th>
                <th className="px-5 py-3 font-medium">الحساب</th>
                <th className="px-5 py-3 font-medium">الاتجاه</th>
                <th className="px-5 py-3 font-medium">المبلغ</th>
                <th className="px-5 py-3 font-medium">الإجراء</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-700">
              {pendingItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-6 text-center text-slate-500">
                    لا توجد التزامات معلقة حالياً.
                  </td>
                </tr>
              ) : (
                pendingItems.slice(0, 30).map((item) => {
                  const isOverdue = item.dueDate < todayString;
                  return (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span>{formatGregorianDate(item.dueDate)}</span>
                          {isOverdue ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                              متأخر
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-3">{item.title}</td>
                      <td className="px-5 py-3">
                        {item.customerName || item.partyName || "الشركة"}
                      </td>
                      <td className="px-5 py-3">{item.categoryName || "-"}</td>
                      <td className="px-5 py-3">{item.accountCategoryName || "-"}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            item.direction === "inflow"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {item.direction === "inflow" ? "مقبوض متوقع" : "مصروف متوقع"}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-semibold">{formatCurrencyKwd(item.amount)}</td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => handleSettleItem(item)}
                          disabled={updatingItemId === item.id}
                          className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-70"
                        >
                          {updatingItemId === item.id
                            ? "جاري التحديث..."
                            : item.direction === "inflow"
                              ? "تم التحصيل"
                              : "تم الصرف"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
