"use client";

import { V5Icon } from "@/components/v5/ui/icon";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock3, FileCheck2, History, Inbox, RefreshCw, Reply } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { Badge } from "@/components/v5/ui/badge";
import { Button } from "@/components/v5/ui/button";
import { Card } from "@/components/v5/ui/card";
import { PageHeader } from "@/components/v5/ui/page-header";
import { formatVnDateTime } from "@/lib/datetime";
import ApprovalPreviewModal, {
  type ApprovalCaseType,
  type ApprovalDecisionAction,
} from "./ApprovalPreviewModal";

interface ApprovalAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileUrl: string;
  createdAt: string;
  uploadedBy?: {
    fullName: string;
  };
}

interface ApprovalItem {
  id: string;
  code: string;
  title: string;
  type: "delay" | "result" | "plan";
  urgent?: boolean;
  timeAgo: string;
  submitter: string;
  unit: string;
  reason?: string;
  oldDeadline?: string;
  newDeadline?: string;
  extensionDays?: string;
  documentTitle?: string;
  documentUrl?: string;
  reqId?: string;
  attachments?: ApprovalAttachment[];
}

interface DecidedCase {
  id: string;
  caseType: string;
  resourceId: string;
  code: string | null;
  title: string;
  status: string;
  decidedAt: string | null;
  decidedByName: string | null;
  submittedByName: string | null;
  latestDecision: {
    action: string;
    actionLabel: string;
    reason: string | null;
    content: string | null;
    actorName: string | null;
    at: string;
    source?: string;
    sourceLabel?: string;
  } | null;
  /** E12-A: các vòng đã quyết định, kèm nhãn nguồn. */
  history?: Array<{
    id: string;
    round: number;
    action: string;
    actionLabel: string;
    reason: string | null;
    content: string | null;
    qualityPercent?: number | null;
    actorName: string | null;
    at: string;
    source: string;
    sourceLabel: string;
  }>;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string, fileName: string) {
  const name = fileName.toLowerCase();
  if (mimeType.includes("pdf") || name.endsWith(".pdf")) {
    return { icon: "picture_as_pdf", color: "text-v5-danger bg-v5-danger-soft border-v5-danger/30" };
  }
  if (
    mimeType.includes("spreadsheet") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".csv")
  ) {
    return { icon: "table_view", color: "text-emerald-600 bg-v5-success-soft border-v5-success/30" };
  }
  if (
    mimeType.startsWith("image/") ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp")
  ) {
    return { icon: "image", color: "text-v5-accent bg-v5-accent-soft border-v5-line" };
  }
  return { icon: "description", color: "text-v5-muted bg-v5-bg border-v5-line" };
}

