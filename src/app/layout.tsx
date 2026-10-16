import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { ToastContainer } from "@/components/ui/Toast";

const inter = Inter({ subsets: ["latin", "vietnamese"] });

export const metadata: Metadata = {
  title: "Hải quan cửa khẩu Quốc tế Tà Lùng — Quản lý Kế hoạch & Công việc",
  description: "Hệ thống Quản lý Kế hoạch & Công việc — Hải quan cửa khẩu Quốc tế Tà Lùng",
  manifest: "/manifest.webmanifest",
  themeColor: "#0f2a43",
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.className} bg-app-bg text-on-surface antialiased min-h-screen`}>
        <AppShell>
          {children}
        </AppShell>
        <ToastContainer />
      </body>
    </html>
  );
}
