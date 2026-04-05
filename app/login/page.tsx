"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/app/lib/firebase";
import { isLikelyPhone, phoneToAuthEmail } from "@/app/lib/auth-helpers";
import { ensureUserProfile } from "@/app/lib/users";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsCheckingSession(false);
        return;
      }

      try {
        const profile = await ensureUserProfile(user);
        if (profile && profile.isActive) {
          router.replace(profile.mustChangePassword ? "/change-password" : "/");
          return;
        }

        await signOut(auth);
        setError("هذا الحساب غير مصرح له بالدخول.");
      } catch {
        setError("تعذر التحقق من صلاحية الحساب.");
      } finally {
        setIsCheckingSession(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!isLikelyPhone(phone)) {
      setError("يرجى إدخال رقم هاتف صحيح.");
      return;
    }

    if (!password.trim()) {
      setError("يرجى إدخال الرقم السري.");
      return;
    }

    try {
      setIsLoading(true);
      const email = phoneToAuthEmail(phone);
      const credentials = await signInWithEmailAndPassword(auth, email, password);
      const profile = await ensureUserProfile(credentials.user);

      if (!profile || !profile.isActive) {
        await signOut(auth);
        setError("هذا الحساب غير مصرح له بالدخول.");
        return;
      }

      router.replace(profile.mustChangePassword ? "/change-password" : "/");
    } catch {
      setError("بيانات الدخول غير صحيحة أو لا يوجد حساب مطابق.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isCheckingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm">
          جاري التحقق من الجلسة...
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">دخول النظام</h1>
        <p className="mt-2 text-sm text-slate-500">
          يتم الدخول برقم الهاتف وكلمة المرور المؤقتة أو الدائمة.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">رقم الهاتف</span>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="مثال: 96555555555"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">الرقم السري</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-70"
          >
            {isLoading ? "جاري تسجيل الدخول..." : "دخول"}
          </button>
        </form>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      </section>
    </div>
  );
}