export default function ApprovalsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"all" | "plan" | "result" | "delay">("all");
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Modal xem trước tệp tài liệu / hình ảnh
  const [previewFile, setPreviewFile] = useState<{
    url: string;
    name: string;
    mimeType: string;
  } | null>(null);

  // YC-37 — Bước XEM TRƯỚC bắt buộc trước khi quyết định
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCaseType, setPreviewCaseType] = useState<ApprovalCaseType | null>(null);
  const [previewResourceId, setPreviewResourceId] = useState<string | null>(null);
  const [previewAction, setPreviewAction] = useState<ApprovalDecisionAction>("AGREE");
  const [previewItemKey, setPreviewItemKey] = useState<string>("");

  // YC-37 — "Hồ sơ của tôi": theo dõi + gửi giải trình lại
  const [myCases, setMyCases] = useState<
    Array<{
      id: string;
      caseType: string;
      resourceId: string;
      code: string | null;
      title: string;
      status: string;
      currentRound: number;
      updatedAt: string;
      latestDecision: {
        action: string;
        reason: string | null;
        content: string | null;
        at: string;
      } | null;
    }>
  >([]);
  const [myCasesLoading, setMyCasesLoading] = useState(false);
  const [respondCase, setRespondCase] = useState<{
    caseType: ApprovalCaseType;
    resourceId: string;
    title: string;
  } | null>(null);
  const [respondContent, setRespondContent] = useState("");
  const [responding, setResponding] = useState(false);

  // YC-12 — "Đã xử lý": lịch sử quyết định theo thẩm quyền + lọc cán bộ/tháng/năm.
  const [decidedCases, setDecidedCases] = useState<DecidedCase[]>([]);
  const [decidedLoading, setDecidedLoading] = useState(false);
  const [decidedPerson, setDecidedPerson] = useState("");
  const [decidedMonth, setDecidedMonth] = useState("");
  const [decidedYear, setDecidedYear] = useState("");

  const fetchMyCases = useCallback(async () => {
    setMyCasesLoading(true);
    try {
      const res = await fetch("/api/approvals/cases", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok) setMyCases(json.data || []);
    } catch {
      // im lặng — phần này chỉ là thông tin phụ
    } finally {
      setMyCasesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyCases();
  }, [fetchMyCases]);

  const fetchDecidedCases = useCallback(async () => {
    setDecidedLoading(true);
    try {
      const params = new URLSearchParams({ scope: "decided" });
      if (decidedPerson.trim()) params.set("person", decidedPerson.trim());
      if (decidedMonth) params.set("month", decidedMonth);
      if (decidedYear) params.set("year", decidedYear);
      const res = await fetch("/api/approvals/cases?" + params.toString(), { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok) setDecidedCases(json?.data || []);
    } catch {
      // im lặng — khối lịch sử không chặn màn hình chính
    } finally {
      setDecidedLoading(false);
    }
  }, [decidedPerson, decidedMonth, decidedYear]);

  useEffect(() => {
    fetchDecidedCases();
  }, [fetchDecidedCases]);

  // Tải danh sách hồ sơ thực tế từ PostgreSQL
  const fetchLiveApprovals = useCallback(async () => {
    try {
      // Chỉ lấy ĐÚNG hai nguồn cần duyệt (trước đây kéo 50 việc đầu về lọc —
      // hồ sơ chờ duyệt nằm ngoài 50 việc đó sẽ vô hình)
      const [tasksRes, delayRes, plansRes] = await Promise.all([
        fetch("/api/tasks?status=WAITING_REVIEW&pageSize=100", { cache: "no-store" }),
        fetch("/api/tasks?deadlinePending=1&pageSize=100", { cache: "no-store" }),
        fetch("/api/plans", { cache: "no-store" }),
      ]);

      const liveItems: ApprovalItem[] = [];

      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        const tasksList = Array.isArray(tasksData) ? tasksData : tasksData.data || [];

        for (const t of tasksList) {
          // 1. Nhiệm vụ chờ nghiệm thu kết quả (result)
          if (t.status === "WAITING_REVIEW") {
            liveItems.push({
              id: t.id,
              code: t.code,
              title: t.title,
              type: "result",
              urgent: t.priority === "Cao" || t.priority === "Khẩn",
              timeAgo: "Chờ nghiệm thu",
              submitter: t.owner?.fullName || "Cán bộ tác nghiệp",
              unit: t.unit?.name || "BP Nghiệp vụ Hải quan",
              reason: t.actualResultText || "Đã hoàn thành các nội dung theo yêu cầu, trình Lãnh đạo nghiệm thu.",
              documentTitle: `Nhiệm vụ: ${t.code}`,
              attachments: t.attachments || [],
            });
          }
        }
      }

      if (delayRes.ok) {
        const delayData = await delayRes.json();
        const delayList = Array.isArray(delayData) ? delayData : delayData.data || [];

        for (const t of delayList) {
          // 2. Nhiệm vụ có đề xuất lùi hạn chót (delay)
          if (t.deadlineRequests && t.deadlineRequests.length > 0) {
            const pendingReq = t.deadlineRequests.find((dr: any) => dr.status === "PENDING");
            if (pendingReq) {
              const oldDateStr = t.originalDeadline
                ? new Date(t.originalDeadline).toLocaleDateString("vi-VN")
                : t.currentDeadline
                ? new Date(t.currentDeadline).toLocaleDateString("vi-VN")
                : "Chưa đặt";
              const newDateStr = pendingReq.requestedDeadline
                ? new Date(pendingReq.requestedDeadline).toLocaleDateString("vi-VN")
                : "Chưa xác định";

              liveItems.push({
                id: t.id,
                code: t.code,
                title: t.title,
                type: "delay",
                urgent: true,
                timeAgo: "Chờ duyệt hạn",
                submitter: pendingReq.requestedBy?.fullName || t.owner?.fullName || "Cán bộ tác nghiệp",
                unit: t.unit?.name || "BP Nghiệp vụ Hải quan",
                reason: pendingReq.reason || "Đề xuất lùi thời hạn thực hiện.",
                oldDeadline: oldDateStr,
                newDeadline: newDateStr,
                extensionDays: "+Gia hạn",
                reqId: pendingReq.id,
                attachments: t.attachments || [],
              });
            }
          }
        }
      }

      if (plansRes.ok) {
        const plansData = await plansRes.json();
        const plansList = Array.isArray(plansData) ? plansData : plansData.data || [];

        for (const p of plansList) {
          if (p.status === "SUBMITTED") {
            liveItems.push({
              id: p.id,
              code: p.period?.code || `KH-${p.period?.type || "TUAN"}`,
              title: p.title || `Kế hoạch ${p.period?.title || "công tác"}`,
              type: "plan",
              urgent: false,
              timeAgo: "Chờ ký duyệt",
              submitter: p.creator?.fullName || p.unit?.name || "Trưởng bộ phận",
              unit: p.unit?.name || "Hải quan cửa khẩu Quốc tế Tà Lùng",
              reason: "Kế hoạch công tác tuần đã được xây dựng hoàn tất, trình Trưởng hải quan cửa khẩu xem xét ký duyệt.",
            });
          }
        }
      }

      setApprovals(liveItems);
    } catch (err: any) {
      console.error("Lỗi khi tải danh sách hồ sơ phê duyệt:", err);
      toast.error("Không thể tải danh sách hồ sơ: " + (err.message || "Lỗi kết nối"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveApprovals();
  }, [fetchLiveApprovals]);

  // YC-37 — Ánh xạ hồ sơ giao diện → loại hồ sơ server-side
  const resolveCaseRef = (item: ApprovalItem): { caseType: ApprovalCaseType; resourceId: string } | null => {
    if (item.type === "result") return { caseType: "TASK_RESULT", resourceId: item.id };
    if (item.type === "plan") return { caseType: "PLAN", resourceId: item.id };
    if (item.type === "delay" && item.reqId)
      return { caseType: "DEADLINE_REQUEST", resourceId: item.reqId };
    return null;
  };

  const approvalItemKey = (item: ApprovalItem) => `${item.id}-${item.reqId || "main"}`;

  // YC-37 — Bấm "Chấp thuận" chỉ MỞ xem trước, KHÔNG ghi quyết định
  const openPreview = (item: ApprovalItem, initialAction: ApprovalDecisionAction) => {
    const ref = resolveCaseRef(item);
    if (!ref) {
      toast.error("Không xác định được loại hồ sơ để xem trước");
      return;
    }
    setPreviewCaseType(ref.caseType);
    setPreviewResourceId(ref.resourceId);
    setPreviewAction(initialAction);
    setPreviewItemKey(approvalItemKey(item));
    setPreviewOpen(true);
  };

  const submitRespond = async () => {
    if (!respondCase) return;
    if (!respondContent.trim()) {
      toast.error("Vui lòng nhập nội dung giải trình.");
      return;
    }
    setResponding(true);
    try {
      const res = await fetch(
        `/api/approvals/${respondCase.caseType}/${respondCase.resourceId}/response`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: respondContent }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error || "Không gửi được nội dung giải trình.");
        return;
      }
      toast.success(json.message || "Đã gửi nội dung giải trình.");
      setRespondCase(null);
      setRespondContent("");
      fetchMyCases();
      fetchLiveApprovals();
    } catch (e: any) {
      toast.error(e.message || "Lỗi khi gửi nội dung giải trình.");
    } finally {
      setResponding(false);
    }
  };

  const filteredItems = approvals.filter((item) => {
    if (activeTab === "all") return true;
    return item.type === activeTab;
  });

  return (
    <div className="w-full pb-4">
      <div className="flex w-full flex-col gap-3">
        <PageHeader
          eyebrow="Trung tâm phê duyệt"
          title="Duyệt & xác nhận"
          badges={<Badge variant="outline">Lãnh đạo</Badge>}
          description="Duyệt kế hoạch, kết quả nhiệm vụ và đề xuất gia hạn."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchLiveApprovals();
                fetchMyCases();
              }}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Làm mới
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-2">
          <Card className="p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-v5-muted">Chờ xử lý</span>
              <FileCheck2 className="h-4 w-4 text-v5-accent" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold tabular-nums text-v5-ink">{String(approvals.length).padStart(2, "0")}</span>
              <span className="text-[10px] text-v5-muted">hồ sơ</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-v5-danger">
              <Clock3 className="h-3 w-3" /> {approvals.filter((a) => a.urgent).length} yêu cầu khẩn
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-v5-muted">Hồ sơ của tôi</span>
              <FileCheck2 className="h-4 w-4 text-v5-muted" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold tabular-nums text-v5-ink">{String(myCases.length).padStart(2, "0")}</span>
              <span className="text-[10px] text-v5-muted">đang theo dõi</span>
            </div>
            <div className="mt-1 text-[10px] text-v5-muted">Cập nhật trạng thái xử lý</div>
          </Card>
        </div>

        <div data-tour="filter-tabs" className="flex w-full flex-wrap items-center gap-1 rounded-md bg-v5-bg p-1">
          {[
            { key: "all" as const, label: `Tất cả (${approvals.length})` },
            { key: "plan" as const, label: `Kế hoạch (${approvals.filter((a) => a.type === "plan").length})` },
            { key: "result" as const, label: `Kết quả (${approvals.filter((a) => a.type === "result").length})` },
            { key: "delay" as const, label: `Lùi hạn (${approvals.filter((a) => a.type === "delay").length})` },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`flex-1 rounded px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                activeTab === item.key
                  ? "bg-v5-accent text-white shadow-sm"
                  : "text-v5-muted hover:bg-v5-surface hover:text-v5-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Cards List */}
        <div data-tour="approval-list" className="flex flex-col gap-space-md">
          {loading ? (
            <div className="p-12 text-center text-v5-muted bg-v5-surface rounded-xl animate-pulse">
              Đang nạp danh sách hồ sơ trình ký và nghiệm thu từ cơ sở dữ liệu...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="bg-v5-surface p-8 rounded-xl border border-v5-line/50 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-status-success-bg text-status-success flex items-center justify-center">
                <V5Icon name="task_alt" className="text-[28px]" />
              </div>
              <p className="font-headline-sm text-primary font-bold">Không có hồ sơ chờ phê duyệt</p>
              <p className="font-body-md text-v5-muted max-w-sm text-sm">
                Tất cả các kế hoạch tuần, đề xuất gia hạn và báo cáo kết quả nhiệm vụ đã được xử lý hoàn tất.
              </p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isItemBusy = processingId === item.id;

              return (
                <div
                  key={`${item.id}-${item.reqId || "main"}`}
                  className="bg-v5-surface rounded-xl shadow-sm p-space-md relative overflow-hidden transition-fast border border-v5-line/50 hover-lift"
                >
                  {/* Priority ribbon bar */}
                  {item.urgent && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-status-danger" />
                  )}

                  {/* Header row */}
                  <div className="flex items-start justify-between gap-space-sm mb-space-xs pt-1">
                    <div className="flex items-center gap-space-xs flex-wrap">
                      {item.urgent && (
                        <span className="px-space-xs py-0.5 bg-status-danger-bg text-status-danger rounded font-label-sm text-[11px] font-bold flex items-center gap-1">
                          <V5Icon name="alarm" className="text-[13px]" />
                          Khẩn cấp
                        </span>
                      )}
                      <span className="font-label-sm text-label-sm text-v5-muted font-mono font-bold">
                        {item.code}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        item.type === "plan"
                          ? "bg-primary-fixed text-primary"
                          : item.type === "delay"
                          ? "bg-status-warning-bg text-status-warning"
                          : "bg-secondary-fixed text-secondary"
                      }`}>
                        {item.type === "plan" ? "Kế hoạch tuần" : item.type === "delay" ? "Đề xuất lùi hạn" : "Nghiệm thu kết quả"}
                      </span>
                    </div>
                    <span className="font-label-sm text-label-sm text-v5-muted">
                      {item.timeAgo}
                    </span>
                  </div>

                  {/* Title & Assignee */}
                  <h2 className="font-headline-sm text-headline-sm text-primary mb-space-xs font-bold leading-snug">
                    {item.title}
                  </h2>
                  <div className="flex items-center gap-space-xs mb-space-sm bg-v5-bg p-space-xs rounded-lg">
                    <div className="w-7 h-7 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-label-sm text-label-sm font-semibold">
                      {item.submitter.charAt(0) || "C"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-body-semibold text-body-semibold text-primary truncate leading-tight text-xs">
                        {item.submitter}
                      </p>
                      <p
                        className="truncate text-[11px] text-v5-muted"
                        title="Đơn vị giao việc của nhiệm vụ, không phải chức danh hiện tại"
                      >
                        Đơn vị giao: {item.unit}
                      </p>
                    </div>
                  </div>

                  {/* Detail Box */}
                  <div className="bg-v5-bg rounded-lg p-space-sm mb-space-sm space-y-space-xs text-xs">
                    {item.reason && (
                      <div className="text-v5-ink font-body-md text-body-md">
                        <span className="text-v5-muted font-label-sm text-label-sm block font-semibold">
                          Lý do / Báo cáo nội dung:
                        </span>
                        {item.reason}
                      </div>
                    )}

                    {item.documentTitle && (
                      <div className="p-2 rounded bg-v5-surface flex items-center gap-2 text-primary font-semibold">
                        <V5Icon name="description" className="text-secondary text-[18px]" />
                        <span className="truncate">{item.documentTitle}</span>
                      </div>
                    )}

                    {item.oldDeadline && item.newDeadline && (
                      <div className="pt-space-xs flex items-center justify-between font-label-md text-label-md bg-v5-surface p-space-xs rounded">
                        <div className="text-v5-muted line-through font-mono">
                          {item.oldDeadline}
                        </div>
                        <V5Icon name="arrow_forward" className="text-status-warning text-[18px]" />
                        <div className="text-status-danger font-semibold font-mono flex items-center gap-1">
                          {item.newDeadline}
                          <span className="text-[11px] px-1 py-0.2 bg-status-danger-bg rounded font-bold">
                            {item.extensionDays}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Hồ sơ & Tài liệu nghiệm thu đính kèm */}
                  {item.attachments && item.attachments.length > 0 && (
                    <div className="bg-v5-bg border border-v5-line/60 rounded-lg p-space-sm mb-space-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-label-sm text-[11px] font-bold text-primary flex items-center gap-1 uppercase tracking-wider">
                          <V5Icon name="attach_file" className="text-[15px] text-secondary" />
                          Hồ sơ & Tài liệu nghiệm thu ({item.attachments.length})
                        </span>
                        <span className="text-[10px] text-v5-muted font-medium">Bấm xem trực tiếp hoặc tải về</span>
                      </div>
                      <div className="space-y-1.5">
                        {item.attachments.map((att) => {
                          const fileStyle = getFileIcon(att.mimeType, att.fileName);
                          const isPdfOrImg =
                            att.mimeType.includes("pdf") ||
                            att.mimeType.startsWith("image/") ||
                            att.fileName.match(/\.(pdf|png|jpg|jpeg|webp)$/i);
                          return (
                            <div
                              key={att.id}
                              className="flex items-center justify-between gap-2 p-2 bg-v5-surface rounded-md border border-v5-line/50 hover:border-secondary/50 transition-fast"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className={`p-1.5 rounded border text-[16px] shrink-0 ${fileStyle.color} flex items-center justify-center`}>
                                  <V5Icon name={fileStyle.icon} className="text-[18px]" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="font-body-semibold text-xs text-primary truncate" title={att.fileName}>
                                    {att.fileName}
                                  </p>
                                  <p className="text-[10px] text-v5-muted">
                                    {formatFileSize(att.fileSize)}
                                    {att.uploadedBy?.fullName && ` · Tải lên bởi ${att.uploadedBy.fullName}`}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {isPdfOrImg && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreviewFile({
                                        url: att.fileUrl,
                                        name: att.fileName,
                                        mimeType: att.mimeType,
                                      })
                                    }
                                    className="px-2 py-1 rounded bg-secondary/10 text-secondary hover:bg-secondary/20 text-[11px] font-semibold transition-fast flex items-center gap-1"
                                    title="Xem nhanh tệp"
                                  >
                                    <V5Icon name="visibility" className="text-[14px]" />
                                    <span>Xem</span>
                                  </button>
                                )}
                                <a
                                  href={att.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={att.fileName}
                                  className="px-2 py-1 rounded bg-v5-bg text-primary hover:bg-v5-bg-high text-[11px] font-semibold transition-fast flex items-center gap-1 border border-v5-line"
                                  title="Tải về máy tính"
                                >
                                  <V5Icon name="download" className="text-[14px]" />
                                  <span>Tải</span>
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {item.type === "result" && (!item.attachments || item.attachments.length === 0) && (
                    <div className="px-3 py-2 rounded-lg bg-v5-bg/80 border border-dashed border-v5-line text-[11px] text-v5-muted mb-space-sm flex items-center gap-1.5">
                      <V5Icon name="info" className="text-[15px] text-v5-muted" />
                      <span>Chưa có tệp đính kèm nào được tải lên cho nhiệm vụ này.</span>
                    </div>
                  )}

                  {/* Action Buttons — YC-37: mọi quyết định đều qua bước XEM TRƯỚC */}
                  <div className="grid grid-cols-2 gap-space-xs">
                    <button
                      type="button"
                      disabled={isItemBusy}
                      onClick={() => openPreview(item, "CLARIFY")}
                      className={`h-11 px-space-xs rounded-lg bg-v5-bg text-primary font-body-semibold text-body-semibold transition-fast flex items-center justify-center gap-1 text-xs border border-v5-line/50 ${
                        isItemBusy ? "opacity-50 cursor-not-allowed" : "hover:bg-v5-bg active-press"
                      }`}
                    >
                      <V5Icon name="undo" className="text-[18px]" />
                      <span>Trả lại / Giải trình</span>
                    </button>
                    <button
                      type="button"
                      disabled={isItemBusy}
                      onClick={() => openPreview(item, "AGREE")}
                      className={`h-11 px-space-xs rounded-lg bg-primary text-on-primary font-body-semibold text-body-semibold shadow-sm transition-fast flex items-center justify-center gap-1 text-xs font-bold ${
                        isItemBusy ? "opacity-50 cursor-not-allowed" : "hover:bg-primary/90 active-press"
                      }`}
                    >
                      {isItemBusy ? (
                        <>
                          <V5Icon name="progress_activity" className="text-[18px] animate-spin" />
                          <span>Đang xử lý...</span>
                        </>
                      ) : (
                        <>
                          <V5Icon name="check_circle" className="text-[18px]" />
                          <span>Chấp thuận</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal xem trước tệp tài liệu / hình ảnh (Lightbox & PDF viewer) */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/75 backdrop-blur-sm animate-fade-in"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="bg-v5-surface rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-v5-line"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 border-b border-v5-line flex items-center justify-between bg-v5-bg">
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <V5Icon
                  name={
                    previewFile.mimeType.includes("pdf") || previewFile.name.toLowerCase().endsWith(".pdf")
                      ? "picture_as_pdf"
                      : "image"
                  }
                  className="text-[22px] text-secondary"
                />
                <span className="font-headline-sm text-sm font-bold text-primary truncate" title={previewFile.name}>
                  {previewFile.name}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={previewFile.name}
                  className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 flex items-center gap-1 shadow-sm transition-fast"
                >
                  <V5Icon name="download" className="text-[15px]" />
                  <span>Tải về</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 rounded-lg hover:bg-v5-bg text-v5-muted hover:text-primary transition-fast"
                  aria-label="Đóng xem trước"
                >
                  <V5Icon name="close" className="text-[20px]" />
                </button>
              </div>
            </div>
            <div className="p-3 md:p-6 flex-1 overflow-auto flex items-center justify-center bg-black/5 min-h-[350px]">
              {previewFile.mimeType.includes("pdf") || previewFile.name.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  src={previewFile.url}
                  title={previewFile.name}
                  className="w-full h-[75vh] rounded-lg border border-v5-line shadow-sm bg-v5-surface"
                />
              ) : (
                <img
                  src={previewFile.url}
                  alt={previewFile.name}
                  className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-sm"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          YC-37 — "HỒ SƠ CỦA TÔI": theo dõi hồ sơ đã trình + gửi giải trình lại
          ===================================================================== */}
      <section className="pt-1">
        <div className="overflow-hidden rounded-xl border border-v5-line bg-v5-surface shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-v5-line px-4 py-3">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-v5-accent" />
              <div>
                <h3 className="text-sm font-semibold text-v5-ink">Hồ sơ của tôi</h3>
                <p className="text-[11px] text-v5-muted">
                  Theo dõi hồ sơ đã trình, lý do bị trả lại và gửi giải trình lại.
                </p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={fetchMyCases}>
              <RefreshCw className="h-3.5 w-3.5" /> Làm mới
            </Button>
          </div>

          {myCasesLoading ? (
            <div className="p-4 text-[11px] text-v5-muted">Đang tải hồ sơ...</div>
          ) : myCases.length === 0 ? (
            <div className="p-4 text-[11px] text-v5-muted">
              Chưa có hồ sơ nào được trình duyệt.
            </div>
          ) : (
            <ul className="divide-y divide-v5-line">
              {myCases.map((mc) => (
                <li key={mc.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-[12px] font-semibold text-v5-ink">
                      <span className="font-mono text-[11px] text-v5-muted">
                        [{mc.code ?? ""}]
                      </span>{" "}
                      {mc.title}
                    </p>
                    <span className="shrink-0 text-[10px] px-2 py-0.5 rounded border border-v5-line bg-v5-bg text-v5-muted font-semibold whitespace-nowrap">
                      {mc.status === "OPEN"
                        ? "Chờ quyết định"
                        : mc.status === "AGREED"
                          ? "Đã chấp thuận"
                          : mc.status === "REJECTED"
                            ? "Đã từ chối"
                            : mc.status === "CLARIFY_REQUESTED"
                              ? "Chờ giải trình"
                              : mc.status}
                    </span>
                  </div>
                  {mc.latestDecision?.reason && (
                    <p className="text-[11px] text-v5-muted">
                      Lý do: {mc.latestDecision.reason}
                    </p>
                  )}
                  {mc.latestDecision?.content &&
                    mc.status !== "CLARIFY_REQUESTED" && (
                      <p className="text-[11px] text-v5-muted">
                        Nội dung: {mc.latestDecision.content}
                      </p>
                    )}
                  {mc.status === "CLARIFY_REQUESTED" && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setRespondCase({
                          caseType: mc.caseType as ApprovalCaseType,
                          resourceId: mc.resourceId,
                          title: mc.title,
                        });
                        setRespondContent("");
                      }}
                    >
                      <Reply className="h-3.5 w-3.5" />
                      Gửi giải trình
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* =====================================================================
          YC-12 — "ĐÃ XỬ LÝ": lịch sử quyết định theo thẩm quyền
          ===================================================================== */}
      <section className="pt-1">
        <div className="overflow-hidden rounded-xl border border-v5-line bg-v5-surface shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-v5-line px-4 py-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-v5-accent" />
              <div>
                <h3 className="text-sm font-semibold text-v5-ink">Đã xử lý</h3>
                <p className="text-[11px] text-v5-muted">
                  Lịch sử hồ sơ bạn đã quyết định hoặc thuộc phạm vi bạn được xem.
                </p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={fetchDecidedCases}>
              <RefreshCw className="h-3.5 w-3.5" /> Làm mới
            </Button>
          </div>

          <div className="px-4 py-2 flex flex-wrap items-center gap-2 border-b border-v5-line">
            <input
              data-testid="decided-person-filter"
              value={decidedPerson}
              onChange={(e) => setDecidedPerson(e.target.value)}
              placeholder="Mã hoặc tên cán bộ"
              className="h-9 flex-1 min-w-[160px] rounded-lg border border-v5-line bg-v5-surface px-3 text-xs"
            />
            <input
              data-testid="decided-month-filter"
              value={decidedMonth}
              onChange={(e) => setDecidedMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
              placeholder="Tháng"
              className="h-9 w-20 rounded-lg border border-v5-line bg-v5-surface px-3 text-xs"
            />
            <input
              data-testid="decided-year-filter"
              value={decidedYear}
              onChange={(e) => setDecidedYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Năm"
              className="h-9 w-24 rounded-lg border border-v5-line bg-v5-surface px-3 text-xs"
            />
            {(decidedPerson || decidedMonth || decidedYear) && (
              <button
                type="button"
                onClick={() => {
                  setDecidedPerson("");
                  setDecidedMonth("");
                  setDecidedYear("");
                }}
                className="text-[11px] font-semibold text-status-primary hover:underline"
              >
                Xoá lọc
              </button>
            )}
          </div>

          {decidedLoading ? (
            <div className="p-4 text-[11px] text-v5-muted">Đang tải lịch sử...</div>
          ) : decidedCases.length === 0 ? (
            <div className="p-4 text-[11px] text-v5-muted">Chưa có hồ sơ nào đã xử lý.</div>
          ) : (
            <ul className="divide-y divide-v5-line">
              {decidedCases.map((dc) => (
                <li key={dc.id} className="px-4 py-3 space-y-1" data-testid={`decided-case-${dc.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-[12px] font-semibold text-v5-ink">
                      <span className="font-mono text-[11px] text-v5-muted">
                        [{dc.code ?? dc.resourceId.slice(0, 8)}]
                      </span>{" "}
                      {dc.title}
                    </p>
                    <span
                      className={`shrink-0 text-[10px] px-2 py-0.5 rounded border font-semibold whitespace-nowrap ${
                        dc.status === "AGREED"
                          ? "border-status-success/30 bg-status-success-bg text-status-success"
                          : dc.status === "REJECTED"
                            ? "border-status-danger/30 bg-status-danger-bg text-status-danger"
                            : "border-status-warning/30 bg-status-warning-bg text-status-warning"
                      }`}
                    >
                      {dc.status === "AGREED"
                        ? "Đã chấp thuận"
                        : dc.status === "REJECTED"
                          ? "Đã từ chối"
                          : dc.status === "CLARIFY_REQUESTED"
                            ? "Yêu cầu giải trình"
                            : dc.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-v5-muted">
                    Người trình: <b className="text-v5-ink">{dc.submittedByName || "—"}</b>
                    {" · "}Người quyết định: <b className="text-v5-ink">{dc.decidedByName || "—"}</b>
                    {dc.decidedAt ? ` · ${formatVnDateTime(dc.decidedAt)}` : ""}
                  </p>
                  <p className="text-[11px] text-v5-muted">
                    <span className="px-1.5 py-0.5 rounded bg-v5-bg text-[10px] font-bold text-primary">
                      Nguồn: {dc.latestDecision?.sourceLabel || "Quyết định duyệt"}
                    </span>
                  </p>
                  {dc.latestDecision?.reason && (
                    <p className="text-[11px] text-v5-muted">Lý do: {dc.latestDecision.reason}</p>
                  )}
                  {dc.latestDecision?.content && (
                    <p className="text-[11px] text-v5-muted">Nội dung: {dc.latestDecision.content}</p>
                  )}
                  {Array.isArray(dc.history) && dc.history.length > 1 && (
                    <details className="text-[11px] text-v5-muted">
                      <summary className="cursor-pointer font-semibold text-secondary">
                        Các vòng đã quyết định ({dc.history.length})
                      </summary>
                      <ul className="mt-1 space-y-1">
                        {dc.history.map((h) => (
                          <li
                            key={h.id}
                            className="rounded border border-v5-line px-2 py-1"
                            data-testid={`decided-history-${h.source}`}
                          >
                            <span className="px-1.5 py-0.5 rounded bg-v5-bg text-[10px] font-bold text-primary">
                              Nguồn: {h.sourceLabel}
                            </span>{" "}
                            · Vòng {h.round} · {h.actionLabel}
                            {h.actorName ? ` · ${h.actorName}` : ""} · {formatVnDateTime(h.at)}
                            {h.reason ? ` · Lý do: ${h.reason}` : ""}
                            {h.content ? ` · Nội dung: ${h.content}` : ""}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <ApprovalPreviewModal
        open={previewOpen}
        caseType={previewCaseType}
        resourceId={previewResourceId}
        initialAction={previewAction}
        onClose={() => setPreviewOpen(false)}
        onDecided={() => {
          fetchLiveApprovals();
          fetchMyCases();
          fetchDecidedCases();
          const next = filteredItems.find((item) => approvalItemKey(item) !== previewItemKey);
          if (next) {
            toast.info("Đã xử lý. Đang mở hồ sơ tiếp theo...");
            window.setTimeout(() => openPreview(next, "AGREE"), 450);
          }
        }}
      />

      {/* Modal gửi giải trình lại */}
      {respondCase && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-v5-surface rounded-xl max-w-lg w-full p-6 shadow-2xl border border-v5-line flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-surface-container pb-3">
              <h3 className="font-headline-sm text-primary font-bold flex items-center gap-2">
                <V5Icon name="reply" className="text-status-warning text-[24px]" />
                Gửi nội dung giải trình
              </h3>
              <button
                type="button"
                onClick={() => setRespondCase(null)}
                className="text-v5-muted hover:text-v5-ink text-sm"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-v5-muted">
              Hồ sơ: <strong className="text-v5-ink">{respondCase.title}</strong>
            </p>
            <textarea
              rows={5}
              value={respondContent}
              onChange={(e) => setRespondContent(e.target.value)}
              placeholder="Bổ sung nội dung giải trình để hồ sơ được xem trước lại..."
              className="w-full p-3 rounded-lg border border-v5-line bg-v5-surface text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-container">
              <button
                type="button"
                onClick={() => setRespondCase(null)}
                disabled={responding}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-v5-muted hover:bg-v5-bg"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={submitRespond}
                disabled={responding}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-primary text-on-primary hover:bg-primary/90 shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {responding ? (
                  <>
                    <V5Icon name="progress_activity" className="text-[16px] animate-spin" />
                    Đang gửi...
                  </>
                ) : (
                  <>
                    <V5Icon name="send" className="text-[16px]" />
                    Gửi lại
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
