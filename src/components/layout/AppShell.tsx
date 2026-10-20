"use client";

import React, { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { MobileNavDrawer } from "@/components/layout/MobileNavDrawer";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ContextHelp } from "@/components/ui/ContextHelp";
import { TourGuide } from "@/components/ui/TourGuide";
import { FeedbackButton } from "@/components/ui/FeedbackButton";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  // Thu gọn menu: giữ trạng thái ở đây để Sidebar, Header và vùng nội dung cùng biết.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("hqtl-sidebar-collapsed") === "1") setSidebarCollapsed(true);
    } catch {}
  }, []);

  // Đổi trang thì đóng drawer mobile, tránh che nội dung mới.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("hqtl-sidebar-collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const openMobileMenu = useCallback(() => setMobileMenuOpen(true), []);

  if (isLoginPage) {
    return <div className="min-h-screen w-full overflow-x-hidden">{children}</div>;
  }

  return (
    <div
      className="min-h-screen"
      style={{ "--sidebar-width": sidebarCollapsed ? "72px" : "260px" } as React.CSSProperties}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-surface-container-lowest focus:px-4 focus:py-2 focus:text-body-semibold focus:text-primary focus:shadow-lg"
      >
        Bỏ qua điều hướng, đến nội dung chính
      </a>

      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <Header
        collapsed={sidebarCollapsed}
        onOpenMobileMenu={openMobileMenu}
        mobileMenuOpen={mobileMenuOpen}
      />

      <MobileNavDrawer open={mobileMenuOpen} onClose={closeMobileMenu} />

      <main
        id="main-content"
        tabIndex={-1}
        className={`min-h-screen bg-app-bg pb-28 pt-[56px] transition-[padding-left] duration-200 ease-in-out lg:pb-10 lg:pt-[96px] ${
          sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-[260px]"
        }`}
      >
        <div className="px-margin pb-1 pt-2 lg:hidden">
          <Breadcrumb />
        </div>
        <div className="w-full">{children}</div>
      </main>

      <BottomNav onOpenMenu={openMobileMenu} mobileMenuOpen={mobileMenuOpen} />
      <ContextHelp />
      <TourGuide />
      <FeedbackButton />
    </div>
  );
}
