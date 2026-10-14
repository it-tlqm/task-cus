import React from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

export function DemoBanner() {
  return (
    <div className="h-6 bg-emerald-50 border-b border-emerald-200/60 px-4 flex items-center justify-between text-xs text-emerald-800 z-50">
      <div className="flex items-center gap-1.5 font-medium">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span className="uppercase tracking-wide font-semibold text-[11px]">
          Hệ thống Vận hành Chính thức — Chi cục Hải quan Cửa khẩu Quốc tế Tà Lùng
        </span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <span className="hidden md:inline">Cục Hải quan tỉnh Cao Bằng</span>
        <span className="px-1.5 py-0.2 bg-emerald-200/50 text-emerald-900 rounded font-semibold text-[10px]">
          CHÍNH THỨC
        </span>
      </div>
    </div>
  );
}
