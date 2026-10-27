"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpenCheck,
  Building2,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FileBarChart2,
  FileCog,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  LogOut,
  Menu,
  Package,
  PanelLeft,
  PieChart,
  PlusSquare,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  UserPlus,
  Users,
  UserCheck,
  X,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import NotificationQuickView from "@/components/notifications/NotificationQuickView";
import CommandPalette from "@/components/layout/CommandPalette";
import { cn } from "@/lib/utils";
import { Button } from "@/components/v5/ui/button";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
};

const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Điều hành",
    items: [
      { label: "Tổng quan", href: "/v5", icon: LayoutDashboard },
      { label: "Số liệu giao ban", href: "/v5/giao-ban", icon: FileBarChart2 },
      { label: "Nhập số liệu", href: "/v5/giao-ban/nhap", icon: PlusSquare },
      { label: "Cấu hình giao ban", href: "/giao-ban/cau-hinh", icon: Settings2 },
      { label: "Chỉ tiêu giao", href: "/giao-ban/cau-hinh?tab=TARGET", icon: Target },
      { label: "Phân công nhập", href: "/giao-ban/cau-hinh?tab=ASSIGN", icon: UserPlus },
      { label: "Báo cáo giao ban", href: "/giao-ban/bao-cao", icon: FileText },
    ],
  },
  {
    label: "Công việc",
    items: [
      { label: "Công việc", href: "/tasks", icon: ClipboardList },
      { label: "Kế hoạch", href: "/plans", icon: CalendarDays },
      { label: "Phê duyệt", href: "/approvals", icon: CheckCheck },
      { label: "Công chức nhận việc", href: "/my-work", icon: UserCheck },
      { label: "Nhật ký ca trực", href: "/routine", icon: BookOpenCheck },
      { label: "Cuộc họp", href: "/meetings", icon: Users },
    ],
  },
  {
    label: "Lịch & báo cáo",
    items: [
      { label: "Lịch công tác", href: "/calendar", icon: CalendarRange },
      { label: "Lịch trực", href: "/roster", icon: Users },
      { label: "Nghỉ phép", href: "/leaves", icon: CalendarOff },
      { label: "Báo cáo", href: "/reports", icon: FileText },
      { label: "Kết quả tháng", href: "/monthly-results", icon: PieChart },
      { label: "Sản phẩm", href: "/products", icon: Package },
      { label: "Tài liệu", href: "/docs", icon: FileCog },
    ],
  },
  {
    label: "Quản trị",
    items: [
      { label: "Tổng quan quản trị", href: "/admin", icon: ShieldCheck },
      { label: "Tổ chức", href: "/admin/organization", icon: Building2 },
      { label: "Phân quyền", href: "/admin/permissions", icon: ShieldCheck },
      { label: "Danh mục", href: "/admin/catalog", icon: FolderKanban },
      { label: "Biểu mẫu", href: "/admin/forms", icon: FileCog },
      { label: "Phản hồi", href: "/admin/feedback", icon: ListChecks },
      { label: "Giám sát", href: "/admin/supervisions", icon: UserCheck },
      { label: "Nhật ký hệ thống", href: "/admin/audit", icon: FileText },
      { label: "Cấu hình hệ thống", href: "/admin/system", icon: Settings2 },
    ],
  },
  {
    label: "Hỗ trợ",
    items: [
      { label: "Hướng dẫn", href: "/huong-dan", icon: CircleHelp },
    ],
  },
];

const PAGE_TITLES: Array<[string, string]> = [
  ["/v5/giao-ban/nhap", "Nhập số liệu"],
  ["/v5/giao-ban", "Số liệu giao ban"],
  ["/v5", "Tổng quan điều hành"],
  ["/dashboard/v4", "Bảng điều hành V4"],
  ["/dashboard", "Bảng điều hành"],
  ["/v5/giao-ban/nhap", "Nhập số liệu"],
  ["/giao-ban/nhap", "Nhập số liệu"],
  ["/giao-ban/cau-hinh", "Cấu hình giao ban"],
  ["/giao-ban/bao-cao", "Báo cáo giao ban"],
  ["/giao-ban", "Số liệu giao ban"],
  ["/tasks", "Công việc"],
  ["/plans", "Kế hoạch"],
  ["/approvals", "Phê duyệt"],
  ["/my-work", "Công chức nhận việc"],
  ["/routine", "Nhật ký ca trực"],
  ["/meetings", "Cuộc họp"],
  ["/calendar", "Lịch công tác"],
  ["/roster", "Lịch trực"],
  ["/leaves", "Nghỉ phép"],
  ["/reports", "Báo cáo"],
  ["/monthly-results", "Kết quả tháng"],
  ["/products", "Sản phẩm"],
  ["/docs", "Tài liệu"],
  ["/admin", "Quản trị"],
  ["/huong-dan", "Hướng dẫn"],
];

