"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  {
    group: "Tổng Quan",
    items: [
      { name: "Dashboard điều hành", href: "/dashboard", icon: "space_dashboard" },
    ],
  },
  {
    group: "Kế Hoạch & Công Việc",
    items: [
      { name: "Kế hoạch công tác", href: "/plans", icon: "event_note" },
      { name: "Công việc của tôi", href: "/my-work", icon: "assignment_ind" },
      { name: "Nhiệm vụ chỉ đạo / phối hợp", href: "/tasks", icon: "hub" },
      { name: "Phê duyệt điều hành", href: "/approvals", icon: "fact_check" },
      { name: "Nhật ký công tác thường xuyên", href: "/routine", icon: "history_edu" },
    ],
  },
  {
    group: "Báo Cáo",
    items: [
      { name: "Báo cáo trực tuyến", href: "/reports", icon: "query_stats" },
      { name: "Xuất Excel (.XLSX)", href: "/reports/excel", icon: "table_view" },
      { name: "Báo cáo chốt kỳ", href: "/reports/snapshots", icon: "verified" },
    ],
  },
  {
    group: "Quản Trị Nghiệp Vụ",
    items: [
      { name: "Cơ cấu tổ chức & Nhân sự", href: "/admin/organization", icon: "corporate_fare" },
      { name: "Danh mục đầu việc mẫu", href: "/admin/catalog", icon: "list_alt" },
      { name: "Biểu mẫu & Quy trình", href: "/admin/forms", icon: "rule_folder" },
      { name: "Quản trị & Cấu hình", href: "/admin/system", icon: "settings" },
      { name: "Nhật ký hệ thống (Audit)", href: "/admin/audit", icon: "manage_history" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

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
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0 shadow-sm active-press">
              <span className="material-symbols-outlined text-on-secondary text-[24px]">shield</span>
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-headline-sm text-headline-sm uppercase tracking-wide truncate text-white leading-tight">
                  HQ CKQT TÀ LÙNG
                </span>
                <span className="font-label-sm text-label-sm text-on-primary-container truncate">
                  Quản lý Kế hoạch &amp; Công việc
                </span>
                <span className="font-label-sm text-[11px] text-secondary-fixed tracking-wider uppercase font-semibold">
                  talung-cus-work
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
          {navigationItems.map((group, groupIdx) => (
            <div key={groupIdx} className="mb-1">
              {!collapsed && (
                <div className="px-space-sm pt-space-sm pb-space-xs">
                  <span className="font-label-sm text-label-sm text-on-primary-container uppercase tracking-wider font-semibold">
                    {group.group}
                  </span>
                </div>
              )}
              {collapsed && groupIdx > 0 && (
                <div className="h-px bg-white/10 my-2 mx-2" />
              )}
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
            </div>
          ))}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-space-md border-t border-border-default/15 bg-primary/40">
        {!collapsed ? (
          <>
            <div className="flex items-center justify-between mb-space-xs">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-label-sm font-semibold bg-status-warning/20 text-status-warning border border-status-warning/40">
                DỮ LIỆU MINH HỌA - V1.1
              </span>
              <span className="font-label-sm text-[11px] text-on-primary-container">v1.1.24</span>
            </div>
            <p className="font-label-sm text-[12px] text-on-primary-container leading-relaxed">
              Hỗ trợ kỹ thuật: Bộ phận CNTT — Nội bộ Tà Lùng
            </p>
          </>
        ) : (
          <div className="flex justify-center" title="Dữ liệu minh họa v1.1.24">
            <span className="w-2.5 h-2.5 rounded-full bg-status-warning" />
          </div>
        )}
      </div>
    </aside>
  );
}
