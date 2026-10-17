"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import { CollaboratorPicker } from "@/components/tasks/CollaboratorPicker";

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
  timeline?: Array<{
    id: string;
    at: string;
    actor: string;
    kind: string;
    title: string;
    detail: string | null;
    progress: number | null;
    statusFrom: string | null;
    statusTo: string | null;
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

  // YC-03: chỉnh sửa nội dung chỉ đạo (mở lại form với dữ liệu PostgreSQL)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState("Cao");
  const [editDeadline, setEditDeadline] = useState("");
  const [editExpectedResult, setEditExpectedResult] = useState("");
  const [editOwnerId, setEditOwnerId] = useState("");
  const [editCollabs, setEditCollabs] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [people, setPeople] = useState<Array<{ id: string; fullName: string }>>([]);

  // Đợt trao đổi: bình luận phẳng + đính file (không thread/sửa)
  const [comments, setComments] = useState<Array<{
    id: string; content: string; createdAt: string; updatedAt?: string;
    author: { id: string; fullName: string };
    attachments: Array<{ id: string; fileName: string; fileUrl: string; fileSize: number }>;
    reactions?: Array<{ emoji: string; personId: string }>;
  }>>([]);
  const [commentText, setCommentText] = useState("");
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [sendingComment, setSendingComment] = useState(false);
  // @mention: gợi ý toàn bộ cán bộ (dùng danh sách nhân sự đã nạp), ưu tiên người trong việc
  const commentBoxRef = React.useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const mentionables = React.useMemo(() => {
    const inTask = new Set<string>();
    if (task?.owner) inTask.add(task.owner.id);
    for (const a of task?.assignees || []) inTask.add((a as any).person.id);
    const base = (people.length > 0 ? people : [
      ...(task?.owner ? [{ id: task.owner.id, fullName: task.owner.fullName }] : []),
      ...((task?.assignees || []).map((a: any) => ({ id: a.person.id, fullName: a.person.fullName }))),
    ]).filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);
    // Người trong việc lên trước
    return [...base].sort((a, b) => Number(inTask.has(b.id)) - Number(inTask.has(a.id)));
  }, [people, task]);
  const mentionMatches =
    mentionQuery === null
      ? []
      : mentionables.filter((p) => p.fullName.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5);

  const handleCommentChange = (value: string, cursor?: number | null) => {
    setCommentText(value);
    const pos = cursor ?? value.length;
    const before = value.slice(0, pos);
    const m = before.match(/@([^\n@]{1,30})$/);
    if (!m) {
      setMentionQuery(null);
      return;
    }
    const q = m[1];
    // Gõ xong đủ tên (khớp chính xác + có dấu cách/kết thúc) thì đóng gợi ý
    const done = mentionables.some((p) => q.trim().toLowerCase() === p.fullName.toLowerCase());
    setMentionQuery(done || !q.trim() ? null : q);
  };

  const insertMention = (name: string) => {
    const el = commentBoxRef.current;
    const pos = el?.selectionStart ?? commentText.length;
    const before = commentText.slice(0, pos);
    const m = before.match(/@([^\n@]{1,30})$/);
    const cutFrom = m ? pos - m[0].length : pos;
    const next = `${commentText.slice(0, cutFrom)}@${name} ${commentText.slice(pos)}`;
    setCommentText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      if (el) {
        const at = cutFrom + name.length + 2;
        el.focus();
        el.setSelectionRange(at, at);
      }
    });
  };

  // Sửa tin của mình + reaction
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [reactingId, setReactingId] = useState<string | null>(null);
  const REACT_EMOJI = ["👍", "❤️", "✅"];

  const handleSaveEditComment = async (cid: string) => {
    if (!task || !editCommentText.trim()) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId: cid, content: editCommentText.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Không thể sửa");
      setEditingCommentId(null);
      toast.success("Đã sửa bình luận.");
      fetchComments(task.id);
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi sửa");
    }
  };

  const handleReact = async (cid: string, emoji: string) => {
    if (!task || reactingId) return;
    setReactingId(cid + emoji);
    // Cập nhật lạc quan
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== cid || !permUser) return c;
        const mine = (c.reactions || []).some((r: any) => r.emoji === emoji && r.personId === permUser.personId);
        return {
          ...c,
          reactions: mine
            ? (c.reactions || []).filter((r: any) => !(r.emoji === emoji && r.personId === permUser.personId))
            : [...(c.reactions || []), { emoji, personId: permUser.personId }],
        };
      })
    );
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId: cid, emoji }),
      });
      if (!res.ok) throw new Error("Không thả được cảm xúc");
      fetchComments(task.id);
    } catch {
      fetchComments(task!.id);
    } finally {
      setReactingId(null);
    }
  };

  // Tô đậm @tên người trong việc khi hiển thị
  const renderContent = (text: string) => {
    const names = mentionables.map((p) => p.fullName).filter(Boolean).sort((a, b) => b.length - a.length);
    if (names.length === 0) return text;
    const pattern = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
    const parts = text.split(pattern);
    return parts.map((part, i) =>
      part.startsWith("@") && names.some((n) => part === `@${n}`) ? (
        <strong key={i} className="text-secondary">{part}</strong>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  const fetchComments = async (tid: string) => {
    try {
      const res = await fetch(`/api/tasks/${tid}/comments`);
      if (res.ok) {
        const json = await res.json();
        setComments(json.data || []);
      }
    } catch {}
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || sendingComment || !commentText.trim()) return;
    setSendingComment(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Không thể gửi bình luận");
      const cid: string = json.data.id;
      // Đính file theo bình luận (nếu có)
      for (const f of commentFiles.slice(0, 3)) {
        try {
          const fd = new FormData();
          fd.append("file", f);
          fd.append("isSigned", "false");
          fd.append("commentId", cid);
          await fetch(`/api/tasks/${task.id}/attachments`, { method: "POST", body: fd });
        } catch {}
      }
      setCommentText("");
      setCommentFiles([]);
      setMentionQuery(null);
      toast.success("Đã gửi trao đổi!");
      fetchComments(task.id);
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi gửi");
    } finally {
      setSendingComment(false);
    }
  };

  const handleDeleteComment = async (cid: string) => {
    if (!task || !confirm("Xóa bình luận này?")) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments?commentId=${cid}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Không thể xóa");
      toast.success("Đã xóa bình luận.");
      fetchComments(task.id);
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi xóa");
    }
  };
  // YC-08: lãnh đạo loại nhiệm vụ trùng (xóa mềm, có xác nhận + lý do)
  const [showCancelDupModal, setShowCancelDupModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);

  const { canApprove, user: permUser } = usePermissions();
  const isLockedTask = task?.status === "COMPLETED" || (task?.status as string) === "DONE" || task?.status === "CANCELED";

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
      fetchComments(taskId);
    }
    // YC-01/YC-03: danh sách nhân sự thật cho chọn chủ trì/phối hợp khi sửa
    fetch("/api/people?pageSize=100")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const list = Array.isArray(json) ? json : json?.data || [];
        setPeople(list.map((p: any) => ({ id: p.id, fullName: p.fullName })));
      })
      .catch(() => {});
  }, [taskId]);

  // YC-03: mở form sửa với đúng dữ liệu đang lưu trong PostgreSQL
  const openEditModal = () => {
    if (!task) return;
    setEditTitle(task.title || "");
    setEditDescription(task.description || "");
    setEditPriority(task.priority || "Cao");
    try {
      const d = new Date(task.currentDeadline);
      const p = (n: number) => String(n).padStart(2, "0");
      setEditDeadline(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`);
    } catch {
      setEditDeadline("");
    }
    setEditExpectedResult(task.expectedResultText || "");
    setEditOwnerId(task.owner?.id || "");
    setEditCollabs((task.assignees || []).map((a) => a.person.id));
    setShowEditModal(true);
  };

  // YC-03: lưu thay đổi vào đúng bản ghi (không tạo Task mới), có lưu vết audit ở backend
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || editSaving || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription,
          priority: editPriority,
          currentDeadline: editDeadline ? new Date(editDeadline).toISOString() : undefined,
          expectedResultText: editExpectedResult,
          ownerId: editOwnerId || undefined,
          assigneeIds: editCollabs,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Đã lưu chỉnh sửa chỉ đạo (ghi nhận lịch sử thay đổi)");
        setShowEditModal(false);
        fetchTaskDetail();
      } else {
        toast.error(json.error || "Không thể lưu chỉnh sửa");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setEditSaving(false);
    }
  };

  // YC-08: lãnh đạo xác nhận loại trùng — đúng mã, đúng bản ghi, có lý do
  const handleCancelDuplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || cancelSaving || !cancelReason.trim()) return;
    setCancelSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL_DUPLICATE", cancelReason: cancelReason.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(json.message || "Đã loại nhiệm vụ trùng khỏi danh sách");
        setShowCancelDupModal(false);
        setCancelReason("");
        fetchTaskDetail();
      } else {
        toast.error(json.error || "Không thể xử lý nhiệm vụ trùng");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setCancelSaving(false);
    }
  };

  // Đợt A: người được giao xác nhận đã nhận việc
  const [accepting, setAccepting] = useState(false);
  const isMyTask =
    !!task && !!permUser &&
    (task.owner?.id === permUser.personId ||
      (task.assignees || []).some((a: any) => (a.person?.id || a.personId) === permUser.personId));
  const handleAcceptTask = async () => {
    if (!task || accepting) return;
    setAccepting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, action: "ACCEPT_TASK" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(json.message || "Đã xác nhận nhận việc!");
        fetchTaskDetail();
      } else {
        toast.error(json.error || "Không thể nhận việc");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setAccepting(false);
    }
  };

  const handleProgressSubmit = async (e: React.FormEvent) => {    e.preventDefault();
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
            {/* Đợt A: nhận việc khi chưa bắt đầu (chủ trì/phối hợp) */}
            {task?.status === "NOT_STARTED" && isMyTask && (
              <button
                onClick={handleAcceptTask}
                disabled={accepting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary hover:opacity-95 text-on-secondary font-semibold text-sm shadow-sm active-press disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">handshake</span>
                <span>{accepting ? "Đang xác nhận..." : "Nhận việc"}</span>
              </button>
            )}
            {/* YC-03: chỉnh sửa nội dung chỉ đạo (khóa khi đã nghiệm thu/kết thúc) */}
            {!isLockedTask && (
              <button
                onClick={openEditModal}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-container text-primary font-semibold text-sm border border-border-default active-press"
              >
                <span className="material-symbols-outlined text-[18px]">edit_note</span>
                <span>Chỉnh sửa chỉ đạo</span>
              </button>
            )}
            {/* YC-08: lãnh đạo loại nhiệm vụ trùng */}
            {!isLockedTask && canApprove && (
              <button
                onClick={() => setShowCancelDupModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-status-danger/10 hover:bg-status-danger/20 text-status-danger font-semibold text-sm border border-status-danger/30 active-press"
              >
                <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
                <span>Xóa nhiệm vụ trùng</span>
              </button>
            )}
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

            {/* Timeline / Updates Card — nhật ký hợp nhất từ lúc giao việc */}
            <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-border-default/50 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-border-default pb-3">
                <h3 className="font-headline-sm text-sm font-bold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">history</span>
                  Nhật Ký Tác Nghiệp &amp; Cập Nhật ({task.timeline?.length || task.updates?.length || 0})
                </h3>
              </div>

              {(!task.timeline || task.timeline.length === 0) && (!task.updates || task.updates.length === 0) ? (
                <div className="py-8 text-center text-outline text-xs">
                  Chưa có lịch sử tác nghiệp nào. Nhấn &quot;Báo cáo tiến độ&quot; để ghi nhận nhật ký.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {(task.timeline && task.timeline.length > 0
                    ? task.timeline
                    : (task.updates || []).map((up: any) => ({
                        id: up.id, at: up.createdAt, actor: up.author?.fullName || "Cán bộ thụ lý",
                        kind: "progress", title: "Cập nhật tiến độ", detail: up.notes || null,
                        progress: up.progressPercent, statusFrom: null, statusTo: null,
                      }))
                  ).map((ev: any) => {
                    const kindStyle: Record<string, { icon: string; cls: string }> = {
                      create: { icon: "add_task", cls: "bg-primary/10 text-primary" },
                      accept: { icon: "handshake", cls: "bg-status-success-bg text-status-success" },
                      progress: { icon: "trending_up", cls: "bg-secondary/15 text-secondary" },
                      submit: { icon: "rate_review", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
                      approve: { icon: "verified", cls: "bg-status-success-bg text-status-success" },
                      return: { icon: "undo", cls: "bg-status-danger-bg text-status-danger" },
                      extend: { icon: "update", cls: "bg-status-unassigned-bg text-status-unassigned" },
                      file: { icon: "attach_file", cls: "bg-surface-container text-on-surface-variant" },
                      edit: { icon: "edit_note", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
                      cancel: { icon: "delete_sweep", cls: "bg-status-danger-bg text-status-danger" },
                      link: { icon: "link", cls: "bg-surface-container text-on-surface-variant" },
                    };
                    const statusVi: Record<string, string> = {
                      NOT_STARTED: "Chưa thực hiện",
                      IN_PROGRESS: "Đang thực hiện",
                      WAITING_REVIEW: "Chờ duyệt",
                      COMPLETED: "Hoàn thành",
                      DONE: "Hoàn thành",
                      CANCELED: "Đã hủy",
                    };
                    const ks = kindStyle[ev.kind] || kindStyle.progress;
                    return (
                      <div key={ev.id} className="flex gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${ks.cls}`}>
                          <span className="material-symbols-outlined text-[16px]">{ks.icon}</span>
                        </div>
                        <div className="p-3 rounded-lg bg-surface-subtle border border-border-default/50 flex flex-col gap-1 flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-primary truncate">
                              {ev.actor} <span className="font-normal text-on-surface-variant">· {ev.title}</span>
                            </span>
                            <span className="text-outline shrink-0">{formatDateTime(ev.at)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs flex-wrap">
                            {typeof ev.progress === "number" && (
                              <span className="px-2 py-0.5 rounded bg-secondary/15 text-secondary font-bold">
                                Tiến độ: {ev.progress}%
                              </span>
                            )}
                            {ev.statusTo && (
                              <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-semibold">
                                {ev.statusFrom && ev.statusFrom !== ev.statusTo
                                  ? `${statusVi[ev.statusFrom] || ev.statusFrom} → ${statusVi[ev.statusTo] || ev.statusTo}`
                                  : statusVi[ev.statusTo] || ev.statusTo}
                              </span>
                            )}
                          </div>
                          {ev.detail && <p className="text-xs text-on-surface mt-0.5 whitespace-pre-line">{ev.detail}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Trao đổi trong nhiệm vụ (bình luận phẳng + đính file) */}
      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-border-default/50 flex flex-col gap-3">
        <h3 className="font-headline-sm text-sm font-bold text-primary flex items-center gap-2 border-b border-border-default pb-3">
          <span className="material-symbols-outlined text-primary text-[20px]">forum</span>
          Trao Đổi ({comments.length})
        </h3>
        {comments.length === 0 ? (
          <p className="text-xs text-outline text-center py-4">
            Chưa có trao đổi nào. Hỏi đáp, nhắc phối hợp ngay tại đây để giữ vết.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {comments.map((c) => {
              const isMine = !!permUser && c.author?.id === permUser.personId;
              const isEdited = c.updatedAt && new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime() > 1000;
              const counts = new Map<string, number>();
              for (const r of c.reactions || []) counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1);
              return (
              <div key={c.id} className="flex gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                  {(c.author?.fullName || "?").trim().split(" ").slice(-1)[0]?.slice(0, 2).toUpperCase()}
                </div>
                <div className="p-3 rounded-lg bg-surface-subtle border border-border-default/50 flex flex-col gap-1 flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-primary truncate">
                      {c.author?.fullName || "Cán bộ"}
                      {isEdited && <span className="font-normal text-outline"> · đã sửa</span>}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <span className="text-outline">{formatDateTime(c.createdAt)}</span>
                      {isMine && editingCommentId !== c.id && (
                        <button
                          onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.content); }}
                          title="Sửa bình luận của mình"
                          className="p-0.5 rounded text-outline hover:text-primary"
                        >
                          <span className="material-symbols-outlined text-[15px]">edit</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteComment(c.id)}
                        title="Xóa bình luận (tác giả hoặc lãnh đạo)"
                        className="p-0.5 rounded text-outline hover:text-status-danger"
                      >
                        <span className="material-symbols-outlined text-[15px]">delete</span>
                      </button>
                    </span>
                  </div>
                  {editingCommentId === c.id ? (
                    <div className="flex flex-col gap-1.5">
                      <textarea
                        rows={2}
                        value={editCommentText}
                        onChange={(e) => setEditCommentText(e.target.value)}
                        className="w-full p-2 rounded bg-surface-container-lowest text-xs border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleSaveEditComment(c.id)}
                          className="px-3 py-1 rounded bg-secondary text-on-secondary text-xs font-bold"
                        >
                          Lưu
                        </button>
                        <button
                          onClick={() => setEditingCommentId(null)}
                          className="px-3 py-1 rounded bg-surface-container text-xs font-semibold"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-on-surface whitespace-pre-line">{renderContent(c.content)}</p>
                  )}
                  {c.attachments.length > 0 && (
                    <div className="flex flex-col gap-1 mt-1">
                      {c.attachments.map((f) => (
                        <a
                          key={f.id}
                          href={f.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-secondary hover:underline flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[14px]">attach_file</span>
                          <span className="truncate">{f.fileName}</span>
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-0.5">
                    {REACT_EMOJI.map((e) => {
                      const n = counts.get(e) || 0;
                      const mine = (c.reactions || []).some((r) => r.emoji === e && permUser && r.personId === permUser.personId);
                      return (
                        <button
                          key={e}
                          onClick={() => handleReact(c.id, e)}
                          title="Thả cảm xúc (bấm lại để gỡ)"
                          className={`px-1.5 py-0.5 rounded-full text-[13px] leading-none border transition-fast active-press ${
                            mine ? "bg-secondary/20 border-secondary" : "bg-surface-container-lowest border-border-subtle hover:border-secondary/50"
                          }`}
                        >
                          {e}{n > 0 && <span className="text-[11px] font-bold ml-0.5">{n}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
        <form onSubmit={handleSendComment} className="flex flex-col gap-2 pt-1 border-t border-border-default">
          <div className="relative">
            <textarea
              ref={commentBoxRef}
              rows={2}
              value={commentText}
              onChange={(e) => handleCommentChange(e.target.value, e.target.selectionStart)}
              onClick={(e) => handleCommentChange(commentText, (e.target as HTMLTextAreaElement).selectionStart)}
              onKeyUp={(e) => handleCommentChange(commentText, (e.target as HTMLTextAreaElement).selectionStart)}
              placeholder="Nhập trao đổi, câu hỏi, nhắc việc... (gõ @ để nhắc tên)"
              className="w-full p-2.5 rounded bg-surface-container-low text-xs border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
            />
            {mentionMatches.length > 0 && (
              <div className="absolute left-0 right-0 bottom-full mb-1 bg-surface-container-lowest border border-border-default rounded-lg shadow-xl overflow-hidden z-10 max-h-44 overflow-y-auto">
                {mentionMatches.map((p) => {
                  const inTask =
                    task?.owner?.id === p.id ||
                    (task?.assignees || []).some((a: any) => a.person.id === p.id);
                  return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => insertMention(p.fullName)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-surface-container flex items-center gap-2"
                  >
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">
                      {p.fullName.trim().split(" ").slice(-1)[0]?.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="font-semibold truncate">{p.fullName}</span>
                    {inTask && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 font-bold shrink-0">
                        trong việc
                      </span>
                    )}
                  </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-primary font-semibold cursor-pointer">
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              <span>{commentFiles.length > 0 ? `${commentFiles.length} tệp` : "Đính file"}</span>
              <input
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  const valid = files.filter((f) => {
                    if (f.size > 10 * 1024 * 1024) {
                      toast.error(`Tệp ${f.name} quá 10MB — bỏ qua`);
                      return false;
                    }
                    return true;
                  }).slice(0, 3);
                  setCommentFiles(valid);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="text-[11px] text-outline">Tối đa 3 tệp, mỗi tệp ≤ 10MB</span>
            <button
              type="submit"
              disabled={sendingComment}
              className="px-4 py-1.5 rounded bg-secondary text-on-secondary text-xs font-bold active-press disabled:opacity-50"
            >
              {sendingComment ? "Đang gửi..." : "Gửi"}
            </button>
          </div>
        </form>
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
              <p className="text-[11px] text-outline">
                Kéo thanh theo mức 5%. Tick ô trên (hoặc chọn 100%) thì việc chuyển sang Chờ duyệt — lãnh đạo duyệt mới xong hẳn.
              </p>

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
                  placeholder="Nhập lý do xin lùi thời hạn, ví dụ chứng từ chờ bổ sung..."
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
                Ký duyệt hoàn thành
              </button>
            </div>
          </div>
        </div>
      )}

      {/* YC-03: MODAL CHỈNH SỬA NỘI DUNG CHỈ ĐẠO — lưu trên đúng bản ghi */}
      {showEditModal && task && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-lg bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-default transition-panel">
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <h3 className="font-headline-sm font-semibold">Chỉnh sửa chỉ đạo [{task.code}]</h3>
              <button onClick={() => setShowEditModal(false)}>
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="p-space-md flex flex-col gap-space-md max-h-[70vh] overflow-y-auto">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-primary">Tên / Nội dung chỉ đạo *</label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Nhập nội dung công việc chỉ đạo..."
                    className="h-10 px-3 rounded bg-surface-container-low text-sm border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-space-sm">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-primary">Cán bộ chủ trì</label>
                    <select
                      value={editOwnerId}
                      onChange={(e) => setEditOwnerId(e.target.value)}
                      className="h-10 px-2 rounded bg-surface-container-low text-sm border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    >
                      {task.owner && <option value={task.owner.id}>{task.owner.fullName}</option>}
                      {people.filter((p) => p.id !== task.owner?.id).map((p) => (
                        <option key={p.id} value={p.id}>{p.fullName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-primary">Mức độ ưu tiên</label>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value)}
                      className="h-10 px-2 rounded bg-surface-container-low text-sm border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    >
                      <option value="Khẩn">Khẩn cấp</option>
                      <option value="Cao">Cao</option>
                      <option value="Trung bình">Trung bình</option>
                      <option value="Thấp">Thấp</option>
                    </select>
                  </div>
                </div>
                <CollaboratorPicker
                  people={people}
                  value={editCollabs}
                  onChange={setEditCollabs}
                  excludeId={editOwnerId}
                  disabled={editSaving}
                />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-primary">Hạn hoàn thành</label>
                  <input
                    type="datetime-local"
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                    className="h-10 px-3 rounded bg-surface-container-low text-sm border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-primary">Nguồn gốc / Chỉ đạo từ đâu</label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Nhập nguồn gốc chỉ đạo..."
                    className="h-10 px-3 rounded bg-surface-container-low text-sm border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-primary">Sản phẩm / Kết quả yêu cầu</label>
                  <textarea
                    rows={2}
                    value={editExpectedResult}
                    onChange={(e) => setEditExpectedResult(e.target.value)}
                    placeholder="Nhập sản phẩm, kết quả yêu cầu..."
                    className="p-2.5 rounded bg-surface-container-low text-sm border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
                  />
                </div>
              </div>
              <div className="p-space-md bg-surface-subtle flex items-center justify-end gap-2 border-t border-border-default">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded bg-surface-container-lowest text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="px-4 py-2 rounded bg-secondary text-on-secondary text-xs font-semibold active-press disabled:opacity-50"
                >
                  {editSaving ? "Đang lưu..." : "Lưu chỉnh sửa"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* YC-08: MODAL XÁC NHẬN LOẠI NHIỆM VỤ TRÙNG — xóa mềm, giữ vết */}
      {showCancelDupModal && task && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-default transition-panel">
            <div className="p-space-md bg-status-danger text-white flex items-center justify-between">
              <h3 className="font-headline-sm font-semibold">Xóa nhiệm vụ trùng</h3>
              <button onClick={() => setShowCancelDupModal(false)}>
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleCancelDuplicate} className="p-space-md flex flex-col gap-3">
              <p className="text-xs text-on-surface">
                Sẽ loại khỏi danh sách thực hiện (không tính KPI, giữ lịch sử và liên kết để đối soát):
              </p>
              <div className="p-3 rounded-lg bg-surface-subtle border border-border-default text-xs flex flex-col gap-1">
                <span className="font-mono font-bold text-primary">{task.code}</span>
                <span className="font-semibold">{task.title}</span>
              </div>
              <label className="text-xs font-semibold text-primary">Lý do loại trùng * (ghi rõ mã nhiệm vụ được giữ lại)</label>
              <textarea
                rows={3}
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Nhập lý do, ví dụ: trùng với NV-2026-0007 đã giao trước đó, giữ lại NV-2026-0007..."
                className="w-full p-2.5 rounded bg-surface-container-low text-xs border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
              />
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-default">
                <button
                  type="button"
                  onClick={() => setShowCancelDupModal(false)}
                  className="px-3 py-1.5 rounded bg-surface-container text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={cancelSaving}
                  className="px-4 py-1.5 rounded bg-status-danger text-white text-xs font-semibold active-press disabled:opacity-50"
                >
                  {cancelSaving ? "Đang xử lý..." : "Xác nhận loại trùng"}
                </button>
              </div>
            </form>
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
