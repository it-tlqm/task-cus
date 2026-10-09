import React from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

export function DemoBanner() {
  return (
    <div className="h-6 bg-amber-50 border-b border-amber-200/60 px-4 flex items-center justify-between text-xs text-amber-800 z-50">
      <div className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <span className="uppercase tracking-wide font-semibold text-[11px]">
          Môi trường thiết kế mẫu — Dữ liệu giả lập nghiệp vụ
        </span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <span className="hidden md:inline">Chi cục Hải quan CKQT Tà Lùng</span>
        <span className="px-1.5 py-0.2 bg-amber-200/50 text-amber-900 rounded font-semibold text-[10px]">
          DEMO MODE
        </span>
      </div>
    </div>
  );
}
