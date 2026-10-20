"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
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

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string, fileName: string) {
  const name = fileName.toLowerCase();
  if (mimeType.includes("pdf") || name.endsWith(".pdf")) {
    return { icon: "picture_as_pdf", color: "text-rose-600 bg-rose-50 border-rose-200" };
  }
  if (
    mimeType.includes("spreadsheet") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".csv")
  ) {
    return { icon: "table_view", color: "text-emerald-600 bg-emerald-50 border-emerald-200" };
  }
  if (
    mimeType.startsWith("image/") ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp")
  ) {
    return { icon: "image", color: "text-blue-600 bg-blue-50 border-blue-200" };
  }
  return { icon: "description", color: "text-slate-600 bg-slate-50 border-slate-200" };
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

  // Tải danh sách hồ sơ thực tế từ PostgreSQL
  const fetchLiveApprovals = useCallback(async () => {
    try {
      // Chỉ lấy ĐÚNG hai nguồn cần duyệt (trước đây kéo 50 việc đầu về lọc —
      // hồ sơ chờ duyệt nằm ngoài 50 việc đó sẽ vô hình)
      const [tasksRes, delayRes, plansRes] = await Promise.all([
        fetch("/api/tasks?status=WAITING_REVIEW&pageSize=100"),
        fetch("/api/tasks?deadlinePending=1&pageSize=100"),
        fetch("/api/plans"),
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
    <div className="w-full min-h-screen bg-app-bg pb-20">
      {/* Header Mobile / Desktop */}
      <div className="max-w-2xl mx-auto px-margin pt-4 flex flex-col gap-4">
        {/* Banner Vận hành Lãnh đạo */}
        <div className="px-space-sm py-space-xs rounded bg-surface-container text-on-surface-variant flex items-center justify-between shadow-sm border border-border-default/60">
          <div className="flex items-center gap-space-xs min-w-0">
            <span className="material-symbols-outlined text-[16px] text-primary shrink-0">
              verified
            </span>
            <span className="font-label-sm text-[11px] truncate uppercase tracking-wider font-semibold">
              TRUNG TÂM PHÊ DUYỆT & NGHIỆM THU — TRỰC BAN LÃNH ĐẠO
            </span>
          </div>
          <span className="px-1.5 py-0.5 rounded bg-surface-subtle text-primary font-label-sm text-[11px] shrink-0 font-bold">
            HQ Tà Lùng
          </span>
        </div>

        {/* Operational Overview Metric Bento */}
        <div className="grid grid-cols-2 gap-space-sm">
          <div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-sm border border-border-default/50 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Chờ xử lý</span>
              <span className="w-2.5 h-2.5 rounded-full bg-status-danger" />
            </div>
            <div className="my-space-xs flex items-baseline gap-space-xs">
              <span className="font-headline-xl text-headline-xl text-primary font-bold">
                {String(approvals.length).padStart(2, "0")}
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">hồ sơ</span>
            </div>
            <div className="flex items-center gap-1 font-label-sm text-label-sm text-status-danger font-semibold">
              <span className="material-symbols-outlined text-[14px]">priority_high</span>
              <span>{approvals.filter((a) => a.urgent).length} yêu cầu khẩn</span>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-sm border border-border-default/50 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Trạng thái hệ thống</span>
              <span className="material-symbols-outlined text-[18px] text-secondary">cloud_done</span>
            </div>
            <div className="my-space-xs flex items-baseline gap-space-xs">
              <span className="font-headline-xl text-headline-xl text-secondary font-bold">100%</span>
            </div>
            <div className="font-label-sm text-label-sm text-on-surface-variant truncate text-xs">
              Đồng bộ CSDL thực tế
            </div>
          </div>
        </div>

        {/* Filter Segmented Tabs */}
        <div data-tour="filter-tabs" className="w-full bg-surface-container-high p-1 rounded-lg flex items-center justify-between shadow-inner text-center overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab("all")}
            className={`flex-1 py-1.5 px-2 rounded font-label-md text-label-md transition-fast ${
              activeTab === "all"
                ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                : "text-on-surface-variant hover:text-primary"
            }`}
          >
            Tất cả ({approvals.length})
          </button>
          <button
            onClick={() => setActiveTab("plan")}
            className={`flex-1 py-1.5 px-2 rounded font-label-md text-label-md transition-fast ${
              activeTab === "plan"
                ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                : "text-on-surface-variant hover:text-primary"
            }`}
          >
            Kế hoạch ({approvals.filter((a) => a.type === "plan").length})
          </button>
          <button
            onClick={() => setActiveTab("result")}
            className={`flex-1 py-1.5 px-2 rounded font-label-md text-label-md transition-fast ${
              activeTab === "result"
                ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                : "text-on-surface-variant hover:text-primary"
            }`}
          >
            Kết quả ({approvals.filter((a) => a.type === "result").length})
          </button>
          <button
            onClick={() => setActiveTab("delay")}
            className={`flex-1 py-1.5 px-2 rounded font-label-md text-label-md transition-fast ${
              activeTab === "delay"
                ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                : "text-on-surface-variant hover:text-primary"
            }`}
          >
            Lùi hạn ({approvals.filter((a) => a.type === "delay").length})
          </button>
        </div>

        {/* Cards List */}
        <div data-tour="approval-list" className="flex flex-col gap-space-md">
          {loading ? (
            <div className="p-12 text-center text-outline bg-surface-container-lowest rounded-xl animate-pulse">
              Đang nạp danh sách hồ sơ trình ký và nghiệm thu từ cơ sở dữ liệu...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="bg-surface-container-lowest p-8 rounded-2xl border border-border-default/50 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-status-success-bg text-status-success flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px]">task_alt</span>
              </div>
              <p className="font-headline-sm text-primary font-bold">Không có hồ sơ chờ phê duyệt</p>
              <p className="font-body-md text-on-surface-variant max-w-sm text-sm">
                Tất cả các kế hoạch tuần, đề xuất gia hạn và báo cáo kết quả nhiệm vụ đã được xử lý hoàn tất.
              </p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isItemBusy = processingId === item.id;

              return (
                <div
                  key={`${item.id}-${item.reqId || "main"}`}
                  className="bg-surface-container-lowest rounded-xl shadow-sm p-space-md relative overflow-hidden transition-fast border border-border-default/50 hover-lift"
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
                          <span className="material-symbols-outlined text-[13px]">alarm</span>
                          Khẩn cấp
                        </span>
                      )}
                      <span className="font-label-sm text-label-sm text-on-surface-variant font-mono font-bold">
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
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      {item.timeAgo}
                    </span>
                  </div>

                  {/* Title & Assignee */}
                  <h2 className="font-headline-sm text-headline-sm text-primary mb-space-xs font-bold leading-snug">
                    {item.title}
                  </h2>
                  <div className="flex items-center gap-space-xs mb-space-sm bg-surface-subtle p-space-xs rounded-lg">
                    <div className="w-7 h-7 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-label-sm text-label-sm font-semibold">
                      {item.submitter.charAt(0) || "C"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-body-semibold text-body-semibold text-primary truncate leading-tight text-xs">
                        {item.submitter}
                      </p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant truncate text-[11px]">
                        {item.unit}
                      </p>
                    </div>
                  </div>

                  {/* Detail Box */}
                  <div className="bg-surface-container-low rounded-lg p-space-sm mb-space-sm space-y-space-xs text-xs">
                    {item.reason && (
                      <div className="text-on-surface font-body-md text-body-md">
                        <span className="text-on-surface-variant font-label-sm text-label-sm block font-semibold">
                          Lý do / Báo cáo nội dung:
                        </span>
                        {item.reason}
                      </div>
                    )}

                    {item.documentTitle && (
                      <div className="p-2 rounded bg-surface-container-lowest flex items-center gap-2 text-primary font-semibold">
                        <span className="material-symbols-outlined text-secondary text-[18px]">
                          description
                        </span>
                        <span className="truncate">{item.documentTitle}</span>
                      </div>
                    )}

                    {item.oldDeadline && item.newDeadline && (
                      <div className="pt-space-xs flex items-center justify-between font-label-md text-label-md bg-surface-container-lowest p-space-xs rounded">
                        <div className="text-on-surface-variant line-through font-mono">
                          {item.oldDeadline}
                        </div>
                        <span className="material-symbols-outlined text-status-warning text-[18px]">
                          arrow_forward
                        </span>
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
                    <div className="bg-surface-subtle border border-border-default/60 rounded-lg p-space-sm mb-space-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-label-sm text-[11px] font-bold text-primary flex items-center gap-1 uppercase tracking-wider">
                          <span className="material-symbols-outlined text-[15px] text-secondary">attach_file</span>
                          Hồ sơ & Tài liệu nghiệm thu ({item.attachments.length})
                        </span>
                        <span className="text-[10px] text-on-surface-variant font-medium">Bấm xem trực tiếp hoặc tải về</span>
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
                              className="flex items-center justify-between gap-2 p-2 bg-surface-container-lowest rounded-md border border-border-default/50 hover:border-secondary/50 transition-fast"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className={`p-1.5 rounded border text-[16px] shrink-0 ${fileStyle.color} flex items-center justify-center`}>
                                  <span className="material-symbols-outlined text-[18px]">{fileStyle.icon}</span>
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="font-body-semibold text-xs text-primary truncate" title={att.fileName}>
                                    {att.fileName}
                                  </p>
                                  <p className="text-[10px] text-on-surface-variant">
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
                                    <span className="material-symbols-outlined text-[14px]">visibility</span>
                                    <span>Xem</span>
                                  </button>
                                )}
                                <a
                                  href={att.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={att.fileName}
                                  className="px-2 py-1 rounded bg-surface-container text-primary hover:bg-surface-container-high text-[11px] font-semibold transition-fast flex items-center gap-1 border border-border-subtle"
                                  title="Tải về máy tính"
                                >
                                  <span className="material-symbols-outlined text-[14px]">download</span>
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
                    <div className="px-3 py-2 rounded-lg bg-surface-subtle/80 border border-dashed border-border-default text-[11px] text-on-surface-variant mb-space-sm flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[15px] text-outline">info</span>
                      <span>Chưa có tệp đính kèm nào được tải lên cho nhiệm vụ này.</span>
                    </div>
                  )}

                  {/* Action Buttons — YC-37: mọi quyết định đều qua bước XEM TRƯỚC */}
                  <div className="grid grid-cols-2 gap-space-xs">
                    <button
                      type="button"
                      disabled={isItemBusy}
                      onClick={() => openPreview(item, "CLARIFY")}
                      className={`h-11 px-space-xs rounded-lg bg-surface-subtle text-primary font-body-semibold text-body-semibold transition-fast flex items-center justify-center gap-1 text-xs border border-border-default/50 ${
                        isItemBusy ? "opacity-50 cursor-not-allowed" : "hover:bg-surface-container active-press"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">undo</span>
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
                          <span className="material-symbols-outlined text-[18px] animate-spin">
                            progress_activity
                          </span>
                          <span>Đang xử lý...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[18px]">check_circle</span>
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
            className="bg-surface-container-lowest rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-border-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 border-b border-border-default flex items-center justify-between bg-surface-subtle">
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <span className="material-symbols-outlined text-secondary text-[22px]">
                  {previewFile.mimeType.includes("pdf") || previewFile.name.toLowerCase().endsWith(".pdf")
                    ? "picture_as_pdf"
                    : "image"}
                </span>
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
                  <span className="material-symbols-outlined text-[15px]">download</span>
                  <span>Tải về</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-primary transition-fast"
                  aria-label="Đóng xem trước"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>
            <div className="p-3 md:p-6 flex-1 overflow-auto flex items-center justify-center bg-black/5 min-h-[350px]">
              {previewFile.mimeType.includes("pdf") || previewFile.name.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  src={previewFile.url}
                  title={previewFile.name}
                  className="w-full h-[75vh] rounded-lg border border-border-subtle shadow-sm bg-white"
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
      <section className="max-w-2xl mx-auto px-margin pt-4">
        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-border-default/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border-default flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[20px]">
                inbox
              </span>
              <div>
                <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
                  Hồ sơ của tôi
                </h3>
                <p className="text-[11px] text-on-surface-variant">
                  Theo dõi hồ sơ đã trình, lý do bị trả lại và gửi giải trình lại.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchMyCases}
              className="text-[11px] font-semibold text-secondary inline-flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[15px]">refresh</span>
              Làm mới
            </button>
          </div>

          {myCasesLoading ? (
            <div className="p-4 text-[11px] text-on-surface-variant">Đang tải hồ sơ...</div>
          ) : myCases.length === 0 ? (
            <div className="p-4 text-[11px] text-on-surface-variant">
              Chưa có hồ sơ nào được trình duyệt.
            </div>
          ) : (
            <ul className="divide-y divide-border-default">
              {myCases.map((mc) => (
                <li key={mc.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] font-semibold text-primary min-w-0">
                      <span className="font-mono text-[11px] text-on-surface-variant">
                        [{mc.code ?? ""}]
                      </span>{" "}
                      {mc.title}
                    </p>
                    <span className="shrink-0 text-[10px] px-2 py-0.5 rounded border border-border-default bg-surface-container text-on-surface-variant font-semibold whitespace-nowrap">
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
                    <p className="text-[11px] text-on-surface-variant">
                      Lý do: {mc.latestDecision.reason}
                    </p>
                  )}
                  {mc.latestDecision?.content &&
                    mc.status !== "CLARIFY_REQUESTED" && (
                      <p className="text-[11px] text-on-surface-variant">
                        Nội dung: {mc.latestDecision.content}
                      </p>
                    )}
                  {mc.status === "CLARIFY_REQUESTED" && (
                    <button
                      type="button"
                      onClick={() => {
                        setRespondCase({
                          caseType: mc.caseType as ApprovalCaseType,
                          resourceId: mc.resourceId,
                          title: mc.title,
                        });
                        setRespondContent("");
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-[11px] font-semibold"
                    >
                      <span className="material-symbols-outlined text-[15px]">reply</span>
                      Gửi giải trình
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Modal YC-37 — bước XEM TRƯỚC bắt buộc trước khi quyết định */}
      <ApprovalPreviewModal
        open={previewOpen}
        caseType={previewCaseType}
        resourceId={previewResourceId}
        initialAction={previewAction}
        onClose={() => setPreviewOpen(false)}
        onDecided={() => {
          fetchLiveApprovals();
          fetchMyCases();
        }}
      />

      {/* Modal gửi giải trình lại */}
      {respondCase && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-border-default flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-surface-container pb-3">
              <h3 className="font-headline-sm text-primary font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-status-warning text-[24px]">
                  reply
                </span>
                Gửi nội dung giải trình
              </h3>
              <button
                type="button"
                onClick={() => setRespondCase(null)}
                className="text-on-surface-variant hover:text-on-surface text-sm"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-on-surface-variant">
              Hồ sơ: <strong className="text-on-surface">{respondCase.title}</strong>
            </p>
            <textarea
              rows={5}
              value={respondContent}
              onChange={(e) => setRespondContent(e.target.value)}
              placeholder="Bổ sung nội dung giải trình để hồ sơ được xem trước lại..."
              className="w-full p-3 rounded-lg border border-border-default bg-surface-container-lowest text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-container">
              <button
                type="button"
                onClick={() => setRespondCase(null)}
                disabled={responding}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-on-surface-variant hover:bg-surface-container"
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
                    <span className="material-symbols-outlined text-[16px] animate-spin">
                      progress_activity
                    </span>
                    Đang gửi...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">send</span>
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
