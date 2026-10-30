"use client";

import { V5Icon } from "@/components/v5/ui/lucide-icon";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ChangePasswordModal } from "@/components/ui/ChangePasswordModal";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import NotificationQuickView from "@/components/notifications/NotificationQuickView";
import CommandPalette from "@/components/layout/CommandPalette";
import { clearClientSession } from "@/lib/client-session";
import {
  UNIT_OFFICIAL_NAME,
  UNIT_ALL_LABEL,
  getRoleDisplayName,
} from "@/lib/unit-info";
import { ENV_BADGE_LABEL, ENV_HEADER_TITLE, ENV_SIDEBAR_LABEL } from "@/config/app-env";

interface OrgUnitOption {
  id: string;
  name: string;
  code: string;
}

interface Props {
  collapsed?: boolean;
  onOpenMobileMenu?: () => void;
  mobileMenuOpen?: boolean;
}

export function Header({ collapsed = false, onOpenMobileMenu, mobileMenuOpen = false }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [isChangePassOpen, setIsChangePassOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState("all");
  const [orgUnits, setOrgUnits] = useState<OrgUnitOption[]>([]);
  const [currentUser, setCurrentUser] = useState<{
    fullName: string;
    role: string;
    positionTitle?: string;
    unitName?: string;
  }>({
    fullName: "",
    role: "STAFF",
    unitName: "",
  });
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [quickNotificationsOpen, setQuickNotificationsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setCurrentUser({
            fullName: data.user.fullName || "Cán bộ",
            role: data.user.role || "STAFF",
            positionTitle: data.user.positionTitle || undefined,
            unitName: data.user.unitName || data.user.unit?.name || "",
          });
        }
      })
      .catch(() => {});

    fetch("/api/org-units/tree")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.flatList && Array.isArray(json.flatList)) {
          setOrgUnits(
            json.flatList.map((u: any) => ({
              id: u.id,
              name: u.name,
              code: u.code,
            }))
          );
        }
      })
      .catch(() => {});

    if (typeof window !== "undefined") {
      const u = new URLSearchParams(window.location.search).get("unitId");
      if (u) setSelectedUnit(u);
    }

    const loadUnreadCount = () => {
      fetch("/api/notifications")
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (typeof json?.unreadCount === "number") {
            setUnreadCount(json.unreadCount);
          }
        })
        .catch(() => {});
    };

    loadUnreadCount();
    window.addEventListener("notifications-updated", loadUnreadCount);
    return () => {
      window.removeEventListener("notifications-updated", loadUnreadCount);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (pathname === "/login") return null;

  const handleLogout = async () => {
    await clearClientSession();
    router.push("/login");
    router.refresh();
  };

  const getRoleBadgeLabel = (role: string) => {
    switch (role) {
      case "UNIT_LEADER":
        return "Lãnh đạo đơn vị";
      case "DEPARTMENT_LEADER":
        return "Lãnh đạo bộ phận";
      case "SYSTEM_ADMIN":
        return "Quản trị hệ thống";
      case "STAFF":
        return "Công chức";
      default:
        return getRoleDisplayName(role);
    }
  };

  const displayName = currentUser.fullName || "Đang tải...";
  const displayRole =
    currentUser.positionTitle ||
    (currentUser.role ? getRoleBadgeLabel(currentUser.role) : "Cán bộ công chức");

  return (
    <>
      {/* DESKTOP HEADER */}
      <header
        className={`fixed right-0 top-0 z-40 hidden h-24 flex-col border-b border-v5-line bg-v5-surface shadow-[0_1px_8px_rgba(0,0,0,0.04)] transition-all duration-200 ease-in-out lg:flex ${
          collapsed ? "left-[72px]" : "left-[260px]"
        }`}
      >
        <div
          title="Nhãn xác nhận HỆ THỐNG đang vận hành chính thức — không phải xác nhận cho số liệu hiển thị. Trạng thái số liệu xem tại từng khu vực số liệu."
          className="flex h-6 items-center justify-between border-b border-v5-line/40 bg-v5-accent/10 px-space-md"
        >
          <div className="flex items-center gap-2">
            <V5Icon name="verified" className="text-[14px] text-v5-ink" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-v5-ink">
              {ENV_HEADER_TITLE} — {UNIT_OFFICIAL_NAME.toUpperCase()}
            </span>
          </div>
          <span className="text-[11px] font-medium text-v5-muted">
            Cổng thông tin điều hành nội bộ · Trực tuyến 24/7
          </span>
        </div>

        <div className="flex h-[72px] items-center justify-between gap-space-md px-space-lg">
          <div className="flex min-w-0 flex-1 items-center gap-space-md">
            <div className="flex min-w-0 max-w-[560px] flex-1 flex-col gap-0.5">
              <Breadcrumb className="hidden md:flex" />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (searchKeyword.trim()) {
                    router.push(`/tasks?q=${encodeURIComponent(searchKeyword.trim())}`);
                  }
                }}
                className="relative w-full max-w-md"
                role="search"
              >
                <V5Icon name="search" className="absolute left-3 top-2.5 text-[18px] text-v5-muted" />
                <input
                  type="search"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  aria-label="Tìm kiếm nhiệm vụ, mã công việc, văn bản chỉ đạo"
                  placeholder="Tìm nhiệm vụ, mã việc, văn bản..."
                  className="h-9 w-full rounded border border-v5-line bg-v5-surface pl-9 pr-3 text-[12px] text-v5-ink placeholder:text-v5-muted transition-fast focus:border-v5-accent focus:outline-none focus:ring-1 focus:ring-v5-accent"
                />
              </form>
            </div>

            <div className="w-[160px] shrink-0 2xl:w-[220px]">
              <select
                value={selectedUnit}
                aria-label="Chọn đơn vị công tác"
                title={UNIT_ALL_LABEL}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedUnit(val);
                  if (pathname === "/tasks") {
                    router.push(val === "all" ? "/tasks" : `/tasks?unitId=${encodeURIComponent(val)}`);
                  } else if (val !== "all") {
                    router.push(`/tasks?unitId=${encodeURIComponent(val)}`);
                  }
                }}
                className="h-9 w-full cursor-pointer truncate rounded border border-v5-line bg-v5-surface px-3 text-[12px] text-v5-ink transition-fast focus:border-v5-accent focus:outline-none"
              >
                <option value="all">{UNIT_ALL_LABEL}</option>
                {orgUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-space-md">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="focus-ring flex items-center gap-1.5 rounded border border-v5-line px-2 py-1.5 text-v5-muted transition-fast hover:bg-v5-bg active-press"
              title="Tìm nhanh (Ctrl+K)"
              aria-label="Tìm nhanh và hành động"
            >
              <V5Icon name="search" className="text-[18px]" />
              <kbd className="hidden rounded border border-v5-line bg-v5-bg px-1 py-0.5 text-[9px] font-semibold 2xl:inline">
                Ctrl K
              </kbd>
            </button>

            <button
              type="button"
              onClick={() => setQuickNotificationsOpen(true)}
              className="focus-ring relative rounded p-1.5 transition-fast hover:bg-v5-bg active-press"
              title="Thông báo điều hành"
              aria-label="Mở thông báo nhanh"
              aria-haspopup="dialog"
              aria-expanded={quickNotificationsOpen}
            >
              <V5Icon name="notifications" className="text-[22px] text-v5-muted" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-v5-danger px-1 py-0.2 text-center text-[10px] font-bold leading-tight text-white shadow-sm ring-2 ring-v5-surface">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            <div className="h-6 w-px bg-v5-line" />

            <div className="flex items-center gap-space-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-v5-accent text-xs font-bold text-white shadow-sm">
                <V5Icon name="person" className="text-[18px]" />
              </div>
              <div className="hidden min-w-0 flex-col text-left xl:flex">
                <span
                  className="max-w-[130px] truncate text-[13px] font-semibold leading-tight text-v5-ink 2xl:max-w-[200px]"
                  title={currentUser.unitName ? `${displayName} — ${currentUser.unitName}` : displayName}
                >
                  {displayName}
                </span>
                <span
                  className="max-w-[130px] truncate text-[11px] text-v5-muted 2xl:max-w-[200px]"
                  title={displayRole}
                >
                  {displayRole}
                  {currentUser.unitName ? ` • ${currentUser.unitName}` : ""}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsChangePassOpen(true)}
              title="Thay đổi mật khẩu cá nhân"
              aria-label="Thay đổi mật khẩu cá nhân"
              className="focus-ring flex items-center gap-1 rounded border border-v5-line px-space-sm py-1.5 text-[12px] text-v5-muted transition-fast hover:bg-v5-bg active-press"
            >
              <V5Icon name="key" className="text-[16px] text-v5-accent" />
              <span className="hidden xl:inline">Đổi MK</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              title="Đăng xuất khỏi hệ thống"
              aria-label="Đăng xuất khỏi hệ thống"
              className="focus-ring flex items-center gap-1 rounded border border-v5-line px-space-sm py-1.5 text-[12px] text-v5-muted transition-fast hover:bg-v5-danger-soft hover:text-v5-danger active-press"
            >
              <V5Icon name="logout" className="text-[16px]" />
              <span className="hidden xl:inline">Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE TOPBAR */}
      <header className="fixed top-0 z-50 w-full border-b border-v5-line/60 bg-v5-surface/95 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center justify-between px-margin">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenMobileMenu}
              aria-label="Mở menu điều hướng"
              aria-controls="mobile-navigation-drawer"
              aria-expanded={mobileMenuOpen}
              data-testid="mobile-menu-button"
              className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-v5-ink-container transition-fast hover:bg-v5-bg active-press"
            >
              <V5Icon name="menu" className="text-[23px]" />
            </button>

            <Link href="/dashboard" className="flex min-w-0 items-center gap-2" aria-label="Về bảng điều hành">
              <img
                src="/images/logo-haiquan.png"
                alt="Logo Hải quan Việt Nam"
                className="h-9 w-9 shrink-0 rounded-full bg-white object-cover"
              />
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-bold leading-tight tracking-tight text-v5-ink-container">
                    HẢI QUAN CỬA KHẨU TÀ LÙNG
                  </span>
                  <span
                    title="Nhãn HỆ THỐNG vận hành chính thức — không phải xác nhận cho số liệu hiển thị."
                    className="hidden rounded border border-emerald-200/80 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide text-emerald-700 min-[390px]:inline"
                  >
                    {ENV_BADGE_LABEL}
                  </span>
                </span>
                <span className="max-w-[150px] truncate text-[10.5px] leading-tight text-v5-muted">
                  {currentUser.unitName || "Quản lý Kế hoạch & Công việc"}
                </span>
              </span>
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              aria-label="Tìm nhanh và hành động"
              className="focus-ring flex h-10 w-10 items-center justify-center rounded-lg text-v5-ink-container transition-fast hover:bg-v5-bg active-press"
            >
              <V5Icon name="search" className="text-[21px]" />
            </button>
            <button
              type="button"
              onClick={() => setQuickNotificationsOpen(true)}
              aria-label="Mở thông báo nhanh"
              aria-haspopup="dialog"
              aria-expanded={quickNotificationsOpen}
              className="focus-ring relative flex h-10 w-10 items-center justify-center rounded-lg text-v5-ink-container transition-fast hover:bg-v5-bg active-press"
            >
              <V5Icon name="notifications" className="text-[22px]" />
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-v5-danger ring-2 ring-v5-surface" />
              )}
            </button>
            <button
              type="button"
              onClick={onOpenMobileMenu}
              aria-label="Mở menu tài khoản và điều hướng"
              aria-expanded={mobileMenuOpen}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-full bg-v5-accent text-white shadow-sm transition-fast active-press"
            >
              <V5Icon name="person" className="text-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />

      <NotificationQuickView
        open={quickNotificationsOpen}
        onClose={() => setQuickNotificationsOpen(false)}
      />

      <ChangePasswordModal
        isOpen={isChangePassOpen}
        onClose={() => setIsChangePassOpen(false)}
      />
    </>
  );
}
