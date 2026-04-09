"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarClock,
  FileText,
  HandCoins,
  LayoutDashboard,
  Settings,
  Tags,
  UserCog,
  Users,
} from "lucide-react";
import type { AppUserRole } from "@/app/lib/users";

const navItems = [
  { label: "الرئيسية", href: "/", icon: LayoutDashboard },
  { label: "المقبوضات", href: "/receipts", icon: FileText },
  { label: "المصروفات", href: "/expenses", icon: HandCoins },
  { label: "الالتزامات", href: "/obligations", icon: CalendarClock },
  { label: "العملاء", href: "/customers", icon: Users },
  { label: "المستخدمون", href: "/users", icon: UserCog },
  { label: "التصنيفات", href: "/categories", icon: Tags },
  { label: "التقارير", href: "/reports", icon: BarChart3 },
  { label: "الإعدادات", href: "/settings", icon: Settings },
];

type SidebarProps = {
  role: AppUserRole | null;
};

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const visibleNavItems =
    role === "super_admin"
      ? navItems
      : navItems.filter((item) => item.href === "/expenses");

  return (
    <aside className="fixed inset-y-0 right-0 z-30 hidden w-72 border-l border-slate-200 bg-white lg:flex lg:flex-col">
      <div className="border-b border-slate-200 px-6 py-5">
        <h1 className="text-lg font-bold text-slate-900">تطبيق المحاسبة</h1>
        <p className="mt-1 text-sm text-slate-500">إدارة العقود والمبيعات</p>
      </div>

      <nav className="flex-1 space-y-2 px-4 py-5">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
