"use client";

import { V5Icon } from "@/components/v5/ui/icon";

import React from "react";
import Link from "next/link";
import { NavigationList } from "@/components/layout/NavigationList";
import { ENV_BADGE_LABEL, ENV_HEADER_TITLE, ENV_SIDEBAR_LABEL } from "@/config/app-env";

interface Props {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed = false, onToggle }: Props) {
  return (
    <aside
      aria-label="Thanh điều hướng chính"
      data-testid="app-sidebar"
      className={`fixed left-0 top-0 z-50 hidden h-full flex-col justify-between border-r border-border-default/20 bg-primary-container text-on-primary shadow-[0_1px_8px_rgba(0,0,0,0.04)] transition-all duration-200 ease-in-out lg:flex ${
        collapsed ? "w-[72px]" : "w-[260px]"
      }`}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className={`flex items-center border-b border-white/10 ${
            collapsed ? "justify-center gap-1 px-1 py-2" : "justify-between gap-2 px-3 py-3"
          }`}
        >
          {collapsed ? (
            <>
              <Link
                href="/dashboard"
                aria-label="Về bảng điều hành"
                title="Hải quan Tà Lùng — Quản lý Kế hoạch & Công việc"
                className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              >
                <img
                  src="/images/logo-haiquan.png"
                  alt="Logo Hải quan Việt Nam"
                  className="h-9 w-9 rounded-full bg-white object-cover shadow-sm"
                />
              </Link>
              <button
                type="button"
                onClick={onToggle}
                aria-label="Mở rộng thanh điều hướng"
                title="Mở rộng menu"
                className="focus-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-on-primary-container transition-fast hover:bg-white/10 hover:text-white"
              >
                <V5Icon name="chevron_right" className="text-[16px]" />
              </button>
            </>
          ) : (
            <>
              <Link
                href="/dashboard"
                className="focus-ring flex min-w-0 items-center gap-2.5 rounded-lg"
                aria-label="Về bảng điều hành"
              >
                <img
                  src="/images/logo-haiquan.png"
                  alt="Logo Hải quan Việt Nam"
                  className="h-10 w-10 shrink-0 rounded-full bg-white object-cover shadow-sm"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-bold uppercase leading-tight tracking-wide text-white">
                    Hải quan cửa khẩu Tà Lùng
                  </span>
                  <span className="truncate text-[10.5px] font-medium leading-tight text-on-primary-container">
                    Quản lý Kế hoạch &amp; Công việc
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={onToggle}
                aria-label="Thu gọn thanh điều hướng"
                title="Thu gọn menu"
                className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-on-primary-container transition-fast hover:bg-white/10 hover:text-white"
              >
                <V5Icon name="chevron_left" className="text-[18px]" />
              </button>
            </>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
          <NavigationList collapsed={collapsed} variant="desktop" />
        </div>
      </div>

      <div className="border-t border-white/10 bg-primary/40 px-3 py-3">
        {!collapsed ? (
          <>
            <Link
              href="/huong-dan"
              className="focus-ring mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-medium text-on-primary-container transition-fast hover:bg-white/10 hover:text-white"
            >
              <V5Icon name="help" className="text-[18px]" />
              Hướng dẫn sử dụng
            </Link>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span
                title="Nhãn HỆ THỐNG vận hành chính thức — không phải xác nhận cho số liệu hiển thị."
                className="inline-flex items-center rounded border border-emerald-300/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-100"
              >
                {ENV_SIDEBAR_LABEL}
              </span>
              <span className="text-[10px] text-on-primary-container">v1.2.4</span>
            </div>
            <p className="text-[10.5px] leading-relaxed text-on-primary-container">
              Hỗ trợ kỹ thuật: Bộ phận CNTT — Nội bộ Tà Lùng
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Link
              href="/huong-dan"
              aria-label="Hướng dẫn sử dụng"
              title="Hướng dẫn sử dụng"
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-on-primary-container transition-fast hover:bg-white/10 hover:text-white"
            >
              <V5Icon name="help" className="text-[18px]" />
            </Link>
            <span
              title="Vận hành chính thức v1.2.4"
              className="h-2.5 w-2.5 rounded-full bg-status-warning"
            />
          </div>
        )}
      </div>
    </aside>
  );
}
