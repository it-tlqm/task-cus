"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ChangePasswordModal } from "@/components/ui/ChangePasswordModal";
import {
  UNIT_OFFICIAL_NAME,
  UNIT_SHORT_NAME,
  UNIT_ALL_LABEL,
  getRoleDisplayName,
} from "@/lib/unit-info";

interface OrgUnitOption {
  id: string;
  name: string;
  code: string;
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [isChangePassOpen, setIsChangePassOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState("all");
  const [orgUnits, setOrgUnits] = useState<OrgUnitOption[]>([]);
  const [currentUser, setCurrentUser] = useState<{
    fullName: string;
    role: string;
    unitName?: string;
  }>({
    fullName: "Nguyễn Văn An",
    role: "TRUONG_BO_PHAN",
    unitName: "Bộ phận Nghiệp vụ A",
  });
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [searchKeyword, setSearchKeyword] = useState("");

  useEffect(() => {
    // Attempt to load current user from API
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setCurrentUser({
            fullName: data.user.fullName || "Nguyễn Văn An",
            role: data.user.role || "TRUONG_BO_PHAN",
            unitName: data.user.unit?.name || "Bộ phận Nghiệp vụ A",
          });
        }
      })
      .catch(() => {});

    // Load live org units from PostgreSQL
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

    // Load live unread notifications count from PostgreSQL
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

