"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  CircleHelp,
  FileText,
  LayoutDashboard,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/v5/ui/badge";
import { Button } from "@/components/v5/ui/button";

const NAV = [
  { label: "Tổng quan", href: "/v5", icon: LayoutDashboard, active: true },
  { label: "Số liệu giao ban", href: "#", icon: BarChart3, soon: true },
  { label: "Công việc", href: "#", icon: ClipboardList, soon: true },
  { label: "Kế hoạch", href: "#", icon: CalendarDays, soon: true },
  { label: "Báo cáo", href: "#", icon: FileText, soon: true },
];

export function V5Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = usePermissions();
  const today = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="v5-root min-h-screen bg-v5-bg text-v5-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[244px] flex-col bg-v5-sidebar text-v5-sidebar-text lg:flex">
        <div className="flex items-center gap-3 px-5 pb-6 pt-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-v5-accent text-sm font-bold text-white">
            TL
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Hải quan Tà Lùng</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-v5-sidebar-text/50">Không gian điều hành</div>
          </div>
        </div>

        <div className="mx-4 mb-5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-v5-sidebar-text/50">
            <Sparkles className="h-3 w-3" /> V5 Preview
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-v5-sidebar-text/65">
            Design system mới · dữ liệu thật · chưa thay production
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.active || pathname === item.href;
            return item.soon ? (
              <span
                key={item.label}
                className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-v5-sidebar-text/35"
                title="Sẽ có trong V5"
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                <span className="text-[9px] uppercase tracking-wider">sắp có</span>
              </span>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/10 text-white"
                    : "text-v5-sidebar-text/70 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-v5-sidebar-text/55 hover:bg-white/[0.06] hover:text-white"
          >
            ← Về giao diện hiện tại
          </Link>
          <div className="mt-2 flex items-center gap-2 px-3 py-2 text-[10px] text-v5-sidebar-text/35">
            <Settings2 className="h-3.5 w-3.5" /> Bản xem trước nội bộ
          </div>
        </div>
      </aside>

      <div className="lg:pl-[244px]">
        <header className="sticky top-0 z-20 border-b border-v5-line/80 bg-v5-bg/90 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-7">
            <div className="flex items-center gap-2 lg:hidden">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-v5-accent text-[11px] font-bold text-white">TL</div>
              <span className="text-sm font-semibold">V5 Preview</span>
            </div>

            <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-v5-muted" />
                <input
                  aria-label="Tìm kiếm trong V5"
                  placeholder="Tìm chỉ tiêu, công việc, người phụ trách…"
                  className="h-9 w-full rounded-lg border border-v5-line bg-v5-surface pl-9 pr-3 text-sm text-v5-ink outline-none placeholder:text-v5-muted/70 focus:border-v5-accent/40 focus:ring-2 focus:ring-v5-accent/10"
                />
              </div>
              <Badge variant="accent" className="ml-1 hidden xl:inline-flex">Dữ liệu thật</Badge>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-xs text-v5-muted md:inline">{today}</span>
              <Button variant="ghost" size="icon" aria-label="Thông báo">
                <Bell className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Trợ giúp">
                <CircleHelp className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2 rounded-lg border border-v5-line bg-v5-surface px-2 py-1.5">
                <div className="grid h-7 w-7 place-items-center rounded-md bg-v5-accent-soft text-[10px] font-bold text-v5-accent">
                  {(user?.fullName || "HQ").slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden min-w-0 leading-tight sm:block">
                  <div className="max-w-[140px] truncate text-[11px] font-semibold">{user?.fullName || "Đang tải…"}</div>
                  <div className="max-w-[140px] truncate text-[9px] text-v5-muted">{user?.positionTitle || user?.role || ""}</div>
                </div>
              </div>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto border-t border-v5-line/60 px-3 py-2 lg:hidden">
            {NAV.map((item) => (
              <span
                key={item.label}
                className={cn(
                  "whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-semibold",
                  item.active ? "bg-v5-accent-soft text-v5-accent" : "text-v5-muted"
                )}
              >
                {item.label}
              </span>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 pb-16 pt-5 lg:px-7 lg:pt-7">{children}</main>
      </div>
    </div>
  );
}
