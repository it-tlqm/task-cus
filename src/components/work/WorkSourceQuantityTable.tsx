"use client";

import React from "react";

export interface WorkSourceLine {
  key: string;
  kind: "TX" | "QD1277";
  code: string;
  title: string;
  quantity: string;
  quantityUnit: string;
  factor: number | null;
  reviewState?: string | null;
  canEdit?: boolean;
  canRemove?: boolean;
}

interface Props {
  lines: WorkSourceLine[];
  onQuantityChange?: (key: string, value: string) => void;
  onUnitChange?: (key: string, value: string) => void;
  onRemove?: (key: string) => void;
  note?: string;
  readOnly?: boolean;
}

/**
 * Bảng nguồn công việc dùng chung: mỗi dòng TX/QĐ1277 có số lượng, đơn vị,
 * hệ số riêng. Dùng ở Kế hoạch, Việc của tôi, Giao việc và Xác nhận hoàn thành.
 */
export function WorkSourceQuantityTable({
  lines,
  onQuantityChange,
  onUnitChange,
  onRemove,
  note = "Mỗi dòng một số lượng riêng. Dòng chưa có hệ số vẫn ghi nhận nhưng chưa tính điểm.",
  readOnly = false,
}: Props) {
  if (lines.length === 0) return null;

  return (
    <div className="shrink-0 overflow-hidden rounded-lg border border-v5-line">
      <table className="w-full table-fixed text-[11px]">
        <thead className="bg-v5-bg text-v5-muted">
          <tr>
            <th className="px-2 py-1.5 text-left font-semibold">Nguồn</th>
            <th className="w-[92px] px-2 py-1.5 text-right font-semibold">SL giao</th>
            <th className="w-[110px] px-2 py-1.5 text-left font-semibold">Đơn vị</th>
            <th className="w-[52px] px-2 py-1.5 text-right font-semibold">Hệ số</th>
            {!readOnly && <th className="w-7" />}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const isTx = line.kind === "TX";
            const canEdit = !readOnly && line.canEdit !== false;
            return (
              <tr key={line.key} className="border-t border-v5-line/60 align-top">
                <td className="px-2 py-1.5">
                  <div
                    className={`font-mono text-[10px] font-semibold ${
                      isTx ? "text-teal-700" : "text-indigo-700"
                    }`}
                  >
                    {isTx ? "TX" : "QĐ1277"} · {line.code}
                  </div>
                  <div className="line-clamp-2 text-v5-ink">{line.title}</div>
                </td>
                <td className="px-1 py-1.5">
                  {readOnly ? (
                    <div className="h-8 px-1.5 text-right text-[11px] font-semibold tabular-nums text-v5-ink">
                      {line.quantity || "—"}
                    </div>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.quantity}
                      disabled={!canEdit}
                      onChange={(e) => onQuantityChange?.(line.key, e.target.value)}
                      placeholder="SL"
                      className="h-8 w-full rounded border border-v5-line bg-v5-surface px-1.5 text-right text-[11px] tabular-nums text-v5-ink focus:outline-none focus:ring-1 focus:ring-v5-accent/30 disabled:bg-v5-bg disabled:text-v5-muted"
                    />
                  )}
                </td>
                <td className="px-1 py-1.5">
                  {readOnly ? (
                    <div className="h-8 px-1.5 text-[11px] text-v5-ink">
                      {line.quantityUnit || "—"}
                    </div>
                  ) : (
                    <input
                      value={line.quantityUnit}
                      disabled={!canEdit}
                      onChange={(e) => onUnitChange?.(line.key, e.target.value)}
                      placeholder="ĐVT"
                      className="h-8 w-full rounded border border-v5-line bg-v5-surface px-1.5 text-[11px] text-v5-ink focus:outline-none focus:ring-1 focus:ring-v5-accent/30 disabled:bg-v5-bg disabled:text-v5-muted"
                    />
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-v5-ink">
                  {line.factor ?? "—"}
                </td>
                {!readOnly && (
                  <td className="pr-1 text-center">
                    <button
                      type="button"
                      onClick={() => onRemove?.(line.key)}
                      disabled={line.canRemove === false}
                      aria-label="Bỏ dòng nguồn"
                      className="rounded px-1 text-[14px] leading-none text-v5-muted hover:text-v5-danger disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {note && (
        <div className="border-t border-v5-line/60 bg-v5-bg px-2 py-1 text-[10px] text-v5-muted">
          {note}
        </div>
      )}
    </div>
  );
}
