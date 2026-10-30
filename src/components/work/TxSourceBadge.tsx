"use client";

import React from "react";

/**
 * YC-38 (UAT fix) — Hiển thị nguồn danh mục TX của một nhiệm vụ.
 *
 * Nguyên tắc:
 *  - Chỉ hiển thị TX khi liên kết thực sự tồn tại (catalog_entry_id / txSource).
 *  - KHÔNG tự gán mã TX hay nhóm nghiệp vụ cho dữ liệu lịch sử chưa xác định nguồn
 *    → hiển thị "Chưa xác định nguồn".
 *  - Hệ số: NULL → "Chưa có hệ số"; 0 → hiển thị đúng 0. KHÔNG tính điểm ở đây.
 */

export interface TxSourceInfo {
  code: string;
  title?: string | null;
  department?: string | null;
  groupCode?: string | null;
  convertFactor?: number | null;
}

/** Hiển thị hệ số đúng theo dữ liệu danh mục (NULL ≠ 0). */
export function FactorText({ value }: { value?: number | null }) {
  if (value === null || value === undefined) {
    return <span className="text-v5-muted">Chưa có hệ số</span>;
  }
  return (
    <span className="text-v5-muted">
      Hệ số: <span className="font-semibold text-v5-ink">{value}</span>
    </span>
  );
}

export function TxSourceBadge({
  source,
  compact = false,
  className = "",
}: {
  source?: TxSourceInfo | null;
  compact?: boolean;
  className?: string;
}) {
  if (!source || !source.code) {
    return (
      <span className={`text-[11px] text-v5-muted ${className}`}>
        Chưa xác định nguồn
      </span>
    );
  }
  return (
    <span className={`flex flex-col gap-0.5 min-w-0 ${className}`}>
      <span className="text-[11px] text-v5-accent font-semibold truncate">
        TX · {source.code}
      </span>
      {!compact && source.title && (
        <span className="text-[12px] text-v5-ink truncate" title={source.title}>
          {source.title}
        </span>
      )}
      {!compact && (
        <span className="text-[11px] text-v5-muted">
          <FactorText value={source.convertFactor} />
        </span>
      )}
    </span>
  );
}

export default TxSourceBadge;