  if (pathname === "/login") return null;

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    router.push("/login");
  };

  const getRoleBadgeLabel = (role: string) => {
    // Mã vai trò cũ (tương thích) giữ nhãn cũ; mã chuẩn dùng tên chức danh chính thức
    switch (role) {
      case "LANH_DAO":
        return "Lãnh đạo đơn vị";
      case "TRUONG_BO_PHAN":
        return "Trưởng bộ phận";
      case "CAN_BO":
        return "Công chức";
      case "ADMIN":
        return "Quản trị hệ thống";
      default:
        return getRoleDisplayName(role);
    }
  };

  return (
    <>
      {/* DESKTOP HEADER */}
      <header className="hidden lg:flex fixed top-0 left-[260px] right-0 h-24 bg-surface-container-lowest z-40 flex-col border-b border-border-default shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        {/* Banner Vận hành Chính thức */}
        <div className="h-6 bg-primary/10 border-b border-border-default/40 px-space-md flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[14px]">
              verified
            </span>
            <span className="font-label-sm text-[11px] text-primary uppercase tracking-wide font-semibold">
              HỆ THỐNG VẬN HÀNH CHÍNH THỨC — {UNIT_OFFICIAL_NAME.toUpperCase()}
            </span>
          </div>
          <span className="font-label-sm text-[11px] text-on-surface-variant font-medium">
            Cổng thông tin điều hành nội bộ · Trực tuyến 24/7
          </span>
        </div>

        {/* Main Desktop Header Row */}
        <div className="h-[72px] px-space-lg flex items-center justify-between gap-space-md">
          {/* Left: Location Breadcrumb & Search */}
          <div className="flex items-center gap-space-md flex-1 min-w-0">
            <div className="hidden xl:flex items-center gap-2 font-label-md text-label-md text-on-surface-variant truncate shrink-0">
              <img
                src="/images/logo-haiquan.png"
                alt="Logo Hải quan Việt Nam"
                className="w-9 h-9 rounded-full object-cover bg-white shrink-0"
              />
              <span>Đơn vị: {UNIT_SHORT_NAME}</span>
              <span className="text-outline-variant">/</span>
              <span className="text-on-surface font-body-semibold">Lãnh đạo đơn vị</span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (searchKeyword.trim()) {
                  router.push(`/tasks?q=${encodeURIComponent(searchKeyword.trim())}`);
                }
              }}
              className="relative flex-1 max-w-md"
            >
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-outline text-[18px]">
                search
              </span>
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                aria-label="Tìm kiếm nhiệm vụ, mã công việc, văn bản chỉ đạo"
                placeholder="Tìm kiếm nhiệm vụ, mã công việc, văn bản chỉ đạo... (Enter để tìm)"
                className="w-full h-9 pl-9 pr-3 rounded bg-surface border border-border-subtle font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-fast"
              />
            </form>

            <div className="shrink-0">
              <select
                value={selectedUnit}
                aria-label="Chọn đơn vị công tác"
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedUnit(val);
                  if (pathname === "/tasks") {
                    if (val === "all") {
                      router.push("/tasks");
                    } else {
                      router.push(`/tasks?unitId=${encodeURIComponent(val)}`);
                    }
                  } else {
                    if (val !== "all") {
                      router.push(`/tasks?unitId=${encodeURIComponent(val)}`);
                    }
                  }
                }}
                className="h-9 px-3 rounded bg-surface border border-border-subtle font-body-md text-body-md text-on-surface focus:outline-none focus:border-secondary transition-fast cursor-pointer"
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

          {/* Right: Notifications, User, Logout */}
          <div className="flex items-center gap-space-md shrink-0">
            <Link
              href="/notifications"
              className="relative p-1.5 rounded hover:bg-surface-subtle transition-fast active-press"
              title="Thông báo điều hành"
              aria-label="Thông báo điều hành"
            >
              <span className="material-symbols-outlined text-on-surface-variant text-[22px]">
                notifications
              </span>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 px-1 py-0.2 min-w-[18px] text-center bg-status-danger text-white rounded-full text-[10px] font-bold ring-2 ring-surface-container-lowest shadow-sm leading-tight">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>

            <div className="h-6 w-px bg-border-default" />

            <div className="flex items-center gap-space-sm">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold text-xs shadow-sm">
                <span className="material-symbols-outlined text-[18px]">person</span>
              </div>
              <div className="flex flex-col text-left">
                <span className="font-body-semibold text-body-semibold text-primary leading-tight">
                  {currentUser.fullName}
                </span>
                <span className="font-label-sm text-label-sm text-outline">
                  {getRoleBadgeLabel(currentUser.role)}
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsChangePassOpen(true)}
              title="Thay đổi mật khẩu cá nhân"
              aria-label="Thay đổi mật khẩu cá nhân"
              className="flex items-center gap-1 px-space-sm py-1.5 rounded border border-border-subtle hover:bg-surface-subtle transition-fast font-label-md text-label-md text-on-surface-variant active-press"
            >
              <span className="material-symbols-outlined text-[16px] text-secondary">key</span>
              <span className="hidden xl:inline">Đổi MK</span>
            </button>

            <button
              onClick={handleLogout}
              title="Đăng xuất khỏi hệ thống"
              aria-label="Đăng xuất khỏi hệ thống"
              className="flex items-center gap-1 px-space-sm py-1.5 rounded border border-border-subtle hover:bg-status-danger-bg hover:text-status-danger transition-fast font-label-md text-label-md text-on-surface-variant active-press"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
              <span className="hidden md:inline">Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE TOPBAR */}
      <header className="lg:hidden fixed top-0 w-full z-50 pt-safe bg-surface/95 backdrop-blur-xl border-b border-border-default/60 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="h-14 px-margin flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <img
              src="/images/logo-haiquan.png"
              alt="Logo Hải quan Việt Nam"
              className="w-9 h-9 rounded-full object-cover bg-white shrink-0"
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-space-xs">
                <span className="font-headline-sm text-headline-sm text-primary-container tracking-tight font-bold">
                  TALUNG-CUS-WORK
                </span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-label-sm text-[10px] leading-none uppercase tracking-wide font-bold">
                  CHÍNH THỨC
                </span>
              </div>
              <span className="font-label-sm text-[11px] text-on-surface-variant line-clamp-1">
                {currentUser.unitName || "Hải quan CKQT Tà Lùng"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-space-xs">
            <button
              onClick={() => setIsChangePassOpen(true)}
              title="Đổi mật khẩu"
              aria-label="Đổi mật khẩu"
              className="w-9 h-9 flex items-center justify-center text-primary-container rounded-lg hover:bg-surface-subtle transition-fast active-press"
            >
              <span className="material-symbols-outlined text-[20px]">key</span>
            </button>
            <Link
              href="/notifications"
              aria-label="Thông báo hệ thống"
              className="w-10 h-10 flex items-center justify-center relative text-primary-container rounded-lg hover:bg-surface-subtle transition-fast active-press"
            >
              <span className="material-symbols-outlined text-[22px]">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-status-danger ring-2 ring-surface" />
              )}
            </Link>
            <div
              onClick={handleLogout}
              title="Đăng xuất"
              className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary cursor-pointer active-press shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">person</span>
            </div>
          </div>
        </div>
      </header>

      {/* Modal Đổi mật khẩu cá nhân */}
      <ChangePasswordModal
        isOpen={isChangePassOpen}
        onClose={() => setIsChangePassOpen(false)}
      />
    </>
  );
}
