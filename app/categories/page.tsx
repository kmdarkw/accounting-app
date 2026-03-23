"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { Plus } from "lucide-react";
import {
  ACCOUNT_GROUP_ID,
  CLIENT_EXPENSE_GROUP_ID,
  CLIENT_RECEIPT_GROUP_ID,
  categoryGroups,
  CategoryGroupId,
  CUSTOMER_CLASSIFICATION_GROUP_ID,
} from "@/app/lib/category-groups";
import { writeAuditLog } from "@/app/lib/audit";
import { auth, db } from "@/app/lib/firebase";

type CategoryItem = {
  id: string;
  name: string;
  groupId: CategoryGroupId;
};

const initialInputs: Record<CategoryGroupId, string> = {
  customerClassification: "",
  customerStage: "",
  clientExpense: "",
  clientReceipt: "",
  account: "",
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [inputs, setInputs] = useState(initialInputs);
  const [savingGroup, setSavingGroup] = useState<CategoryGroupId | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [actionCategoryId, setActionCategoryId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "categories"), (snapshot) => {
      const items = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as { name?: string; groupId?: CategoryGroupId };
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

      setCategories(items);
    });

    return () => unsubscribe();
  }, []);

  function handleAddCategory(event: FormEvent<HTMLFormElement>, groupId: CategoryGroupId) {
    event.preventDefault();
    const categoryName = inputs[groupId].trim();

    if (!categoryName) {
      setError("يرجى كتابة اسم التصنيف قبل الحفظ.");
      return;
    }

    const duplicated = categories.some(
      (item) =>
        item.groupId === groupId &&
        item.name.trim().toLowerCase() === categoryName.toLowerCase(),
    );
    if (duplicated) {
      setError("هذا التصنيف موجود بالفعل في نفس القسم.");
      return;
    }

    setError("");
    setSavingGroup(groupId);
    setInputs((prev) => ({ ...prev, [groupId]: "" }));

    // Do not block the UI on remote acknowledgment to avoid stuck loading state.
    void addDoc(collection(db, "categories"), {
      name: categoryName,
      groupId,
      createdByUid: auth.currentUser?.uid ?? "",
      createdByEmail: auth.currentUser?.email ?? "",
      updatedByUid: auth.currentUser?.uid ?? "",
      updatedByEmail: auth.currentUser?.email ?? "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
      .then((categoryRef) => {
        void writeAuditLog({
          action: "create",
          entity: "category",
          entityId: categoryRef.id,
          details: { name: categoryName, groupId },
        });
      })
      .catch(() => {
        setInputs((prev) => ({ ...prev, [groupId]: categoryName }));
        setError("تعذر مزامنة الإضافة مع الخادم. حاول مرة أخرى.");
      });

    setSavingGroup(null);
  }

  function startEdit(category: CategoryItem) {
    setError("");
    setEditingCategoryId(category.id);
    setEditingName(category.name);
  }

  function cancelEdit() {
    setEditingCategoryId(null);
    setEditingName("");
  }

  async function handleUpdateCategory(category: CategoryItem) {
    const nextName = editingName.trim();
    if (!nextName) {
      setError("يرجى كتابة اسم التصنيف قبل الحفظ.");
      return;
    }

    const duplicated = categories.some(
      (item) =>
        item.id !== category.id &&
        item.groupId === category.groupId &&
        item.name.trim().toLowerCase() === nextName.toLowerCase(),
    );
    if (duplicated) {
      setError("هذا التصنيف موجود بالفعل في نفس القسم.");
      return;
    }

    try {
      setError("");
      setActionCategoryId(category.id);
      await updateDoc(doc(db, "categories", category.id), {
        name: nextName,
        updatedByUid: auth.currentUser?.uid ?? "",
        updatedByEmail: auth.currentUser?.email ?? "",
        updatedAt: serverTimestamp(),
      });
      void writeAuditLog({
        action: "update",
        entity: "category",
        entityId: category.id,
        details: {
          name: nextName,
          groupId: category.groupId,
        },
      });
      cancelEdit();
    } catch {
      setError("تعذر تعديل التصنيف حالياً. حاول مرة أخرى.");
    } finally {
      setActionCategoryId(null);
    }
  }

  async function handleDeleteCategory(category: CategoryItem) {
    const shouldDelete = window.confirm("هل أنت متأكد من حذف هذا التصنيف؟");
    if (!shouldDelete) {
      return;
    }

    try {
      setError("");
      setActionCategoryId(category.id);

      if (category.groupId === CUSTOMER_CLASSIFICATION_GROUP_ID) {
        const customersRef = collection(db, "customers");
        const linkedCustomersQuery = query(
          customersRef,
          where("customerCategoryId", "==", category.id),
          limit(1),
        );
        const linkedCustomersSnapshot = await getDocs(linkedCustomersQuery);
        if (!linkedCustomersSnapshot.empty) {
          setError("لا يمكن حذف هذا التصنيف لأنه مرتبط بعملاء مسجلين.");
          return;
        }
      }

      if (category.groupId === CLIENT_RECEIPT_GROUP_ID) {
        const receiptsRef = collection(db, "receipts");
        const linkedReceiptsQuery = query(
          receiptsRef,
          where("receiptCategoryId", "==", category.id),
          limit(1),
        );
        const linkedReceiptsSnapshot = await getDocs(linkedReceiptsQuery);
        if (!linkedReceiptsSnapshot.empty) {
          setError("لا يمكن حذف هذا التصنيف لأنه مستخدم في المقبوضات.");
          return;
        }
      }

      if (category.groupId === CLIENT_EXPENSE_GROUP_ID) {
        const expensesRef = collection(db, "expenses");
        const linkedExpensesQuery = query(
          expensesRef,
          where("expenseCategoryId", "==", category.id),
          limit(1),
        );
        const linkedExpensesSnapshot = await getDocs(linkedExpensesQuery);
        if (!linkedExpensesSnapshot.empty) {
          setError("لا يمكن حذف هذا التصنيف لأنه مستخدم في المصروفات.");
          return;
        }
      }

      if (category.groupId === ACCOUNT_GROUP_ID) {
        const receiptsRef = collection(db, "receipts");
        const linkedReceiptsQuery = query(
          receiptsRef,
          where("accountCategoryId", "==", category.id),
          limit(1),
        );
        const linkedReceiptsSnapshot = await getDocs(linkedReceiptsQuery);
        if (!linkedReceiptsSnapshot.empty) {
          setError("لا يمكن حذف هذا الحساب لأنه مستخدم في المقبوضات.");
          return;
        }

        const expensesRef = collection(db, "expenses");
        const linkedExpensesQuery = query(
          expensesRef,
          where("accountCategoryId", "==", category.id),
          limit(1),
        );
        const linkedExpensesSnapshot = await getDocs(linkedExpensesQuery);
        if (!linkedExpensesSnapshot.empty) {
          setError("لا يمكن حذف هذا الحساب لأنه مستخدم في المصروفات.");
          return;
        }
      }

      await deleteDoc(doc(db, "categories", category.id));
      void writeAuditLog({
        action: "delete",
        entity: "category",
        entityId: category.id,
        details: {
          name: category.name,
          groupId: category.groupId,
        },
      });
      if (editingCategoryId === category.id) {
        cancelEdit();
      }
    } catch {
      setError("تعذر حذف التصنيف حالياً. حاول مرة أخرى.");
    } finally {
      setActionCategoryId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">التصنيفات</h1>
        <p className="mt-1 text-sm text-slate-500">
          إدارة أنواع التصنيفات الأساسية للعملاء والمصروفات والمقبوضات والحسابات.
        </p>
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {categoryGroups.map((group) => {
          const groupCategories = categories.filter(
            (category) => category.groupId === group.id,
          );

          return (
            <article
              key={group.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="text-base font-semibold text-slate-900">{group.label}</h2>

              <form
                className="mt-4 flex items-center gap-2"
                onSubmit={(event) => handleAddCategory(event, group.id)}
              >
                <input
                  type="text"
                  value={inputs[group.id]}
                  onChange={(event) =>
                    setInputs((prev) => ({ ...prev, [group.id]: event.target.value }))
                  }
                  placeholder="اكتب اسم تصنيف جديد"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                />
                <button
                  type="submit"
                  disabled={savingGroup === group.id}
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-70"
                >
                  <Plus className="h-4 w-4" />
                  <span>{savingGroup === group.id ? "جاري الحفظ..." : "إضافة"}</span>
                </button>
              </form>

              <ul className="mt-4 space-y-2">
                {groupCategories.length === 0 ? (
                  <li className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    لا توجد عناصر حالياً.
                  </li>
                ) : (
                  groupCategories.map((category) => (
                    <li
                      key={category.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2 text-sm text-slate-700"
                    >
                      {editingCategoryId === category.id ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none transition focus:border-slate-400"
                        />
                      ) : (
                        <span>{category.name}</span>
                      )}

                      <div className="flex items-center gap-2">
                        {editingCategoryId === category.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleUpdateCategory(category)}
                              disabled={actionCategoryId === category.id}
                              className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-70"
                            >
                              حفظ
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                              إلغاء
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(category)}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                              تعديل
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(category)}
                              disabled={actionCategoryId === category.id}
                              className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-rose-500 disabled:opacity-70"
                            >
                              حذف
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </article>
          );
        })}
      </section>
    </div>
  );
}
