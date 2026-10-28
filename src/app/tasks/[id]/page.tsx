"use client";

import { V5Icon } from "@/components/v5/ui/icon";

import React, { useState, useEffect, useRef } from "react";
import { isSelfInitiated, originLabel } from "@/lib/task-origin";
import TxSourceBadge from "@/components/work/TxSourceBadge";
import { formatVnDateTime, utcIsoToVnInputValue, vnLocalToUtcIso } from "@/lib/datetime";
import { useParams, useRouter } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
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
  // YC-38: nguon danh muc TX + nguon phat sinh
  txSource?: {
    code: string;
    title?: string | null;
    department?: string | null;
    groupCode?: string | null;
    convertFactor?: number | null;
  } | null;
  originKind?: string | null;
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
  approval?: {
    caseId: string;
    caseStatus: string;
    round: number;
    action: "AGREE" | "REJECT" | "CLARIFY" | "RESPOND" | null;
    actionLabel: string | null;
    reason: string | null;
    content: string | null;
    decidedById: string | null;
    decidedByName: string | null;
    decidedAt: string | null;
    quality?: {
      visible: boolean;
      enabled: boolean;
      original: number | null;
      effective: number | null;
      adjusted: boolean;
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
    } | null;
  } | null;
  qualityEnabled?: boolean;
  precheck?: {
    enabled: boolean;
    taskStatus?: string;
    canSubmitOverall?: boolean;
    viewerCanPrecheckAny?: boolean;
    route?: {
      status: string;
      ready: boolean;
      allPrechecked: boolean;
      legacyOnly: boolean;
      ownerUnitId?: string;
      finalCandidates?: Array<{
        personId: string;
        fullName: string;
        role?: string | null;
        unitName?: string | null;
      }>;
      participants?: Array<{
        personId: string;
        fullName: string;
        role: string;
        partStatus: string;
        precheckStatus: string;
        precheckNote?: string | null;
        precheckedBy?: { personId: string; fullName: string } | null;
        precheckedAt?: string | null;
        eligiblePrecheckers: Array<{ personId: string; fullName: string }>;
        canPrecheck: boolean;
        routeStatus: string;
        blockers: Array<{ code: string; personName: string; message: string }>;
      }>;
      blockers?: Array<{ code: string; personName: string; message: string }>;
    } | null;
    latestSnapshot?: {
      round: number;
      routeStatus: string;
      createdAt: string;
      routeJson?: any;
    } | null;
  };
  participantResults?: Array<{
    id: string;
    personId: string;
    role: "OWNER" | "COLLABORATOR" | string;
    partStatus: string;
    partResultText?: string | null;
    partCompletedOn?: string | null;
    partProgressPercent?: number | null;
    decisionNote?: string | null;
    round?: number;
    person?: { id: string; fullName: string; code?: string };
    submittedBy?: { id: string; fullName: string } | null;
    decidedBy?: { id: string; fullName: string } | null;
  }>;
}

