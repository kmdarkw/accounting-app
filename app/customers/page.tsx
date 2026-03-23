import Link from "next/link";

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">العملاء</h1>
            <p className="mt-1 text-sm text-slate-500">
              إدارة بيانات العملاء والعقود المرتبطة بهم.
            </p>
          </div>

          <Link
            href="/customers/new"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            إضافة عميل جديد
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">
          استخدم زر "إضافة عميل جديد" لتسجيل عميل برقم عقده وتصنيفه.
        </p>
      </section>
    </div>
  );
}
