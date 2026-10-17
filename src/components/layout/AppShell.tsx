"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { ContextHelp } from "@/components/ui/ContextHelp";
import { TourGuide } from "@/components/ui/TourGuide";
import { FeedbackButton } from "@/components/ui/FeedbackButton";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  // Thu gọn menu: giữ trạng thái ở đây để Sidebar, Header và vùng nội dung cùng biết.
  // (Trước đây Header/nội dung cứng 260px nên thu menu xong vẫn trống một mảng.)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("hqtl-sidebar-collapsed") === "1") setSidebarCollapsed(true);
    } catch {}
  }, []);
  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("hqtl-sidebar-collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  if (isLoginPage) {
    return <div className="w-full min-h-screen overflow-x-hidden">{children}</div>;
  }

  return (
    <>
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <Header collapsed={sidebarCollapsed} />
      <main
        className={`pt-[56px] lg:pt-[96px] pb-28 lg:pb-10 min-h-screen bg-app-bg transition-[padding-left] duration-200 ease-in-out ${
          sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-[260px]"
        }`}
      >
        <div className="w-full">{children}</div>
      </main>
      <BottomNav />
      <ContextHelp />
      <TourGuide />
      <FeedbackButton />
    </>
  );
}
