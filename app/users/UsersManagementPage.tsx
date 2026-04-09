"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { deleteApp, initializeApp } from "firebase/app";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db, firebaseConfig } from "@/app/lib/firebase";
import { isLikelyPhone, normalizePhone, phoneToAuthEmail } from "@/app/lib/auth-helpers";
import { AppUserProfile, AppUserRole, ensureUserProfile } from "@/app/lib/users";
import { writeAuditLog } from "@/app/lib/audit";

type ManagedUser = AppUserProfile;

const ROLE_OPTIONS: Array<{ value: AppUserRole; label: string }> = [
  { value: "super_admin", label: "سوبر أدمن" },
  { value: "admin", label: "مدير" },
  { value: "staff", label: "موظف" },
];

export default function UsersManagementPage() {
  const [currentUser, setCurrentUser] = useState<AppUserProfile | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [phone, setPhone] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [role, setRole] = useState<AppUserRole>("admin");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoadingPage(false);
        return;
      }

      const profile = await ensureUserProfile(user);
      setCurrentUser(profile);
      setLoadingPage(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentUser?.role !== "super_admin") {
      setUsers([]);
      return;
    }

    const usersQuery = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const nextUsers: ManagedUser[] = snapshot.docs.map((userDoc) => {
        const raw = userDoc.data();
        const rawRole = raw.role;
        const mappedRole: AppUserRole =
          rawRole === "super_admin" || rawRole === "admin" || rawRole === "staff"
            ? rawRole
            : "staff";

        return {
          uid: userDoc.id,
          phone: raw.phone ?? "",
          role: mappedRole,
          isActive: raw.isActive ?? false,
          mustChangePassword: raw.mustChangePassword ?? false,
        };
      });

      setUsers(nextUsers);
    });

    return () => unsubscribe();
  }, [currentUser?.role]);

  const canManageUsers = useMemo(() => currentUser?.role === "super_admin", [currentUser?.role]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!canManageUsers) {
      setError("هذه الصفحة متاحة للسوبر أدمن فقط.");
      return;
    }

    if (!isLikelyPhone(phone)) {
      setError("يرجى إدخال رقم هاتف صحيح.");
      return;
    }

    if (tempPassword.length < 6) {
      setError("كلمة المرور المؤقتة يجب ألا تقل عن 6 أحرف.");
      return;
    }

    const normalizedPhone = normalizePhone(phone);
    const email = phoneToAuthEmail(normalizedPhone);
    const duplicatePhone = users.some((item) => item.phone === normalizedPhone);
    if (duplicatePhone) {
      setError("رقم الهاتف مسجل بالفعل.");
      return;
    }

    const secondaryAppName = `users-manager-${Date.now()}`;
    const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      setLoadingCreate(true);
      const credentials = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        tempPassword,
      );

      await setDoc(doc(db, "users", credentials.user.uid), {
        phone: normalizedPhone,
        role,
        isActive: true,
        mustChangePassword: true,
        createdByUid: auth.currentUser?.uid ?? "",
        createdByEmail: auth.currentUser?.email ?? "",
        updatedByUid: auth.currentUser?.uid ?? "",
        updatedByEmail: auth.currentUser?.email ?? "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await writeAuditLog({
        action: "create",
        entity: "users",
        entityId: credentials.user.uid,
        details: { phone: normalizedPhone, role, isActive: true, mustChangePassword: true },
      });

      setPhone("");
      setTempPassword("");
      setRole("admin");
      setSuccess("تم إنشاء المستخدم بنجاح. سيتم إجباره على تغيير كلمة المرور عند أول دخول.");
    } catch {
      setError("تعذر إنشاء المستخدم. تأكد أن رقم الهاتف غير مستخدم.");
    } finally {
      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);
      setLoadingCreate(false);
    }
  }

  async function toggleActive(user: ManagedUser) {
    if (!canManageUsers) {
      return;
    }

    if (auth.currentUser?.uid === user.uid && user.isActive) {
      setError("لا يمكن تعطيل حسابك الحالي.");
      return;
    }

    setError("");
    setSuccess("");
    try {
      await updateDoc(doc(db, "users", user.uid), {
        isActive: !user.isActive,
        updatedByUid: auth.currentUser?.uid ?? "",
        updatedByEmail: auth.currentUser?.email ?? "",
        updatedAt: serverTimestamp(),
      });

      await writeAuditLog({
        action: "update",
        entity: "users",
        entityId: user.uid,
        details: { isActive: !user.isActive },
      });
    } catch {
      setError("تعذر تحديث حالة المستخدم.");
    }
  }

  async function forcePasswordReset(user: ManagedUser) {
    if (!canManageUsers) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      await updateDoc(doc(db, "users", user.uid), {
        mustChangePassword: true,
        updatedByUid: auth.currentUser?.uid ?? "",
        updatedByEmail: auth.currentUser?.email ?? "",
        updatedAt: serverTimestamp(),
      });

      await writeAuditLog({
        action: "update",
        entity: "users",
        entityId: user.uid,
        details: { mustChangePassword: true },
      });

      setSuccess("تم فرض تغيير كلمة المرور لهذا المستخدم في الدخول القادم.");
    } catch {
      setError("تعذر تحديث إعدادات كلمة المرور.");
    }
  }

  if (loadingPage) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        جاري تحميل بيانات المستخدمين...
      </div>
    );
  }

  if (!canManageUsers) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 shadow-sm">
        الوصول لهذه الصفحة متاح فقط لحساب السوبر أدمن.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">إضافة مستخدم جديد</h2>
        <p className="mt-1 text-sm text-slate-500">
          رقم الهاتف هو اسم الدخول، وكلمة المرور التالية تكون مؤقتة لأول دخول.
        </p>

        <form onSubmit={handleCreateUser} className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">رقم الهاتف</span>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="9655xxxxxxx"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">كلمة المرور المؤقتة</span>
            <input
              type="password"
              value={tempPassword}
              onChange={(event) => setTempPassword(event.target.value)}
              placeholder="6 أحرف أو أكثر"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">الدور</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as AppUserRole)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            >
              {ROLE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={loadingCreate}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-70"
            >
              {loadingCreate ? "جاري الإنشاء..." : "إنشاء المستخدم"}
            </button>
          </div>
        </form>

        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">المستخدمون الحاليون</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right font-medium">رقم الهاتف</th>
                <th className="px-3 py-2 text-right font-medium">الدور</th>
                <th className="px-3 py-2 text-right font-medium">الحالة</th>
                <th className="px-3 py-2 text-right font-medium">تغيير كلمة المرور</th>
                <th className="px-3 py-2 text-right font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.uid}>
                  <td className="px-3 py-2 text-slate-800">{user.phone}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {ROLE_OPTIONS.find((item) => item.value === user.role)?.label ?? "موظف"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        user.isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {user.isActive ? "نشط" : "معطل"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {user.mustChangePassword ? "إجباري" : "لا"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleActive(user)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100"
                      >
                        {user.isActive ? "تعطيل" : "تفعيل"}
                      </button>

                      <button
                        type="button"
                        onClick={() => forcePasswordReset(user)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100"
                      >
                        فرض تغيير كلمة المرور
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!users.length ? (
                <tr>
                  <td className="px-3 py-4 text-slate-500" colSpan={5}>
                    لا يوجد مستخدمون حتى الآن.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
