import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";

const inter = Inter({ subsets: ["latin", "vietnamese"] });

export const metadata: Metadata = {
  title: "HQ TÀ LÙNG — Quản lý Kế hoạch & Công việc (talung-cus-work)",
  description: "Hệ thống Quản lý Kế hoạch & Công việc Hải quan Cửa khẩu quốc tế Tà Lùng",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${inter.className} bg-app-bg text-slate-900 antialiased min-h-screen`}>
        <Sidebar />
        <Header />
        <main className="lg:pl-[260px] pt-[84px] lg:pt-[92px] pb-20 lg:pb-8 min-h-screen">
          <div className="w-full px-4 lg:px-6">
            {children}
          </div>
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