interface TaskHistoryEntry {
  id: string;
  at: string;
  source: "TASK_UPDATE" | "APPROVAL_DECISION" | "PARTICIPANT_EVENT";
  sourceLabel: string;
  kind: string;
  title: string;
  detail: string | null;
  actorName: string;
  actorPersonId: string | null;
  subjectPersonName: string | null;
  progressPercent: number | null;
  statusFrom: string | null;
  statusTo: string | null;
  round: number | null;
  action: string | null;
  actionLabel: string | null;
  qualityPercent: number | null;
}

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // E12-A: lịch sử hợp nhất (TaskUpdate + ApprovalDecision + participant events)
  const [historyEntries, setHistoryEntries] = useState<TaskHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historySource, setHistorySource] = useState<"ALL" | TaskHistoryEntry["source"]>("ALL");
  const [historyView, setHistoryView] = useState<"timeline" | "unified">("timeline");

  // Update progress modal state
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [newProgress, setNewProgress] = useState(50);
  const [updateNotes, setUpdateNotes] = useState("");
  // YC-38 B4: KHONG dung state rieng cho "trinh duyet" — suy ra tu newProgress === 100
  // (truoc day checked={isSubmitReview || newProgress === 100} => hien da tick nhung state chua dong bo)
  const [updating, setUpdating] = useState(false);

  // Extension request modal state
  const [showExtRequestModal, setShowExtRequestModal] = useState(false);
  const [extDeadline, setExtDeadline] = useState("2026-10-16T17:00");
  const [extReason, setExtReason] = useState("");

  // Approval modal state
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [approvalQualityPercent, setApprovalQualityPercent] = useState("");

  // YC-10: điều chỉnh chất lượng sau nghiệm thu
  const [qualityAdjustValue, setQualityAdjustValue] = useState("");
  const [qualityAdjustReason, setQualityAdjustReason] = useState("");
  const [qualityAdjustBusy, setQualityAdjustBusy] = useState(false);
  const [qualityAdjustNotes, setQualityAdjustNotes] = useState<Record<string, string>>({});

  // YC-11: báo phần việc của chính mình + pre-check
  const [ownPartOpen, setOwnPartOpen] = useState(false);
  const [ownPartText, setOwnPartText] = useState("");
  const [ownPartBusy, setOwnPartBusy] = useState(false);
  const [precheckBusy, setPrecheckBusy] = useState<string | null>(null);

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
      const res = await fetch(`/api/tasks/${taskId}`, { cache: "no-store" });
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

  const submitQualityAdjustment = async () => {
    if (!qualityAdjustValue) {
      toast.error("Vui lòng chọn mức chất lượng điều chỉnh.");
      return;
    }
    if (!qualityAdjustReason.trim()) {
      toast.error("Vui lòng nêu lý do điều chỉnh chất lượng.");
      return;
    }
    setQualityAdjustBusy(true);
    try {
      const res = await fetch(`/api/approvals/TASK_RESULT/${taskId}/quality-adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newQualityPercent: Number(qualityAdjustValue),
          reason: qualityAdjustReason.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error || "Không gửi được yêu cầu điều chỉnh chất lượng.");
        return;
      }
      toast.success("Đã gửi yêu cầu điều chỉnh chất lượng.");
      setQualityAdjustValue("");
      setQualityAdjustReason("");
      await fetchTaskDetail();
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi gửi yêu cầu điều chỉnh.");
    } finally {
      setQualityAdjustBusy(false);
    }
  };

  const decideQualityAdjustment = async (id: string, action: "APPROVE" | "REJECT") => {
    setQualityAdjustBusy(true);
    try {
      const res = await fetch(`/api/approvals/quality-adjustments/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: qualityAdjustNotes[id]?.trim() || null }),
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
      setQualityAdjustNotes((prev) => ({ ...prev, [id]: "" }));
      await fetchTaskDetail();
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi quyết định điều chỉnh.");
    } finally {
      setQualityAdjustBusy(false);
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
    // YC-38 UAT fix: nạp giờ Việt Nam vào ô datetime-local (không theo múi giờ thiết bị)
    setEditDeadline(utcIsoToVnInputValue(task.currentDeadline));
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
          currentDeadline: editDeadline ? vnLocalToUtcIso(editDeadline) : undefined,
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
  const isTaskOwner = !!task && !!permUser && task.owner?.id === permUser.personId;
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

  const handleProgressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;
    setUpdating(true);

    try {
      const isCollaboratorOnly = !isTaskOwner && !canApprove;
      if (isCollaboratorOnly) {
        if (newProgress === 100 && updateNotes.trim().length < 5) {
          toast.error("Vui lòng nhập kết quả phần việc (ít nhất 5 ký tự) trước khi báo hoàn thành.");
          return;
        }
        const body =
          newProgress === 100
            ? {
                action: "SUBMIT",
                partResultText: updateNotes,
                partCompletedOn: new Date().toISOString().slice(0, 10),
                partProgressPercent: 100,
              }
            : { action: "PROGRESS", progressPercent: newProgress, notes: updateNotes };
        const res = await fetch(`/api/tasks/${task.id}/participant-results`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          toast.success(
            newProgress === 100
              ? "Đã báo phần việc của bạn. Chủ trì sẽ tổng hợp và trình lãnh đạo."
              : "Đã cập nhật tiến độ phần việc của bạn."
          );
          setShowUpdateModal(false);
          setUpdateNotes("");
          fetchTaskDetail();
        } else {
          toast.error(json.error || "Không thể cập nhật phần việc");
        }
        return;
      }

      // YC-11: chủ trì chỉ nộp chung khi tuyến pre-check đã đủ.
      if (
        newProgress === 100 &&
        isTaskOwner &&
        task.precheck?.enabled &&
        task.precheck.route &&
        !task.precheck.route.legacyOnly &&
        !task.precheck.canSubmitOverall
      ) {
        const missing = (task.precheck.route.blockers || [])
          .map((b) => b.message)
          .filter((v, i, arr) => v && arr.indexOf(v) === i)
          .slice(0, 2);
        toast.error(
          "Chưa thể nộp kết quả chung: còn phần việc chưa được kiểm tra sơ bộ." +
            (missing.length ? " " + missing.join(" ") : "")
        );
        return;
      }

      const res = await fetch(`/api/tasks/${task.id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          progressPercent: newProgress,
          notes: updateNotes,
          actualResultText: isTaskOwner || canApprove ? updateNotes : undefined,
          // YC-38 B4: 100% => tu dong trinh duyet; <100% => chi cap nhat nhat ky
          submitForReview: newProgress === 100,
        }),
      });

      if (res.ok) {
        toast.success(
          newProgress === 100
            ? "Đã nộp kết quả và trình Lãnh đạo phê duyệt!"
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

  const handleParticipantDecision = async (
    personId: string,
    action: "ACCEPT" | "RETURN"
  ) => {
    if (!task) return;
    let note: string | null = null;
    if (action === "RETURN") {
      note = window.prompt("Lý do trả lại phần việc (bắt buộc):") || "";
      if (note.trim().length < 3) {
        toast.error("Vui lòng ghi rõ lý do trả lại.");
        return;
      }
    }
    try {
      const res = await fetch(
        `/api/tasks/${task.id}/participant-results/${personId}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, note }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(action === "ACCEPT" ? "Đã chấp nhận phần việc." : "Đã trả lại phần việc.");
        fetchTaskDetail();
      } else {
        toast.error(json.error || "Không thể xử lý phần việc");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    }
  };

  // YC-11: người thực hiện báo phần việc của chính mình (kể cả chủ trì)
  const handleOwnPartSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || ownPartBusy) return;
    if (ownPartText.trim().length < 5) {
      toast.error("Vui lòng nhập kết quả phần việc (ít nhất 5 ký tự).");
      return;
    }
    setOwnPartBusy(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/participant-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SUBMIT",
          partResultText: ownPartText.trim(),
          partCompletedOn: new Date().toISOString().slice(0, 10),
          partProgressPercent: 100,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Đã báo phần việc của bạn — chờ kiểm tra sơ bộ.");
        setOwnPartOpen(false);
        setOwnPartText("");
        fetchTaskDetail();
      } else {
        toast.error(json.error || "Không thể báo phần việc");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setOwnPartBusy(false);
    }
  };

  // YC-11: pre-check PASS/RETURN (một người pre-check là đủ)
  const handlePrecheck = async (personId: string, action: "PASS" | "RETURN") => {
    if (!task || precheckBusy) return;
    let note: string | null = null;
    if (action === "RETURN") {
      note = window.prompt("Lý do trả lại ở bước kiểm tra sơ bộ (bắt buộc):") || "";
      if (note.trim().length < 3) {
        toast.error("Vui lòng ghi rõ lý do trả lại.");
        return;
      }
    }
    setPrecheckBusy(personId);
    try {
      const res = await fetch(
        `/api/tasks/${task.id}/participant-results/${personId}/precheck`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, note }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(
          action === "PASS"
            ? "Đã kiểm tra sơ bộ đạt — chờ chủ trì nộp kết quả chung."
            : "Đã trả lại phần việc ở bước kiểm tra sơ bộ."
        );
        fetchTaskDetail();
      } else {
        toast.error(json.error || "Không thể kiểm tra sơ bộ");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setPrecheckBusy(null);
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
          requestedDeadline: vnLocalToUtcIso(extDeadline),
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

  const fetchTaskHistory = async (source: "ALL" | TaskHistoryEntry["source"] = "ALL") => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams();
      if (source !== "ALL") params.set("source", source);
      params.set("limit", "200");
      const res = await fetch(`/api/tasks/${taskId}/history?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setHistoryError(json?.error || "Không tải được lịch sử hợp nhất.");
        return;
      }
      setHistoryEntries(json?.data?.entries || []);
    } catch (err: any) {
      setHistoryError("Lỗi kết nối máy chủ: " + err.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openUnifiedHistory = (source: "ALL" | TaskHistoryEntry["source"] = historySource) => {
    setHistoryView("unified");
    setHistorySource(source);
    void fetchTaskHistory(source);
  };

  const handleApproveResult = async () => {
    if (!task) return;
    if (task.qualityEnabled && !approvalQualityPercent) {
      toast.error("Vui lòng chọn mức chất lượng kết quả (65–100, bước 5) khi đồng ý nghiệm thu.");
      return;
    }
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "COMPLETED",
          actualResultText: approvalNotes || "Lãnh đạo đơn vị đã nghiệm thu và phê duyệt kết quả hoàn thành.",
          qualityPercent: approvalQualityPercent ? Number(approvalQualityPercent) : null,
        }),
      });

      if (res.ok) {
        toast.success("Đã phê duyệt nghiệm thu kết quả nhiệm vụ!");
        setShowApproveModal(false);
        setApprovalNotes("");
        setApprovalQualityPercent("");
        fetchTaskDetail();
      } else {
        const json = await res.json();
        toast.error(json.error || "Không thể phê duyệt");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    }
  };

  // YC-38 UAT fix: hiển thị thời hạn theo giờ Việt Nam, KHÔNG phụ thuộc múi giờ thiết bị
  const formatDateTime = (iso?: string) => (iso ? formatVnDateTime(iso) : "--");

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-transparent flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-secondary border-t-transparent rounded-full animate-spin" />
          <p className="text-body-md text-v5-muted font-medium">Đang tải hồ sơ nhiệm vụ...</p>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="w-full min-h-screen bg-transparent p-8 flex flex-col items-center justify-center">
        <div className="bg-v5-surface p-8 rounded-xl shadow-sm border border-v5-line max-w-md w-full text-center flex flex-col items-center gap-4">
          <V5Icon name="error" className="text-[48px] text-status-danger" />
          <h2 className="text-headline-md font-bold text-primary">Không thể truy cập nhiệm vụ</h2>
          <p className="text-body-md text-v5-muted">{error || "Nhiệm vụ không tồn tại hoặc đã bị xóa"}</p>
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
  const isReturned =
    task.status === "IN_PROGRESS" &&
    (task.approval?.action === "REJECT" || task.approval?.action === "CLARIFY");
  const isOverdue = task.isOverdue;
  // YC-11: chỉ người thuộc tuyến final đã chốt mới thấy nút ký duyệt.
  const snapshotFinalCandidates: string[] =
    task.precheck?.latestSnapshot?.routeJson?.final?.candidates?.map(
      (c: any) => c.personId
    ) ?? [];
  const snapshotExcludedPrecheckers: string[] =
    task.precheck?.latestSnapshot?.routeJson?.final?.excludedPrecheckerIds ?? [];
  const canFinalByRoute =
    !task.precheck?.latestSnapshot ||
    (!!permUser?.personId &&
      snapshotFinalCandidates.includes(permUser.personId) &&
      !snapshotExcludedPrecheckers.includes(permUser.personId));

  return (
    <div className="w-full min-h-screen bg-transparent pb-28">
      <div className="flex flex-col w-full p-space-lg gap-space-lg max-w-7xl mx-auto">
        {/* Nút quay lại nổi bật + mã nhiệm vụ */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <BackButton href="/tasks" label="Danh sách nhiệm vụ" />
          <span className="font-label-sm text-label-sm text-v5-muted">
            Mã nhiệm vụ: <span className="text-primary font-bold">{task.code}</span>
          </span>
        </div>

        {/* Task Header Banner */}
        <div className="bg-v5-surface p-space-lg rounded-xl shadow-sm border border-v5-line/50 flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
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
                    : "bg-v5-bg text-v5-muted"
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
                <V5Icon
                  name={isCompleted ? "check_circle" : isWaiting ? "schedule" : isOverdue ? "warning" : "sync"}
                  className="text-[14px]"
                />
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
              {isReturned && (
                <span
                  data-testid="task-returned-badge"
                  className="px-2.5 py-0.5 rounded font-bold text-xs inline-flex items-center gap-1 bg-status-danger-bg text-status-danger"
                >
                  <V5Icon name="undo" className="text-[14px]" />
                  <span>Bị trả lại</span>
                </span>
              )}
              {isReturned && (
                <span
                  data-testid="task-returned-progress-kept"
                  className="px-2.5 py-0.5 rounded font-semibold text-[11px] inline-flex items-center gap-1 bg-v5-bg text-v5-muted"
                  title="E8-A: trả lại không reset tiến độ/kết quả đã báo"
                >
                  <V5Icon name="lock_clock" className="text-[13px]" />
                  <span>Giữ nguyên tiến độ</span>
                </span>
              )}
            </div>

            <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight font-bold">
              {task.title}
            </h1>

            <p className="font-body-md text-v5-muted">
              {task.description || "Nhiệm vụ trực tiếp từ Lãnh đạo Hải quan cửa khẩu Quốc tế Tà Lùng."}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-space-sm shrink-0">
            {/* Đợt A: nhận việc khi chưa bắt đầu (chủ trì/phối hợp) */}
            {task?.status === "NOT_STARTED" && isMyTask && !isSelfInitiated(task?.originKind) && (
              <button
                onClick={handleAcceptTask}
                disabled={accepting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary hover:opacity-95 text-on-secondary font-semibold text-sm shadow-sm active-press disabled:opacity-50"
              >
                <V5Icon name="handshake" className="text-[18px]" />
                <span>{accepting ? "Đang xác nhận..." : "Nhận việc"}</span>
              </button>
            )}
            {/* YC-03: chỉnh sửa nội dung chỉ đạo (khóa khi đã nghiệm thu/kết thúc) */}
            {!isLockedTask && (
              <button
                onClick={openEditModal}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-v5-bg hover:bg-v5-bg text-primary font-semibold text-sm border border-v5-line active-press"
              >
                <V5Icon name="edit_note" className="text-[18px]" />
                <span>Chỉnh sửa chỉ đạo</span>
              </button>
            )}
            {/* YC-08: lãnh đạo loại nhiệm vụ trùng */}
            {!isLockedTask && canApprove && (
              <button
                onClick={() => setShowCancelDupModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-status-danger/10 hover:bg-status-danger/20 text-status-danger font-semibold text-sm border border-status-danger/30 active-press"
              >
                <V5Icon name="delete_sweep" className="text-[18px]" />
                <span>Xóa nhiệm vụ trùng</span>
              </button>
            )}
            {!isCompleted && !isWaiting && (
              <button
                onClick={() => {
                  // YC-38 B4: reset trạng thái modal mỗi lần mở (không giữ checkbox/tiến độ cũ)
                  setNewProgress(task?.progressPercent ?? 0);
                  setUpdateNotes("");
                  setShowUpdateModal(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/90 text-on-secondary font-semibold text-sm shadow-sm active-press"
              >
                <V5Icon name="edit_calendar" className="text-[18px]" />
                <span>{isTaskOwner || canApprove ? "Báo cáo tiến độ / Nộp kết quả" : "Báo phần việc của tôi"}</span>
              </button>
            )}

            {!isCompleted && !isWaiting && (
              <button
                onClick={() => setShowExtRequestModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-v5-bg hover:bg-v5-bg text-primary font-semibold text-sm border border-v5-line active-press"
              >
                <V5Icon name="update" className="text-[18px] text-status-unassigned" />
                <span>Xin gia hạn</span>
              </button>
            )}

            {isWaiting && canApprove && canFinalByRoute && task.owner?.id !== permUser?.personId && (
              <button
                onClick={() => setShowApproveModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-status-success text-white font-semibold text-sm shadow-sm active-press"
              >
                <V5Icon name="verified" className="text-[18px]" />
                <span>Ký duyệt kết quả</span>
              </button>
            )}
          </div>
        </div>

        {/* Điều hướng nhanh trong hồ sơ */}
        <nav
          aria-label="Điều hướng nhanh trong hồ sơ"
          className="sticky top-14 z-10 flex gap-1 overflow-x-auto rounded-lg border border-v5-line bg-v5-surface/95 p-1 backdrop-blur"
        >
          {[
            { id: "task-progress", label: "Tiến độ" },
            { id: "task-participants", label: "Phần việc" },
            { id: "task-timeline", label: "Nhật ký" },
            { id: "task-comments", label: "Trao đổi" },
            { id: "task-attachments", label: "Tệp đính kèm" },
          ]
            .filter((item) => item.id !== "task-participants" || (task.participantResults?.length || 0) > 0)
            .map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="shrink-0 rounded px-3 py-1.5 text-[11px] font-semibold text-v5-muted transition-colors hover:bg-v5-bg hover:text-v5-ink"
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Grid: 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
          {/* Left Column (2/3): Execution Details & Timeline */}
          <div className="lg:col-span-2 flex flex-col gap-space-lg">
            {/* Progress Card */}
            <div
              id="task-progress"
              className="scroll-mt-28 bg-v5-surface p-space-md rounded-xl shadow-sm border border-v5-line/50 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-headline-sm text-sm font-bold text-primary flex items-center gap-2">
                  <V5Icon name="trending_up" className="text-secondary text-[20px]" />
                  Tiến Độ Giải Quyết Thực Tế
                </span>
                <span className="font-bold text-secondary text-base">{task.progressPercent ?? (isCompleted ? 100 : 0)}%</span>
              </div>
              <div className="w-full bg-v5-bg h-3 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isCompleted ? "bg-status-success" : isOverdue ? "bg-status-danger" : "bg-secondary"
                  }`}
                  style={{ width: `${Math.min(100, task.progressPercent ?? (isCompleted ? 100 : 0))}%` }}
                />
              </div>

              {task.expectedResultText && (
                <div className="mt-2 p-3 rounded-lg bg-v5-bg border border-v5-line text-xs flex flex-col gap-1">
                  <span className="font-bold text-primary">Sản phẩm / Kết quả mục tiêu:</span>
                  <span className="text-v5-ink">{task.expectedResultText}</span>
                </div>
              )}

              {task.actualResultText && (
                <div className="p-3 rounded-lg bg-status-success-bg/40 border border-status-success/30 text-xs flex flex-col gap-1">
                  <span className="font-bold text-status-success">Kết quả thực tế đã nghiệm thu:</span>
                  <span className="text-v5-ink">{task.actualResultText}</span>
                </div>
              )}

              {/* YC-08: quyết định duyệt gần nhất — người, thời gian, lý do */}
              {task.approval && (task.approval.action || task.approval.caseStatus !== "OPEN") && (
                <div
                  data-testid="task-approval-summary"
                  className={`p-3 rounded-lg border text-xs flex flex-col gap-1 ${
                    isReturned
                      ? "bg-status-danger-bg/40 border-status-danger/30"
                      : task.approval.caseStatus === "AGREED"
                        ? "bg-status-success-bg/40 border-status-success/30"
                        : "bg-v5-bg border-v5-line"
                  }`}
                >
                  <span
                    className={`font-bold ${
                      isReturned
                        ? "text-status-danger"
                        : task.approval.caseStatus === "AGREED"
                          ? "text-status-success"
                          : "text-primary"
                    }`}
                  >
                    Quyết định của lãnh đạo: {task.approval.actionLabel || task.approval.caseStatus}
                  </span>
                  <span className="text-v5-muted">
                    Người quyết định: <b className="text-v5-ink">{task.approval.decidedByName || "—"}</b>
                    {task.approval.decidedAt ? ` · ${formatDateTime(task.approval.decidedAt)}` : ""}
                    {task.approval.round ? ` · Vòng ${task.approval.round}` : ""}
                  </span>
                  {task.approval.reason && (
                    <span className="text-v5-ink">Lý do: {task.approval.reason}</span>
                  )}
                  {task.approval.content && (
                    <span className="text-v5-ink">Nội dung: {task.approval.content}</span>
                  )}
                </div>
              )}

              {/* YC-10: chất lượng lãnh đạo đánh giá — chỉ owner/tuyến/decider thấy */}
              {task.approval?.quality?.visible && (
                <div
                  data-testid="task-quality-summary"
                  className="p-3 rounded-lg border border-v5-line bg-v5-bg text-xs flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-primary flex items-center gap-1.5">
                      <V5Icon name="verified" className="text-[18px] text-secondary" />
                      Đánh giá chất lượng kết quả
                    </span>
                    <span className="font-bold text-secondary">
                      Hiệu lực: {task.approval.quality.effective ?? "Chưa đánh giá"}
                      {task.approval.quality.effective !== null ? "%" : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-v5-muted">
                    <span>
                      Gốc: <b className="text-v5-ink">
                        {task.approval.quality.original ?? "Chưa đánh giá"}
                        {task.approval.quality.original !== null ? "%" : ""}
                      </b>
                    </span>
                    <span>
                      {task.approval.quality.adjusted
                        ? "Đã điều chỉnh (giữ nguyên giá trị gốc)"
                        : "Chưa điều chỉnh"}
                    </span>
                    {task.approval.quality.pendingAdjustmentCount > 0 && (
                      <span className="text-status-warning font-semibold">
                        {task.approval.quality.pendingAdjustmentCount} yêu cầu chờ xử lý
                      </span>
                    )}
                  </div>
                  {task.approval.quality.history.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase text-v5-muted font-semibold">
                        Lịch sử theo vòng
                      </p>
                      <ul className="space-y-0.5">
                        {task.approval.quality.history.map((h) => (
                          <li key={h.decisionId} className="text-[11px] text-v5-muted">
                            • Vòng {h.round} · {h.actionLabel} ·{" "}
                            <b className="text-v5-ink">
                              {h.qualityPercent !== null ? `${h.qualityPercent}%` : "Chưa đánh giá"}
                            </b>
                            {h.actorName ? ` · ${h.actorName}` : ""} · {formatDateTime(h.createdAt)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {task.approval.quality.adjustments.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase text-v5-muted font-semibold">
                        Yêu cầu điều chỉnh
                      </p>
                      {task.approval.quality.adjustments.map((a) => (
                        <div
                          key={a.id}
                          data-testid={`task-quality-adjustment-${a.id}`}
                          className="rounded border border-v5-line bg-v5-surface p-2 space-y-1"
                        >
                          <p className="text-[11px] text-v5-ink">
                            <b>
                              {a.oldQualityPercent ?? "Chưa đánh giá"}
                              {a.oldQualityPercent !== null ? "%" : ""} → {a.newQualityPercent}%
                            </b>{" "}
                            · {a.statusLabel}
                          </p>
                          <p className="text-[11px] text-v5-muted">
                            Lý do: {a.reason} · Người yêu cầu: {a.requestedByName || "—"} ·{" "}
                            {formatDateTime(a.requestedAt)}
                          </p>
                          {a.decidedAt && (
                            <p className="text-[11px] text-v5-muted">
                              Người quyết định: {a.decidedByName || "—"} ·{" "}
                              {formatDateTime(a.decidedAt)}
                              {a.decisionNote ? ` · Ghi chú: ${a.decisionNote}` : ""}
                            </p>
                          )}
                          {a.canDecide && (
                            <div className="flex flex-col sm:flex-row gap-1.5 pt-1">
                              <input
                                value={qualityAdjustNotes[a.id] || ""}
                                onChange={(e) =>
                                  setQualityAdjustNotes((prev) => ({
                                    ...prev,
                                    [a.id]: e.target.value,
                                  }))
                                }
                                placeholder="Ghi chú quyết định (không bắt buộc)"
                                className="flex-1 min-w-0 px-2 py-1.5 rounded border border-v5-line bg-v5-surface text-[11px]"
                              />
                              <div className="flex gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={qualityAdjustBusy}
                                  onClick={() => decideQualityAdjustment(a.id, "APPROVE")}
                                  className="px-2.5 py-1.5 rounded bg-primary text-on-primary text-[11px] font-semibold disabled:opacity-50"
                                >
                                  Chấp thuận
                                </button>
                                <button
                                  type="button"
                                  disabled={qualityAdjustBusy}
                                  onClick={() => decideQualityAdjustment(a.id, "REJECT")}
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
                  {task.approval.quality.canRequestAdjustment && (
                    <div className="space-y-1.5 rounded border border-secondary/40 bg-v5-bg p-2">
                      <p className="text-[10px] uppercase text-v5-muted font-semibold">
                        Yêu cầu điều chỉnh chất lượng
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                        <select
                          data-testid="task-quality-adjustment-select"
                          value={qualityAdjustValue}
                          onChange={(e) => setQualityAdjustValue(e.target.value)}
                          className="w-full px-2 py-1.5 rounded border border-v5-line bg-v5-surface text-[11px]"
                        >
                          <option value="">— Chọn mức mới —</option>
                          {[65, 70, 75, 80, 85, 90, 95, 100].map((v) => (
                            <option key={v} value={v}>
                              {v}%
                            </option>
                          ))}
                        </select>
                        <input
                          data-testid="task-quality-adjustment-reason"
                          value={qualityAdjustReason}
                          onChange={(e) => setQualityAdjustReason(e.target.value)}
                          placeholder="Lý do điều chỉnh (bắt buộc)"
                          className="sm:col-span-2 w-full px-2 py-1.5 rounded border border-v5-line bg-v5-surface text-[11px]"
                        />
                      </div>
                      <button
                        type="button"
                        data-testid="task-quality-adjustment-submit"
                        disabled={qualityAdjustBusy}
                        onClick={submitQualityAdjustment}
                        className="px-3 py-1.5 rounded bg-secondary text-on-secondary text-[11px] font-semibold disabled:opacity-50"
                      >
                        Gửi yêu cầu điều chỉnh
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* YC-09 Phase 1 + YC-11 Phase 3: phần việc theo từng người + pre-check */}
            {!!task.participantResults?.length && (
              <div
                id="task-participants"
                data-testid="task-participants"
                className="scroll-mt-28 bg-v5-surface p-space-md rounded-xl shadow-sm border border-v5-line/50 flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-headline-sm text-sm font-bold text-primary flex items-center gap-2">
                    <V5Icon name="groups" className="text-primary text-[20px]" />
                    Phần việc theo người
                  </h3>
                  <span className="text-[11px] text-v5-muted">
                    Một nhiệm vụ — một hồ sơ duyệt chung
                  </span>
                </div>

                {task.precheck?.enabled && (
                  <div
                    data-testid="task-precheck-panel"
                    className={`rounded-lg border p-3 text-[11px] flex flex-col gap-1.5 ${
                      task.precheck.route?.legacyOnly
                        ? "bg-v5-bg border-v5-line/60 text-v5-muted"
                        : task.precheck.canSubmitOverall
                          ? "bg-status-success-bg/40 border-status-success/30 text-v5-ink"
                          : "bg-status-warning-bg/40 border-status-warning/30 text-v5-ink"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-primary">
                        {task.precheck.route?.legacyOnly
                          ? "Nhiệm vụ legacy — duyệt cuối trực tiếp"
                          : `Kiểm tra sơ bộ: ${
                              task.precheck.route?.status === "READY"
                                ? task.precheck.canSubmitOverall
                                  ? "đã đủ"
                                  : "đang thực hiện"
                                : "chờ phân tuyến"
                            }`}
                      </strong>
                      {task.precheck.route?.finalCandidates?.length ? (
                        <span className="text-v5-muted">
                          Người quyết định cuối:{" "}
                          {task.precheck.route.finalCandidates.map((c) => c.fullName).join(", ")}
                        </span>
                      ) : null}
                    </div>
                    {task.precheck.route?.legacyOnly ? (
                      <span>
                        Không có dữ liệu phần việc/pre-check — giữ luồng final-only, không tự tạo tuyến.
                      </span>
                    ) : task.precheck.canSubmitOverall ? (
                      <span>
                        Tất cả phần bắt buộc đã được pre-check. Chủ trì có thể nộp kết quả chung để lãnh đạo
                        quyết định cuối.
                      </span>
                    ) : (
                      <span>
                        {task.precheck.route?.blockers
                          ?.map((b) => b.message)
                          .filter((v, i, arr) => v && arr.indexOf(v) === i)
                          .slice(0, 4)
                          .join(" ") ||
                          "Còn phần việc chưa được kiểm tra sơ bộ — chưa thể nộp kết quả chung."}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {task.participantResults.map((p) => {
                    const statusLabel: Record<string, string> = {
                      NOT_STARTED: "Chưa bắt đầu",
                      IN_PROGRESS: "Đang thực hiện",
                      SUBMITTED: "Đã báo phần việc",
                      RETURNED: "Bị trả lại",
                      ACCEPTED: "Đã chấp nhận",
                      EXEMPT: "Được miễn",
                    };
                    const precheckMode =
                      !!task.precheck?.enabled && !task.precheck.route?.legacyOnly;
                    const pre = task.precheck?.route?.participants?.find(
                      (x) => x.personId === p.personId
                    );
                    const canDecidePart =
                      !precheckMode &&
                      canApprove &&
                      p.role !== "OWNER" &&
                      p.personId !== permUser?.personId &&
                      p.partStatus === "SUBMITTED";
                    const isOwnPart = p.personId === permUser?.personId;
                    const canReportOwnPart =
                      isOwnPart &&
                      ["NOT_STARTED", "IN_PROGRESS", "RETURNED"].includes(p.partStatus) &&
                      task.status !== "WAITING_REVIEW" &&
                      task.status !== "COMPLETED" &&
                      task.status !== "CANCELED";
                    const canPrecheck =
                      !!pre?.canPrecheck && p.partStatus === "SUBMITTED";
                    const precheckLabel =
                      pre?.precheckStatus === "PASSED"
                        ? "Pre-check đạt"
                        : pre?.precheckStatus === "RETURNED"
                          ? "Pre-check trả lại"
                          : pre?.precheckStatus === "PENDING"
                            ? "Chờ pre-check"
                            : null;
                    return (
                      <div
                        key={p.id}
                        data-testid={`participant-row-${p.personId}`}
                        className="p-3 rounded-lg bg-v5-bg border border-v5-line/60 flex flex-col gap-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-primary">
                            {p.person?.fullName}
                            <span className="ml-1 font-normal text-v5-muted">
                              ({p.role === "OWNER" ? "Chủ trì" : "Phối hợp"})
                            </span>
                          </span>
                          <span className="flex flex-wrap items-center gap-1">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                p.partStatus === "ACCEPTED"
                                  ? "bg-status-success-bg text-status-success"
                                  : p.partStatus === "RETURNED"
                                    ? "bg-status-danger-bg text-status-danger"
                                    : p.partStatus === "SUBMITTED"
                                      ? "bg-status-warning-bg text-status-warning"
                                      : "bg-v5-bg text-v5-muted"
                              }`}
                            >
                              {statusLabel[p.partStatus] || p.partStatus}
                              {p.partProgressPercent !== null && p.partProgressPercent !== undefined
                                ? ` · ${p.partProgressPercent}%`
                                : ""}
                            </span>
                            {precheckLabel && (
                              <span
                                data-testid={`precheck-status-${p.personId}`}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  pre?.precheckStatus === "PASSED"
                                    ? "bg-status-success-bg text-status-success"
                                    : pre?.precheckStatus === "RETURNED"
                                      ? "bg-status-danger-bg text-status-danger"
                                      : "bg-status-warning-bg text-status-warning"
                                }`}
                              >
                                {precheckLabel}
                              </span>
                            )}
                          </span>
                        </div>
                        {p.partResultText && (
                          <p className="text-[11px] text-v5-ink whitespace-pre-wrap">
                            Kết quả: {p.partResultText}
                          </p>
                        )}
                        {precheckMode && pre && pre.eligiblePrecheckers.length > 0 && (
                          <p className="text-[10px] text-v5-muted">
                            Tuyến pre-check:{" "}
                            {pre.eligiblePrecheckers.map((x) => x.fullName).join(", ")}
                          </p>
                        )}
                        {precheckMode && pre?.precheckedBy && (
                          <p className="text-[10px] text-status-success">
                            Đã pre-check: {pre.precheckedBy.fullName}
                            {pre.precheckedAt
                              ? ` · ${formatVnDateTime(pre.precheckedAt)}`
                              : ""}
                          </p>
                        )}
                        {precheckMode && pre?.precheckNote && (
                          <p className="text-[11px] text-status-danger">
                            Ý kiến pre-check: {pre.precheckNote}
                          </p>
                        )}
                        {p.decisionNote && (
                          <p className="text-[11px] text-status-danger">
                            Ý kiến: {p.decisionNote}
                          </p>
                        )}
                        {(canReportOwnPart || canPrecheck) && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {canReportOwnPart && (
                              <button
                                type="button"
                                data-testid={`own-part-report-${p.personId}`}
                                onClick={() => {
                                  setOwnPartText(p.partResultText || "");
                                  setOwnPartOpen(true);
                                }}
                                className="px-2.5 py-1 rounded bg-secondary text-on-secondary text-[11px] font-semibold"
                              >
                                {p.partStatus === "RETURNED"
                                  ? "Báo lại phần việc của tôi"
                                  : "Báo phần việc của tôi"}
                              </button>
                            )}
                            {canPrecheck && (
                              <>
                                <button
                                  type="button"
                                  data-testid={`precheck-pass-${p.personId}`}
                                  disabled={precheckBusy === p.personId}
                                  onClick={() => handlePrecheck(p.personId, "PASS")}
                                  className="px-2.5 py-1 rounded bg-status-success text-white text-[11px] font-semibold disabled:opacity-50"
                                >
                                  {precheckBusy === p.personId ? "Đang xử lý..." : "Pre-check đạt"}
                                </button>
                                <button
                                  type="button"
                                  data-testid={`precheck-return-${p.personId}`}
                                  disabled={precheckBusy === p.personId}
                                  onClick={() => handlePrecheck(p.personId, "RETURN")}
                                  className="px-2.5 py-1 rounded bg-status-danger/10 text-status-danger text-[11px] font-semibold border border-status-danger/30 disabled:opacity-50"
                                >
                                  Trả lại (pre-check)
                                </button>
                              </>
                            )}
                          </div>
                        )}
                        {canDecidePart && (
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleParticipantDecision(p.personId, "ACCEPT")}
                              className="px-2.5 py-1 rounded bg-status-success text-white text-[11px] font-semibold"
                            >
                              Chấp nhận phần
                            </button>
                            <button
                              type="button"
                              onClick={() => handleParticipantDecision(p.personId, "RETURN")}
                              className="px-2.5 py-1 rounded bg-status-danger/10 text-status-danger text-[11px] font-semibold border border-status-danger/30"
                            >
                              Trả lại phần
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Timeline / Updates Card - nhật ký tác nghiệp + lịch sử hợp nhất (E12-A) */}
            <div
              id="task-timeline"
              className="scroll-mt-28 bg-v5-surface p-space-md rounded-xl shadow-sm border border-v5-line/50 flex flex-col gap-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-v5-line pb-3">
                <h3 className="font-headline-sm text-sm font-bold text-primary flex items-center gap-2">
                  <V5Icon name="history" className="text-primary text-[20px]" />
                  {historyView === "unified" ? "Lịch Sử Hợp Nhất" : "Nhật Ký Tác Nghiệp"}{" "}
                  ({historyView === "unified"
                    ? historyEntries.length
                    : task.timeline?.length || task.updates?.length || 0})
                </h3>
                <div className="flex items-center gap-1 rounded-lg border border-v5-line p-0.5">
                  <button
                    type="button"
                    data-testid="task-history-tab-timeline"
                    onClick={() => setHistoryView("timeline")}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                      historyView === "timeline"
                        ? "bg-secondary text-on-secondary"
                        : "text-v5-muted hover:bg-v5-bg"
                    }`}
                  >
                    Nhật ký tác nghiệp
                  </button>
                  <button
                    type="button"
                    data-testid="task-history-tab-unified"
                    onClick={() => openUnifiedHistory(historySource)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                      historyView === "unified"
                        ? "bg-secondary text-on-secondary"
                        : "text-v5-muted hover:bg-v5-bg"
                    }`}
                  >
                    Lịch sử hợp nhất
                  </button>
                </div>
              </div>

              {historyView === "timeline" ? (
                (!task.timeline || task.timeline.length === 0) && (!task.updates || task.updates.length === 0) ? (
                  <div className="py-8 text-center text-v5-muted text-xs">
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
                        submit: { icon: "rate_review", cls: "bg-v5-gold/15 text-v5-gold-ink dark:text-amber-300" },
                        approve: { icon: "verified", cls: "bg-status-success-bg text-status-success" },
                        return: { icon: "undo", cls: "bg-status-danger-bg text-status-danger" },
                        extend: { icon: "update", cls: "bg-status-unassigned-bg text-status-unassigned" },
                        file: { icon: "attach_file", cls: "bg-v5-bg text-v5-muted" },
                        edit: { icon: "edit_note", cls: "bg-blue-500/15 text-v5-accent dark:text-blue-300" },
                        cancel: { icon: "delete_sweep", cls: "bg-status-danger-bg text-status-danger" },
                        link: { icon: "link", cls: "bg-v5-bg text-v5-muted" },
                        participant_precheck_pass: { icon: "fact_check", cls: "bg-status-success-bg text-status-success" },
                        participant_precheck_return: { icon: "assignment_return", cls: "bg-status-danger-bg text-status-danger" },
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
                            <V5Icon name={ks.icon} className="text-[16px]" />
                          </div>
                          <div className="p-3 rounded-lg bg-v5-bg border border-v5-line/50 flex flex-col gap-1 flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-bold text-primary truncate">
                                {ev.actor} <span className="font-normal text-v5-muted">· {ev.title}</span>
                              </span>
                              <span className="text-v5-muted shrink-0">{formatDateTime(ev.at)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs flex-wrap">
                              {typeof ev.progress === "number" && (
                                <span className="px-2 py-0.5 rounded bg-secondary/15 text-secondary font-bold">
                                  Tiến độ: {ev.progress}%
                                </span>
                              )}
                              {ev.statusTo && (
                                <span className="px-2 py-0.5 rounded bg-v5-bg text-v5-muted font-semibold">
                                  {ev.statusFrom && ev.statusFrom !== ev.statusTo
                                    ? `${statusVi[ev.statusFrom] || ev.statusFrom} → ${statusVi[ev.statusTo] || ev.statusTo}`
                                    : statusVi[ev.statusTo] || ev.statusTo}
                                </span>
                              )}
                            </div>
                            {ev.detail && <p className="text-xs text-v5-ink mt-0.5 whitespace-pre-line">{ev.detail}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-3" data-testid="task-unified-history">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {([
                      ["ALL", "Tất cả"],
                      ["TASK_UPDATE", "Cập nhật nhiệm vụ"],
                      ["APPROVAL_DECISION", "Quyết định duyệt"],
                      ["PARTICIPANT_EVENT", "Phần việc phối hợp"],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        data-testid={`task-history-filter-${key}`}
                        onClick={() => openUnifiedHistory(key)}
                        className={`px-2 py-1 rounded-full text-[10px] font-semibold border ${
                          historySource === key
                            ? "border-secondary bg-secondary/15 text-secondary"
                            : "border-v5-line text-v5-muted hover:bg-v5-bg"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => fetchTaskHistory(historySource)}
                      className="ml-auto text-[10px] font-semibold text-secondary inline-flex items-center gap-1"
                    >
                      <V5Icon name="refresh" className="text-[13px]" />
                      Làm mới
                    </button>
                  </div>
                  <p className="text-[10px] text-v5-muted">
                    Chỉ gồm cập nhật nhiệm vụ, quyết định duyệt và phần việc phối hợp. Bình luận và
                    tệp đính kèm không gộp vào lịch sử này.
                  </p>

                  {historyLoading ? (
                    <div className="py-6 text-center text-[11px] text-v5-muted">
                      Đang tải lịch sử hợp nhất...
                    </div>
                  ) : historyError ? (
                    <div className="py-4 text-center text-[11px] text-status-danger">{historyError}</div>
                  ) : historyEntries.length === 0 ? (
                    <div className="py-6 text-center text-[11px] text-v5-muted">
                      Chưa có bản ghi nào cho nguồn đã chọn.
                    </div>
                  ) : (
                    historyEntries.map((ev) => {
                      const sourceStyle: Record<
                        TaskHistoryEntry["source"],
                        { icon: string; cls: string }
                      > = {
                        TASK_UPDATE: { icon: "trending_up", cls: "bg-secondary/15 text-secondary" },
                        APPROVAL_DECISION: { icon: "verified", cls: "bg-primary/10 text-primary" },
                        PARTICIPANT_EVENT: {
                          icon: "groups",
                          cls: "bg-v5-gold/15 text-v5-gold-ink dark:text-amber-300",
                        },
                      };
                      const statusVi: Record<string, string> = {
                        NOT_STARTED: "Chưa thực hiện",
                        IN_PROGRESS: "Đang thực hiện",
                        WAITING_REVIEW: "Chờ duyệt",
                        COMPLETED: "Hoàn thành",
                        DONE: "Hoàn thành",
                        CANCELED: "Đã hủy",
                      };
                      const style = sourceStyle[ev.source];
                      return (
                        <div key={ev.id} className="flex gap-2.5" data-testid={`task-history-${ev.source}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${style.cls}`}>
                            <V5Icon name={style.icon} className="text-[16px]" />
                          </div>
                          <div className="p-3 rounded-lg bg-v5-bg border border-v5-line/50 flex flex-col gap-1 flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-bold text-primary truncate">
                                {ev.actorName}{" "}
                                <span className="font-normal text-v5-muted">· {ev.title}</span>
                              </span>
                              <span className="text-v5-muted shrink-0">{formatDateTime(ev.at)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded bg-v5-bg text-[10px] font-bold text-primary">
                                Nguồn: {ev.sourceLabel}
                              </span>
                              {ev.round !== null && (
                                <span className="px-2 py-0.5 rounded bg-v5-bg text-[10px] font-semibold text-v5-muted">
                                  Vòng {ev.round}
                                </span>
                              )}
                              {ev.subjectPersonName && (
                                <span className="px-2 py-0.5 rounded bg-v5-bg text-[10px] font-semibold text-v5-muted">
                                  {ev.subjectPersonName}
                                </span>
                              )}
                              {typeof ev.progressPercent === "number" && (
                                <span className="px-2 py-0.5 rounded bg-secondary/15 text-secondary text-[10px] font-bold">
                                  Tiến độ: {ev.progressPercent}%
                                </span>
                              )}
                              {ev.statusTo && (
                                <span className="px-2 py-0.5 rounded bg-v5-bg text-[10px] font-semibold text-v5-muted">
                                  {ev.statusFrom && ev.statusFrom !== ev.statusTo
                                    ? `${statusVi[ev.statusFrom] || ev.statusFrom} → ${
                                        statusVi[ev.statusTo] || ev.statusTo
                                      }`
                                    : statusVi[ev.statusTo] || ev.statusTo}
                                </span>
                              )}
                              {ev.qualityPercent !== null && (
                                <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold">
                                  Chất lượng: {ev.qualityPercent}%
                                </span>
                              )}
                            </div>
                            {ev.detail && (
                              <p className="text-xs text-v5-ink mt-0.5 whitespace-pre-line">{ev.detail}</p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Trao đổi trong nhiệm vụ (bình luận phẳng + đính file) */}
      <div
        id="task-comments"
        className="scroll-mt-28 bg-v5-surface p-space-md rounded-xl shadow-sm border border-v5-line/50 flex flex-col gap-3"
      >
        <h3 className="font-headline-sm text-sm font-bold text-primary flex items-center gap-2 border-b border-v5-line pb-3">
          <V5Icon name="forum" className="text-primary text-[20px]" />
          Trao Đổi ({comments.length})
        </h3>
        {comments.length === 0 ? (
          <p className="text-xs text-v5-muted text-center py-4">
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
                <div className="p-3 rounded-lg bg-v5-bg border border-v5-line/50 flex flex-col gap-1 flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-primary truncate">
                      {c.author?.fullName || "Cán bộ"}
                      {isEdited && <span className="font-normal text-v5-muted"> · đã sửa</span>}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <span className="text-v5-muted">{formatDateTime(c.createdAt)}</span>
                      {isMine && editingCommentId !== c.id && (
                        <button
                          onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.content); }}
                          title="Sửa bình luận của mình"
                          className="p-0.5 rounded text-v5-muted hover:text-primary"
                        >
                          <V5Icon name="edit" className="text-[15px]" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteComment(c.id)}
                        title="Xóa bình luận (tác giả hoặc lãnh đạo)"
                        className="p-0.5 rounded text-v5-muted hover:text-status-danger"
                      >
                        <V5Icon name="delete" className="text-[15px]" />
                      </button>
                    </span>
                  </div>
                  {editingCommentId === c.id ? (
                    <div className="flex flex-col gap-1.5">
                      <textarea
                        rows={2}
                        value={editCommentText}
                        onChange={(e) => setEditCommentText(e.target.value)}
                        className="w-full p-2 rounded bg-v5-surface text-xs border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
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
                          className="px-3 py-1 rounded bg-v5-bg text-xs font-semibold"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-v5-ink whitespace-pre-line">{renderContent(c.content)}</p>
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
                          <V5Icon name="attach_file" className="text-[14px]" />
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
                            mine ? "bg-secondary/20 border-secondary" : "bg-v5-surface border-v5-line hover:border-secondary/50"
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
        <form onSubmit={handleSendComment} className="flex flex-col gap-2 pt-1 border-t border-v5-line">
          <div className="relative">
            <textarea
              ref={commentBoxRef}
              rows={2}
              value={commentText}
              onChange={(e) => handleCommentChange(e.target.value, e.target.selectionStart)}
              onClick={(e) => handleCommentChange(commentText, (e.target as HTMLTextAreaElement).selectionStart)}
              onKeyUp={(e) => handleCommentChange(commentText, (e.target as HTMLTextAreaElement).selectionStart)}
              placeholder="Nhập trao đổi, câu hỏi, nhắc việc... (gõ @ để nhắc tên)"
              className="w-full p-2.5 rounded bg-v5-bg text-xs border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
            />
            {mentionMatches.length > 0 && (
              <div className="absolute left-0 right-0 bottom-full mb-1 bg-v5-surface border border-v5-line rounded-lg shadow-xl overflow-hidden z-10 max-h-44 overflow-y-auto">
                {mentionMatches.map((p) => {
                  const inTask =
                    task?.owner?.id === p.id ||
                    (task?.assignees || []).some((a: any) => a.person.id === p.id);
                  return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => insertMention(p.fullName)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-v5-bg flex items-center gap-2"
                  >
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">
                      {p.fullName.trim().split(" ").slice(-1)[0]?.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="font-semibold truncate">{p.fullName}</span>
                    {inTask && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-v5-accent-soft text-v5-accent font-bold shrink-0">
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
              <V5Icon name="upload_file" className="text-[18px]" />
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
            <span className="text-[11px] text-v5-muted">Tối đa 3 tệp, mỗi tệp ≤ 10MB</span>
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
              <div className="bg-v5-surface p-space-md rounded-xl shadow-sm border border-v5-line/50 flex flex-col gap-3">
                <h3 className="font-headline-sm text-sm font-bold text-primary flex items-center gap-2">
                  <V5Icon name="update" className="text-status-unassigned text-[20px]" />
                  Lịch Sử Đề Xuất Gia Hạn ({task.deadlineRequests.length})
                </h3>
                <div className="flex flex-col gap-2">
                  {task.deadlineRequests.map((req) => (
                    <div key={req.id} className="p-3 rounded-lg bg-v5-bg border border-v5-line text-xs flex flex-col gap-1">
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
                      <p className="text-v5-muted">Lý do: {req.reason}</p>
                      <span className="text-[11px] text-v5-muted">Gửi lúc: {formatDateTime(req.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column (1/3): Metadata & Responsible Officers */}
          <div className="flex flex-col gap-space-lg">
            {/* Meta Attributes */}
            <div className="bg-v5-surface p-space-md rounded-xl shadow-sm border border-v5-line/50 flex flex-col gap-4">
              <h3 className="font-headline-sm text-sm font-bold text-primary border-b border-v5-line pb-2">
                Thông Tin Trách Nhiệm
              </h3>

              <div className="flex flex-col gap-3 text-xs">
                <div>
                  <span className="text-v5-muted block mb-0.5">Đơn vị chủ trì:</span>
                  <span className="font-bold text-primary text-sm">{task.unit?.name || "Hải quan cửa khẩu Quốc tế Tà Lùng"}</span>
                </div>

                <div>
                  <span className="text-v5-muted block mb-0.5">Cán bộ phụ trách chính:</span>
                  <div className="flex items-center gap-2">
                    <V5Icon name="account_circle" className="text-secondary text-[18px]" />
                    <div>
                      <span className="font-bold text-primary block">{task.owner?.fullName || "Chưa phân công"}</span>
                      <span className="text-[11px] text-v5-muted">{task.owner?.position || "Công chức phụ trách"}</span>
                    </div>
                  </div>
                </div>

                {task.assignees && task.assignees.length > 0 && (
                  <div>
                    <span className="text-v5-muted block mb-1">Cán bộ phối hợp:</span>
                    <div className="flex flex-col gap-1">
                      {task.assignees.map((as, i) => (
                        <div key={i} className="flex items-center gap-1.5 p-1.5 rounded bg-v5-bg">
                          <V5Icon name="person" className="text-[15px] text-v5-muted" />
                          <span className="font-semibold text-primary">{as.person.fullName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-v5-line">
                  <span className="text-v5-muted block mb-0.5">Hạn giải quyết hiện tại:</span>
                  <span className={`font-bold text-sm ${isOverdue ? "text-status-danger" : "text-primary"}`}>
                    {formatDateTime(task.currentDeadline)}
                  </span>
                </div>

                {task.originalDeadline && task.originalDeadline !== task.currentDeadline && (
                  <div>
                    <span className="text-v5-muted block mb-0.5">Hạn định ban đầu:</span>
                    <span className="text-v5-muted">{formatDateTime(task.originalDeadline)}</span>
                  </div>
                )}

                {/* YC-38 UAT fix: khoi "Nguon cong viec" — ma TX + nguon phat sinh */}
                <div className="pt-2 border-t border-v5-line">
                  <span className="text-v5-muted block mb-0.5">Nguồn công việc:</span>
                  <TxSourceBadge source={task.txSource} />
                  <span className="text-[11px] text-v5-muted block mt-0.5">
                    {originLabel(task.originKind)}
                  </span>
                </div>

                {task.planLinks && task.planLinks.length > 0 && (
                  <div className="pt-2 border-t border-v5-line">
                    <span className="text-v5-muted block mb-0.5">Thuộc kế hoạch công tác:</span>
                    <span className="font-semibold text-secondary">
                      {task.planLinks[0].planItem?.plan?.title || "Kế hoạch tuần Chi cục"}
                    </span>
                    {task.planLinks[0].planItem?.title && (
                      <span className="text-[11px] text-v5-muted block mt-0.5">
                        Mục tiêu: {task.planLinks[0].planItem.title}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Attachments Card */}
            <div
              id="task-attachments"
              className="scroll-mt-28 bg-v5-surface p-space-md rounded-xl shadow-sm border border-v5-line/50 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between border-b border-v5-line pb-2">
                <h3 className="font-headline-sm text-sm font-bold text-primary flex items-center gap-1.5">
                  <V5Icon name="attach_file" className="text-[18px] text-secondary" />
                  <span>Hồ Sơ &amp; Tệp Đính Kèm ({attachments.length})</span>
                </h3>
                {uploadingFile && (
                  <span className="text-secondary font-label-sm text-[11px] flex items-center gap-1">
                    <V5Icon name="progress_activity" className="text-[12px] animate-spin" />
                    Đang tải lên...
                  </span>
                )}
              </div>

              {/* Danh sách file */}
              <div className="flex flex-col gap-2">
                {attachmentsLoading ? (
                  <div className="p-3 rounded-lg bg-v5-bg text-center text-xs text-v5-muted flex items-center justify-center gap-2">
                    <V5Icon name="progress_activity" className="text-[16px] animate-spin" />
                    Đang tải...
                  </div>
                ) : attachments.length === 0 ? (
                  <div className="p-3 rounded-lg bg-v5-bg border border-dashed border-v5-line text-center">
                    <p className="text-xs text-v5-muted">Chưa có tệp đính kèm nào trong nhiệm vụ này.</p>
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
                        className="flex items-center justify-between p-2 rounded-lg bg-v5-bg border border-v5-line text-xs hover:border-secondary/40 transition-fast"
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                          <V5Icon
                            name={
                              isPdf
                                ? "picture_as_pdf"
                                : isSheet
                                  ? "table_view"
                                  : isImage
                                    ? "image"
                                    : "description"
                            }
                            className={`shrink-0 text-[20px] ${
                              isPdf
                                ? "text-status-danger"
                                : isSheet
                                  ? "text-status-success"
                                  : isImage
                                    ? "text-secondary"
                                    : "text-v5-muted"
                            }`}
                          />
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
                            <span className="text-[11px] text-v5-muted">
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
                              className="p-1 text-v5-muted hover:text-secondary rounded"
                              title="Xem nhanh tệp"
                            >
                              <V5Icon name="visibility" className="text-[16px]" />
                            </button>
                          )}
                          <a
                            href={att.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            download
                            className="p-1 text-v5-muted hover:text-secondary rounded"
                            title="Tải về máy"
                          >
                            <V5Icon name="download" className="text-[16px]" />
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(att.id)}
                            className="p-1 text-v5-muted hover:text-status-danger rounded"
                            title="Xóa tệp"
                          >
                            <V5Icon name="delete" className="text-[16px]" />
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
                className="w-full py-2 rounded-lg bg-v5-bg hover:bg-v5-bg-high text-secondary font-semibold text-xs flex items-center justify-center gap-1.5 transition-fast active-press border border-v5-line disabled:opacity-50"
              >
                <V5Icon
                  name={uploadingFile ? "progress_activity" : "upload_file"}
                  className={`text-[16px] ${uploadingFile ? "animate-spin" : ""}`}
                />
                <span>{uploadingFile ? "Đang tải lên..." : "Tải lên tệp đính kèm mới"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Thanh thao tác cố định trên mobile */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-v5-line bg-v5-surface/95 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {task.status === "NOT_STARTED" && isMyTask && !isSelfInitiated(task.originKind) ? (
            <button
              onClick={handleAcceptTask}
              disabled={accepting}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-v5-accent text-sm font-semibold text-white disabled:opacity-50"
            >
              <V5Icon name="handshake" className="text-[18px]" />
              {accepting ? "Đang xác nhận..." : "Nhận việc"}
            </button>
          ) : !isCompleted && !isWaiting ? (
            <>
              <button
                onClick={() => {
                  setNewProgress(task.progressPercent ?? 0);
                  setUpdateNotes("");
                  setShowUpdateModal(true);
                }}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-v5-accent text-sm font-semibold text-white"
              >
                <V5Icon name="edit_calendar" className="text-[18px]" />
                Báo cáo tiến độ
              </button>
              <button
                onClick={() => setShowExtRequestModal(true)}
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-v5-line bg-v5-surface px-3 text-sm font-semibold text-v5-ink"
              >
                <V5Icon name="update" className="text-[18px]" />
                Gia hạn
              </button>
            </>
          ) : isWaiting && canApprove && canFinalByRoute && task.owner?.id !== permUser?.personId ? (
            <button
              onClick={() => setShowApproveModal(true)}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-v5-success text-sm font-semibold text-white"
            >
              <V5Icon name="verified" className="text-[18px]" />
              Ký duyệt kết quả
            </button>
          ) : null}
        </div>
      </div>

      {/* MODAL CẬP NHẬT TIẾN ĐỘ */}
      {showUpdateModal && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-md bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line transition-panel">
            <div className="p-space-md bg-secondary text-on-secondary flex items-center justify-between">
              <h3 className="font-headline-sm font-semibold">Cập Nhật Tiến Độ Thực Hiện</h3>
              <button onClick={() => setShowUpdateModal(false)}>
                <V5Icon name="close" className="text-[20px]" />
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
                  className="w-full p-2.5 rounded bg-v5-bg text-xs border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
                />
              </div>

              {/* YC-38 B4: quy tắc nộp duyệt — 100% tự động trình duyệt; dưới 100% chỉ cập nhật nhật ký.
                  Ô tick là trạng thái SUY RA từ tiến độ (không có state riêp) => không thể lệch hiển thị. */}
              <label
                className={`flex items-center gap-2 text-xs font-medium ${
                  newProgress === 100 ? "text-primary cursor-pointer" : "text-v5-muted"
                }`}
              >
                <input
                  type="checkbox"
                  checked={newProgress === 100}
                  disabled={newProgress !== 100 || task?.status === "WAITING_REVIEW"}
                  onChange={() => undefined}
                  className="rounded text-secondary"
                />
                <span>
                  {isTaskOwner || canApprove
                    ? newProgress === 100
                      ? "Nộp kết quả chờ Lãnh đạo đơn vị ký phê duyệt"
                      : "Nộp kết quả chờ Lãnh đạo đơn vị ký phê duyệt (đạt 100% tiến độ)"
                    : newProgress === 100
                      ? "Báo phần việc của tôi (đạt 100%)"
                      : "Cập nhật tiến độ phần việc của tôi"}
                </span>
              </label>
              <p className="text-[11px] text-v5-muted">
                Kéo thanh theo mức 5%.{" "}
                {isTaskOwner || canApprove
                  ? newProgress === 100
                    ? "Đạt 100% — khi bấm \"Xác nhận cập nhật\", hệ thống sẽ NỘP KẾT QUẢ chờ Lãnh đạo đơn vị phê duyệt. Cán bộ không tự kết luận hoàn thành."
                    : "Dưới 100% — khi lưu chỉ cập nhật nhật ký, nhiệm vụ tiếp tục \"Đang thực hiện\". Trình duyệt sớm chưa triển khai (đề xuất nghiệp vụ đang chờ xác nhận)."
                  : newProgress === 100
                    ? "Đạt 100% — bấm \"Xác nhận cập nhật\" để báo phần việc của bạn. Chủ trì sẽ tổng hợp và trình lãnh đạo; bạn không nộp thay kết quả chung."
                    : "Dưới 100% — chỉ cập nhật tiến độ phần việc của bạn; không thay đổi tiến độ chung của nhiệm vụ."}
              </p>
              {task?.status === "WAITING_REVIEW" && (
                <p className="text-[11px] font-semibold text-status-warning">
                  Nhiệm vụ đang chờ Lãnh đạo phê duyệt — không thể trình lặp lại.
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-v5-line">
                <button
                  type="button"
                  onClick={() => setShowUpdateModal(false)}
                  className="px-3 py-1.5 rounded bg-v5-bg text-xs font-semibold"
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

      {/* MODAL BÁO PHẦN VIỆC CỦA TÔI (YC-09/YC-11) */}
      {ownPartOpen && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            data-testid="own-part-modal"
            className="w-full max-w-md bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line"
          >
            <div className="p-4 bg-secondary text-on-secondary flex items-center justify-between">
              <h3 className="font-headline-sm text-sm font-bold">Báo phần việc của tôi</h3>
              <button type="button" onClick={() => setOwnPartOpen(false)} aria-label="Đóng">
                <V5Icon name="close" className="text-[20px]" />
              </button>
            </div>
            <form onSubmit={handleOwnPartSubmit} className="p-4 flex flex-col gap-3">
              <p className="text-[11px] text-v5-muted">
                Kết quả này chỉ thuộc phần việc của bạn. Chủ trì tổng hợp và nộp kết quả chung;
                lãnh đạo quyết định cuối.
              </p>
              <label className="text-xs font-semibold text-v5-ink">
                Kết quả phần việc <span className="text-status-danger">*</span>
              </label>
              <textarea
                data-testid="own-part-text"
                rows={4}
                required
                value={ownPartText}
                onChange={(e) => setOwnPartText(e.target.value)}
                placeholder="Mô tả kết quả phần việc đã thực hiện (ít nhất 5 ký tự)..."
                className="w-full p-2.5 rounded bg-v5-bg text-xs border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
              />
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-v5-line">
                <button
                  type="button"
                  onClick={() => setOwnPartOpen(false)}
                  disabled={ownPartBusy}
                  className="px-3 py-1.5 rounded bg-v5-bg text-xs font-semibold disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  data-testid="own-part-submit"
                  disabled={ownPartBusy}
                  className="px-4 py-1.5 rounded bg-secondary text-on-secondary text-xs font-semibold active-press disabled:opacity-50"
                >
                  {ownPartBusy ? "Đang gửi..." : "Gửi phần việc"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XIN GIA HẠN */}
      {showExtRequestModal && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-md bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line transition-panel">
            <div className="p-space-md bg-status-unassigned text-white flex items-center justify-between">
              <h3 className="font-headline-sm font-semibold">Đề Xuất Gia Hạn Nhiệm Vụ</h3>
              <button onClick={() => setShowExtRequestModal(false)}>
                <V5Icon name="close" className="text-[20px]" />
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
                  className="h-9 px-2.5 rounded bg-v5-bg text-xs border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
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
                  className="w-full p-2.5 rounded bg-v5-bg text-xs border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-v5-line">
                <button
                  type="button"
                  onClick={() => setShowExtRequestModal(false)}
                  className="px-3 py-1.5 rounded bg-v5-bg text-xs font-semibold"
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
          <div className="w-full max-w-md bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line transition-panel">
            <div className="p-space-md bg-status-success text-white flex items-center justify-between">
              <h3 className="font-headline-sm font-semibold">Phê Duyệt Nghiệm Thu Hoàn Thành</h3>
              <button onClick={() => setShowApproveModal(false)}>
                <V5Icon name="close" className="text-[20px]" />
              </button>
            </div>
            <div className="p-space-md flex flex-col gap-3">
              <p className="text-xs text-v5-ink">
                Xác nhận phê duyệt hoàn thành nhiệm vụ <strong>{task.code}</strong>. Kết quả sẽ được ghi vào sổ điện tử và báo cáo chỉ huy.
              </p>
              <textarea
                rows={3}
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Ý kiến phê duyệt: Đạt yêu cầu, đồng ý lưu hồ sơ..."
                className="w-full p-2.5 rounded bg-v5-bg text-xs border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
              />
              {task.qualityEnabled && (
                <div className="flex flex-col gap-1" data-testid="task-approve-quality-block">
                  <label className="text-xs font-semibold text-v5-ink">
                    Mức chất lượng kết quả (65–100, bước 5){" "}
                    <span className="text-status-danger">*</span>
                  </label>
                  <select
                    data-testid="task-approve-quality-select"
                    value={approvalQualityPercent}
                    onChange={(e) => setApprovalQualityPercent(e.target.value)}
                    className="w-full p-2.5 rounded bg-v5-bg text-xs border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
                  >
                    <option value="">— Chọn mức chất lượng —</option>
                    {[65, 70, 75, 80, 85, 90, 95, 100].map((v) => (
                      <option key={v} value={v}>
                        {v}%
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-v5-muted">
                    Không tự mặc định 100; mức chất lượng không tự đổi điểm/xếp loại.
                  </p>
                </div>
              )}
            </div>
            <div className="p-space-md bg-v5-bg flex items-center justify-end gap-2 border-t border-v5-line">
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                className="px-3 py-1.5 rounded bg-v5-bg text-xs font-semibold"
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
          <div className="w-full max-w-lg bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line transition-panel">
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <h3 className="font-headline-sm font-semibold">Chỉnh sửa chỉ đạo [{task.code}]</h3>
              <button onClick={() => setShowEditModal(false)}>
                <V5Icon name="close" className="text-[20px]" />
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
                    className="h-10 px-3 rounded bg-v5-bg text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-space-sm">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-primary">Cán bộ chủ trì</label>
                    <select
                      value={editOwnerId}
                      onChange={(e) => setEditOwnerId(e.target.value)}
                      className="h-10 px-2 rounded bg-v5-bg text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
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
                      className="h-10 px-2 rounded bg-v5-bg text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
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
                    className="h-10 px-3 rounded bg-v5-bg text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-primary">Nguồn gốc / Chỉ đạo từ đâu</label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Nhập nguồn gốc chỉ đạo..."
                    className="h-10 px-3 rounded bg-v5-bg text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-primary">Sản phẩm / Kết quả yêu cầu</label>
                  <textarea
                    rows={2}
                    value={editExpectedResult}
                    onChange={(e) => setEditExpectedResult(e.target.value)}
                    placeholder="Nhập sản phẩm, kết quả yêu cầu..."
                    className="p-2.5 rounded bg-v5-bg text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
                  />
                </div>
              </div>
              <div className="p-space-md bg-v5-bg flex items-center justify-end gap-2 border-t border-v5-line">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded bg-v5-surface text-xs font-semibold"
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
          <div className="w-full max-w-md bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line transition-panel">
            <div className="p-space-md bg-status-danger text-white flex items-center justify-between">
              <h3 className="font-headline-sm font-semibold">Xóa nhiệm vụ trùng</h3>
              <button onClick={() => setShowCancelDupModal(false)}>
                <V5Icon name="close" className="text-[20px]" />
              </button>
            </div>
            <form onSubmit={handleCancelDuplicate} className="p-space-md flex flex-col gap-3">
              <p className="text-xs text-v5-ink">
                Sẽ loại khỏi danh sách thực hiện (không tính KPI, giữ lịch sử và liên kết để đối soát):
              </p>
              <div className="p-3 rounded-lg bg-v5-bg border border-v5-line text-xs flex flex-col gap-1">
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
                className="w-full p-2.5 rounded bg-v5-bg text-xs border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
              />
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-v5-line">
                <button
                  type="button"
                  onClick={() => setShowCancelDupModal(false)}
                  className="px-3 py-1.5 rounded bg-v5-bg text-xs font-semibold"
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
            className="bg-v5-surface rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-v5-line"
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
    </div>
  );
}
