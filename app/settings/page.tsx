import Link from "next/link";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">الإعدادات</h1>
        <p className="mt-1 text-sm text-slate-500">إعدادات النظام الأساسية (خاصة بمدير النظام).</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href="/settings/users"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <h2 className="text-base font-semibold text-slate-900">إدارة المستخدمين</h2>
          <p className="mt-1 text-sm text-slate-500">
            إضافة المستخدمين وتفعيلهم أو تعطيلهم وإعادة فرض تغيير كلمة المرور.
          </p>
        </Link>
      </section>
    </div>
  );
}
