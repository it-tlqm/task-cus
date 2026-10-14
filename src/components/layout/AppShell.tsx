"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return <div className="w-full min-h-screen overflow-x-hidden">{children}</div>;
  }

  return (
    <>
      <Sidebar />
      <Header />
      <main className="lg:pl-[260px] pt-[56px] lg:pt-[96px] pb-28 lg:pb-10 min-h-screen bg-app-bg">
        <div className="w-full">{children}</div>
      </main>
      <BottomNav />
    </>
  );
}
