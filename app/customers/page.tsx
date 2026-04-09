"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/app/lib/firebase";

type CustomerItem = {
  id: string;
  name: string;
  contractNumber: string;
  phone: string;
  customerCategoryName: string;
  contractTypeCategoryName: string;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "customers"), (snapshot) => {
      const nextCustomers = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as {
            name?: string;
            contractNumber?: string;
            phone?: string;
            customerCategoryName?: string;
            contractTypeCategoryName?: string;
          };

          if (!data.name) {
            return null;
          }

          return {
            id: docItem.id,
            name: data.name,
            contractNumber: data.contractNumber ?? "-",
            phone: data.phone ?? "-",
            customerCategoryName: data.customerCategoryName ?? "-",
            contractTypeCategoryName: data.contractTypeCategoryName ?? "-",
          } satisfies CustomerItem;
        })
        .filter((item): item is CustomerItem => item !== null);

      setCustomers(nextCustomers);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const orderedCustomers = useMemo(
    () =>
      [...customers].sort((a, b) =>
        a.name.localeCompare(b.name, "ar", { sensitivity: "base" }),
      ),
    [customers],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">العملاء</h1>
            <p className="mt-1 text-sm text-slate-500">
              افتح بطاقة العميل لمراجعة كل التفاصيل وتسجيل مصروف جديد مباشرة.
            </p>
          </div>

          <Link
            href="/customers/new"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            إضافة عميل جديد
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          <article className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            جاري تحميل العملاء...
          </article>
        ) : !orderedCustomers.length ? (
          <article className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            لا يوجد عملاء حتى الآن. يمكنك البدء عبر زر "إضافة عميل جديد".
          </article>
        ) : (
          orderedCustomers.map((customer) => (
            <article
              key={customer.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="text-base font-semibold text-slate-900">{customer.name}</h2>
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                <p>رقم العقد: {customer.contractNumber}</p>
                <p>الهاتف: {customer.phone}</p>
                <p>تصنيف العميل: {customer.customerCategoryName}</p>
                <p>نوع العقد: {customer.contractTypeCategoryName}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/customers/${customer.id}`}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
                >
                  فتح بطاقة العميل
                </Link>
                <Link
                  href={`/expenses?scope=customer&customerId=${customer.id}`}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  تسجيل مصروف بسرعة
                </Link>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
