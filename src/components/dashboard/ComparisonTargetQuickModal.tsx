"use client";

import { V5Icon } from "@/components/v5/ui/lucide-icon";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { toast } from "@/components/ui/Toast";
import FormattedNumberInput from "@/components/ui/FormattedNumberInput";

type Kind = "BTC" | "UBND" | "KH_THANG";

interface TargetRow {
  id: string;
  status: string;
  valueBase: number | string;
  sourceNote: string | null;
  comparisonKind: string;
  periodType: string;
  year: number;
  periodNo: number | null;
  classificationId: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  metricId: string;
  year: number;
  month: number;
  onSaved: () => void;
}

const ROWS: Array<{
  kind: Kind;
  label: string;
  periodLabel: string;
  comparisonKind: string;
  periodType: "YEAR" | "MONTH";
}> = [
  { kind: "BTC", label: "Chỉ tiêu Bộ Tài chính (năm)", periodLabel: "Cả năm", comparisonKind: "BTC_YEAR", periodType: "YEAR" },
  { kind: "UBND", label: "Chỉ tiêu UBND tỉnh (năm)", periodLabel: "Cả năm", comparisonKind: "UBND_YEAR", periodType: "YEAR" },
  { kind: "KH_THANG", label: "Kế hoạch tháng HQTL", periodLabel: "Tháng", comparisonKind: "MONTH_PLAN", periodType: "MONTH" },
];

function canonicalTarget(targets: TargetRow[], kind: Kind, year: number, month: number) {
  const row = ROWS.find((item) => item.kind === kind)!;
  return targets.find(
    (target) =>
      target.comparisonKind === row.comparisonKind &&
      target.year === year &&
      target.periodType === row.periodType &&
      target.periodNo === (row.periodType === "MONTH" ? month : null) &&
      !target.classificationId
  );
}