function isActivePath(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/v5" || href === "/dashboard" || href === "/admin") return false;
  return pathname.startsWith(`${href}/`);
}

function SidebarNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  return (
    <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
      {NAV_SECTIONS.map((section) => {
        const isCollapsed = !!collapsed[section.label];
        return (
          <div key={section.label} className="mb-2.5">
            <button
              type="button"
              onClick={() => setCollapsed((prev) => ({ ...prev, [section.label]: !prev[section.label] }))}
              aria-expanded={!isCollapsed}
              className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-v5-muted hover:bg-v5-bg hover:text-v5-ink"
            >
              <span>{section.label}</span>
              <ChevronDown className={cn("h-3 w-3 transition-transform", isCollapsed && "-rotate-90")} />
            </button>
            {!isCollapsed && (
              <div className="mt-0.5 space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActivePath(pathname, item.href);
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors",
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
            )}
          </div>
        );
      })}
    </nav>
  );
}

function BrandBlock() {
  return (
    <div className="flex h-14 items-center gap-2.5 border-b border-v5-line px-4">
      <img src="/images/logo-haiquan.png" alt="Hải quan Tà Lùng" className="h-8 w-8 rounded-full object-contain" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold leading-tight">Hải quan Tà Lùng</div>
        <div className="truncate text-[10px] text-v5-muted">Không gian điều hành</div>
      </div>
      <ChevronDown className="h-3.5 w-3.5 text-v5-muted" />
    </div>
  );
}

function UserCard({ user }: { user: ReturnType<typeof usePermissions>["user"] }) {
  return (
    <div className="border-t border-v5-line p-3">
      <Link
        href="/huong-dan"
        className="mb-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-v5-muted hover:bg-v5-bg hover:text-v5-ink"
      >
        <LifeBuoy className="h-3.5 w-3.5" /> Hướng dẫn & hỗ trợ
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
  );
}

export function V5Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = usePermissions();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const pageTitle = PAGE_TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] || "Không gian điều hành";
  const today = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const loadUnread = () => {
      fetch("/api/notifications", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (typeof json?.unreadCount === "number") setUnreadCount(json.unreadCount);
        })
        .catch(() => {});
    };
    loadUnread();
    window.addEventListener("notifications-updated", loadUnread);
    return () => window.removeEventListener("notifications-updated", loadUnread);
  }, []);

  return (
    <div className="v5-shell min-h-screen bg-v5-bg text-v5-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-v5-line bg-v5-surface lg:flex">
        <BrandBlock />
        <SidebarNav pathname={pathname} />
        <UserCard user={user} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Đóng menu"
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-[88%] max-w-[310px] flex-col border-r border-v5-line bg-v5-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-v5-line pr-2">
              <BrandBlock />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 text-v5-muted hover:bg-v5-bg hover:text-v5-ink"
                aria-label="Đóng menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarNav pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <UserCard user={user} />
          </aside>
        </div>
      )}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-v5-line bg-v5-surface/95 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-v5-line text-v5-muted hover:bg-v5-bg hover:text-v5-ink lg:hidden"
              aria-label="Mở menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              <img src="/images/logo-haiquan.png" alt="" className="h-7 w-7 rounded-full object-contain" />
              <span className="truncate text-sm font-semibold">{pageTitle}</span>
            </div>

            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              <PanelLeft className="h-4 w-4 text-v5-muted" />
              <span className="text-[13px] font-semibold text-v5-ink">{pageTitle}</span>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="hidden h-8 items-center gap-2 rounded-md border border-v5-line bg-v5-surface px-2.5 text-[11px] text-v5-muted md:flex"
                title="Tìm kiếm (Ctrl/⌘ K)"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Tìm kiếm</span>
                <kbd className="rounded border border-v5-line bg-v5-bg px-1 text-[9px]">⌘K</kbd>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setCommandOpen(true)}
                aria-label="Tìm kiếm"
              >
                <Search className="h-4 w-4" />
              </Button>
              <span className="hidden text-[10px] text-v5-muted xl:inline">{today}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Thông báo${unreadCount > 0 ? ` (${unreadCount} chưa đọc)` : ""}`}
                className="relative"
                onClick={() => setNotificationsOpen(true)}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-v5-danger px-1 text-center text-[8px] font-bold leading-4 text-white ring-2 ring-v5-surface">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
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
        </header>

        <main className="mx-auto w-full max-w-[1760px] px-3 pb-8 pt-3 lg:px-5 lg:pt-4">{children}</main>
      </div>

      <NotificationQuickView open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
}
