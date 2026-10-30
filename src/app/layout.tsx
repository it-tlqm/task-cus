import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { ToastContainer } from "@/components/ui/Toast";

const inter = Inter({ subsets: ["latin", "vietnamese"] });

export const viewport: Viewport = {
  themeColor: "rgb(27 52 97)",
};

export const metadata: Metadata = {
  title: "Hải quan cửa khẩu Quốc tế Tà Lùng — Quản lý Kế hoạch & Công việc",
  description: "Hệ thống Quản lý Kế hoạch & Công việc — Hải quan cửa khẩu Quốc tế Tà Lùng",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HQ Tà Lùng",
  },
  icons: {
    icon: "/images/logo-haiquan.png",
    apple: "/images/logo-haiquan.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${inter.className} bg-app-bg text-v5-ink antialiased min-h-screen`}>
        <AppShell>
          {children}
        </AppShell>
        <ToastContainer />
      </body>
    </html>
  );
}