export default function ComparisonTargetQuickModal({
  open,
  onClose,
  metricId,
  year,
  month,
  onSaved,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [values, setValues] = useState<Record<Kind, string>>({ BTC: "", UBND: "", KH_THANG: "" });
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [sourceNote, setSourceNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || !metricId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/metrics/targets?metricId=${encodeURIComponent(metricId)}&year=${year}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Không tải được chỉ tiêu hiện có");
        const rows: TargetRow[] = Array.isArray(json.targets) ? json.targets : [];
        setTargets(rows);
        const next: Record<Kind, string> = { BTC: "", UBND: "", KH_THANG: "" };
        for (const item of ROWS) {
          const current = canonicalTarget(rows, item.kind, year, month);
          if (current) next[item.kind] = String(current.valueBase ?? "");
        }
        setValues(next);
        const firstNote = rows.find((row) => row.sourceNote)?.sourceNote || "";
        setSourceNote(firstNote);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được chỉ tiêu hiện có"))
      .finally(() => setLoading(false));

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    const timer = window.setTimeout(() => closeRef.current?.focus(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, metricId, year, month]);

  async function saveAndConfirm() {
    if (saving) return;
    if (!sourceNote.trim()) {
      toast.error("Vui lòng nhập nguồn/căn cứ trước khi xác nhận.");
      return;
    }
    const missing = ROWS.filter((item) => !values[item.kind].trim());
    if (missing.length > 0) {
      toast.error(`Còn thiếu: ${missing.map((item) => item.label).join(", ")}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      for (const item of ROWS) {
        const current = canonicalTarget(targets, item.kind, year, month);
        if (current?.status === "LOCKED") {
          throw new Error(`${item.label} đã chốt, không thể sửa trong màn hình nhanh. Vào Cấu hình đầy đủ để điều chỉnh.`);
        }
        const payload = {
          metricId,
          classificationId: null,
          label:
            item.kind === "KH_THANG"
              ? `Kế hoạch tháng ${month}/${year}`
              : item.kind === "BTC"
                ? `Chỉ tiêu BTC năm ${year}`
                : `Chỉ tiêu UBND tỉnh năm ${year}`,
          periodType: item.periodType,
          year,
          periodNo: item.periodType === "MONTH" ? month : null,
          value: values[item.kind],
          comparisonKind: item.comparisonKind,
          dataSource: "REAL",
          sourceNote: sourceNote.trim(),
          note: "Nhập nhanh từ khối So sánh",
        };

        let targetId = current?.id || null;
        if (targetId) {
          const res = await fetch(`/api/metrics/targets/${targetId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json?.error || `Không cập nhật được ${item.label}`);
        } else {
          const res = await fetch("/api/metrics/targets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json?.error || `Không tạo được ${item.label}`);
          targetId = json?.target?.id || null;
        }

        if (!targetId) throw new Error(`Không lấy được mã chỉ tiêu ${item.label}`);
        const confirmRes = await fetch(`/api/metrics/targets/${targetId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "confirm",
            sourceNote: sourceNote.trim(),
            reason: "Xác nhận từ nhập nhanh So sánh",
          }),
        });
        const confirmJson = await confirmRes.json().catch(() => ({}));
        if (!confirmRes.ok) throw new Error(confirmJson?.error || `Không xác nhận được ${item.label}`);
      }
      toast.success("Đã lưu và xác nhận 3 chỉ tiêu đối chiếu.");
      onSaved();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Không lưu được chỉ tiêu đối chiếu";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/35 p-0 backdrop-blur-[1px] sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Nhập nhanh chỉ tiêu đối chiếu"
        data-testid="comparison-target-quick-modal"
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-v5-line bg-v5-surface shadow-2xl sm:max-h-[86vh] sm:w-[620px] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-2 border-b border-v5-line/60 px-4 py-3">
          <div>
            <h2 className="text-title-md font-bold text-v5-ink">Nhập nhanh chỉ tiêu đối chiếu</h2>
            <p className="mt-0.5 text-[11px] text-v5-muted">
              Thu NSNN · Tháng {month}/{year} · nhập 3 chỉ tiêu bắt buộc
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng nhập chỉ tiêu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-v5-muted hover:bg-v5-bg active-press"
          >
            <V5Icon name="close" className="text-[20px]" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-3">
              <div className="h-20 animate-pulse rounded-xl bg-v5-bg" />
              <div className="h-20 animate-pulse rounded-xl bg-v5-bg" />
              <div className="h-20 animate-pulse rounded-xl bg-v5-bg" />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {ROWS.map((item) => {
                const current = canonicalTarget(targets, item.kind, year, month);
                return (
                  <div key={item.kind} className="rounded-xl border border-v5-line/60 bg-v5-surface p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[12px] font-semibold text-v5-ink">{item.label}</div>
                        <div className="text-[11px] text-v5-muted">
                          {item.periodLabel} {item.periodType === "MONTH" ? `${month}/${year}` : year}
                        </div>
                      </div>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                          current?.status === "CONFIRMED" || current?.status === "LOCKED"
                            ? "bg-v5-success-soft text-v5-success"
                            : current?.status === "PROPOSED"
                              ? "bg-v5-gold-soft text-v5-gold-ink"
                              : "bg-v5-bg text-v5-muted"
                        }`}
                      >
                        {current?.status === "CONFIRMED"
                          ? "Đã xác nhận"
                          : current?.status === "LOCKED"
                            ? "Đã chốt"
                            : current?.status === "PROPOSED"
                              ? "Đã lưu nháp"
                              : "Chưa có"}
                      </span>
                    </div>
                    <FormattedNumberInput
                      value={values[item.kind]}
                      onValueChange={(raw) => setValues((prev) => ({ ...prev, [item.kind]: raw }))}
                      placeholder="Nhập số chỉ tiêu..."
                      className="w-full rounded-lg border border-v5-line bg-v5-surface px-3 py-2 text-[12px] tabular-nums text-v5-ink focus:border-v5-accent focus:outline-none disabled:opacity-60"
                      disabled={current?.status === "LOCKED"}
                    />
                  </div>
                );
              })}

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-v5-muted">
                Nguồn / căn cứ (bắt buộc)
                <textarea
                  value={sourceNote}
                  onChange={(event) => setSourceNote(event.target.value)}
                  placeholder="VD: Quyết định giao chỉ tiêu số ... ngày ..."
                  className="min-h-20 rounded-lg border border-v5-line bg-v5-surface px-3 py-2 text-[12px] font-normal text-v5-ink focus:border-v5-accent focus:outline-none"
                />
              </label>

              {error && (
                <div className="rounded-lg border border-v5-danger/30 bg-v5-danger-soft/40 p-3 text-[12px] text-v5-danger">
                  {error}
                </div>
              )}

              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900">
                Hệ thống sẽ lưu và <b>xác nhận ngay</b> cả 3 chỉ tiêu. Chỉ tiêu đã chốt phải điều chỉnh ở Cấu hình đầy đủ.
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-v5-line/60 p-3">
          <Link
            href={`/giao-ban/cau-hinh?tab=TARGET&metric=THU_NSNN`}
            className="text-[11px] font-semibold text-v5-ink hover:underline"
          >
            Mở cấu hình đầy đủ
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-v5-line px-3 py-2 text-[12px] font-semibold text-v5-muted hover:bg-v5-bg"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={saveAndConfirm}
              disabled={saving || loading}
              className="rounded-lg bg-v5-accent px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : "Lưu & xác nhận"}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
