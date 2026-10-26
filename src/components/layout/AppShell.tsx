"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { V5Shell } from "@/components/v5/V5Shell";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login" || pathname === "/change-password";
  const isV5Route = pathname === "/v5" || pathname.startsWith("/v5/");

  if (isLoginPage) {
    return <div className="min-h-screen w-full overflow-x-hidden">{children}</div>;
  }

  if (isV5Route) {
    return <div className="min-h-screen w-full overflow-x-hidden">{children}</div>;
  }

  return <V5Shell>{children}</V5Shell>;
}
