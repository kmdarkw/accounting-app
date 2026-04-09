"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import { formatCurrencyKwd, formatGregorianDate } from "@/app/lib/formatters";

type ReceiptItem = {
  id: string;
  customerId: string;
  customerName: string;
  date: string;
  amount: number;
};

type ExpenseItem = {
  id: string;
  scope: "company" | "customer";
  customerId: string;
  customerName: string;
  expenseCategoryName: string;
  date: string;
  amount: number;
  isOutsideTemplate: boolean;
  isRepeatedExpense: boolean;
  repeatIndex: number;
};

type CustomerItem = {
  id: string;
  name: string;
  contractTypeCategoryId: string;
  contractTypeCategoryName: string;
};

const monthFormatter = new Intl.DateTimeFormat("ar-KW-u-nu-latn-ca-gregory", {
  month: "long",
  year: "numeric",
});

function getMonthKey(dateString: string) {
  return dateString.slice(0, 7);
}

function toMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  const date = new Date(`${year}-${month}-01T00:00:00`);
  return monthFormatter.format(date);
}

function getCurrentMonthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [fromDate, setFromDate] = useState(getCurrentMonthStart());
  const [toDate, setToDate] = useState(getTodayIso());
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedContractTypeId, setSelectedContractTypeId] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "customers"), (snapshot) => {
      const items = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as {
            name?: string;
            contractTypeCategoryId?: string;
            contractTypeCategoryName?: string;
          };
          if (!data.name) {
            return null;
          }

          return {
            id: docItem.id,
            name: data.name,
            contractTypeCategoryId: data.contractTypeCategoryId ?? "",
            contractTypeCategoryName: data.contractTypeCategoryName ?? "",
          } satisfies CustomerItem;
        })
        .filter((item): item is CustomerItem => item !== null);

      setCustomers(items);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "receipts"), (snapshot) => {
      const items = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as {
            customerId?: string;
            customerName?: string;
            date?: string;
            amount?: number;
          };
          if (!data.date || typeof data.amount !== "number") {
            return null;
          }

          return {
            id: docItem.id,
            customerId: data.customerId ?? "",
            customerName: data.customerName ?? "",
            date: data.date,
            amount: data.amount,
          } satisfies ReceiptItem;
        })
        .filter((item): item is ReceiptItem => item !== null);

      setReceipts(items);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "expenses"), (snapshot) => {
      const items = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as {
            scope?: "company" | "customer";
            customerId?: string;
            customerName?: string;
            expenseCategoryName?: string;
            date?: string;
            amount?: number;
            isOutsideTemplate?: boolean;
            isRepeatedExpense?: boolean;
            repeatIndex?: number;
          };
          if (!data.date || typeof data.amount !== "number") {
            return null;
          }

          return {
            id: docItem.id,
            scope: data.scope === "customer" ? "customer" : "company",
            customerId: data.customerId ?? "",
            customerName: data.customerName ?? "",
            expenseCategoryName: data.expenseCategoryName ?? "",
            date: data.date,
            amount: data.amount,
            isOutsideTemplate: data.isOutsideTemplate ?? false,
            isRepeatedExpense: data.isRepeatedExpense ?? false,
            repeatIndex: data.repeatIndex ?? 1,
          } satisfies ExpenseItem;
        })
        .filter((item): item is ExpenseItem => item !== null);

      setExpenses(items);
    });

    return () => unsubscribe();
  }, []);

  const customersById = useMemo(() => {
    return new Map(customers.map((customer) => [customer.id, customer]));
  }, [customers]);

  const contractTypeOptions = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((customer) => {
      if (customer.contractTypeCategoryId && customer.contractTypeCategoryName) {
        map.set(customer.contractTypeCategoryId, customer.contractTypeCategoryName);
      }
    });

    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [customers]);

  const filteredReceipts = useMemo(() => {
    return receipts.filter((item) => {
      if (item.date < fromDate || item.date > toDate) {
        return false;
      }

      if (selectedCustomerId && item.customerId !== selectedCustomerId) {
        return false;
      }

      if (selectedContractTypeId) {
        const customer = customersById.get(item.customerId);
        if (!customer || customer.contractTypeCategoryId !== selectedContractTypeId) {
          return false;
        }
      }

      return true;
    });
  }, [customersById, fromDate, receipts, selectedContractTypeId, selectedCustomerId, toDate]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      if (item.date < fromDate || item.date > toDate) {
        return false;
      }

      if (selectedCustomerId) {
        if (item.scope !== "customer" || item.customerId !== selectedCustomerId) {
          return false;
        }
      }

      if (selectedContractTypeId) {
        if (item.scope !== "customer") {
          return false;
        }
        const customer = customersById.get(item.customerId);
        if (!customer || customer.contractTypeCategoryId !== selectedContractTypeId) {
          return false;
        }
      }

      return true;
    });
  }, [customersById, expenses, fromDate, selectedContractTypeId, selectedCustomerId, toDate]);

  const totalReceipts = useMemo(
    () => filteredReceipts.reduce((sum, item) => sum + item.amount, 0),
    [filteredReceipts],
  );
  const totalExpenses = useMemo(
    () => filteredExpenses.reduce((sum, item) => sum + item.amount, 0),
    [filteredExpenses],
  );
  const netCashFlow = totalReceipts - totalExpenses;

  const outsideTemplateExpenses = useMemo(
    () => filteredExpenses.filter((item) => item.isOutsideTemplate),
    [filteredExpenses],
  );
  const repeatedExpenses = useMemo(
    () => filteredExpenses.filter((item) => item.isRepeatedExpense || item.repeatIndex > 1),
    [filteredExpenses],
  );

  const monthlySummary = useMemo(() => {
    const rows = new Map<string, { receipts: number; expenses: number }>();

    filteredReceipts.forEach((item) => {
      const key = getMonthKey(item.date);
      const current = rows.get(key) ?? { receipts: 0, expenses: 0 };
      current.receipts += item.amount;
      rows.set(key, current);
    });

    filteredExpenses.forEach((item) => {
      const key = getMonthKey(item.date);
      const current = rows.get(key) ?? { receipts: 0, expenses: 0 };
      current.expenses += item.amount;
      rows.set(key, current);
    });

    return Array.from(rows.entries())
      .map(([monthKey, values]) => ({
        monthKey,
        label: toMonthLabel(monthKey),
        receipts: values.receipts,
        expenses: values.expenses,
        net: values.receipts - values.expenses,
      }))
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [filteredExpenses, filteredReceipts]);

  const profitabilityRows = useMemo(() => {
    const activeCustomerIds = new Set<string>();
    filteredReceipts.forEach((item) => {
      if (item.customerId) {
        activeCustomerIds.add(item.customerId);
      }
    });
    filteredExpenses.forEach((item) => {
      if (item.scope === "customer" && item.customerId) {
        activeCustomerIds.add(item.customerId);
      }
    });

    return Array.from(activeCustomerIds)
      .map((customerId) => {
        const customer = customersById.get(customerId);
        if (!customer) {
          return null;
        }

        const receiptsAmount = filteredReceipts
          .filter((item) => item.customerId === customerId)
          .reduce((sum, item) => sum + item.amount, 0);
        const expensesAmount = filteredExpenses
          .filter((item) => item.scope === "customer" && item.customerId === customerId)
          .reduce((sum, item) => sum + item.amount, 0);

        return {
          customerId,
          customerName: customer.name,
          contractTypeName: customer.contractTypeCategoryName || "-",
          receiptsAmount,
          expensesAmount,
          netAmount: receiptsAmount - expensesAmount,
        };
      })
      .filter(
        (
          item,
        ): item is {
          customerId: string;
          customerName: string;
          contractTypeName: string;
          receiptsAmount: number;
          expensesAmount: number;
          netAmount: number;
        } => item !== null,
      )
      .sort((a, b) => b.netAmount - a.netAmount);
  }, [customersById, filteredExpenses, filteredReceipts]);

  const flaggedExpenses = useMemo(() => {
    return filteredExpenses
      .filter((item) => item.scope === "customer" && (item.isOutsideTemplate || item.isRepeatedExpense))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredExpenses]);

  const totalOutsideTemplateAmount = useMemo(
    () => outsideTemplateExpenses.reduce((sum, item) => sum + item.amount, 0),
    [outsideTemplateExpenses],
  );

  function resetFilters() {
    setFromDate(getCurrentMonthStart());
    setToDate(getTodayIso());
    setSelectedCustomerId("");
    setSelectedContractTypeId("");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">التقارير</h1>
        <p className="mt-1 text-sm text-slate-500">
          لوحة رقابية لمدير النظام: ملخص مالي، ربحية العملاء، والمصروفات الاستثنائية.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">من تاريخ</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">إلى تاريخ</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">العميل</span>
            <select
              value={selectedCustomerId}
              onChange={(event) => setSelectedCustomerId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="">كل العملاء</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">نوع العقد</span>
            <select
              value={selectedContractTypeId}
              onChange={(event) => setSelectedContractTypeId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="">كل الأنواع</option>
              {contractTypeOptions.map((typeOption) => (
                <option key={typeOption.id} value={typeOption.id}>
                  {typeOption.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
          >
            إعادة ضبط الفلاتر
          </button>
        </div>
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
          <p className="text-sm text-slate-500">صافي التدفق</p>
          <p className={`mt-3 text-2xl font-bold ${netCashFlow >= 0 ? "text-blue-600" : "text-rose-600"}`}>
            {formatCurrencyKwd(netCashFlow)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">مصروفات خارج القالب</p>
          <p className="mt-3 text-2xl font-bold text-amber-600">
            {outsideTemplateExpenses.length} / {formatCurrencyKwd(totalOutsideTemplateAmount)}
          </p>
          <p className="mt-1 text-xs text-slate-500">مكررة: {repeatedExpenses.length}</p>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">الملخص المالي الشهري</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-right">
            <thead className="bg-slate-50 text-sm text-slate-600">
              <tr>
                <th className="px-5 py-3 font-medium">الشهر</th>
                <th className="px-5 py-3 font-medium">المقبوضات</th>
                <th className="px-5 py-3 font-medium">المصروفات</th>
                <th className="px-5 py-3 font-medium">الصافي</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-700">
              {monthlySummary.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-slate-500">
                    لا توجد بيانات ضمن الفلاتر الحالية.
                  </td>
                </tr>
              ) : (
                monthlySummary.map((row) => (
                  <tr key={row.monthKey} className="border-t border-slate-100">
                    <td className="px-5 py-3">{row.label}</td>
                    <td className="px-5 py-3 text-emerald-700">{formatCurrencyKwd(row.receipts)}</td>
                    <td className="px-5 py-3 text-rose-700">{formatCurrencyKwd(row.expenses)}</td>
                    <td className={`px-5 py-3 font-semibold ${row.net >= 0 ? "text-blue-700" : "text-rose-700"}`}>
                      {formatCurrencyKwd(row.net)}
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
          <h2 className="text-base font-semibold text-slate-900">ربحية العملاء</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-right">
            <thead className="bg-slate-50 text-sm text-slate-600">
              <tr>
                <th className="px-5 py-3 font-medium">العميل</th>
                <th className="px-5 py-3 font-medium">نوع العقد</th>
                <th className="px-5 py-3 font-medium">إجمالي المقبوض</th>
                <th className="px-5 py-3 font-medium">إجمالي المصروف</th>
                <th className="px-5 py-3 font-medium">صافي العميل</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-700">
              {profitabilityRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-slate-500">
                    لا توجد بيانات كافية لحساب ربحية العملاء.
                  </td>
                </tr>
              ) : (
                profitabilityRows.map((row) => (
                  <tr key={row.customerId} className="border-t border-slate-100">
                    <td className="px-5 py-3">{row.customerName}</td>
                    <td className="px-5 py-3">{row.contractTypeName}</td>
                    <td className="px-5 py-3 text-emerald-700">{formatCurrencyKwd(row.receiptsAmount)}</td>
                    <td className="px-5 py-3 text-rose-700">{formatCurrencyKwd(row.expensesAmount)}</td>
                    <td className={`px-5 py-3 font-semibold ${row.netAmount >= 0 ? "text-blue-700" : "text-rose-700"}`}>
                      {formatCurrencyKwd(row.netAmount)}
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
          <h2 className="text-base font-semibold text-slate-900">
            المصروفات الاستثنائية والمكررة
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-right">
            <thead className="bg-slate-50 text-sm text-slate-600">
              <tr>
                <th className="px-5 py-3 font-medium">التاريخ</th>
                <th className="px-5 py-3 font-medium">العميل</th>
                <th className="px-5 py-3 font-medium">البند</th>
                <th className="px-5 py-3 font-medium">الوسوم</th>
                <th className="px-5 py-3 font-medium">المبلغ</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-700">
              {flaggedExpenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-slate-500">
                    لا توجد مصروفات استثنائية أو مكررة ضمن الفترة المحددة.
                  </td>
                </tr>
              ) : (
                flaggedExpenses.map((expense) => (
                  <tr key={expense.id} className="border-t border-slate-100">
                    <td className="px-5 py-3">{formatGregorianDate(expense.date)}</td>
                    <td className="px-5 py-3">{expense.customerName || "-"}</td>
                    <td className="px-5 py-3">{expense.expenseCategoryName || "-"}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-2">
                        {expense.isOutsideTemplate ? (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                            خارج القالب
                          </span>
                        ) : null}
                        {expense.isRepeatedExpense || expense.repeatIndex > 1 ? (
                          <span className="rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700">
                            مكرر #{expense.repeatIndex}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-semibold">{formatCurrencyKwd(expense.amount)}</td>
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
