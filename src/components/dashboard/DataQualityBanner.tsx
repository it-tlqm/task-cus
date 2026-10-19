"use client";

import React from "react";

export interface MetricDataQuality {
  demoBaselines: number;
  demoEntries: number;
  realEntries: number;
  demoTargets: number;
  demoPresent: boolean;
  mixedWithReal: boolean;
}

/**
 * YC-26 — Cảnh báo bắt buộc tại khu vực số liệu:
 * khi nguồn số liệu đang hiển thị có thành phần DEMO (mốc lũy kế mô phỏng /
 * bản ghi nhập thử / chỉ tiêu giao mô phỏng), đặc biệt khi trộn với bản ghi
 * do cán bộ nhập thật, phải hiện cảnh báo rõ:
 * "Dữ liệu dùng thử/chưa đối soát — không sử dụng làm số liệu báo cáo chính thức."
 * Không chặn thao tác — chỉ nêu rõ trạng thái dữ liệu (minh bạch).
 */
export function DataQualityBanner({ q, className = "" }: { q?: MetricDataQuality | null; className?: string }) {
  if (!q || !q.demoPresent) return null;

  const parts: string[] = [];
  if (q.demoBaselines > 0) parts.push(`${q.demoBaselines} mốc lũy kế mô phỏng`);
  if (q.demoEntries > 0) parts.push(`${q.demoEntries} bản ghi nhập thử (DEMO)`);
  if (q.demoTargets > 0) parts.push(`${q.demoTargets} chỉ tiêu giao mô phỏng`);

  return (
    <div
      data-testid="data-quality-warning"
      className={`rounded-xl border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 flex items-start gap-2.5 ${className}`}
    >
      <span className="material-symbols-outlined text-[20px] text-amber-600 shrink-0 mt-0.5">warning</span>
      <div className="flex flex-col gap-1 text-body-sm leading-snug">
        <span className="font-bold">
          Dữ liệu dùng thử/chưa đối soát — không sử dụng làm số liệu báo cáo chính thức.
        </span>
        <span className="text-body-xs text-amber-800">
          Khu vực này đang gồm {parts.join(", ")}
          {q.mixedWithReal ? `, trộn cùng ${q.realEntries} bản ghi do cán bộ nhập thật` : ""}. Nhãn “CHÍNH THỨC” ở đầu trang là nhãn của
          hệ thống — không phải xác nhận cho số liệu hiển thị. Phân biệt trạng thái: Đã nhập ≠ Đã xác nhận ≠ Đã chốt báo cáo.
        </span>
      </div>
    </div>
  );
}
