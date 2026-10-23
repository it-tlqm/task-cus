"use client";

import React, { useEffect, useState } from "react";
import { formatVnDateTime } from "@/lib/datetime";
import { toast } from "@/components/ui/Toast";

/**
 * YC-37 — Modal XEM TRƯỚC hồ sơ trước khi quyết định.
 *
 * Luồng đúng yêu cầu Hải quan:
 *   Bấm "Chấp thuận" → mở modal này (KHÔNG ghi quyết định, KHÔNG đổi trạng thái)
 *   → người có thẩm quyền xem đầy đủ hồ sơ
 *   → chọn: Đồng ý | Không đồng ý (bắt buộc lý do) | Yêu cầu giải trình (bắt buộc nội dung)
 *
 * Lịch sử mọi lượt chấp thuận / từ chối / giải trình hiển thị ngay trong modal.
 */

export type ApprovalCaseType = "TASK_RESULT" | "PLAN" | "DEADLINE_REQUEST";
export type ApprovalDecisionAction = "AGREE" | "REJECT" | "CLARIFY";

export interface ApprovalPreviewData {
  caseType: ApprovalCaseType;
  caseId: string | null;
  resourceId: string;
  code: string;
  title: string;
  caseStatus: string;
  currentRound: number;
  submitter: { id: string | null; fullName: string; unitName: string | null } | null;
  submittedAt: string | null;
  deadline: {
    original: string | null;
    current: string | null;
    extensionDays: number | null;
    requestedDeadline: string | null;
  };
  progress: { percent: number | null; status: string | null; updatedAt: string | null };
  result: { expected: string | null; actual: string | null };
  content: Record<string, any>;
  attachments: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    uploadedBy: string;
    createdAt: string;
    downloadUrl: string;
  }>;
  history: Array<{
    round: number;
    action: string;
    actionLabel: string;
    reason: string | null;
    content: string | null;
    actorName: string;
    actorPersonId: string | null;
    createdAt: string;
  }>;
  quality: {
    visible: boolean;
    enabled: boolean;
    required: boolean;
    original: number | null;
    effective: number | null;
    adjusted: boolean;
    latestAdjustmentId: string | null;
    latestAdjustmentAt: string | null;
    canRequestAdjustment: boolean;
    pendingAdjustmentCount: number;
    history: Array<{
      decisionId: string;
      round: number;
      action: string;
      actionLabel: string;
      qualityPercent: number | null;
      actorName: string | null;
      createdAt: string;
    }>;
    adjustments: Array<{
      id: string;
      oldQualityPercent: number | null;
      newQualityPercent: number;
      reason: string;
      status: string;
      statusLabel: string;
      requestedByName: string | null;
      requestedAt: string;
      decidedByName: string | null;
      decidedAt: string | null;
      decisionNote: string | null;
      canDecide: boolean;
    }>;
  };
  precheck?: {
    enabled: boolean;
    routeStatus: string | null;
    required: boolean;
    allPrechecked: boolean;
    canDecideFinal: boolean;
    snapshotRound: number | null;
    finalCandidates: Array<{
      personId: string;
      fullName: string;
      role: string | null;
      unitName: string | null;
    }>;
    participants: Array<{
      personId: string;
      fullName: string;
      partStatus: string;
      precheckStatus: string;
      precheckedByName: string | null;
      precheckedAt: string | null;
      precheckNote: string | null;
    }>;
    snapshot: { round: number; routeStatus: string; createdAt: string } | null;
  } | null;
  permissions: { canDecide: boolean; canRespond: boolean; reason: string | null };
  warnings: string[];
}

interface Props {
  open: boolean;
  caseType: ApprovalCaseType | null;
  resourceId: string | null;
  initialAction: ApprovalDecisionAction;
  onClose: () => void;
  onDecided: () => void;
}

const ACTION_OPTIONS: Array<{
  value: ApprovalDecisionAction;
  label: string;
  hint: string;
  icon: string;
  tone: string;
}> = [
  {
    value: "AGREE",
    label: "Đồng ý",
    hint: "Chấp thuận hồ sơ, áp dụng hiệu ứng nghiệp vụ tương ứng.",
    icon: "check_circle",
    tone: "text-status-success",
  },
  {
    value: "REJECT",
    label: "Không đồng ý",
    hint: "Từ chối hồ sơ — bắt buộc nêu lý do.",
    icon: "cancel",
    tone: "text-status-danger",
  },
  {
    value: "CLARIFY",
    label: "Yêu cầu giải trình",
    hint: "Yêu cầu người trình bổ sung — bắt buộc nêu nội dung cần giải trình.",
    icon: "edit_note",
    tone: "text-status-warning",
  },
];

