"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { fmtMetric, fmtDate, STATUS_LABELS, STATUS_STYLES } from "@/lib/metric-format";

interface DashMetric {
  id: string;
  code: string;
  name: string;
  unitLabel: string;
  displayScale: number;
  decimals: number;
  cols: { week: number | null; month: number | null; quarter: number | null; year: number | null };
  targets: { label: string; percent: number | null }[];
  latest: { date: string; status: string; byName: string | null } | null;
}

/**
 * YC-17/YG-19 — Khu "Số liệu giao ban" trên Trang chủ:
 * chỉ hiện các chỉ tiêu được bật "Hiện trên Trang chủ" (mặc định: Thu NSNN).
 * Chưa có số liệu thì nói rõ "chưa có" — không hiển thị số 0 giả.
 */
export function TaxSummarySection() {
  const [metrics, setMetrics] = useState<DashMetric[] | null>(null);
  const [range, setRange] = useState<any>(null);

  useEffect(() => {
    fetch("/api/metrics/summary?scope=dashboard")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success) {
          const rows: DashMetric[] = (json.groups || []).flatMap((g: any) => g.metrics);
          setMetrics(rows);
          setRange(json.range);
        }
      })
      .catch(() => setMetrics([]));
  }, []);

  if (metrics === null) return null;
  if (metrics.length === 0) {
    return (
      <section className="px-margin pt-space-md">
        <div className="bg-surface-container-lowest rounded-xl border border-dashed border-border-default/60 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">monitoring</span>
            <span className="text-body-sm text-on-surface-variant">
              Khu vực số liệu giao ban chưa được bật chỉ tiêu. Vào <b>Cấu hình số liệu</b> để chọn chỉ tiêu hiển thị trên Trang chủ.
            </span>
          </div>
          <Link href="/giao-ban/cau-hinh" className="text-label-sm font-semibold text-primary hover:underline">
            Cấu hình →
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="px-margin pt-space-md">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-primary">monitoring</span>
          <h2 className="font-label-lg text-label-lg text-primary font-bold uppercase tracking-wide text-[12px]">Số liệu giao ban</h2>
        </div>
        <Link href="/giao-ban" className="text-label-sm font-semibold text-primary hover:underline flex items-center gap-0.5">
          Chi tiết
          <span className="material-symbols-outlined text-[16px]">chevron_right</span>
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-sm">
        {metrics.map((m) => (
          <div key={m.id} className="bg-surface-container-lowest p-3 rounded-lg shadow-sm border border-border-default/50 flex flex-col gap-1.5">
            <span className="font-label-md text-label-md text-on-surface font-semibold">{m.name}</span>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-headline-sm text-headline-sm text-primary font-bold tabular-nums">{fmtMetric(m.cols.month, m)}</span>
              <span className="text-body-xs text-on-surface-variant">
                {range?.month?.label ? `Lũy kế ${range.month.label.toLowerCase()}` : "Lũy kế tháng"}
              </span>
            </div>
            <div className="text-body-xs text-on-surface-variant">
              Năm: <span className="tabular-nums font-medium text-on-surface">{fmtMetric(m.cols.year, m)}</span>
              {m.cols.week !== null && (
                <>
                  {" · "}Tuần: <span className="tabular-nums font-medium text-on-surface">{fmtMetric(m.cols.week, m)}</span>
                </>
              )}
            </div>
            {m.targets.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {m.targets.map((t, i) => (
                  <span
                    key={i}
                    className={`text-[11px] px-1.5 py-0.5 rounded border font-semibold ${
                      t.percent === null
                        ? "border-border-default text-on-surface-variant"
                        : t.percent >= 100
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {t.label.replace(/^Chỉ tiêu\s*/i, "")}: {t.percent === null ? "—" : `${t.percent}%`}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5 mt-0.5">
              {m.latest ? (
                <>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${STATUS_STYLES[m.latest.status] || "border-border-default"}`}>
                    {STATUS_LABELS[m.latest.status] || m.latest.status}
                  </span>
                  <span className="text-body-xs text-on-surface-variant">
                    {fmtDate(m.latest.date)}
                    {m.latest.byName ? ` · ${m.latest.byName}` : ""}
                  </span>
                </>
              ) : (
                <span className="text-body-xs text-on-surface-variant italic">Chưa có số liệu — bấm Nhập số liệu</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
