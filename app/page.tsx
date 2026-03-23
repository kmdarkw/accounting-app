"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import { formatCurrencyKwd, formatGregorianDate } from "@/app/lib/formatters";

type ReceiptItem = {
  id: string;
  date: string;
  amount: number;
  customerName: string;
  receiptCategoryName: string;
};

type ExpenseItem = {
  id: string;
  date: string;
  amount: number;
  scope: "company" | "customer";
  customerName: string;
  expenseCategoryName: string;
};

type ObligationItem = {
  id: string;
  dueDate: string;
  amount: number;
  direction: "inflow" | "outflow";
  status: "pending" | "settled";
};

const numberFormatter = new Intl.NumberFormat("ar-KW-u-nu-latn");

export default function HomePage() {
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [obligationItems, setObligationItems] = useState<ObligationItem[]>([]);
  const [customersCount, setCustomersCount] = useState(0);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "receipts"), (snapshot) => {
      const nextReceipts = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as {
            date?: string;
            amount?: number;
            customerName?: string;
            receiptCategoryName?: string;
          };
          if (!data.date || typeof data.amount !== "number") {
            return null;
          }

          return {
            id: docItem.id,
            date: data.date,
            amount: data.amount,
            customerName: data.customerName ?? "",
            receiptCategoryName: data.receiptCategoryName ?? "",
          } satisfies ReceiptItem;
        })
        .filter((item): item is ReceiptItem => item !== null);

      setReceipts(nextReceipts);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "expenses"), (snapshot) => {
      const nextExpenses = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as {
            date?: string;
            amount?: number;
            scope?: "company" | "customer";
            customerName?: string;
            expenseCategoryName?: string;
          };
          if (!data.date || typeof data.amount !== "number") {
            return null;
          }

          return {
            id: docItem.id,
            date: data.date,
            amount: data.amount,
            scope: data.scope === "customer" ? "customer" : "company",
            customerName: data.customerName ?? "",
            expenseCategoryName: data.expenseCategoryName ?? "",
          } satisfies ExpenseItem;
        })
        .filter((item): item is ExpenseItem => item !== null);

      setExpenses(nextExpenses);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "customers"), (snapshot) => {
      setCustomersCount(snapshot.size);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "obligationItems"), (snapshot) => {
      const nextItems = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as {
            dueDate?: string;
            amount?: number;
            direction?: "inflow" | "outflow";
            status?: "pending" | "settled";
          };
          if (
            !data.dueDate ||
            typeof data.amount !== "number" ||
            !data.direction ||
            !data.status
          ) {
            return null;
          }

          return {
            id: docItem.id,
            dueDate: data.dueDate,
            amount: data.amount,
            direction: data.direction,
            status: data.status,
          } satisfies ObligationItem;
        })
        .filter((item): item is ObligationItem => item !== null);

      setObligationItems(nextItems);
    });

    return () => unsubscribe();
  }, []);

  const totalReceipts = useMemo(
    () => receipts.reduce((sum, item) => sum + item.amount, 0),
    [receipts],
  );
  const totalExpenses = useMemo(
    () => expenses.reduce((sum, item) => sum + item.amount, 0),
    [expenses],
  );
  const netCashFlow = totalReceipts - totalExpenses;
  const todayString = new Date().toISOString().slice(0, 10);
  const nextMonthDate = new Date();
  nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
  const in30DaysString = nextMonthDate.toISOString().slice(0, 10);

  const dueOutflow30 = useMemo(
    () =>
      obligationItems
        .filter(
          (item) =>
            item.status === "pending" &&
            item.direction === "outflow" &&
            item.dueDate >= todayString &&
            item.dueDate <= in30DaysString,
        )
        .reduce((sum, item) => sum + item.amount, 0),
    [obligationItems, in30DaysString, todayString],
  );

  const dueInflow30 = useMemo(
    () =>
      obligationItems
        .filter(
          (item) =>
            item.status === "pending" &&
            item.direction === "inflow" &&
            item.dueDate >= todayString &&
            item.dueDate <= in30DaysString,
        )
        .reduce((sum, item) => sum + item.amount, 0),
    [obligationItems, in30DaysString, todayString],
  );

  const latestTransactions = useMemo(() => {
    const receiptRows = receipts.map((item) => ({
      id: `receipt-${item.id}`,
      date: item.date,
      description: `${item.customerName || "عميل"} - ${item.receiptCategoryName || "مقبوض"}`,
      type: "إيراد" as const,
      amount: item.amount,
    }));

    const expenseRows = expenses.map((item) => ({
      id: `expense-${item.id}`,
      date: item.date,
      description:
        item.scope === "customer"
          ? `${item.customerName || "عميل"} - ${item.expenseCategoryName || "مصروف عميل"}`
          : "مصروف عام للشركة",
      type: "مصروف" as const,
      amount: item.amount,
    }));

    return [...receiptRows, ...expenseRows]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 12);
  }, [expenses, receipts]);

  const stats = [
    {
      title: "إجمالي المقبوضات",
      value: formatCurrencyKwd(totalReceipts),
      accent: "text-emerald-600",
    },
    {
      title: "إجمالي المصروفات",
      value: formatCurrencyKwd(totalExpenses),
      accent: "text-rose-600",
    },
    {
      title: "صافي التدفق النقدي",
      value: formatCurrencyKwd(netCashFlow),
      accent: netCashFlow >= 0 ? "text-blue-600" : "text-rose-600",
    },
    {
      title: "عدد العملاء",
      value: numberFormatter.format(customersCount),
      accent: "text-amber-600",
    },
    {
      title: "التزامات علينا خلال 30 يوم",
      value: formatCurrencyKwd(dueOutflow30),
      accent: "text-rose-600",
    },
    {
      title: "مستحقات لنا خلال 30 يوم",
      value: formatCurrencyKwd(dueInflow30),
      accent: "text-emerald-600",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((card) => (
          <article
            key={card.title}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-slate-500">{card.title}</p>
            <p className={`mt-3 text-2xl font-bold ${card.accent}`}>{card.value}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">أحدث المعاملات</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-right">
            <thead className="bg-slate-50 text-sm text-slate-600">
              <tr>
                <th className="px-5 py-3 font-medium">التاريخ</th>
                <th className="px-5 py-3 font-medium">البيان</th>
                <th className="px-5 py-3 font-medium">النوع</th>
                <th className="px-5 py-3 font-medium">المبلغ</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-700">
              {latestTransactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-slate-500">
                    لا توجد معاملات مسجلة بعد.
                  </td>
                </tr>
              ) : (
                latestTransactions.map((tx) => (
                  <tr key={tx.id} className="border-t border-slate-100">
                    <td className="px-5 py-3">{formatGregorianDate(tx.date)}</td>
                    <td className="px-5 py-3">{tx.description}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          tx.type === "إيراد"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-semibold">{formatCurrencyKwd(tx.amount)}</td>
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
