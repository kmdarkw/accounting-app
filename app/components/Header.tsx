"use client";

import { Bell, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/app/lib/firebase";

const pageTitles: Record<string, string> = {
  "/": "لوحة التحكم",
  "/receipts": "المقبوضات",
  "/invoices": "المقبوضات",
  "/expenses": "المصروفات",
  "/obligations": "الالتزامات",
  "/customers": "العملاء",
  "/customers/new": "إضافة عميل جديد",
  "/users": "إدارة المستخدمين",
  "/categories": "التصنيفات",
  "/reports": "التقارير",
  "/settings": "الإعدادات",
  "/change-password": "تغيير كلمة المرور",
};

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const pageTitle =
    pageTitles[pathname] ??
    (pathname.startsWith("/customers") ? "العملاء" : "لوحة التحكم");

  async function handleLogout() {
    await signOut(auth);
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between px-4 lg:px-6">
        <h2 className="text-lg font-semibold text-slate-900">{pageTitle}</h2>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="الإشعارات"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100"
          >
            <Bell className="h-5 w-5" />
          </button>

          <button
            type="button"
            aria-label="تسجيل الخروج"
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
          >
            <LogOut className="h-5 w-5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    </header>
  );
}
