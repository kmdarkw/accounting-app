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
  Users,
} from "lucide-react";

const navItems = [
  { label: "الرئيسية", href: "/", icon: LayoutDashboard },
  { label: "المقبوضات", href: "/receipts", icon: FileText },
  { label: "المصروفات", href: "/expenses", icon: HandCoins },
  { label: "الالتزامات", href: "/obligations", icon: CalendarClock },
  { label: "العملاء", href: "/customers", icon: Users },
  { label: "التصنيفات", href: "/categories", icon: Tags },
  { label: "التقارير", href: "/reports", icon: BarChart3 },
  { label: "الإعدادات", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 right-0 z-30 hidden w-72 border-l border-slate-200 bg-white lg:flex lg:flex-col">
      <div className="border-b border-slate-200 px-6 py-5">
        <h1 className="text-lg font-bold text-slate-900">تطبيق المحاسبة</h1>
        <p className="mt-1 text-sm text-slate-500">إدارة العقود والمبيعات</p>
      </div>

      <nav className="flex-1 space-y-2 px-4 py-5">
        {navItems.map((item) => {
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
