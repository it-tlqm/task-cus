"use client";

import React, { useState } from "react";
import { toast } from "@/components/ui/Toast";

/**
 * YC-34 — Xem trước & xuất biểu mẫu 01A / 01B (tháng) và 02A / 02B (quý).
 *
 * - Luôn XEM TRƯỚC trước khi tải file.
 * - Ô chưa đủ căn cứ được gắn nhãn "DỰ THẢO — CHƯA ĐỦ CĂN CỨ"; không ghi điểm giả.
 */

type Template = "01A" | "01B" | "02A" | "02B";

const TEMPLATES: Array<{ id: Template; label: string; period: "MONTH" | "QUARTER"; note: string }> = [
  { id: "01A", label: "Mẫu 01A — Công chức (tháng)", period: "MONTH", note: "Có thêm sheet Bảng 1 tính điểm" },
  { id: "01B", label: "Mẫu 01B — Lãnh đạo (tháng)", period: "MONTH", note: "a/b/c theo quan hệ phụ trách" },
  { id: "02A", label: "Mẫu 02A — Công chức (quý)", period: "QUARTER", note: "Có mục tự đề xuất mức xếp loại" },
  { id: "02B", label: "Mẫu 02B — Lãnh đạo (quý)", period: "QUARTER", note: "a/b/c theo quan hệ phụ trách" },
];

export default function EvaluationExportPanel({
  personId,
  year,
  month,
}: {
  personId: string;
  year: number;
  month: number;
}) {
  const [template, setTemplate] = useState<Template>("01A");
  const [periodType, setPeriodType] = useState<"MONTH" | "QUARTER">("MONTH");
  const [number, setNumber] = useState(month);
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const current = TEMPLATES.find((t) => t.id === template)!;

  const doPreview = async () => {
    setLoading(true);
    setPreview(null);
    try {
      const params = new URLSearchParams({
        template,
        personId,
        periodType,
        year: String(year),
        number: String(number),
        preview: "1",
      });
      const res = await fetch(`/api/evaluation-export?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error || "Không xem trước được biểu mẫu");
        return;
      }
      setPreview(json.data);
    } catch (e: any) {
      toast.error(e.message || "Lỗi khi xem trước biểu mẫu");
    } finally {
      setLoading(false);
    }
  };

  const doDownload = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams({
        template,
        personId,
        periodType,
        year: String(year),
        number: String(number),
      });
      const res = await fetch(`/api/evaluation-export?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error || "Không xuất được biểu mẫu");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Phieu-${template}-${periodType === "QUARTER" ? "Q" : "T"}${number}-${year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Đã tải biểu mẫu (bản dự thảo).");
    } catch (e: any) {
      toast.error(e.message || "Lỗi khi tải biểu mẫu");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      data-testid="yc34-export-panel"
      className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
        <span className="material-symbols-outlined text-secondary text-[20px]">description</span>
        <div className="flex-1 min-w-[220px]">
          <h3 className="text-sm font-bold text-slate-800">
            Biểu mẫu theo dõi, đánh giá (01A / 01B / 02A / 02B)
          </h3>
          <p className="text-[11px] text-slate-500">
            Xem trước trước khi xuất. Ô thiếu căn cứ được để trống và gắn nhãn DỰ THẢO.
          </p>
        </div>
        <select
          value={template}
          onChange={(e) => {
            const t = TEMPLATES.find((x) => x.id === e.target.value)!;
            setTemplate(t.id);
            setPeriodType(t.period);
            setPreview(null);
          }}
          className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
        >
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={periodType}
          onChange={(e) => {
            setPeriodType(e.target.value as "MONTH" | "QUARTER");
            setPreview(null);
          }}
          className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
        >
          <option value="MONTH">Theo tháng</option>
          <option value="QUARTER">Theo quý</option>
        </select>
        <input
          type="number"
          min={periodType === "QUARTER" ? 1 : 1}
          max={periodType === "QUARTER" ? 4 : 12}
          value={number}
          onChange={(e) => {
            setNumber(Number(e.target.value));
            setPreview(null);
          }}
          className="w-16 px-2 py-1.5 rounded-lg border border-slate-300 text-xs"
        />
        <button
          onClick={doPreview}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-secondary text-white text-[11px] font-semibold disabled:opacity-50"
        >
          {loading ? "Đang xem trước..." : "Xem trước"}
        </button>
        <button
          onClick={doDownload}
          disabled={downloading || !preview}
          className="px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-semibold disabled:opacity-50"
          title={preview ? "" : "Hãy xem trước trước khi tải"}
        >
          {downloading ? "Đang xuất..." : "Tải Excel"}
        </button>
      </div>

      {preview && (
        <div className="p-4 space-y-2 text-[12px]">
          <p className="text-slate-600">
            Mẫu <strong>{preview.template}</strong> ·{" "}
            {preview.periodType === "QUARTER" ? `Quý ${preview.periodNumber}` : `Tháng ${preview.periodNumber}`}/
            {preview.periodYear} · {preview.person?.fullName}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
            <div>
              <div className="text-[10px] text-slate-500">a — số lượng</div>
              <div className="text-lg font-bold">
                {preview.leader ? preview.leader.a ?? "—" : preview.score?.ratios?.a ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">b — tiến độ</div>
              <div className="text-lg font-bold">
                {preview.leader ? preview.leader.b ?? "—" : preview.score?.ratios?.b ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">c — chất lượng</div>
              <div className="text-lg font-bold">
                {preview.leader ? preview.leader.c ?? "—" : preview.score?.ratios?.c ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">d = (a+b+c)/3</div>
              <div className="text-lg font-bold">{preview.score?.ratios?.d ?? "—"}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Điểm KQ ×70%</div>
              <div className="text-lg font-bold">{preview.score?.ratios?.score70 ?? "—"}</div>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Trạng thái tính điểm: <strong>{preview.score?.status}</strong> · Trạng thái phiếu:{" "}
            <strong>{preview.evaluationStatus}</strong> · {current.note}
          </p>
          {preview.warnings && preview.warnings.length > 0 && (
            <ul className="space-y-0.5">
              {preview.warnings.map((w: string, i: number) => (
                <li key={i} className="text-[11px] text-amber-800 flex items-start gap-1">
                  <span className="material-symbols-outlined text-[14px] shrink-0">info</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
