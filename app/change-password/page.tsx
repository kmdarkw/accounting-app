"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, updatePassword } from "firebase/auth";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "@/app/lib/firebase";
import { ensureUserProfile } from "@/app/lib/users";
import { writeAuditLog } from "@/app/lib/audit";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsCheckingSession(false);
        router.replace("/login");
        return;
      }

      const profile = await ensureUserProfile(user);
      if (!profile || !profile.isActive) {
        setIsCheckingSession(false);
        router.replace("/login");
        return;
      }

      if (!profile.mustChangePassword) {
        setIsCheckingSession(false);
        router.replace("/");
        return;
      }

      setIsCheckingSession(false);
    });

    return () => unsubscribe();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("تأكيد كلمة المرور غير مطابق.");
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError("انتهت الجلسة، يرجى تسجيل الدخول من جديد.");
      router.replace("/login");
      return;
    }

    try {
      setIsLoading(true);
      await updatePassword(currentUser, newPassword);
      await updateDoc(doc(db, "users", currentUser.uid), {
        mustChangePassword: false,
        updatedByUid: currentUser.uid,
        updatedByEmail: currentUser.email ?? "",
        updatedAt: serverTimestamp(),
      });

      await writeAuditLog({
        action: "update",
        entity: "users",
        entityId: currentUser.uid,
        details: { field: "mustChangePassword", value: false },
      });

      router.replace("/");
    } catch {
      setError("تعذر تحديث كلمة المرور. أعد تسجيل الدخول وحاول مرة أخرى.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isCheckingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm">
          جاري التحقق من صلاحيات الحساب...
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">تغيير كلمة المرور</h1>
        <p className="mt-2 text-sm text-slate-500">
          يجب تغيير كلمة المرور المؤقتة قبل استخدام النظام.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">كلمة المرور الجديدة</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="6 أحرف أو أكثر"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">تأكيد كلمة المرور الجديدة</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="أعد كتابة كلمة المرور"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-70"
          >
            {isLoading ? "جاري الحفظ..." : "حفظ كلمة المرور"}
          </button>
        </form>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      </section>
    </div>
  );
}
