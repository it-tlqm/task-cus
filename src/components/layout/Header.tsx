"use client";

import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, MapPin, Bell, User, LogOut, ChevronDown } from "lucide-react";
import { DemoBanner } from "./DemoBanner";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [selectedUnit, setSelectedUnit] = useState("all");

  if (pathname === "/login") return null;

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/me", { method: "POST" });
      router.push("/login");
    } catch {
      router.push("/login");
    }
  };

  return (
    <header className="fixed top-0 left-0 lg:left-[260px] right-0 z-30 flex flex-col bg-white border-b border-border-default shadow-sm">
      <DemoBanner />
      
      <div className="h-14 lg:h-16 px-4 lg:px-6 flex items-center justify-between gap-4">
        {/* Left: Location & Search */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="hidden xl:flex items-center gap-1.5 text-xs text-slate-600 truncate shrink-0">
            <MapPin className="w-3.5 h-3.5 text-secondary shrink-0" />
            <span>HQ CK Quốc tế Tà Lùng</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-900 font-semibold">Ca trực điều hành</span>
          </div>

          <div className="relative flex-1 max-w-xs lg:max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm nhiệm vụ, mã công việc, chỉ đạo..."
              className="w-full h-9 pl-9 pr-3 rounded bg-slate-50 border border-border-subtle text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-secondary focus:bg-white transition-all"
            />
          </div>

          {/* Unit selector dropdown */}
          <div className="hidden md:block shrink-0">
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="h-9 px-3 rounded bg-slate-50 border border-border-subtle text-xs font-semibold text-slate-800 focus:outline-none focus:border-secondary cursor-pointer"
            >
              <option value="all">Toàn đơn vị — HQ CKQT Tà Lùng</option>
              <option value="A">Bộ phận Nghiệp vụ A (Thủ tục & Thông quan)</option>
              <option value="B">Bộ phận Giám sát B (Barie & Bãi xe)</option>
              <option value="C">Bộ phận Xử lý nghiệp vụ tồn đọng C</option>
              <option value="D">Bộ phận Tổng hợp & Đánh giá D</option>
            </select>
          </div>
        </div>

        {/* Right: Notifications, User, Logout */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            title="Thông báo nhiệm vụ"
            className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-600 rounded-full ring-2 ring-white" />
          </button>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          {/* User Profile */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xs shrink-0">
              NA
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-semibold text-primary leading-tight">
                Đ/c Nguyễn Văn An
              </span>
              <span className="text-[10px] text-slate-500">
                Trưởng nhóm BP Nghiệp vụ A
              </span>
            </div>
          </div>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            title="Đăng xuất"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-border-subtle hover:bg-red-50 hover:text-red-700 text-xs text-slate-600 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Thoát</span>
          </button>
        </div>
      </div>
    </header>
  );
}
