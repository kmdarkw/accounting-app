"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { addDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/app/lib/firebase";
import {
  ACCOUNT_GROUP_ID,
  CLIENT_RECEIPT_GROUP_ID,
} from "@/app/lib/category-groups";
import { writeAuditLog } from "@/app/lib/audit";
import { formatCurrencyKwd, formatGregorianDate } from "@/app/lib/formatters";

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

type ReceiptFormState = {
  customerId: string;
  amount: string;
  receiptCategoryId: string;
  accountCategoryId: string;
  date: string;
  notes: string;
};

const initialReceiptForm: ReceiptFormState = {
  customerId: "",
  amount: "",
  receiptCategoryId: "",
  accountCategoryId: "",
  date: new Date().toISOString().slice(0, 10),
  notes: "",
};

export default function ReceiptsPage() {
  const [form, setForm] = useState(initialReceiptForm);
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

  const receiptCategories = useMemo(
    () => categories.filter((category) => category.groupId === CLIENT_RECEIPT_GROUP_ID),
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

    if (
      !form.customerId.trim() ||
      !form.receiptCategoryId.trim() ||
      !form.accountCategoryId.trim() ||
      !form.date.trim()
    ) {
      setError("يرجى تعبئة جميع الحقول المطلوبة قبل الحفظ.");
      return;
    }

    const selectedCustomer = customers.find((item) => item.id === form.customerId);
    const selectedReceiptCategory = receiptCategories.find(
      (item) => item.id === form.receiptCategoryId,
    );
    const selectedAccountCategory = accountCategories.find(
      (item) => item.id === form.accountCategoryId,
    );

    if (!selectedCustomer || !selectedReceiptCategory || !selectedAccountCategory) {
      setError("بعض الاختيارات غير صالحة. يرجى إعادة الاختيار.");
      return;
    }

    try {
      setIsSaving(true);
      const receiptRef = await addDoc(collection(db, "receipts"), {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerContractNumber: selectedCustomer.contractNumber ?? "",
        amount,
        receiptCategoryId: selectedReceiptCategory.id,
        receiptCategoryName: selectedReceiptCategory.name,
        accountCategoryId: selectedAccountCategory.id,
        accountCategoryName: selectedAccountCategory.name,
        date: form.date,
        notes: form.notes.trim(),
        createdByUid: auth.currentUser?.uid ?? "",
        createdByEmail: auth.currentUser?.email ?? "",
        updatedByUid: auth.currentUser?.uid ?? "",
        updatedByEmail: auth.currentUser?.email ?? "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      void writeAuditLog({
        action: "create",
        entity: "receipt",
        entityId: receiptRef.id,
        details: {
          customerId: selectedCustomer.id,
          amount,
        },
      });

      setForm((prev) => ({
        ...initialReceiptForm,
        date: prev.date,
      }));
      setSuccess("تم تسجيل المقبوض بنجاح.");
    } catch {
      setError("تعذر حفظ المقبوض حالياً. حاول مرة أخرى.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">تسجيل مقبوض</h1>
        <p className="mt-1 text-sm text-slate-500">
          اختر العميل ثم سبب القبض والحساب الذي تم القبض عليه.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
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

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">
              سبب القبض (تصنيف المقبوضات)
            </span>
            <select
              value={form.receiptCategoryId}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  receiptCategoryId: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="">اختر تصنيف المقبوض</option>
              {receiptCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">
              الحساب الذي تم القبض عليه
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
              placeholder="أي تفاصيل إضافية عن المقبوض"
            />
          </label>

          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-70"
            >
              {isSaving ? "جاري الحفظ..." : "حفظ المقبوض"}
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
