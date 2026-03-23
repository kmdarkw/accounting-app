import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import ProtectedLayout from "@/app/components/ProtectedLayout";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "تطبيق المحاسبة",
  description: "لوحة تحكم لإدارة العقود والمبيعات والمصروفات",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 text-slate-900">
        <ProtectedLayout>{children}</ProtectedLayout>
      </body>
    </html>
  );
}
