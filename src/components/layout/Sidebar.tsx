"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  UserCheck,
  GitBranch,
  BookOpen,
  FileSpreadsheet,
  Download,
  ShieldAlert,
  Building2,
  ListTree,
  SlidersHorizontal,
  History,
  Shield,
} from "lucide-react";

const navigationItems = [
  {
    group: "TỔNG QUAN",
    items: [
      { name: "Dashboard điều hành", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    group: "KẾ HOẠCH & CÔNG VIỆC",
    items: [
      { name: "Kế hoạch công tác", href: "/plans", icon: CalendarDays },
      { name: "Công việc của tôi", href: "/my-work", icon: UserCheck },
      { name: "Nhiệm vụ chỉ đạo / phối hợp", href: "/tasks", icon: GitBranch },
      { name: "Nhật ký công tác thường xuyên", href: "/routine", icon: BookOpen },
    ],
  },
  {
    group: "BÁO CÁO",
    items: [
      { name: "Báo cáo trực tuyến", href: "/reports", icon: FileSpreadsheet },
      { name: "Xuất Excel (.XLSX)", href: "/reports/excel", icon: Download },
      { name: "Báo cáo chốt kỳ", href: "/reports/snapshots", icon: ShieldAlert },
    ],
  },
  {
    group: "QUẢN TRỊ NGHIỆP VỤ",
    items: [
      { name: "Cơ cấu tổ chức & Nhân sự", href: "/admin/organization", icon: Building2 },
      { name: "Danh mục đầu việc mẫu", href: "/admin/catalog", icon: ListTree },
      { name: "Biểu mẫu & Quy trình", href: "/admin/forms", icon: SlidersHorizontal },
      { name: "Nhật ký hệ thống (Audit)", href: "/admin/audit", icon: History },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  // Hide sidebar on login page
  if (pathname === "/login") return null;

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-full w-[260px] bg-primary-container text-white border-r border-white/10 z-40 flex-col justify-between shadow-sm">
      <div className="flex flex-col flex-1 overflow-y-auto">
        {/* Brand Header */}
        <div className="p-4 border-b border-white/15 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm uppercase tracking-wide truncate text-white leading-tight">
              HQ CKQT TÀ LÙNG
            </span>
            <span className="text-[11px] text-slate-300 truncate">
              Quản lý Kế hoạch & Công việc
            </span>
            <span className="text-[10px] text-teal-300 tracking-wider uppercase font-semibold">
              talung-cus-work
            </span>
          </div>
        </div>

        {/* Navigation Groups */}
        <nav className="flex flex-col gap-1 p-2">
          {navigationItems.map((group, groupIdx) => (
            <div key={groupIdx} className="mb-2">
              <div className="px-3 pt-3 pb-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  {group.group}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? "bg-secondary text-white font-semibold shadow-sm"
                          : "text-slate-200 hover:bg-primary-light hover:text-white"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Footer Demo Info */}
      <div className="p-3 border-t border-white/15 bg-primary/40">
        <div className="flex items-center justify-between mb-1">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            DỮ LIỆU MINH HỌA - V1.1
          </span>
          <span className="text-[11px] text-slate-400">v1.1.24</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-tight">
          Chi cục Hải quan CKQT Tà Lùng
        </p>
      </div>
    </aside>
  );
}
