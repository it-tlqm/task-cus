import React from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { UNIT_OFFICIAL_NAME, PARENT_UNIT_NAME } from "@/lib/unit-info";

export function DemoBanner() {
  return (
    <div className="h-6 bg-emerald-50 border-b border-emerald-200/60 px-4 flex items-center justify-between text-xs text-emerald-800 z-50">
      <div className="flex items-center gap-1.5 font-medium">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span className="uppercase tracking-wide font-semibold text-[11px]">
          Hệ thống Vận hành Chính thức — {UNIT_OFFICIAL_NAME}
        </span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <span className="hidden md:inline">{PARENT_UNIT_NAME}</span>
        <span className="px-1.5 py-0.2 bg-emerald-200/50 text-emerald-900 rounded font-semibold text-[10px]">
          CHÍNH THỨC
        </span>
      </div>
    </div>
  );
}
