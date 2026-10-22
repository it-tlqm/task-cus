"use client";

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/Toast";

/**
 * YC-36 — Phiếu tự đánh giá / nhận xét lãnh đạo / mức xếp loại đề xuất.
 *
 * - Điểm tiêu chí chung: hệ thống CHƯA có quy tắc gợi ý (hiển thị lý do, không bịa điểm);
 *   cán bộ tự chấm và được sửa.
 * - Ưu điểm / hạn chế: để trống được.
 * - Mức xếp loại: 4 lựa chọn theo mẫu 02A — hệ thống KHÔNG tự gợi ý (chưa có ngưỡng điểm).
 * - Nhận xét lãnh đạo: để trống mặc định; chỉ lãnh đạo mới sửa được.
 * - Tự đánh giá KHÔNG phải kết quả đánh giá chính thức.
 */

interface EvalView {
  id: string;
  subjectPersonId: string;
  subjectName: string;
  periodType: string;
  periodYear: number;
  periodNumber: number;
  commonCriteriaSuggested: number | null;
  commonCriteriaScore: number | null;
  taskResultScore: number | null;
  selfGradeSuggestion: string | null;
  selfGradeChoice: string | null;
  finalGrade: string | null;
  finalGradeById: string | null;
  finalGradeAt: string | null;
  finalGradeNote: string | null;
  strengths: string | null;
  weaknesses: string | null;
  reviewerComment: string | null;
  evaluationStatus: string;
  suggestions: {
    commonCriteria: { value: number | null; reason: string | null };
    selfGrade: { value: string | null; reason: string | null };
  };
  gradeReference?: {
    source: string;
    note: string;
    autoApply: boolean;
    levels: Array<{
      grade: string;
      minScore: number | null;
      maxScore: number | null;
      extra: string | null;
    }>;
  } | null;
  permissions: {
    canEditSelf: boolean;
    canEditReviewerComment: boolean;
    canSubmit: boolean;
    reason: string | null;
  };
  selfGradeOptions?: string[];
}

interface Props {
  personId: string;
  periodType: "MONTH" | "QUARTER";
  year: number;
  number: number;
  /** Điểm kết quả thực hiện nhiệm vụ từ YC-33 (chỉ hiển thị). */
  taskResultScore?: number | null;
  onSaved?: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Bản nháp",
  SUBMITTED: "Đã trình lãnh đạo",
  REVIEWED: "Lãnh đạo đã nhận xét",
  CONFIRMED: "Đã chốt",
};

