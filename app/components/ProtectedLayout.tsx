"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import Header from "@/app/components/Header";
import Sidebar from "@/app/components/Sidebar";
import { auth, db } from "@/app/lib/firebase";

type ProtectedLayoutProps = {
  children: ReactNode;
};

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    if (pathname === "/login") {
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
        const adminRef = doc(db, "admins", user.uid);
        const adminDoc = await getDoc(adminRef);
        if (!adminDoc.exists()) {
          await signOut(auth);
          setIsCheckingAuth(false);
          setIsAllowed(false);
          router.replace("/login");
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
  }, [pathname, router]);

  if (pathname === "/login") {
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

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="lg:mr-72">
        <Header />
        <main className="px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
