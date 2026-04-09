"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import Header from "@/app/components/Header";
import Sidebar from "@/app/components/Sidebar";
import { auth } from "@/app/lib/firebase";
import { ensureUserProfile } from "@/app/lib/users";
import type { AppUserRole } from "@/app/lib/users";

type ProtectedLayoutProps = {
  children: ReactNode;
};

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);
  const [userRole, setUserRole] = useState<AppUserRole | null>(null);
  const isPublicRoute = pathname === "/login";
  const isPasswordChangeRoute = pathname === "/change-password";
  const isExpensesRoute = pathname === "/expenses" || pathname.startsWith("/expenses/");

  useEffect(() => {
    if (isPublicRoute) {
      setIsCheckingAuth(false);
      setIsAllowed(true);
      return;
    }

    setIsCheckingAuth(true);
    setIsAllowed(false);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsCheckingAuth(false);
        setIsAllowed(false);
        router.replace("/login");
        return;
      }

      try {
        const profile = await ensureUserProfile(user);
        if (!profile || !profile.isActive) {
          await signOut(auth);
          setIsCheckingAuth(false);
          setIsAllowed(false);
          router.replace("/login");
          return;
        }

        setUserRole(profile.role);

        if (profile.mustChangePassword && !isPasswordChangeRoute) {
          setIsAllowed(false);
          setIsCheckingAuth(false);
          router.replace("/change-password");
          return;
        }

        if (!profile.mustChangePassword && isPasswordChangeRoute) {
          setIsAllowed(false);
          setIsCheckingAuth(false);
          router.replace(profile.role === "super_admin" ? "/" : "/expenses");
          return;
        }

        if (profile.role !== "super_admin" && !isExpensesRoute) {
          setIsAllowed(false);
          setIsCheckingAuth(false);
          router.replace("/expenses");
          return;
        }

        if (
          (pathname === "/users" || pathname === "/settings/users") &&
          profile.role !== "super_admin"
        ) {
          setIsAllowed(false);
          setIsCheckingAuth(false);
          router.replace("/");
          return;
        }

        setIsAllowed(true);
      } catch {
        setIsAllowed(false);
      } finally {
        setIsCheckingAuth(false);
      }
    });

    return () => unsubscribe();
  }, [isExpensesRoute, isPasswordChangeRoute, isPublicRoute, pathname, router]);

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm">
          جاري التحقق من صلاحية الدخول...
        </div>
      </div>
    );
  }

  if (!isAllowed) {
    return null;
  }

  if (isPasswordChangeRoute) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <Sidebar role={userRole} />
      <div className="lg:mr-72">
        <Header />
        <main className="px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
