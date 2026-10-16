"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";

const navigationItems = [
  {
    group: "Tổng Quan",
    items: [
      { name: "Bảng điều hành", href: "/dashboard", icon: "space_dashboard" },
      { name: "Hướng dẫn 5 phút", href: "/huong-dan", icon: "help" },
    ],
  },
  {
    group: "Công Việc",
    items: [
      { name: "Việc của tôi", href: "/my-work", icon: "assignment_ind" },
      { name: "Việc đơn vị", href: "/tasks", icon: "hub" },
      { name: "Việc tháng của tôi", href: "/monthly-results", icon: "assessment" },
      { name: "Kế hoạch tuần", href: "/plans", icon: "event_note" },
      { name: "Phê duyệt", href: "/approvals", icon: "fact_check", leadersOnly: true },
      { name: "Biên bản giao ban", href: "/meetings", icon: "forum" },
      { name: "Sổ văn bản", href: "/docs", icon: "mail" },
    ],
  },
  {
    group: "Lịch & Nghỉ",
    items: [
      { name: "Nhật ký ca trực", href: "/routine", icon: "history_edu" },
      { name: "Lịch công tác", href: "/calendar", icon: "calendar_month" },
      { name: "Lịch trực ca", href: "/roster", icon: "schedule" },
      { name: "Nghỉ phép & công tác", href: "/leaves", icon: "beach_access" },
    ],
  },
  {
    group: "Báo Cáo",
    items: [
      { name: "Báo cáo tuần", href: "/reports", icon: "query_stats" },
      { name: "Xuất Excel", href: "/reports/excel", icon: "table_view", needExport: true },
      { name: "Số liệu đã chốt", href: "/reports/snapshots", icon: "verified", needLock: true },
    ],
  },
  {
    group: "Danh Mục",
    items: [
      { name: "Mẫu công việc tuần", href: "/admin/catalog", icon: "list_alt", adminOnly: true },
      { name: "Sản phẩm QĐ1277", href: "/products", icon: "inventory_2" },
    ],
  },
  {
    group: "Quản Trị",
    adminOnly: true,
    items: [
      { name: "Tổ chức & Nhân sự", href: "/admin/organization", icon: "corporate_fare" },
      { name: "Biểu mẫu & Quy trình", href: "/admin/forms", icon: "rule_folder" },
      { name: "Cấu hình hệ thống", href: "/admin/system", icon: "settings" },
      { name: "Nhật ký hệ thống", href: "/admin/audit", icon: "manage_history" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { canApprove, canExport, canLock, showAdminMenu } = usePermissions();
  // Gấp/mở từng cụm menu (nhớ trên máy để sidebar luôn gọn)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("hqtl-nav-open") : null;
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  });
  const isOpen = (g: string) => openGroups[g] !== false;
  // Tự mở cụm chứa trang đang xem (trường hợp vào link trực tiếp khi cụm đang gấp)
  React.useEffect(() => {
    const hit = navigationItems.find((g) =>
      g.items.some((it) => pathname === it.href || (it.href !== "/dashboard" && pathname.startsWith(it.href)))
    );
    if (hit && openGroups[hit.group] === false) {
      setOpenGroups((prev) => ({ ...prev, [hit.group]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  const toggleGroup = (g: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [g]: !isOpen(g) };
      try {
        localStorage.setItem("hqtl-nav-open", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Ẩn mục không có quyền thay vì hiện ra rồi chặn 403 (backend vẫn chặn thật)
  const visibleGroups = navigationItems
    .filter((group) => {
      if ((group as any).adminOnly && !showAdminMenu) return false;
      return true;
    })
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const it = item as any;
        if (it.adminOnly && !showAdminMenu) return false;
        if (it.leadersOnly && !canApprove) return false;
        if (it.needExport && !canExport) return false;
        if (it.needLock && !canLock) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  // Hide sidebar on login page
  if (pathname === "/login") return null;

  return (
    <aside
      className={`hidden lg:flex fixed left-0 top-0 h-full ${
        collapsed ? "w-[72px]" : "w-[260px]"
      } bg-primary-container text-on-primary border-r border-border-default/20 z-50 flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)] transition-all duration-200 ease-in-out`}
    >
      <div className="flex flex-col flex-1 overflow-y-auto no-scrollbar">
        {/* Brand Header */}
        <div className="p-space-md border-b border-border-default/15 flex items-center justify-between gap-space-sm">
          <Link href="/dashboard" className="flex items-center gap-space-sm min-w-0">
            <img
              src="/images/logo-haiquan.png"
              alt="Logo Hải quan Việt Nam"
              className="w-10 h-10 rounded-full object-cover bg-white shrink-0 shadow-sm"
            />
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-headline-sm text-headline-sm uppercase tracking-wide truncate text-white leading-tight">
                  HQCKQT TÀ LÙNG
                </span>
                <span className="font-label-sm text-label-sm text-on-primary-container truncate">
                  Quản lý Kế hoạch &amp; Công việc
                </span>
              </div>
            )}
          </Link>
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
            className="text-on-primary-container hover:text-white p-1 rounded hover:bg-primary transition-colors text-xs"
          >
            <span className="material-symbols-outlined text-[18px]">
              {collapsed ? "chevron_right" : "chevron_left"}
            </span>
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="flex flex-col gap-space-xs p-space-sm">
          {visibleGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="mb-1">
              {!collapsed ? (
                <button
                  onClick={() => toggleGroup(group.group)}
                  className="w-full flex items-center justify-between px-space-sm pt-space-sm pb-space-xs hover:opacity-80 transition-fast"
                  title={isOpen(group.group) ? "Gấp cụm này lại" : "Mở cụm này ra"}
                >
                  <span className="font-label-sm text-label-sm text-on-primary-container uppercase tracking-wider font-semibold">
                    {group.group}
                  </span>
                  <span className={`material-symbols-outlined text-[16px] text-on-primary-container transition-transform ${isOpen(group.group) ? "" : "-rotate-90"}`}>
                    expand_more
                  </span>
                </button>
              ) : null}
              {collapsed && groupIdx > 0 && (
                <div className="h-px bg-white/10 my-2 mx-2" />
              )}
              {(collapsed || isOpen(group.group)) && (
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.name : undefined}
                      className={`flex items-center gap-space-sm px-space-sm py-2 rounded-lg transition-fast active-press ${
                        isActive
                          ? "bg-secondary text-on-secondary font-body-semibold shadow-sm"
                          : "text-on-primary-container hover:bg-primary hover:text-on-primary"
                      } ${collapsed ? "justify-center" : ""}`}
                    >
                      <span className="material-symbols-outlined text-[20px] shrink-0">
                        {item.icon}
                      </span>
                      {!collapsed && (
                        <span className="font-body-md text-body-md truncate">{item.name}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-space-md border-t border-border-default/15 bg-primary/40">
        {!collapsed ? (
          <>
            <div className="flex items-center justify-between mb-space-xs">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-label-sm font-semibold bg-emerald-500/20 text-emerald-100 border border-emerald-300/40">
                VẬN HÀNH CHÍNH THỨC
              </span>
              <span className="font-label-sm text-[11px] text-on-primary-container">v1.2.4</span>
            </div>
            <p className="font-label-sm text-[12px] text-on-primary-container leading-relaxed">
              Hỗ trợ kỹ thuật: Bộ phận CNTT — Nội bộ Tà Lùng
            </p>
          </>
        ) : (
          <div className="flex justify-center" title="Vận hành chính thức v1.2.4">
            <span className="w-2.5 h-2.5 rounded-full bg-status-warning" />
          </div>
        )}
      </div>
    </aside>
  );
}
