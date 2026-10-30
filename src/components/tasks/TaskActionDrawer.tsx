"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Loader2,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { formatVnDateTime } from "@/lib/datetime";

interface DrawerTask {
  id: string;
  code: string;
  title: string;
  status: string;
  progressPercent?: number | null;
  currentDeadline?: string;
  assignedQty?: number | null;
  completedQty?: number | null;
  quantityUnit?: string | null;
  factorSnapshot?: number | null;
  owner?: { id: string; fullName?: string };
  assignees?: Array<{ person?: { id: string; fullName?: string } }>;
}

interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileUrl: string;
  isSigned?: boolean;
  uploadedBy?: { fullName?: string };
}

interface Props {
  task: DrawerTask;
  personId?: string | null;
  canApprove: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function TaskActionDrawer({ task, personId, canApprove, onClose, onSaved }: Props) {
  const isOwner = !!personId && task.owner?.id === personId;
  const isCollaboratorOnly = !isOwner && !canApprove;
  const [status, setStatus] = useState<"IN_PROGRESS" | "COMPLETED">(
    task.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
  );
  const [progress, setProgress] = useState<number>(task.status === "COMPLETED" ? 100 : task.progressPercent ?? 0);
  const [notes, setNotes] = useState("");
  const [assignedQty, setAssignedQty] = useState(task.assignedQty?.toString() ?? "");
  const [completedQty, setCompletedQty] = useState(task.completedQty?.toString() ?? "");
  const [quantityUnit, setQuantityUnit] = useState(task.quantityUnit ?? "");
  const [factor, setFactor] = useState<number | null>(task.factorSnapshot ?? null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setAttachmentsLoading(true);
    fetch(`/api/tasks/${task.id}/attachments`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setAttachments(json?.data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAttachmentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const reloadAttachments = async () => {
    const res = await fetch(`/api/tasks/${task.id}/attachments`);
    if (res.ok) {
      const json = await res.json();
      setAttachments(json.data || []);
    }
  };

  const uploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("isSigned", "true");
      const res = await fetch(`/api/tasks/${task.id}/attachments`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Không thể tải tệp lên");
      toast.success(`Đã tải lên tệp: ${file.name}`);
      await reloadAttachments();
    } catch (err: any) {
      toast.error(err.message || "Tải tệp thất bại");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const deleteAttachment = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa tệp đính kèm này?")) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}/attachments?attachmentId=${id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Không thể xóa tệp");
      toast.success("Đã xóa tệp đính kèm");
      await reloadAttachments();
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi xóa tệp");
    }
  };

  const submit = async (finalSubmit: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (isCollaboratorOnly) {
        if (finalSubmit && notes.trim().length < 5) {
          throw new Error("Vui lòng nhập kết quả phần việc (ít nhất 5 ký tự) trước khi báo hoàn thành.");
        }
        const res = await fetch(`/api/tasks/${task.id}/participant-results`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            finalSubmit
              ? {
                  action: "SUBMIT",
                  partResultText: notes,
                  partCompletedOn: new Date().toISOString().slice(0, 10),
                  partProgressPercent: 100,
                }
              : {
                  action: "PROGRESS",
                  progressPercent: Math.round(progress / 5) * 5,
                  notes,
                },
          ),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Không thể cập nhật phần việc");
        const message = finalSubmit
          ? "Đã báo phần việc của bạn. Chủ trì sẽ tổng hợp và trình duyệt."
          : "Đã cập nhật tiến độ phần việc của bạn.";
        setSuccess(message);
        toast.success(message);
        onSaved();
        setTimeout(onClose, 900);
        return;
      }

      if (isOwner) {
        const qtyRes = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignedQty: assignedQty === "" ? null : Number(assignedQty),
            completedQty: completedQty === "" ? null : Number(completedQty),
            quantityUnit: quantityUnit.trim() || null,
            factorSnapshot: factor,
            ...(finalSubmit ? { completedDate: new Date().toISOString() } : {}),
          }),
        });
        if (!qtyRes.ok) {
          const json = await qtyRes.json().catch(() => ({}));
          throw new Error(json.error || "Không thể lưu số lượng giao/hoàn thành");
        }
      }

      const steppedProgress = finalSubmit ? 100 : Math.round(progress / 5) * 5;
      const nextStatus = finalSubmit ? "WAITING_REVIEW" : status;
      const updateRes = await fetch(`/api/tasks/${task.id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          progressPercent: steppedProgress,
          notes: notes || "Cập nhật tiến độ nghiệp vụ",
          newStatus: nextStatus,
          statusAfter: nextStatus,
        }),
      });
      if (!updateRes.ok) {
        const json = await updateRes.json().catch(() => ({}));
        throw new Error(json.error || "Không thể cập nhật tiến độ");
      }

      const message = finalSubmit
        ? "Đã nộp báo cáo kết quả và trình duyệt cấp trên thành công!"
        : "Đã cập nhật tiến độ công việc thành công!";
      setSuccess(message);
      toast.success(message);
      onSaved();
      setTimeout(onClose, 900);
    } catch (err: any) {
      const message = err.message || "Đã xảy ra lỗi trong quá trình xử lý";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-full flex-col bg-v5-surface shadow-sm sm:w-[520px]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-v5-line bg-v5-surface px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-v5-accent-soft text-v5-accent">
              <ClipboardList className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-v5-muted">
                Tác nghiệp một chạm
              </p>
              <h2 className="truncate text-sm font-semibold text-v5-ink">
                Cập nhật tiến độ &amp; kết quả
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-md p-1 text-v5-muted hover:bg-v5-bg hover:text-v5-ink"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-v5-line bg-v5-bg px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-v5-accent px-2 py-0.5 text-[11px] font-semibold text-white">
                {task.code}
              </span>
              {task.currentDeadline && (
                <span className="text-[11px] text-v5-muted">
                  Hạn xử lý: <strong className="text-v5-ink">{formatVnDateTime(task.currentDeadline)}</strong>
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[13px] font-semibold text-v5-ink">{task.title}</p>
          </div>

          <div className="flex flex-col gap-4 p-4">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-v5-danger/30 bg-v5-danger-soft px-3 py-2 text-[12px] text-v5-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 rounded-lg border border-v5-success/30 bg-v5-success-soft px-3 py-2 text-[12px] text-v5-success">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <section className="flex flex-col gap-2">
              <p className="text-[12px] font-semibold text-v5-ink">1. Trạng thái phần việc</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["IN_PROGRESS", "Đang xử lý"],
                  ["COMPLETED", "Hoàn thành"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setStatus(value);
                      if (value === "COMPLETED") setProgress(100);
                    }}
                    className={`rounded-lg border px-3 py-2 text-[12px] font-semibold ${
                      status === value
                        ? "border-v5-accent bg-v5-accent-soft text-v5-accent"
                        : "border-v5-line bg-v5-surface text-v5-muted hover:bg-v5-bg"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold text-v5-ink">2. Tỷ lệ hoàn thành</p>
                <span className="text-sm font-bold text-v5-accent">{progress}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(event) => setProgress(Number(event.target.value))}
                className="w-full accent-v5-accent"
              />
              <div className="flex justify-between text-[10px] text-v5-muted">
                <span>0% Bắt đầu</span>
                <span>50% Đang xử lý</span>
                <span>100% Hoàn tất</span>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-v5-muted">
                Số lượng giao
                <input
                  type="number"
                  min={0}
                  value={assignedQty}
                  onChange={(event) => setAssignedQty(event.target.value)}
                  placeholder="Ví dụ: 100"
                  className="h-9 rounded-lg border border-v5-line bg-v5-surface px-3 text-[12px] font-normal text-v5-ink focus:outline-none focus:ring-1 focus:ring-v5-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-v5-muted">
                Đơn vị tính
                <input
                  value={quantityUnit}
                  onChange={(event) => setQuantityUnit(event.target.value)}
                  placeholder="Tờ khai, lô, hồ sơ..."
                  className="h-9 rounded-lg border border-v5-line bg-v5-surface px-3 text-[12px] font-normal text-v5-ink focus:outline-none focus:ring-1 focus:ring-v5-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-v5-muted">
                Số lượng hoàn thành
                <input
                  type="number"
                  min={0}
                  value={completedQty}
                  onChange={(event) => setCompletedQty(event.target.value)}
                  placeholder="Để trống = bằng số giao"
                  className="h-9 rounded-lg border border-v5-line bg-v5-surface px-3 text-[12px] font-normal text-v5-ink focus:outline-none focus:ring-1 focus:ring-v5-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-v5-muted">
                Hệ số quy đổi
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={factor ?? ""}
                  onChange={(event) => setFactor(event.target.value === "" ? null : Number(event.target.value))}
                  placeholder="Theo QĐ1277"
                  className="h-9 rounded-lg border border-v5-line bg-v5-surface px-3 text-[12px] font-normal text-v5-ink focus:outline-none focus:ring-1 focus:ring-v5-accent"
                />
              </label>
            </section>

            <section className="flex flex-col gap-1.5">
              <p className="text-[12px] font-semibold text-v5-ink">3. Kết quả nghiệp vụ chi tiết</p>
              <textarea
                rows={4}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Nhập tóm tắt kết quả, hồ sơ đã xử lý, số tờ khai..."
                className="rounded-lg border border-v5-line bg-v5-surface p-2.5 text-[12px] text-v5-ink focus:outline-none focus:ring-1 focus:ring-v5-accent resize-none"
              />
            </section>

            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold text-v5-ink">
                  4. Đính kèm minh chứng / tài liệu ({attachments.length})
                </p>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1 rounded-md border border-v5-line px-2 py-1 text-[11px] font-semibold text-v5-accent hover:bg-v5-bg disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Tải tệp
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  onChange={uploadFile}
                  className="hidden"
                />
              </div>
              {attachmentsLoading ? (
                <p className="rounded-lg bg-v5-bg px-3 py-2 text-[11px] text-v5-muted">Đang tải tài liệu...</p>
              ) : attachments.length === 0 ? (
                <p className="rounded-lg border border-dashed border-v5-line bg-v5-bg px-3 py-2 text-[11px] text-v5-muted">
                  Chưa có tệp đính kèm. Tải lên biên bản, chứng từ hoặc ảnh giám định.
                </p>
              ) : (
                attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-v5-line bg-v5-bg px-2.5 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-v5-accent" />
                      <div className="min-w-0">
                        <a
                          href={att.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-[12px] font-semibold text-v5-ink hover:underline"
                          title={att.fileName}
                        >
                          {att.fileName}
                        </a>
                        <span className="text-[10px] text-v5-muted">
                          {att.fileSize > 1024 * 1024
                            ? `${(att.fileSize / (1024 * 1024)).toFixed(1)} MB`
                            : `${Math.round(att.fileSize / 1024)} KB`}
                          {att.uploadedBy?.fullName ? ` · ${att.uploadedBy.fullName}` : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <a
                        href={att.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded p-1 text-v5-muted hover:bg-v5-surface hover:text-v5-accent"
                        title="Xem tệp"
                      >
                        <Eye className="h-4 w-4" />
                      </a>
                      <a
                        href={att.fileUrl}
                        download
                        className="rounded p-1 text-v5-muted hover:bg-v5-surface hover:text-v5-accent"
                        title="Tải về"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => deleteAttachment(att.id)}
                        className="rounded p-1 text-v5-muted hover:bg-v5-surface hover:text-v5-danger"
                        title="Xóa tệp"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </section>

            <div className="flex items-start gap-2 rounded-lg border border-v5-gold/30 bg-v5-gold-soft/40 px-3 py-2 text-[11px] text-v5-muted">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-v5-gold-ink" />
              <span>
                Bấm <strong>&quot;Báo hoàn thành &amp; Trình duyệt&quot;</strong> hệ thống sẽ cập nhật Dashboard
                lãnh đạo và chuyển thông báo tới Trưởng bộ phận.
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-v5-line bg-v5-bg px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-v5-line bg-v5-surface px-4 py-2 text-[12px] text-v5-ink hover:bg-v5-bg"
          >
            Hủy bỏ
          </button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => submit(false)}
              className="rounded-lg border border-v5-line bg-v5-surface px-3 py-2 text-[12px] font-semibold text-v5-ink hover:bg-v5-bg disabled:opacity-50"
            >
              {busy ? "Đang lưu..." : isCollaboratorOnly ? "Lưu tiến độ phần việc" : "Lưu nháp"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => submit(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-v5-accent px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-v5-accent/90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Báo hoàn thành &amp; Trình duyệt
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

