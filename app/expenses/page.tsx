"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { addDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/app/lib/firebase";
import {
  ACCOUNT_GROUP_ID,
  CLIENT_EXPENSE_GROUP_ID,
  COMPANY_EXPENSE_GROUP_ID,
} from "@/app/lib/category-groups";
import { writeAuditLog } from "@/app/lib/audit";
import { formatCurrencyKwd, formatGregorianDate } from "@/app/lib/formatters";

type ExpenseScope = "company" | "customer";

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

type ExpenseFormState = {
  scope: ExpenseScope;
  customerId: string;
  amount: string;
  expenseCategoryId: string;
  accountCategoryId: string;
  date: string;
  notes: string;
};

const initialExpenseForm: ExpenseFormState = {
  scope: "company",
  customerId: "",
  amount: "",
  expenseCategoryId: "",
  accountCategoryId: "",
  date: new Date().toISOString().slice(0, 10),
  notes: "",
};

export default function ExpensesPage() {
  const [form, setForm] = useState(initialExpenseForm);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [isSaving, setIsSaving] = useState(false);
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

    if (form.scope === "customer") {
      if (!form.customerId.trim() || !form.expenseCategoryId.trim()) {
        setError("عند الصرف على عميل يجب اختيار العميل وتصنيف المصروف.");
        return;
      }

      selectedCustomer = customers.find((item) => item.id === form.customerId);
      selectedExpenseCategory = expenseCategories.find(
        (item) => item.id === form.expenseCategoryId,
      );

      if (!selectedCustomer || !selectedExpenseCategory) {
        setError("اختيارات العميل أو تصنيف المصروف غير صالحة.");
        return;
      }
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
        },
      });

      setForm((prev) => ({
        ...initialExpenseForm,
        date: prev.date,
      }));
      setSuccess("تم تسجيل المصروف بنجاح.");
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
                {expenseCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
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