function formatBytes(bytes: number) {
  if (!bytes) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// YC-38 UAT fix: hiển thị thời hạn theo giờ Việt Nam, KHÔNG phụ thuộc múi giờ thiết bị
function formatDateTime(iso?: string | null) {
  return formatVnDateTime(iso);
}

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Đang chờ quyết định",
  NOT_CREATED: "Chưa có hồ sơ quyết định",
  AGREED: "Đã chấp thuận",
  REJECTED: "Đã từ chối",
  CLARIFY_REQUESTED: "Chờ giải trình",
  CLOSED: "Đã đóng",
};

const QUALITY_VALUES = [65, 70, 75, 80, 85, 90, 95, 100];

function qualityLabel(value: number | null | undefined) {
  if (value === null || value === undefined) return "Chưa đánh giá";
  return `${value}%`;
}

export default function ApprovalPreviewModal({
  open,
  caseType,
  resourceId,
  initialAction,
  onClose,
  onDecided,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<ApprovalPreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ApprovalDecisionAction>(initialAction);
  const [reason, setReason] = useState("");
  const [content, setContent] = useState("");
  const [returnPersonIds, setReturnPersonIds] = useState<string[]>([]);
  const [qualityPercent, setQualityPercent] = useState("");
  const [adjustmentQuality, setAdjustmentQuality] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentBusy, setAdjustmentBusy] = useState(false);
  const [adjustmentNotes, setAdjustmentNotes] = useState<Record<string, string>>({});

  const refreshPreview = async () => {
    if (!caseType || !resourceId) return;
    try {
      const res = await fetch(`/api/approvals/${caseType}/${resourceId}/preview`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) setPreview(json.data);
    } catch {
      // giữ dữ liệu cũ; người dùng có thể tải lại
    }
  };

  const submitAdjustmentRequest = async () => {
    if (!caseType || !resourceId) return;
    if (!adjustmentQuality) {
      toast.error("Vui lòng chọn mức chất lượng điều chỉnh.");
      return;
    }
    if (!adjustmentReason.trim()) {
      toast.error("Vui lòng nêu lý do điều chỉnh chất lượng.");
      return;
    }
    setAdjustmentBusy(true);
    try {
      const res = await fetch(
        `/api/approvals/${caseType}/${resourceId}/quality-adjustments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newQualityPercent: Number(adjustmentQuality),
            reason: adjustmentReason.trim(),
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error || "Không gửi được yêu cầu điều chỉnh.");
        return;
      }
      toast.success("Đã gửi yêu cầu điều chỉnh chất lượng.");
      setAdjustmentQuality("");
      setAdjustmentReason("");
      await refreshPreview();
    } catch (e: any) {
      toast.error(e.message || "Lỗi khi gửi yêu cầu điều chỉnh.");
    } finally {
      setAdjustmentBusy(false);
    }
  };

  const decideAdjustment = async (id: string, action: "APPROVE" | "REJECT") => {
    setAdjustmentBusy(true);
    try {
      const res = await fetch(`/api/approvals/quality-adjustments/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: adjustmentNotes[id]?.trim() || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error || "Không quyết định được yêu cầu điều chỉnh.");
        return;
      }
      toast.success(
        action === "APPROVE"
          ? "Đã chấp thuận điều chỉnh chất lượng."
          : "Đã từ chối điều chỉnh chất lượng."
      );
      setAdjustmentNotes((prev) => ({ ...prev, [id]: "" }));
      await refreshPreview();
    } catch (e: any) {
      toast.error(e.message || "Lỗi khi quyết định điều chỉnh.");
    } finally {
      setAdjustmentBusy(false);
    }
  };
  useEffect(() => {
    if (!open) return;
    setAction(initialAction);
    setReason("");
    setContent("");
    setReturnPersonIds([]);
    setQualityPercent("");
    setAdjustmentQuality("");
    setAdjustmentReason("");
    setAdjustmentNotes({});
    setError(null);
    if (!caseType || !resourceId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/approvals/${caseType}/${resourceId}/preview`,
          { cache: "no-store" }
        );
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(json?.error || "Không tải được hồ sơ xem trước.");
          setPreview(null);
          return;
        }
        setPreview(json.data);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Lỗi khi tải hồ sơ xem trước.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, caseType, resourceId, initialAction]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async () => {
    if (!caseType || !resourceId) return;
    if (action === "REJECT" && !reason.trim()) {
      toast.error("Vui lòng nêu lý do không đồng ý.");
      return;
    }
    if (action === "CLARIFY" && !content.trim()) {
      toast.error("Vui lòng nêu nội dung cần giải trình.");
      return;
    }
    if (
      preview?.caseType === "TASK_RESULT" &&
      preview.quality?.enabled &&
      action === "AGREE" &&
      !qualityPercent
    ) {
      toast.error("Vui lòng chọn mức chất lượng kết quả (65–100, bước 5) khi đồng ý nghiệm thu.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/approvals/${caseType}/${resourceId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason,
          content,
          returnPersonIds,
          qualityPercent: qualityPercent ? Number(qualityPercent) : null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error || "Không ghi được quyết định.");
        return;
      }
      toast.success(json.message || "Đã ghi quyết định.");
      onDecided();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Lỗi khi ghi quyết định.");
    } finally {
      setSubmitting(false);
    }
  };

  const c = preview?.content || {};

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-start justify-center p-3 overflow-y-auto">
      <div className="bg-surface-container-lowest rounded-2xl max-w-3xl w-full my-4 shadow-2xl border border-border-default">
        {/* Header */}
        <div className="px-5 py-4 bg-primary text-on-primary rounded-t-2xl flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <span className="material-symbols-outlined text-secondary-fixed text-[24px] shrink-0">
              fact_check
            </span>
            <div className="min-w-0">
              <h3 className="font-headline-sm text-white font-bold">
                Xem trước hồ sơ trước khi quyết định
              </h3>
              <p className="text-[11px] text-on-primary/80 mt-0.5">
                Bấm "Chấp thuận" KHÔNG tự phê duyệt — hãy kiểm tra nội dung bên dưới rồi chọn quyết định.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-on-primary/80 hover:text-white text-lg leading-none shrink-0"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-on-surface-variant">
            Đang tải hồ sơ…
          </div>
        ) : error ? (
          <div className="p-6 space-y-3">
            <div className="flex items-center gap-2 text-status-danger text-sm font-semibold">
              <span className="material-symbols-outlined text-[18px]">error</span>
              Không xem được hồ sơ
            </div>
            <p className="text-xs text-on-surface-variant">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold border border-border-default"
            >
              Đóng
            </button>
          </div>
        ) : preview ? (
          <div className="flex flex-col">
            <div className="p-5 space-y-4 max-h-[62vh] overflow-y-auto">
              {/* Cảnh báo */}
              {preview.warnings.length > 0 && (
                <div className="rounded-lg bg-status-warning-bg border border-status-warning/30 p-3 space-y-1">
                  {preview.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px] text-on-surface">
                      <span className="material-symbols-outlined text-[15px] text-status-warning shrink-0">
                        warning
                      </span>
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Thông tin chính */}
              <div className="rounded-lg bg-surface-container-low p-3 space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold text-primary">
                    [{preview.code}] {preview.title}
                  </p>
                  <span className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-surface-container-lowest border border-border-default font-semibold">
                    {STATUS_LABEL[preview.caseStatus] || preview.caseStatus}
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant">
                  Người trình:{" "}
                  <strong className="text-on-surface">
                    {preview.submitter?.fullName || "—"}
                  </strong>
                  {preview.submitter?.unitName ? ` · ${preview.submitter.unitName}` : ""}
                  {preview.submittedAt ? ` · ${formatDateTime(preview.submittedAt)}` : ""}
                </p>
                <p className="text-[11px] text-on-surface-variant">
                  Loại quy trình:{" "}
                  <strong className="text-on-surface">
                    {preview.caseType === "TASK_RESULT"
                      ? "Nghiệm thu kết quả công việc"
                      : preview.caseType === "PLAN"
                        ? "Phê duyệt kế hoạch công tác"
                        : "Duyệt đề nghị gia hạn"}
                  </strong>
                  {preview.currentRound > 1 ? ` · Vòng ${preview.currentRound}` : ""}
                </p>
              </div>

              {/* Hạn / tiến độ */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded-lg border border-border-default p-2">
                  <p className="text-[10px] uppercase tracking-wide text-outline font-semibold">
                    Hạn gốc
                  </p>
                  <p className="text-[11px] text-on-surface font-mono">
                    {preview.deadline.original || "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border-default p-2">
                  <p className="text-[10px] uppercase tracking-wide text-outline font-semibold">
                    Hạn hiện tại
                  </p>
                  <p className="text-[11px] text-on-surface font-mono">
                    {preview.deadline.current || "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border-default p-2">
                  <p className="text-[10px] uppercase tracking-wide text-outline font-semibold">
                    Gia hạn
                  </p>
                  <p className="text-[11px] text-on-surface font-mono">
                    {preview.deadline.extensionDays
                      ? `+${preview.deadline.extensionDays} ngày`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border-default p-2">
                  <p className="text-[10px] uppercase tracking-wide text-outline font-semibold">
                    Tiến độ
                  </p>
                  <p className="text-[11px] text-on-surface font-mono">
                    {preview.progress.percent !== null
                      ? `${preview.progress.percent}%`
                      : "—"}
                  </p>
                </div>
              </div>

              {/* Kết quả */}
              {(preview.result.expected || preview.result.actual) && (
                <div className="space-y-2">
                  <p className="font-label-sm text-label-sm uppercase tracking-wide text-outline font-semibold">
                    Kết quả thực hiện
                  </p>
                  <div className="rounded-lg border border-border-default p-3 space-y-2">
                    {preview.result.expected && (
                      <div>
                        <p className="text-[10px] uppercase text-outline font-semibold">
                          Kết quả yêu cầu
                        </p>
                        <p className="text-[11px] text-on-surface whitespace-pre-wrap">
                          {preview.result.expected}
                        </p>
                      </div>
                    )}
                    {preview.result.actual && (
                      <div>
                        <p className="text-[10px] uppercase text-outline font-semibold">
                          Kết quả đã ghi
                        </p>
                        <p className="text-[11px] text-on-surface whitespace-pre-wrap">
                          {preview.result.actual}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Nội dung riêng theo quy trình */}
              {preview.caseType === "TASK_RESULT" && (
                <div className="space-y-2">
                  <p className="font-label-sm text-label-sm uppercase tracking-wide text-outline font-semibold">
                    Chi tiết nhiệm vụ
                  </p>
                  <div className="rounded-lg border border-border-default p-3 space-y-2 text-[11px]">
                    {c.description && (
                      <div>
                        <p className="text-[10px] uppercase text-outline font-semibold">Mô tả</p>
                        <p className="text-on-surface whitespace-pre-wrap">{c.description}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] uppercase text-outline font-semibold">Đơn vị</p>
                        <p className="text-on-surface">{c.unitName || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-outline font-semibold">Độ ưu tiên</p>
                        <p className="text-on-surface">{c.priority || "—"}</p>
                      </div>
                    </div>
                    {Array.isArray(c.participants) && c.participants.length > 0 && (
                      <div className="rounded-lg border border-border-default p-2.5 space-y-1.5">
                        <p className="text-[10px] uppercase text-outline font-semibold">
                          Phần việc theo người
                        </p>
                        {c.participants.map((p: any) => {
                          const canReturn =
                            (action === "REJECT" || action === "CLARIFY") &&
                            p.role !== "OWNER" &&
                            ["SUBMITTED", "ACCEPTED"].includes(p.partStatus);
                          return (
                            <div key={p.personId} className="flex items-start justify-between gap-2 text-[11px]">
                              <div className="min-w-0">
                                <p className="font-semibold text-on-surface">
                                  {p.personName}
                                  <span className="ml-1 font-normal text-outline">
                                    ({p.role === "OWNER" ? "Chủ trì" : "Phối hợp"})
                                  </span>
                                </p>
                                <p className="text-on-surface-variant">
                                  {p.partStatusLabel || p.partStatus}
                                  {p.partProgressPercent !== null && p.partProgressPercent !== undefined
                                    ? ` · ${p.partProgressPercent}%`
                                    : ""}
                                </p>
                                {p.partResultText && (
                                  <p className="text-on-surface-variant whitespace-pre-wrap">
                                    Kết quả: {p.partResultText}
                                  </p>
                                )}
                              </div>
                              {canReturn && (
                                <label className="flex items-center gap-1 shrink-0 text-[10px] text-status-danger">
                                  <input
                                    type="checkbox"
                                    checked={returnPersonIds.includes(p.personId)}
                                    onChange={(e) => {
                                      setReturnPersonIds((prev) =>
                                        e.target.checked
                                          ? [...prev, p.personId]
                                          : prev.filter((id) => id !== p.personId)
                                      );
                                    }}
                                  />
                                  Trả phần này
                                </label>
                              )}
                            </div>
                          );
                        })}
                        {(action === "REJECT" || action === "CLARIFY") && (
                          <p className="text-[10px] text-outline">
                            Không chọn phần nào = trả lại các phần chưa được chấp nhận; phần đã chấp nhận được giữ.
                          </p>
                        )}
                      </div>
                    )}
                    {preview.precheck?.enabled && (
                      <div
                        data-testid="approval-precheck-summary"
                        className="rounded-lg border border-border-default p-2.5 space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] uppercase text-outline font-semibold">
                            Kiểm tra sơ bộ (YC-11)
                          </p>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              preview.precheck.snapshot
                                ? "bg-status-success-bg text-status-success"
                                : "bg-status-warning-bg text-status-warning"
                            }`}
                          >
                            {preview.precheck.snapshot
                              ? `Đã chốt tuyến vòng ${preview.precheck.snapshot.round}`
                              : preview.precheck.required
                                ? "Chưa có snapshot tuyến"
                                : "Legacy final-only"}
                          </span>
                        </div>
                        {preview.precheck.finalCandidates.length > 0 && (
                          <p className="text-[11px] text-on-surface">
                            Người quyết định cuối:{" "}
                            {preview.precheck.finalCandidates.map((c) => c.fullName).join(", ")}
                          </p>
                        )}
                        {preview.precheck.participants.length > 0 && (
                          <ul className="space-y-1">
                            {preview.precheck.participants.map((p) => (
                              <li key={p.personId} className="text-[11px] text-on-surface-variant">
                                <span className="font-semibold text-on-surface">{p.fullName}</span>
                                {" · "}
                                {p.precheckStatus === "PASSED"
                                  ? `Pre-check đạt${
                                      p.precheckedByName ? ` (${p.precheckedByName})` : ""
                                    }`
                                  : p.precheckStatus === "RETURNED"
                                    ? "Pre-check trả lại"
                                    : "Chưa pre-check"}
                                {p.precheckNote ? ` · ${p.precheckNote}` : ""}
                              </li>
                            ))}
                          </ul>
                        )}
                        {preview.precheck.snapshot && (
                          <p className="text-[10px] text-outline">
                            Tuyến được chốt tại thời điểm chủ trì nộp; thay đổi tuyến sau đó không viết lại lịch sử.
                          </p>
                        )}
                      </div>
                    )}
                    {Array.isArray(c.assignees) && c.assignees.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase text-outline font-semibold">
                          Người phối hợp
                        </p>
                        <p className="text-on-surface">
                          {c.assignees.map((a: any) => a.name).join(", ")}
                        </p>
                      </div>
                    )}
                    {c.planLink && (
                      <div>
                        <p className="text-[10px] uppercase text-outline font-semibold">Kế hoạch</p>
                        <p className="text-on-surface">{c.planLink.planTitle}</p>
                      </div>
                    )}
                    {c.issueNotes && (
                      <div>
                        <p className="text-[10px] uppercase text-outline font-semibold">
                          Ghi chú vấn đề
                        </p>
                        <p className="text-status-danger whitespace-pre-wrap">{c.issueNotes}</p>
                      </div>
                    )}
                    {Array.isArray(c.recentUpdates) && c.recentUpdates.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase text-outline font-semibold">
                          Cập nhật gần nhất
                        </p>
                        <ul className="space-y-0.5">
                          {c.recentUpdates.slice(0, 4).map((u: any, i: number) => (
                            <li key={i} className="text-on-surface-variant">
                              • {u.at} — {u.author} — {u.percent}%{" "}
                              {u.notes ? `— ${u.notes}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {Array.isArray(c.linkedWorkItems) && c.linkedWorkItems.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase text-outline font-semibold">
                          Đầu việc liên thông
                        </p>
                        <ul className="space-y-0.5">
                          {c.linkedWorkItems.map((w: any, i: number) => (
                            <li key={i} className="text-on-surface-variant">
                              • {w.title}
                              {w.completedDate ? ` — hoàn thành ${w.completedDate}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {preview.caseType === "PLAN" && (
                <div className="space-y-2">
                  <p className="font-label-sm text-label-sm uppercase tracking-wide text-outline font-semibold">
                    Hạng mục kế hoạch ({Array.isArray(c.items) ? c.items.length : 0})
                  </p>
                  <div className="rounded-lg border border-border-default p-3 space-y-1">
                    <p className="text-[11px] text-on-surface-variant">
                      Đơn vị: {c.unitName || "—"} · Người lập: {c.creatorName || "—"} · Kỳ:{" "}
                      {c.periodTitle || "—"}
                    </p>
                    {Array.isArray(c.items) && c.items.length > 0 ? (
                      <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                        {c.items.map((it: any, i: number) => (
                          <li key={it.id || i} className="text-[11px] text-on-surface">
                            • {it.title}
                            {it.priority ? ` (${it.priority})` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-on-surface-variant">Kế hoạch chưa có hạng mục.</p>
                    )}
                  </div>
                </div>
              )}

              {preview.caseType === "DEADLINE_REQUEST" && (
                <div className="space-y-2">
                  <p className="font-label-sm text-label-sm uppercase tracking-wide text-outline font-semibold">
                    Đề nghị gia hạn
                  </p>
                  <div className="rounded-lg border border-border-default p-3 space-y-1 text-[11px]">
                    <p className="text-on-surface-variant">
                      Người đề nghị: <strong className="text-on-surface">{c.requestedByName}</strong>
                    </p>
                    <p className="text-on-surface-variant">
                      Hạn đề nghị:{" "}
                      <strong className="text-on-surface font-mono">
                        {preview.deadline.requestedDeadline || "—"}
                      </strong>
                    </p>
                    <div>
                      <p className="text-[10px] uppercase text-outline font-semibold">Lý do</p>
                      <p className="text-on-surface whitespace-pre-wrap">{c.reason || "—"}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Minh chứng */}
              {preview.attachments.length > 0 && (
                <div className="space-y-2">
                  <p className="font-label-sm text-label-sm uppercase tracking-wide text-outline font-semibold">
                    Tệp đính kèm ({preview.attachments.length})
                  </p>
                  <ul className="space-y-1">
                    {preview.attachments.map((a) => (
                      <li
                        key={a.id}
                        className="rounded-lg border border-border-default p-2 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] text-on-surface truncate font-medium">
                            {a.fileName}
                          </p>
                          <p className="text-[10px] text-on-surface-variant">
                            {formatBytes(a.fileSize)} · {a.uploadedBy} ·{" "}
                            {formatDateTime(a.createdAt)}
                          </p>
                        </div>
                        <a
                          href={a.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-[11px] font-semibold text-secondary underline"
                        >
                          Mở (có kiểm tra quyền)
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Lịch sử quyết định */}
              {preview.history.length > 0 && (
                <div className="space-y-2">
                  <p className="font-label-sm text-label-sm uppercase tracking-wide text-outline font-semibold">
                    Lịch sử xử lý ({preview.history.length})
                  </p>
                  <ul className="space-y-1">
                    {preview.history.map((h, i) => (
                      <li key={i} className="rounded-lg border border-border-default p-2">
                        <p className="text-[11px] text-on-surface">
                          <strong>Vòng {h.round}</strong> · {h.actionLabel} ·{" "}
                          {formatDateTime(h.createdAt)}
                        </p>
                        {h.reason && (
                          <p className="text-[11px] text-on-surface-variant">Lý do: {h.reason}</p>
                        )}
                        {h.content && (
                          <p className="text-[11px] text-on-surface-variant">
                            Nội dung: {h.content}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* YC-10: mức chất lượng + lịch sử điều chỉnh (chỉ người có quyền xem) */}
              {preview.caseType === "TASK_RESULT" &&
                preview.quality?.visible &&
                (preview.quality.history.length > 0 || preview.quality.adjustments.length > 0) && (
                  <div
                    data-testid="quality-history"
                    className="space-y-2 rounded-lg border border-border-default p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-label-sm text-label-sm uppercase tracking-wide text-outline font-semibold">
                        Đánh giá chất lượng kết quả
                      </p>
                      <span className="text-[11px] font-semibold text-primary">
                        Hiệu lực: {qualityLabel(preview.quality.effective)}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                      <div className="rounded border border-border-default p-2">
                        <p className="text-[10px] uppercase text-outline font-semibold">Gốc (bất biến)</p>
                        <p className="text-on-surface font-mono">
                          {qualityLabel(preview.quality.original)}
                        </p>
                      </div>
                      <div className="rounded border border-border-default p-2">
                        <p className="text-[10px] uppercase text-outline font-semibold">Hiệu lực</p>
                        <p className="text-on-surface font-mono">
                          {qualityLabel(preview.quality.effective)}
                          {preview.quality.adjusted ? " (đã điều chỉnh)" : ""}
                        </p>
                      </div>
                      <div className="rounded border border-border-default p-2">
                        <p className="text-[10px] uppercase text-outline font-semibold">Chờ điều chỉnh</p>
                        <p className="text-on-surface font-mono">
                          {preview.quality.pendingAdjustmentCount}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-outline font-semibold">
                        Lịch sử theo vòng
                      </p>
                      <ul className="space-y-0.5">
                        {preview.quality.history.map((h) => (
                          <li key={h.decisionId} className="text-[11px] text-on-surface-variant">
                            • Vòng {h.round} · {h.actionLabel} ·{" "}
                            <strong className="text-on-surface">
                              {qualityLabel(h.qualityPercent)}
                            </strong>
                            {h.actorName ? ` · ${h.actorName}` : ""} · {formatDateTime(h.createdAt)}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {preview.quality.adjustments.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase text-outline font-semibold">
                          Yêu cầu điều chỉnh
                        </p>
                        {preview.quality.adjustments.map((a) => (
                          <div
                            key={a.id}
                            data-testid={`quality-adjustment-${a.id}`}
                            className="rounded border border-border-default p-2 space-y-1"
                          >
                            <p className="text-[11px] text-on-surface">
                              <strong>
                                {qualityLabel(a.oldQualityPercent)} → {qualityLabel(a.newQualityPercent)}
                              </strong>{" "}
                              · {a.statusLabel}
                            </p>
                            <p className="text-[11px] text-on-surface-variant">
                              Lý do: {a.reason} · Người yêu cầu: {a.requestedByName || "—"} ·{" "}
                              {formatDateTime(a.requestedAt)}
                            </p>
                            {a.decidedAt && (
                              <p className="text-[11px] text-on-surface-variant">
                                Người quyết định: {a.decidedByName || "—"} ·{" "}
                                {formatDateTime(a.decidedAt)}
                                {a.decisionNote ? ` · Ghi chú: ${a.decisionNote}` : ""}
                              </p>
                            )}
                            {a.canDecide && (
                              <div className="flex flex-col sm:flex-row gap-1.5 pt-1">
                                <input
                                  value={adjustmentNotes[a.id] || ""}
                                  onChange={(e) =>
                                    setAdjustmentNotes((prev) => ({
                                      ...prev,
                                      [a.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Ghi chú quyết định (không bắt buộc)"
                                  className="flex-1 min-w-0 px-2 py-1.5 rounded border border-border-default bg-surface-container-lowest text-[11px]"
                                />
                                <div className="flex gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    disabled={adjustmentBusy}
                                    onClick={() => decideAdjustment(a.id, "APPROVE")}
                                    className="px-2.5 py-1.5 rounded bg-primary text-on-primary text-[11px] font-semibold disabled:opacity-50"
                                  >
                                    Chấp thuận
                                  </button>
                                  <button
                                    type="button"
                                    disabled={adjustmentBusy}
                                    onClick={() => decideAdjustment(a.id, "REJECT")}
                                    className="px-2.5 py-1.5 rounded border border-status-danger text-status-danger text-[11px] font-semibold disabled:opacity-50"
                                  >
                                    Từ chối
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {preview.quality.canRequestAdjustment && (
                      <div className="space-y-1.5 rounded border border-secondary/40 bg-surface-container p-2">
                        <p className="text-[10px] uppercase text-outline font-semibold">
                          Yêu cầu điều chỉnh chất lượng
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                          <select
                            data-testid="quality-adjustment-select"
                            value={adjustmentQuality}
                            onChange={(e) => setAdjustmentQuality(e.target.value)}
                            className="w-full px-2 py-1.5 rounded border border-border-default bg-surface-container-lowest text-[11px]"
                          >
                            <option value="">— Chọn mức mới —</option>
                            {QUALITY_VALUES.map((v) => (
                              <option key={v} value={v}>
                                {v}%
                              </option>
                            ))}
                          </select>
                          <input
                            data-testid="quality-adjustment-reason"
                            value={adjustmentReason}
                            onChange={(e) => setAdjustmentReason(e.target.value)}
                            placeholder="Lý do điều chỉnh (bắt buộc)"
                            className="sm:col-span-2 w-full px-2 py-1.5 rounded border border-border-default bg-surface-container-lowest text-[11px]"
                          />
                        </div>
                        <button
                          type="button"
                          data-testid="quality-adjustment-submit"
                          disabled={adjustmentBusy}
                          onClick={submitAdjustmentRequest}
                          className="px-3 py-1.5 rounded bg-secondary text-on-secondary text-[11px] font-semibold disabled:opacity-50"
                        >
                          Gửi yêu cầu điều chỉnh
                        </button>
                      </div>
                    )}
                  </div>
                )}
            </div>

            {/* Quyết định */}
            <div className="px-5 py-4 border-t border-border-default bg-surface-container-lowest">
              {preview.permissions.reason && (
                <p className="text-[11px] text-status-warning font-semibold mb-2">
                  {preview.permissions.reason}
                </p>
              )}
              <p className="font-label-sm text-label-sm uppercase tracking-wide text-outline font-semibold mb-2">
                Quyết định của bạn
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {ACTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={!preview.permissions.canDecide || submitting}
                    onClick={() => setAction(opt.value)}
                    className={`text-left rounded-lg border p-2 transition-fast disabled:opacity-50 ${
                      action === opt.value
                        ? "border-secondary bg-surface-container ring-1 ring-secondary"
                        : "border-border-default hover:bg-surface-container"
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-[18px] ${opt.tone} block`}
                    >
                      {opt.icon}
                    </span>
                    <span className="text-[12px] font-bold text-primary block">{opt.label}</span>
                    <span className="text-[10px] text-on-surface-variant leading-tight block">
                      {opt.hint}
                    </span>
                  </button>
                ))}
              </div>

              {preview.caseType === "TASK_RESULT" && preview.quality?.enabled && (
                <div
                  data-testid="quality-select-block"
                  className="mt-3 rounded-lg border border-border-default p-2.5 space-y-1"
                >
                  <label
                    htmlFor="quality-percent"
                    className="text-xs font-semibold text-on-surface block"
                  >
                    Mức chất lượng kết quả (65–100, bước 5){" "}
                    {action === "AGREE" ? (
                      <span className="text-status-danger">*</span>
                    ) : (
                      <span className="text-outline font-normal">(không bắt buộc)</span>
                    )}
                  </label>
                  <select
                    id="quality-percent"
                    data-testid="quality-select"
                    value={qualityPercent}
                    onChange={(e) => setQualityPercent(e.target.value)}
                    disabled={!preview.permissions.canDecide || submitting}
                    className="w-full px-2.5 py-2 rounded-lg border border-border-default bg-surface-container-lowest text-xs disabled:opacity-50"
                  >
                    <option value="">— Chưa đánh giá / chọn mức —</option>
                    {QUALITY_VALUES.map((v) => (
                      <option key={v} value={v}>
                        {v}%{v === 100 ? " — chất lượng đạt yêu cầu đầy đủ" : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-on-surface-variant">
                    Không tự mặc định 100. Mức 65–95 vẫn có thể là Đồng ý; chất lượng không tự đổi
                    điểm/xếp loại.
                  </p>
                  {action === "AGREE" && !qualityPercent && (
                    <p
                      data-testid="quality-required-error"
                      className="text-[11px] font-semibold text-status-danger"
                    >
                      Bắt buộc chọn mức chất lượng khi Đồng ý nghiệm thu.
                    </p>
                  )}
                </div>
              )}

              {action === "REJECT" && (
                <div className="mt-3 flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-on-surface">
                    Lý do không đồng ý: <span className="text-status-danger">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Nêu rõ lý do để người trình biết cần điều chỉnh gì..."
                    className="w-full p-2.5 rounded-lg border border-border-default bg-surface-container-lowest text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              )}

              {action === "CLARIFY" && (
                <div className="mt-3 flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-on-surface">
                    Nội dung cần giải trình: <span className="text-status-danger">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Nội dung người trình cần bổ sung / làm rõ để hồ sơ được xem trước..."
                    className="w-full p-2.5 rounded-lg border border-border-default bg-surface-container-lowest text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-on-surface-variant hover:bg-surface-container"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  data-testid="approval-submit-decision"
                  onClick={submit}
                  disabled={submitting || !preview.permissions.canDecide}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-primary text-on-primary hover:bg-primary/90 shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">
                        progress_activity
                      </span>
                      Đang ghi...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">gavel</span>
                      Ghi quyết định
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
