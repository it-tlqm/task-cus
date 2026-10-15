"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";

interface TaskAttachmentItem {
  id: string;
  taskId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileUrl: string;
  isSigned: boolean;
  signedBy: string | null;
  createdAt: string;
  uploadedBy?: {
    id: string;
    fullName: string;
    code: string;
  };
}

interface TaskDetail {
  id: string;
  code: string;
  title: string;
  description?: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "WAITING_REVIEW" | "COMPLETED" | "CANCELED";
  priority: "Cao" | "Trung bình" | "Thấp" | "Khẩn";
  currentDeadline: string;
  originalDeadline?: string;
  expectedResultText?: string;
  actualResultText?: string;
  hasIssue: boolean;
  issueNotes?: string;
  isOverdue?: boolean;
  progressPercent?: number;
  unit?: { id: string; name: string };
  owner?: { id: string; fullName: string; position?: string };
  assignees?: Array<{ person: { id: string; fullName: string; position?: string } }>;
  planLinks?: Array<{
    planItem?: {
      title?: string;
      plan?: { title?: string };
    };
  }>;
  deadlineRequests?: Array<{
    id: string;
    requestedDeadline: string;
    reason: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    createdAt: string;
  }>;
  updates?: Array<{
    id: string;
    progressPercent: number;
    notes?: string;
    createdAt: string;
    author?: { fullName: string };
  }>;
}

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Update progress modal state
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [newProgress, setNewProgress] = useState(50);
  const [updateNotes, setUpdateNotes] = useState("");
  const [isSubmitReview, setIsSubmitReview] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Extension request modal state
  const [showExtRequestModal, setShowExtRequestModal] = useState(false);
  const [extDeadline, setExtDeadline] = useState("2026-10-16T17:00");
  const [extReason, setExtReason] = useState("");

  // Approval modal state
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");

  // Attachment state
  const [attachments, setAttachments] = useState<TaskAttachmentItem[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewFile, setPreviewFile] = useState<{
    url: string;
    name: string;
    mimeType: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = async (id: string) => {
    setAttachmentsLoading(true);
    try {
      const res = await fetch(`/api/tasks/${id}/attachments`);
      if (res.ok) {
        const json = await res.json();
        setAttachments(json.data || []);
      }
    } catch (err) {
      console.error("Lỗi lấy tệp đính kèm:", err);
    } finally {
      setAttachmentsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !task) return;

    setUploadingFile(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("isSigned", "true");

    try {
      const res = await fetch(`/api/tasks/${task.id}/attachments`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể tải tệp lên");
      toast.success(`Đã tải lên tệp: ${file.name}`);
      await fetchAttachments(task.id);
    } catch (err: any) {
      toast.error(err.message || "Tải tệp thất bại");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!task) return;
    if (!confirm("Bạn có chắc chắn muốn xóa tệp đính kèm này?")) return;

    try {
      const res = await fetch(
        `/api/tasks/${task.id}/attachments?attachmentId=${attachmentId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể xóa tệp");
      toast.success("Đã xóa tệp đính kèm");
      await fetchAttachments(task.id);
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi xóa tệp");
    }
  };

  const fetchTaskDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (res.ok) {
        const json = await res.json();
        setTask(json.data);
        if (json.data.progressPercent !== undefined) {
          setNewProgress(json.data.progressPercent);
        }
      } else {
        const json = await res.json();
        setError(json.error || "Không thể tải thông tin nhiệm vụ");
      }
    } catch (err: any) {
      setError("Lỗi kết nối máy chủ: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (taskId) {
      fetchTaskDetail();
      fetchAttachments(taskId);
    }
  }, [taskId]);

  const handleProgressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;
    setUpdating(true);

    try {
      const res = await fetch(`/api/tasks/${task.id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          progressPercent: newProgress,
          notes: updateNotes,
          actualResultText: updateNotes,
          submitForReview: isSubmitReview || newProgress === 100,
        }),
      });

      if (res.ok) {
        toast.success(
          isSubmitReview || newProgress === 100
            ? "Đã nộp báo cáo kết quả và trình lãnh đạo phê duyệt!"
            : "Đã cập nhật tiến độ công việc thành công!"
        );
        setShowUpdateModal(false);
        setUpdateNotes("");
        fetchTaskDetail();
      } else {
        const json = await res.json();
        toast.error(json.error || "Không thể cập nhật tiến độ");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleExtensionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;
    if (!extReason.trim()) {
      toast.warning("Vui lòng nhập lý do đề xuất gia hạn");
      return;
    }

    try {
      const res = await fetch(`/api/tasks/${task.id}/deadline-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedDeadline: new Date(extDeadline).toISOString(),
          reason: extReason,
        }),
      });

      if (res.ok) {
        toast.success("Đã gửi văn bản đề xuất gia hạn đến Lãnh đạo!");
        setShowExtRequestModal(false);
        setExtReason("");
        fetchTaskDetail();
      } else {
        const json = await res.json();
        toast.error(json.error || "Không thể gửi đề xuất gia hạn");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    }
  };

  const handleApproveResult = async () => {
    if (!task) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "COMPLETED",
          actualResultText: approvalNotes || "Lãnh đạo đơn vị đã nghiệm thu và phê duyệt kết quả hoàn thành.",
        }),
      });

      if (res.ok) {
        toast.success("Đã phê duyệt nghiệm thu kết quả nhiệm vụ!");
        setShowApproveModal(false);
        setApprovalNotes("");
        fetchTaskDetail();
      } else {
        const json = await res.json();
        toast.error(json.error || "Không thể phê duyệt");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    }
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return "--";
    try {
      const d = new Date(iso);
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${hours}:${minutes} ${day}/${month}/${year}`;
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-app-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-secondary border-t-transparent rounded-full animate-spin" />
          <p className="text-body-md text-on-surface-variant font-medium">Đang tải hồ sơ nhiệm vụ...</p>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="w-full min-h-screen bg-app-bg p-8 flex flex-col items-center justify-center">
        <div className="bg-surface-container-lowest p-8 rounded-xl shadow-sm border border-border-default max-w-md w-full text-center flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-[48px] text-status-danger">error</span>
          <h2 className="text-headline-md font-bold text-primary">Không thể truy cập nhiệm vụ</h2>
          <p className="text-body-md text-on-surface-variant">{error || "Nhiệm vụ không tồn tại hoặc đã bị xóa"}</p>
          <button
            onClick={() => router.push("/tasks")}
            className="px-4 py-2 rounded-lg bg-secondary text-on-secondary font-semibold text-body-md active-press"
          >
            Quay lại danh sách nhiệm vụ
          </button>
        </div>
      </div>
    );
  }

  const isCompleted = task.status === "COMPLETED";
  const isWaiting = task.status === "WAITING_REVIEW";
  const isOverdue = task.isOverdue;

  return (
    <div className="w-full min-h-screen bg-app-bg pb-16">
      <div className="flex flex-col w-full p-space-lg gap-space-lg max-w-7xl mx-auto">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm">
            <Link href="/tasks" className="hover:text-primary transition-colors flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              <span>Nhiệm vụ chỉ đạo</span>
            </Link>
            <span className="text-outline">/</span>
            <span className="text-primary font-bold">{task.code}</span>
          </div>

          <Link
            href="/tasks"
            className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-semibold text-xs transition-fast flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">list</span>
            <span>Về danh sách</span>
          </Link>
        </div>

        {/* Task Header Banner */}
        <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-border-default/50 flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded bg-primary text-on-primary font-bold text-xs uppercase tracking-wide">
                {task.code}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded font-bold text-xs ${
                  task.priority === "Khẩn"
                    ? "bg-status-danger-bg text-status-danger"
                    : task.priority === "Cao"
                    ? "bg-status-warning-bg text-status-warning"
                    : "bg-surface-container text-on-surface-variant"
                }`}
              >
                Ưu tiên: {task.priority}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded font-bold text-xs inline-flex items-center gap-1 ${
                  isCompleted
                    ? "bg-status-success-bg text-status-success"
                    : isWaiting
                    ? "bg-status-warning-bg text-status-warning"
                    : isOverdue
                    ? "bg-status-danger-bg text-status-danger"
                    : "bg-secondary-fixed text-on-secondary-fixed-variant"
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {isCompleted ? "check_circle" : isWaiting ? "schedule" : isOverdue ? "warning" : "sync"}
                </span>
                <span>
                  {isCompleted
                    ? "Đã hoàn thành"
                    : isWaiting
                    ? "Chờ lãnh đạo duyệt"
                    : isOverdue
                    ? "Chậm tiến độ"
                    : "Đang thực hiện"}
                </span>
              </span>
            </div>

            <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight font-bold">
              {task.title}
            </h1>

            <p className="font-body-md text-on-surface-variant">
              {task.description || "Nhiệm vụ trực tiếp từ Lãnh đạo Hải quan cửa khẩu Quốc tế Tà Lùng."}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-space-sm shrink-0">
            {!isCompleted && (
              <button
                onClick={() => setShowUpdateModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/90 text-on-secondary font-semibold text-sm shadow-sm active-press"
              >
                <span className="material-symbols-outlined text-[18px]">edit_calendar</span>
                <span>Báo cáo tiến độ / Nộp kết quả</span>
              </button>
            )}

            {!isCompleted && (
              <button
                onClick={() => setShowExtRequestModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-subtle hover:bg-surface-container text-primary font-semibold text-sm border border-border-default active-press"
              >
                <span className="material-symbols-outlined text-[18px] text-status-unassigned">update</span>
                <span>Xin gia hạn</span>
              </button>
            )}

            {isWaiting && (
              <button
                onClick={() => setShowApproveModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-status-success text-white font-semibold text-sm shadow-sm active-press"
              >
                <span className="material-symbols-outlined text-[18px]">verified</span>
                <span>Ký duyệt kết quả</span>
              </button>
            )}
          </div>
        </div>

        {/* Grid: 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
          {/* Left Column (2/3): Execution Details & Timeline */}
          <div className="lg:col-span-2 flex flex-col gap-space-lg">
            {/* Progress Card */}
            <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-border-default/50 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-headline-sm text-sm font-bold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-[20px]">trending_up</span>
                  Tiến Độ Giải Quyết Thực Tế
                </span>
                <span className="font-bold text-secondary text-base">{task.progressPercent ?? (isCompleted ? 100 : 0)}%</span>
              </div>
              <div className="w-full bg-surface-container h-3 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isCompleted ? "bg-status-success" : isOverdue ? "bg-status-danger" : "bg-secondary"
                  }`}
                  style={{ width: `${Math.min(100, task.progressPercent ?? (isCompleted ? 100 : 0))}%` }}
                />
              </div>

              {task.expectedResultText && (
                <div className="mt-2 p-3 rounded-lg bg-surface-subtle border border-border-default text-xs flex flex-col gap-1">
                  <span className="font-bold text-primary">Sản phẩm / Kết quả mục tiêu:</span>
                  <span className="text-on-surface">{task.expectedResultText}</span>
                </div>
              )}

              {task.actualResultText && (
                <div className="p-3 rounded-lg bg-status-success-bg/40 border border-status-success/30 text-xs flex flex-col gap-1">
                  <span className="font-bold text-status-success">Kết quả thực tế đã nghiệm thu:</span>
                  <span className="text-on-surface">{task.actualResultText}</span>
                </div>
              )}
            </div>

            {/* Timeline / Updates Card */}
            <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-border-default/50 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-border-default pb-3">
                <h3 className="font-headline-sm text-sm font-bold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">history</span>
                  Nhật Ký Tác Nghiệp &amp; Cập Nhật ({task.updates?.length || 0})
                </h3>
              </div>

              {(!task.updates || task.updates.length === 0) ? (
                <div className="py-8 text-center text-outline text-xs">
                  Chưa có lịch sử cập nhật tác nghiệp nào. Nhấn &quot;Báo cáo tiến độ&quot; để ghi nhận nhật ký.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {task.updates.map((up) => (
                    <div key={up.id} className="p-3 rounded-lg bg-surface-subtle border border-border-default/50 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-primary">{up.author?.fullName || "Cán bộ thụ lý"}</span>
                        <span className="text-outline">{formatDateTime(up.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded bg-secondary/15 text-secondary font-bold">
                          Tiến độ: {up.progressPercent}%
                        </span>
                      </div>
                      {up.notes && <p className="text-xs text-on-surface mt-1">{up.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Deadline Requests Card */}
            {task.deadlineRequests && task.deadlineRequests.length > 0 && (
              <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-border-default/50 flex flex-col gap-3">
                <h3 className="font-headline-sm text-sm font-bold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-status-unassigned text-[20px]">update</span>
                  Lịch Sử Đề Xuất Gia Hạn ({task.deadlineRequests.length})
                </h3>
                <div className="flex flex-col gap-2">
                  {task.deadlineRequests.map((req) => (
                    <div key={req.id} className="p-3 rounded-lg bg-surface-subtle border border-border-default text-xs flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-primary">
                          Đề xuất hạn mới: {formatDateTime(req.requestedDeadline)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            req.status === "APPROVED"
                              ? "bg-status-success-bg text-status-success"
                              : req.status === "REJECTED"
                              ? "bg-status-danger-bg text-status-danger"
                              : "bg-status-warning-bg text-status-warning"
                          }`}
                        >
                          {req.status === "APPROVED" ? "Đã duyệt" : req.status === "REJECTED" ? "Từ chối" : "Đang chờ duyệt"}
                        </span>
                      </div>
                      <p className="text-on-surface-variant">Lý do: {req.reason}</p>
                      <span className="text-[11px] text-outline">Gửi lúc: {formatDateTime(req.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column (1/3): Metadata & Responsible Officers */}
          <div className="flex flex-col gap-space-lg">
            {/* Meta Attributes */}
            <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-border-default/50 flex flex-col gap-4">
              <h3 className="font-headline-sm text-sm font-bold text-primary border-b border-border-default pb-2">
                Thông Tin Trách Nhiệm
              </h3>

              <div className="flex flex-col gap-3 text-xs">
                <div>
                  <span className="text-outline block mb-0.5">Đơn vị chủ trì:</span>
                  <span className="font-bold text-primary text-sm">{task.unit?.name || "Hải quan cửa khẩu Quốc tế Tà Lùng"}</span>
                </div>

                <div>
                  <span className="text-outline block mb-0.5">Cán bộ phụ trách chính:</span>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-[18px]">account_circle</span>
                    <div>
                      <span className="font-bold text-primary block">{task.owner?.fullName || "Chưa phân công"}</span>
                      <span className="text-[11px] text-outline">{task.owner?.position || "Công chức phụ trách"}</span>
                    </div>
                  </div>
                </div>

                {task.assignees && task.assignees.length > 0 && (
                  <div>
                    <span className="text-outline block mb-1">Cán bộ phối hợp:</span>
                    <div className="flex flex-col gap-1">
                      {task.assignees.map((as, i) => (
                        <div key={i} className="flex items-center gap-1.5 p-1.5 rounded bg-surface-subtle">
                          <span className="material-symbols-outlined text-[15px] text-outline">person</span>
                          <span className="font-semibold text-primary">{as.person.fullName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-border-default">
                  <span className="text-outline block mb-0.5">Hạn giải quyết hiện tại:</span>
                  <span className={`font-bold text-sm ${isOverdue ? "text-status-danger" : "text-primary"}`}>
                    {formatDateTime(task.currentDeadline)}
                  </span>
                </div>

                {task.originalDeadline && task.originalDeadline !== task.currentDeadline && (
                  <div>
                    <span className="text-outline block mb-0.5">Hạn định ban đầu:</span>
                    <span className="text-outline">{formatDateTime(task.originalDeadline)}</span>
                  </div>
                )}

                {task.planLinks && task.planLinks.length > 0 && (
                  <div className="pt-2 border-t border-border-default">
                    <span className="text-outline block mb-0.5">Thuộc kế hoạch công tác:</span>
                    <span className="font-semibold text-secondary">
                      {task.planLinks[0].planItem?.plan?.title || "Kế hoạch tuần Chi cục"}
                    </span>
                    {task.planLinks[0].planItem?.title && (
                      <span className="text-[11px] text-outline block mt-0.5">
                        Mục tiêu: {task.planLinks[0].planItem.title}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Attachments Card */}
            <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-border-default/50 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-border-default pb-2">
                <h3 className="font-headline-sm text-sm font-bold text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px] text-secondary">attach_file</span>
                  <span>Hồ Sơ &amp; Tệp Đính Kèm ({attachments.length})</span>
                </h3>
                {uploadingFile && (
                  <span className="text-secondary font-label-sm text-[11px] flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
                    Đang tải lên...
                  </span>
                )}
              </div>

              {/* Danh sách file */}
              <div className="flex flex-col gap-2">
                {attachmentsLoading ? (
                  <div className="p-3 rounded-lg bg-surface-subtle text-center text-xs text-outline flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                    Đang tải...
                  </div>
                ) : attachments.length === 0 ? (
                  <div className="p-3 rounded-lg bg-surface-subtle border border-dashed border-border-default text-center">
                    <p className="text-xs text-outline">Chưa có tệp đính kèm nào trong nhiệm vụ này.</p>
                  </div>
                ) : (
                  attachments.map((att) => {
                    const isPdf = att.mimeType.includes("pdf") || att.fileName.endsWith(".pdf");
                    const isSheet =
                      att.mimeType.includes("sheet") ||
                      att.mimeType.includes("excel") ||
                      att.fileName.endsWith(".xlsx") ||
                      att.fileName.endsWith(".xls");
                    const isImage = att.mimeType.includes("image");
                    const sizeFormatted =
                      att.fileSize > 1024 * 1024
                        ? `${(att.fileSize / (1024 * 1024)).toFixed(1)} MB`
                        : `${Math.round(att.fileSize / 1024)} KB`;

                    return (
                      <div
                        key={att.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-surface-subtle border border-border-default text-xs hover:border-secondary/40 transition-fast"
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                          <span
                            className={`material-symbols-outlined text-[20px] shrink-0 ${
                              isPdf
                                ? "text-status-danger"
                                : isSheet
                                ? "text-status-success"
                                : isImage
                                ? "text-secondary"
                                : "text-outline"
                            }`}
                          >
                            {isPdf
                              ? "picture_as_pdf"
                              : isSheet
                              ? "table_view"
                              : isImage
                              ? "image"
                              : "description"}
                          </span>
                          <div className="flex flex-col min-w-0">
                            <a
                              href={att.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-bold text-primary truncate hover:underline hover:text-secondary"
                              title={att.fileName}
                            >
                              {att.fileName}
                            </a>
                            <span className="text-[11px] text-outline">
                              {sizeFormatted} · {att.uploadedBy?.fullName || "Cán bộ"}
                              {att.isSigned ? " · Đã xác thực" : ""}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {(isPdf || isImage) && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewFile({
                                  url: att.fileUrl,
                                  name: att.fileName,
                                  mimeType: att.mimeType,
                                })
                              }
                              className="p-1 text-outline hover:text-secondary rounded"
                              title="Xem nhanh tệp"
                            >
                              <span className="material-symbols-outlined text-[16px]">visibility</span>
                            </button>
                          )}
                          <a
                            href={att.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            download
                            className="p-1 text-outline hover:text-secondary rounded"
                            title="Tải về máy"
                          >
                            <span className="material-symbols-outlined text-[16px]">download</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(att.id)}
                            className="p-1 text-outline hover:text-status-danger rounded"
                            title="Xóa tệp"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Input chọn file ẩn */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                className="w-full py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-secondary font-semibold text-xs flex items-center justify-center gap-1.5 transition-fast active-press border border-border-subtle disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[16px] ${uploadingFile ? "animate-spin" : ""}`}>
                  {uploadingFile ? "progress_activity" : "upload_file"}
                </span>
                <span>{uploadingFile ? "Đang tải lên..." : "Tải lên tệp đính kèm mới"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL CẬP NHẬT TIẾN ĐỘ */}
      {showUpdateModal && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-default transition-panel">
            <div className="p-space-md bg-secondary text-on-secondary flex items-center justify-between">
              <h3 className="font-headline-sm font-semibold">Cập Nhật Tiến Độ Thực Hiện</h3>
              <button onClick={() => setShowUpdateModal(false)}>
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleProgressSubmit} className="p-space-md flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs font-semibold text-primary">
                  <span>Tỷ lệ hoàn thành:</span>
                  <span className="text-secondary font-bold text-sm">{newProgress}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={newProgress}
                  onChange={(e) => setNewProgress(Number(e.target.value))}
                  className="w-full accent-secondary cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-primary">Nội dung báo cáo / Nhật ký công tác</label>
                <textarea
                  rows={3}
                  required
                  value={updateNotes}
                  onChange={(e) => setUpdateNotes(e.target.value)}
                  placeholder="Ghi nhận kết quả xử lý, văn bản đính kèm, thông tin đối chiếu..."
                  className="w-full p-2.5 rounded bg-surface-container-low text-xs border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-primary font-medium">
                <input
                  type="checkbox"
                  checked={isSubmitReview || newProgress === 100}
                  onChange={(e) => setIsSubmitReview(e.target.checked)}
                  className="rounded text-secondary"
                />
                <span>Trình Lãnh đạo đơn vị ký phê duyệt kết quả hoàn thành</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-default">
                <button
                  type="button"
                  onClick={() => setShowUpdateModal(false)}
                  className="px-3 py-1.5 rounded bg-surface-container text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="px-4 py-1.5 rounded bg-secondary text-on-secondary text-xs font-semibold active-press disabled:opacity-50"
                >
                  {updating ? "Đang lưu..." : "Xác nhận cập nhật"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XIN GIA HẠN */}
      {showExtRequestModal && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-default transition-panel">
            <div className="p-space-md bg-status-unassigned text-white flex items-center justify-between">
              <h3 className="font-headline-sm font-semibold">Đề Xuất Gia Hạn Nhiệm Vụ</h3>
              <button onClick={() => setShowExtRequestModal(false)}>
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleExtensionSubmit} className="p-space-md flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-primary">Thời hạn mong muốn gia hạn đến *</label>
                <input
                  type="datetime-local"
                  required
                  value={extDeadline}
                  onChange={(e) => setExtDeadline(e.target.value)}
                  className="h-9 px-2.5 rounded bg-surface-container-low text-xs border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-primary">Lý do xin lùi thời hạn *</label>
                <textarea
                  rows={3}
                  required
                  value={extReason}
                  onChange={(e) => setExtReason(e.target.value)}
                  placeholder="Ví dụ: Đang chờ chứng từ giám định bổ sung từ đối tác..."
                  className="w-full p-2.5 rounded bg-surface-container-low text-xs border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-default">
                <button
                  type="button"
                  onClick={() => setShowExtRequestModal(false)}
                  className="px-3 py-1.5 rounded bg-surface-container text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-status-unassigned text-white text-xs font-semibold active-press"
                >
                  Gửi đề xuất
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DUYỆT NGHIỆM THU */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-default transition-panel">
            <div className="p-space-md bg-status-success text-white flex items-center justify-between">
              <h3 className="font-headline-sm font-semibold">Phê Duyệt Nghiệm Thu Hoàn Thành</h3>
              <button onClick={() => setShowApproveModal(false)}>
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="p-space-md flex flex-col gap-3">
              <p className="text-xs text-on-surface">
                Xác nhận phê duyệt hoàn thành nhiệm vụ <strong>{task.code}</strong>. Kết quả sẽ được ghi vào sổ điện tử và báo cáo chỉ huy.
              </p>
              <textarea
                rows={3}
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Ý kiến phê duyệt: Đạt yêu cầu, đồng ý lưu hồ sơ..."
                className="w-full p-2.5 rounded bg-surface-container-low text-xs border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
              />
            </div>
            <div className="p-space-md bg-surface-subtle flex items-center justify-end gap-2 border-t border-border-default">
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                className="px-3 py-1.5 rounded bg-surface-container text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleApproveResult}
                className="px-4 py-1.5 rounded bg-status-success text-white text-xs font-semibold active-press"
              >
                Ký số phê duyệt
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
