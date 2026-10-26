"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpenCheck,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Command,
  FileBarChart2,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  PanelLeft,
  PieChart,
  PlusSquare,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  UserCheck,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/v5/ui/badge";
import { Button } from "@/components/v5/ui/button";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  soon?: boolean;
};

const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Điều hành",
    items: [
      { label: "Tổng quan", href: "/v5", icon: LayoutDashboard },
      { label: "Số liệu giao ban", href: "/v5/giao-ban", icon: FileBarChart2 },
      { label: "Nhập số liệu", href: "/giao-ban/nhap", icon: PlusSquare },
    ],
  },
  {
    label: "Công việc",
    items: [
      { label: "Công việc", href: "/tasks", icon: ClipboardList },
      { label: "Kế hoạch", href: "/plans", icon: CalendarDays },
      { label: "Duyệt hồ sơ", href: "/approvals", icon: CheckCheck },
      { label: "Công chức nhận việc", href: "/my-work", icon: UserCheck },
      { label: "Nhật ký ca trực", href: "/routine", icon: BookOpenCheck },
    ],
  },
  {
    label: "Lịch & báo cáo",
    items: [
      { label: "Lịch", href: "/calendar", icon: CalendarRange },
      { label: "Lịch trực", href: "/roster", icon: Users },
      { label: "Nghỉ phép", href: "/leaves", icon: CalendarOff },
      { label: "Báo cáo", href: "/reports", icon: FileText },
      { label: "Kết quả tháng", href: "/monthly-results", icon: PieChart },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { label: "Quản trị", href: "/admin", icon: ShieldCheck },
      { label: "Hướng dẫn", href: "/huong-dan", icon: CircleHelp },
    ],
  },
];

const PAGE_TITLES: Array<[string, string]> = [
  ["/v5/giao-ban", "Số liệu giao ban"],
  ["/v5", "Tổng quan điều hành"],
  ["/dashboard/v4", "Bảng điều hành V4"],
  ["/dashboard", "Bảng điều hành"],
  ["/giao-ban/nhap", "Nhập số liệu"],
  ["/giao-ban/cau-hinh", "Cấu hình số liệu"],
  ["/giao-ban/bao-cao", "Báo cáo giao ban"],
  ["/giao-ban", "Số liệu giao ban"],
  ["/tasks", "Công việc"],
  ["/plans", "Kế hoạch"],
  ["/approvals", "Duyệt hồ sơ"],
  ["/my-work", "Công chức nhận việc"],
  ["/routine", "Nhật ký ca trực"],
  ["/calendar", "Lịch"],
  ["/roster", "Lịch trực"],
  ["/leaves", "Nghỉ phép"],
  ["/reports", "Báo cáo"],
  ["/monthly-results", "Kết quả tháng"],
  ["/admin", "Quản trị"],
  ["/huong-dan", "Hướng dẫn"],
];

export function V5Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = usePermissions();
  const pageTitle = PAGE_TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] || "Không gian điều hành";
  const today = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  const isActive = (href: string) =>
    pathname === href || (href !== "/v5" && href !== "/dashboard" && pathname.startsWith(`${href}/`));

  return (
    <div className="min-h-screen bg-v5-bg text-v5-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-v5-line bg-v5-surface lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-v5-line px-4">
          <img src="/images/logo-haiquan.png" alt="Hải quan Tà Lùng" className="h-8 w-8 rounded-full object-contain" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold leading-tight">Hải quan Tà Lùng</div>
            <div className="truncate text-[10px] text-v5-muted">Không gian điều hành</div>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-v5-muted" />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="mb-5">
              <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-v5-muted">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return item.soon ? (
                    <div
                      key={item.label}
                      className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-v5-muted/50"
                      title="Sẽ có trong V5"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{item.label}</span>
                      <span className="text-[8px] uppercase tracking-wider">sắp có</span>
                    </div>
                  ) : (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                        active
                          ? "bg-v5-accent-soft font-semibold text-v5-accent"
                          : "text-v5-muted hover:bg-v5-bg hover:text-v5-ink"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{item.label}</span>
                      {active && <ChevronRight className="h-3.5 w-3.5" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-v5-line p-3">
          <Link
            href="/v5"
            className="mb-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-v5-muted hover:bg-v5-bg hover:text-v5-ink"
          >
            <LifeBuoy className="h-3.5 w-3.5" /> Trang tổng quan
          </Link>
          <div className="flex items-center gap-2 rounded-md border border-v5-line px-2 py-2">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-v5-accent-soft text-[10px] font-bold text-v5-accent">
              {(user?.fullName || "HQ").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold">{user?.fullName || "Đang tải…"}</div>
              <div className="truncate text-[9px] text-v5-muted">{user?.positionTitle || user?.role || "—"}</div>
            </div>
            <button
              type="button"
              aria-label="Đăng xuất"
              title="Đăng xuất"
              onClick={async () => {
                try {
                  await fetch("/api/auth/logout", { method: "POST" });
                } finally {
                  window.location.href = "/login";
                }
              }}
              className="rounded p-1 text-v5-muted hover:bg-v5-bg hover:text-v5-danger"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-v5-line bg-v5-surface/95 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
            <div className="flex items-center gap-2 lg:hidden">
              <img src="/images/logo-haiquan.png" alt="" className="h-7 w-7 rounded-full object-contain" />
              <span className="text-sm font-semibold">Hải quan Tà Lùng</span>
            </div>

            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              <PanelLeft className="h-4 w-4 text-v5-muted" />
              <span className="text-[13px] font-semibold text-v5-ink">{pageTitle}</span>
              <Badge variant="outline" className="ml-1 hidden xl:inline-flex">V5</Badge>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                className="hidden h-8 items-center gap-2 rounded-md border border-v5-line bg-v5-surface px-2.5 text-[11px] text-v5-muted md:flex"
                title="Tìm kiếm"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Tìm kiếm</span>
                <kbd className="rounded border border-v5-line bg-v5-bg px-1 text-[9px]">⌘K</kbd>
              </button>
              <span className="hidden text-[10px] text-v5-muted xl:inline">{today}</span>
              <Button variant="ghost" size="icon" aria-label="Thông báo" className="relative" asChild>
                <Link href="/notifications">
                  <Bell className="h-4 w-4" />
                  <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-v5-danger ring-2 ring-v5-surface" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" aria-label="Cấu hình" asChild>
                <Link href="/admin">
                  <Settings2 className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" aria-label="Trợ giúp" asChild>
                <Link href="/huong-dan">
                  <CircleHelp className="h-4 w-4" />
                </Link>
              </Button>
              <div className="ml-1 grid h-7 w-7 place-items-center rounded-full bg-v5-accent text-[10px] font-bold text-white">
                {(user?.fullName || "HQ").slice(0, 2).toUpperCase()}
              </div>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto border-t border-v5-line px-3 py-2 lg:hidden">
            {NAV_SECTIONS.flatMap((section) => section.items).map((item) => (
              <Link
                key={`${item.label}-${item.href}`}
                href={item.href}
                className={cn(
                  "whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-semibold",
                  isActive(item.href) ? "bg-v5-accent-soft text-v5-accent" : "text-v5-muted"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 pb-14 pt-4 lg:px-6 lg:pt-5">{children}</main>
      </div>

      <div className="fixed bottom-4 right-4 z-40 hidden xl:block">
        <div className="flex items-center gap-1 rounded-full border border-v5-line bg-v5-surface px-2.5 py-1.5 text-[10px] text-v5-muted shadow-sm">
          <Command className="h-3 w-3" /> V5 · shadcn/ui
        </div>
      </div>
    </div>
  );
}
