"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "@/app/lib/firebase";
import { CUSTOMER_CLASSIFICATION_GROUP_ID } from "@/app/lib/category-groups";
import { writeAuditLog } from "@/app/lib/audit";

type CategoryOption = {
  id: string;
  name: string;
  groupId: string;
};

type CustomerFormState = {
  contractNumber: string;
  name: string;
  phone: string;
  customerCategoryId: string;
};

const initialFormState: CustomerFormState = {
  contractNumber: "",
  name: "",
  phone: "",
  customerCategoryId: "",
};

export default function NewCustomerPage() {
  const [form, setForm] = useState(initialFormState);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  const customerCategories = useMemo(
    () =>
      categories.filter(
        (category) => category.groupId === CUSTOMER_CLASSIFICATION_GROUP_ID,
      ),
    [categories],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const contractNumber = form.contractNumber.trim();
    const customerName = form.name.trim();
    const phone = form.phone.trim();
    const categoryId = form.customerCategoryId.trim();

    if (!contractNumber || !customerName || !phone || !categoryId) {
      setError("يرجى تعبئة جميع الحقول المطلوبة قبل الحفظ.");
      return;
    }

    const selectedCategory = customerCategories.find(
      (category) => category.id === categoryId,
    );

    if (!selectedCategory) {
      setError("تصنيف العميل غير صالح. يرجى إعادة الاختيار.");
      return;
    }

    try {
      setIsSaving(true);
      const duplicatedContractQuery = query(
        collection(db, "customers"),
        where("contractNumber", "==", contractNumber),
        limit(1),
      );
      const duplicatedContractSnapshot = await getDocs(duplicatedContractQuery);
      if (!duplicatedContractSnapshot.empty) {
        setError("رقم العقد مسجل مسبقاً. يرجى استخدام رقم عقد مختلف.");
        return;
      }

      const customerRef = await addDoc(collection(db, "customers"), {
        contractNumber,
        name: customerName,
        phone,
        customerCategoryId: selectedCategory.id,
        customerCategoryName: selectedCategory.name,
        createdByUid: auth.currentUser?.uid ?? "",
        createdByEmail: auth.currentUser?.email ?? "",
        updatedByUid: auth.currentUser?.uid ?? "",
        updatedByEmail: auth.currentUser?.email ?? "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      void writeAuditLog({
        action: "create",
        entity: "customer",
        entityId: customerRef.id,
        details: {
          contractNumber,
          name: customerName,
        },
      });

      setForm(initialFormState);
      setSuccess("تم حفظ العميل بنجاح.");
    } catch {
      setError("تعذر حفظ بيانات العميل حالياً. حاول مرة أخرى.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">إضافة عميل جديد</h1>
            <p className="mt-1 text-sm text-slate-500">
              أدخل رقم العقد وبيانات العميل ثم اختر تصنيفه.
            </p>
          </div>

          <Link
            href="/categories"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            إدارة التصنيفات
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">رقم العقد</span>
            <input
              type="text"
              value={form.contractNumber}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, contractNumber: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
              placeholder="مثال: CTR-2026-001"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">اسم العميل</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
              placeholder="اسم العميل"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">رقم التلفون</span>
            <input
              type="tel"
              value={form.phone}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, phone: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
              placeholder="مثال: 99999999"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">تصنيف العميل</span>
            <select
              value={form.customerCategoryId}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  customerCategoryId: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="">اختر تصنيف العميل</option>
              {customerCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <div className="md:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-70"
            >
              {isSaving ? "جاري الحفظ..." : "حفظ العميل"}
            </button>
            <Link
              href="/customers"
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              رجوع
            </Link>
          </div>
        </form>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
        {success ? <p className="mt-4 text-sm text-emerald-600">{success}</p> : null}
      </section>
    </div>
  );
}