export default function SelfAssessmentPanel({
  personId,
  periodType,
  year,
  number,
  taskResultScore,
  onSaved,
}: Props) {
  const [data, setData] = useState<EvalView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [commonCriteria, setCommonCriteria] = useState("");
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [selfGrade, setSelfGrade] = useState("");
  const [reviewerComment, setReviewerComment] = useState("");
  const [finalGrade, setFinalGrade] = useState("");
  const [finalGradeNote, setFinalGradeNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        personId,
        periodType,
        year: String(year),
        number: String(number),
      });
      const res = await fetch(`/api/evaluations?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error || "Không tải được phiếu đánh giá");
        return;
      }
      const d: EvalView = json.data;
      setData(d);
      setCommonCriteria(d.commonCriteriaScore === null ? "" : String(d.commonCriteriaScore));
      setStrengths(d.strengths || "");
      setWeaknesses(d.weaknesses || "");
      setSelfGrade(d.selfGradeChoice || "");
      setReviewerComment(d.reviewerComment || "");
      setFinalGrade(d.finalGrade || "");
      setFinalGradeNote(d.finalGradeNote || "");
    } catch (e: any) {
      toast.error(e.message || "Lỗi khi tải phiếu đánh giá");
    } finally {
      setLoading(false);
    }
  }, [personId, periodType, year, number]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (extra: Record<string, unknown> = {}) => {
    setSaving(true);
    try {
      const res = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          periodType,
          year,
          number,
          commonCriteriaScore: commonCriteria === "" ? null : Number(commonCriteria),
          strengths,
          weaknesses,
          selfGradeChoice: selfGrade || null,
          ...extra,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error || "Không lưu được phiếu đánh giá");
        return;
      }
      toast.success(json.message || "Đã lưu");
      await load();
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message || "Lỗi khi lưu phiếu đánh giá");
    } finally {
      setSaving(false);
    }
  };

  const saveReviewerComment = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          periodType,
          year,
          number,
          reviewerComment,
          ...(finalGrade ? { finalGrade, finalGradeNote } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error || "Không lưu được nhận xét");
        return;
      }
      toast.success("Đã lưu nhận xét của lãnh đạo");
      await load();
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message || "Lỗi khi lưu nhận xét");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-[12px] text-slate-500">
        Đang tải phiếu tự đánh giá…
      </div>
    );
  }
  if (!data) return null;

  const canEditSelf = data.permissions.canEditSelf;
  const canEditReviewer = data.permissions.canEditReviewerComment;
  const options =
    data.selfGradeOptions && data.selfGradeOptions.length
      ? data.selfGradeOptions
      : ["Hoàn thành xuất sắc", "Hoàn thành tốt", "Hoàn thành", "Không hoàn thành"];

  return (
    <div
      data-testid="yc36-self-assessment"
      className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-[20px]">rate_review</span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              Tự đánh giá, nhận xét lãnh đạo và mức xếp loại đề xuất
            </h3>
            <p className="text-[11px] text-slate-500">
              {periodType === "QUARTER" ? `Quý ${number}/${year}` : `Tháng ${number}/${year}`} ·{" "}
              {data.subjectName}
            </p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">
          {STATUS_LABEL[data.evaluationStatus] || data.evaluationStatus}
        </span>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ---------------- I. Tiêu chí chung ---------------- */}
        <div className="space-y-2">
          <p className="text-[12px] font-bold text-slate-700">
            I. Điểm tiêu chí chung (tối đa 30 điểm)
          </p>
          <div className="rounded-lg border border-slate-200 p-2.5 bg-slate-50">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
              Gợi ý của hệ thống
            </p>
            <p className="text-sm font-bold text-slate-800">
              {data.commonCriteriaSuggested !== null
                ? data.commonCriteriaSuggested
                : "Chưa có gợi ý"}
            </p>
            {data.suggestions.commonCriteria.reason && (
              <p className="text-[10px] text-amber-800 mt-0.5">
                {data.suggestions.commonCriteria.reason}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-600">
              Điểm cán bộ tự chấm (0…30)
            </label>
            <input
              type="number"
              min="0"
              max="30"
              step="0.5"
              disabled={!canEditSelf}
              value={commonCriteria}
              onChange={(e) => setCommonCriteria(e.target.value)}
              placeholder="Chưa chấm"
              className="w-28 px-2 py-1.5 rounded-lg border border-slate-300 text-sm disabled:bg-slate-100"
            />
          </div>
        </div>

        {/* ---------------- II. Kết quả thực hiện nhiệm vụ ---------------- */}
        <div className="space-y-2">
          <p className="text-[12px] font-bold text-slate-700">
            II. Điểm kết quả thực hiện nhiệm vụ (YC-33)
          </p>
          <div className="rounded-lg border border-slate-200 p-2.5 bg-slate-50">
            <p className="text-sm font-bold text-slate-800">
              {taskResultScore === null || taskResultScore === undefined
                ? "Chưa đủ căn cứ để tính điểm"
                : taskResultScore}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Điểm lấy từ bộ máy tính Bảng 1 (đã đối chiếu mẫu gốc). Chưa đủ căn cứ thì để trống —
              không tự đặt điểm.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-2.5 bg-slate-50">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
              Gợi ý mức xếp loại của hệ thống
            </p>
            <p className="text-sm font-bold text-slate-800">
              {data.selfGradeSuggestion || "Chưa có gợi ý"}
            </p>
            {data.suggestions.selfGrade.reason && (
              <p className="text-[10px] text-amber-800 mt-0.5">
                {data.suggestions.selfGrade.reason}
              </p>
            )}
            {data.gradeReference && (
              <div className="mt-2 pt-2 border-t border-slate-200">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                  Ngưỡng THAM CHIẾU (chưa tự áp dụng)
                </p>
                <ul className="mt-1 space-y-0.5">
                  {data.gradeReference.levels.map((l) => (
                    <li key={l.grade} className="text-[11px] text-on-surface">
                      <strong>{l.grade}</strong>:{" "}
                      {l.minScore !== null ? `từ ${l.minScore} điểm` : ""}
                      {l.maxScore !== null
                        ? ` đến <${(l.maxScore + 0.001).toFixed(2)} điểm`
                        : ""}
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-slate-500 mt-1">
                  Nguồn: {data.gradeReference.source}. {data.gradeReference.note}
                </p>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-600">
              Mức xếp loại cá nhân tự đề xuất
            </label>
            <select
              disabled={!canEditSelf}
              value={selfGrade}
              onChange={(e) => setSelfGrade(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-slate-300 text-sm disabled:bg-slate-100 bg-white"
            >
              <option value="">— Chưa chọn —</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500">
              4 mức theo mẫu 02A. Tự đề xuất KHÔNG phải kết quả đánh giá chính thức.
            </p>
          </div>

          {/* Kết quả xếp loại CUỐI CÙNG — do cấp có thẩm quyền quyết định */}
          {canEditReviewer && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-600">
                Kết quả xếp loại cuối cùng (quyết định của cấp thẩm quyền)
              </label>
              <select
                value={finalGrade}
                onChange={(e) => setFinalGrade(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
              >
                <option value="">— Chưa quyết định —</option>
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <input
                value={finalGradeNote}
                onChange={(e) => setFinalGradeNote(e.target.value)}
                placeholder="Ghi chú kèm theo quyết định (không bắt buộc)"
                className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs"
              />
              {data.finalGrade && (
                <p className="text-[10px] text-emerald-700">
                  Đã quyết định: <strong>{data.finalGrade}</strong>
                  {data.finalGradeAt ? " · " + new Date(data.finalGradeAt).toLocaleString("vi-VN") : ""}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ---------------- Ưu điểm / hạn chế ---------------- */}
        <div className="space-y-2">
          <p className="text-[12px] font-bold text-slate-700">Ưu điểm</p>
          <textarea
            rows={3}
            disabled={!canEditSelf}
            value={strengths}
            onChange={(e) => setStrengths(e.target.value)}
            placeholder="Có thể để trống và bổ sung sau..."
            className="w-full p-2 rounded-lg border border-slate-300 text-xs disabled:bg-slate-100"
          />
          <p className="text-[12px] font-bold text-slate-700">Hạn chế, khuyết điểm</p>
          <textarea
            rows={3}
            disabled={!canEditSelf}
            value={weaknesses}
            onChange={(e) => setWeaknesses(e.target.value)}
            placeholder="Có thể để trống và bổ sung sau..."
            className="w-full p-2 rounded-lg border border-slate-300 text-xs disabled:bg-slate-100"
          />
          {canEditSelf && (
            <button
              onClick={() => save()}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-secondary text-white text-[11px] font-semibold disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : "Lưu phần tự đánh giá"}
            </button>
          )}
        </div>

        {/* ---------------- Nhận xét lãnh đạo ---------------- */}
        <div className="space-y-2">
          <p className="text-[12px] font-bold text-slate-700">
            Ý kiến nhận xét của cấp có thẩm quyền
          </p>
          <textarea
            rows={6}
            disabled={!canEditReviewer}
            value={reviewerComment}
            onChange={(e) => setReviewerComment(e.target.value)}
            placeholder={
              canEditReviewer
                ? "Có thể để trống để ghi tay trên bản in..."
                : "Phần này do lãnh đạo trực tiếp nhập hoặc để trống trên bản in."
            }
            className="w-full p-2 rounded-lg border border-slate-300 text-xs disabled:bg-slate-100"
          />
          {canEditReviewer && (
            <button
              onClick={saveReviewerComment}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-semibold disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : "Lưu nhận xét lãnh đạo"}
            </button>
          )}
          {!canEditReviewer && (
            <p className="text-[10px] text-slate-500">
              Chỉ lãnh đạo trong phạm vi mới được sửa nhận xét này.
            </p>
          )}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[10px] text-slate-500">
          Tự đánh giá là hồ sơ của cán bộ — KHÔNG phải kết quả đánh giá chính thức của cấp có
          thẩm quyền.
        </p>
        {canEditSelf && (
          <button
            onClick={() => save({ evaluationStatus: "SUBMITTED" })}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-semibold disabled:opacity-50"
          >
            Trình lãnh đạo
          </button>
        )}
      </div>
    </div>
  );
}
