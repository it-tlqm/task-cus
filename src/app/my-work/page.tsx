"use client";

import React, { useState, useEffect, useRef } from "react";
import { isSelfInitiated, originLabel } from "@/lib/task-origin";
import Link from "next/link";
import { toast } from "@/components/ui/Toast";
import { getCurrentPeriodLabels } from "@/lib/period-helper";
import { formatVnDateTime, vnLocalToUtcIso, utcIsoToVnInputValue } from "@/lib/datetime";
import { usePermissions } from "@/hooks/usePermissions";
import { CollaboratorPicker } from "@/components/tasks/CollaboratorPicker";
import WorkSourcePicker from "@/components/work/WorkSourcePicker";
import TxSourceBadge from "@/components/work/TxSourceBadge";
import MyWorkItemsSection from "./MyWorkItemsSection";
import {
  DEFAULT_JOURNAL_FILTER,
  JournalFilterBar,
  journalDateInRange,
  journalPeriodRange,
  journalTextMatches,
  type JournalFilterState,
} from "@/components/work/JournalFilterBar";
import { ENV_BADGE_LABEL } from "@/config/app-env";

interface TaskUpdateItem {
  id: string;
  progressPercent: number;
  statusBefore: string;
  statusAfter: string;
  notes: string | null;
  createdAt: string;
  author?: {
    fullName: string;
  };
}

interface DeadlineRequestItem {
  id: string;
  requestedDeadline: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reviewNotes?: string | null;
}

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

interface TaskItem {
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
  owner?: { id: string; fullName: string; position: string };
  assignees?: Array<{ person: { id: string; fullName: string; position: string } }>;
  planLinks?: Array<{
    planItem: {
      plan: { title: string; year: number; weekNumber?: number; monthNumber?: number };
    };
  }>;
  updates?: TaskUpdateItem[];
  deadlineRequests?: DeadlineRequestItem[];
  // YC-38: nguon danh muc TX + nguon phat sinh (null = du lieu lich su chua xac dinh)
  txSource?: {
    code: string;
    title?: string | null;
    department?: string | null;
    groupCode?: string | null;
    convertFactor?: number | null;
  } | null;
  originKind?: string | null;
}

export default function MyWorkPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "ALL" | "IN_PROGRESS" | "WAITING_REVIEW" | "OVERDUE" | "COMPLETED"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  // YC-30 (bổ sung) — bộ lọc "Nhật ký công việc" dùng chung cho nhiệm vụ giao + đầu việc kế hoạch.
  const [journalFilter, setJournalFilter] = useState<JournalFilterState>(
    DEFAULT_JOURNAL_FILTER
  );
  // UX: tìm kiếm + phân trang server (API giới hạn 50/trang)
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  // Bộ đếm KPI do server tính trên toàn phạm vi (không phụ thuộc trang đã tải)
  const [serverStats, setServerStats] = useState<{
    active: number;
    high: number;
    dueSoon: number;
    overdue: number;
    waiting: number;
    done: number;
    maxOverdueDays: number;
  } | null>(null);

  // Số liệu thật: ưu tiên bộ đếm server, fallback tính từ tasks đã tải (không hardcode)
  const derivedStats = React.useMemo(() => {
    const now = Date.now();
    const active = tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELED");
    const high = active.filter((t) => t.priority === "Cao" || t.priority === "Khẩn").length;
    const dueSoon = active.filter((t) => {
      const dl = new Date(t.currentDeadline).getTime();
      return !isNaN(dl) && dl >= now && dl <= now + 24 * 3600 * 1000;
    }).length;
    const overdueList = tasks.filter((t) => t.isOverdue || t.hasIssue);
    const waiting = tasks.filter((t) => t.status === "WAITING_REVIEW").length;
    const done = tasks.filter((t) => t.status === "COMPLETED").length;
    const maxOverdueDays = overdueList.reduce((m, t) => {
      const dl = new Date(t.currentDeadline).getTime();
      if (isNaN(dl)) return m;
      return Math.max(m, Math.floor((now - dl) / 86400000));
    }, 0);
    return { active: active.length, high, dueSoon, overdue: overdueList.length, waiting, done, maxOverdueDays };
  }, [tasks]);
  const myStats = serverStats ?? derivedStats;

  // Hoạt động gần nhất từ TaskUpdate thật (tối đa 2)
  const recentActivity = React.useMemo(() => {
    const all: Array<{ taskCode: string; taskTitle: string; notes: string; at: string; author: string }> = [];
    tasks.forEach((t) => {
      (t.updates || []).forEach((u: any) => {
        all.push({
          taskCode: t.code,
          taskTitle: t.title,
          notes: u.notes || "Cập nhật tiến độ",
          at: u.createdAt,
          author: u.author?.fullName || t.owner?.fullName || "",
        });
      });
    });
    return all.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 2);
  }, [tasks]);

  // Lưu ý hydration: nhãn ngày phụ thuộc múi giờ → tính SAU khi mount để
  // HTML do server và client render ở lần đầu giống nhau (tránh React error #418).
  const [todayLabel, setTodayLabel] = useState("");
  const [todayShort, setTodayShort] = useState("");
  const [periodLabels, setPeriodLabels] = useState<ReturnType<typeof getCurrentPeriodLabels>>({ weekNumber: 0, year: 0, month: 0, weekShort: "", monthShort: "" });
  useEffect(() => {
    const d = new Date();
    const weekdays = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    setTodayLabel(
      `${weekdays[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
    );
    setPeriodLabels(getCurrentPeriodLabels());
    setTodayShort(
      new Date().toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })
    );
  }, []);

  // Drawer & Modal States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  // YC-04: chặn bấm trùng nút tạo việc cá nhân
  const [isCreatingPersonal, setIsCreatingPersonal] = useState(false);

  // Lãnh đạo + Trưởng nhóm: sửa giao việc và duyệt ngay trên mobile
  const { canApprove } = usePermissions();
  const [people, setPeople] = useState<Array<{ id: string; fullName: string }>>([]);
  const [editTask, setEditTask] = useState<TaskItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editOwnerId, setEditOwnerId] = useState("");
  const [editCollabs, setEditCollabs] = useState<string[]>([]);
  const [editDeadline, setEditDeadline] = useState("");
  const [editPriority, setEditPriority] = useState("Cao");
  const [editSaving, setEditSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Drawer Form State
  const [drawerStatus, setDrawerStatus] = useState<"IN_PROGRESS" | "COMPLETED" | "WAITING_REVIEW">("IN_PROGRESS");
  const [drawerProgress, setDrawerProgress] = useState<number>(85);
  const [drawerNotes, setDrawerNotes] = useState("");

  // Attachments & Review Reminder States
  const [attachments, setAttachments] = useState<TaskAttachmentItem[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [remindingTaskId, setRemindingTaskId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{
    url: string;
    name: string;
    mimeType: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Task Form State
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"Cao" | "Trung bình" | "Thấp">("Trung bình");
  const [newTaskDeadline, setNewTaskDeadline] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [newTaskTime, setNewTaskTime] = useState("17:00");
  // YC-38: nguon phat sinh — chi giu nguon DANH MUC trong source_kind,
  // nguon PHAT SINH nam rieng trong origin_kind (server quyet dinh lai)
  const [newTaskSource, setNewTaskSource] = useState("SELF_INITIATED");
  // YC-38B: nguồn công việc đã chọn (TX / QĐ1277) — gửi kèm khi tạo
  const [newTaskCatalogEntry, setNewTaskCatalogEntry] = useState<{
    id: string;
    code: string;
    title: string;
    department?: string | null;
    convertFactor?: number | null;
  } | null>(null);
  const [newTaskProduct, setNewTaskProduct] = useState<{
    id: string;
    code: string;
    taskName: string;
    convertFactor?: number | null;
  } | null>(null);
  // Khoá idempotency cấp form: sinh 1 lần khi mở modal, dùng lại khi bấm lưu
  const [newTaskIdempotencyKey, setNewTaskIdempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );

  const [currentUser, setCurrentUser] = useState<{
    personId?: string;
    fullName: string;
    personCode?: string;
    positionTitle?: string;
    unitName?: string;
  }>({
    fullName: "Công chức",
    personCode: "—",
    positionTitle: "Cán bộ",
    unitName: "Hải quan cửa khẩu Quốc tế Tà Lùng",
  });

  // YC-38 UAT fix: hiển thị thời hạn theo giờ Việt Nam, KHÔNG phụ thuộc múi giờ thiết bị
  const formatDateTime = (iso?: string) => (iso ? formatVnDateTime(iso) : "--");

  const fetchTasks = async (opts?: { page?: number; append?: boolean; search?: string }) => {
    const p = opts?.page ?? 1;
    const q = opts?.search ?? searchQuery;
    if (opts?.append) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: "50" });
      if (q.trim()) params.set("search", q.trim());
      const res = await fetch(`/api/tasks?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const data = Array.isArray(json) ? json : json.data || [];
        setTasks((prev) => (opts?.append ? [...prev, ...data] : data));
        setPage(p);
        setTotalPages(json.pagination?.totalPages || 1);
        setTotalCount(json.pagination?.total ?? data.length);
        if (json.stats) setServerStats(json.stats);
        setLastSyncAt(new Date());
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Tìm kiếm server (debounce, bỏ qua lần đầu)
  const firstSearch = React.useRef(true);
  useEffect(() => {
    if (firstSearch.current) {
      firstSearch.current = false;
      return;
    }
    const t = setTimeout(() => {
      fetchTasks({ page: 1, search: searchQuery });
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    fetchTasks();
    // Danh sách nhân sự cho sửa giao việc (lãnh đạo/trưởng nhóm)
    fetch("/api/people?pageSize=100")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const list = Array.isArray(json) ? json : json?.data || [];
        setPeople(list.map((p: any) => ({ id: p.id, fullName: p.fullName })));
      })
      .catch(() => {});
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setCurrentUser({
            personId: data.user.personId,
            fullName: data.user.fullName || "Công chức",
            personCode: data.user.personCode || data.user.username?.toUpperCase() || "—",
            positionTitle: data.user.positionTitle || "Cán bộ",
            unitName: data.user.unitName || data.user.unit?.name || "Hải quan cửa khẩu Quốc tế Tà Lùng",
          });
        }
      })
      .catch(() => {});
  }, []);

  const fetchAttachments = async (taskId: string) => {
    setAttachmentsLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/attachments`);
      if (res.ok) {
        const data = await res.json();
        setAttachments(data.data || []);
      }
    } catch (err) {
      console.error("Lỗi lấy danh sách tệp đính kèm:", err);
    } finally {
      setAttachmentsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTask) return;

    setUploadingFile(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("isSigned", "true");

    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/attachments`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể tải tệp lên");
      toast.success(`Đã tải lên tệp: ${file.name}`);
      await fetchAttachments(selectedTask.id);
    } catch (err: any) {
      toast.error(err.message || "Tải tệp thất bại");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!selectedTask) return;
    if (!confirm("Bạn có chắc chắn muốn xóa tệp đính kèm này khỏi hồ sơ?")) return;

    try {
      const res = await fetch(
        `/api/tasks/${selectedTask.id}/attachments?attachmentId=${attachmentId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể xóa tệp");
      toast.success("Đã xóa tệp đính kèm");
      await fetchAttachments(selectedTask.id);
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi xóa tệp");
    }
  };

  const handleSendReminder = async (taskId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRemindingTaskId(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/remind`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể gửi nhắc duyệt");
      toast.success(data.message || "Đã gửi thông báo nhắc duyệt tới Lãnh đạo phụ trách");
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi gửi thông báo nhắc duyệt");
    } finally {
      setRemindingTaskId(null);
    }
  };

  // F5 (YC-38): nhiệm vụ đã nghiệm thu/kết thúc ⇒ khóa mọi thao tác cập nhật ở giao diện
  // (server vẫn chặn là lớp bảo vệ chính — xem src/server/task-transitions.ts)
  const isTaskTerminal = (status?: string | null) =>
    status === "COMPLETED" || status === "DONE" || status === "CANCELED";

  const openDrawerForTask = (task: TaskItem) => {
    if (isTaskTerminal(task.status)) {
      toast.warning(
        "Nhiệm vụ đã được nghiệm thu — không thể cập nhật tiến độ hoặc nộp lại."
      );
      return;
    }
    setSelectedTask(task);
    // Tiến độ thật: 0/chưa ghi nhận mở đúng 0% (khớp cột Tiến độ); chỉ nhiệm vụ đã hoàn thành mới mặc định 100%
    // (nhiệm vụ kết thúc đã bị chặn ở trên ⇒ các nhánh "COMPLETED" không còn khả dụng)
    setDrawerProgress(task.progressPercent ?? 0);
    setDrawerStatus("IN_PROGRESS");
    setDrawerNotes(task.actualResultText || "");
    setActionSuccess(null);
    setActionError(null);
    setIsDrawerOpen(true);
    fetchAttachments(task.id);
  };

  const handleDrawerSubmit = async (finalSubmit: boolean) => {
    if (!selectedTask || drawerLoading) return;
    setDrawerLoading(true);
    setActionError(null);
    try {
      // 1. Submit progress update (YC-09: làm tròn về bước 5% gần nhất)
      const steppedProgress = finalSubmit ? 100 : Math.round(drawerProgress / 5) * 5;
      const updateRes = await fetch(`/api/tasks/${selectedTask.id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          progressPercent: steppedProgress,
          notes: drawerNotes || "Cập nhật tiến độ nghiệp vụ",
          newStatus: finalSubmit ? "WAITING_REVIEW" : drawerStatus,
          statusAfter: finalSubmit ? "WAITING_REVIEW" : drawerStatus,
        }),
      });

      if (!updateRes.ok) {
        const errJson = await updateRes.json();
        throw new Error(errJson.error || "Không thể cập nhật tiến độ");
      }

      const successMsg = finalSubmit
        ? "Đã nộp báo cáo kết quả và trình duyệt cấp trên thành công!"
        : "Đã cập nhật tiến độ công việc thành công!";
      setActionSuccess(successMsg);
      toast.success(successMsg);

      await fetchTasks();
      setTimeout(() => {
        setIsDrawerOpen(false);
      }, 900);
    } catch (err: any) {
      const errMsg = err.message || "Đã xảy ra lỗi trong quá trình xử lý";
      setActionError(errMsg);
      toast.error(errMsg);
    } finally {
      setDrawerLoading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isDrawerOpen) setIsDrawerOpen(false);
        if (isNewTaskModalOpen) setIsNewTaskModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawerOpen, isNewTaskModalOpen]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    // YC-04: một thao tác chỉ gửi một request
    if (!newTaskTitle.trim() || isCreatingPersonal) return;
    setIsCreatingPersonal(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          priority: newTaskPriority,
          currentDeadline: vnLocalToUtcIso(newTaskDeadline, newTaskTime),
          description: `Nguồn: ${originLabel(newTaskSource)}`,
          originKind: newTaskSource,
          status: "IN_PROGRESS",
          progressPercent: 0,
          // YC-38B/YC-38C: nguồn công việc + khoá idempotency (chống bấm trùng)
          catalogEntryId: newTaskCatalogEntry?.id || undefined,
          productItemId: newTaskProduct?.id || undefined,
          idempotencyKey: newTaskIdempotencyKey,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setIsNewTaskModalOpen(false);
        setNewTaskTitle("");
        setNewTaskCatalogEntry(null);
        setNewTaskProduct(null);
        setNewTaskIdempotencyKey(
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        );
        await fetchTasks();
        toast.success(
          json.deduplicated
            ? "Công việc vừa được tạo (hệ thống chặn bấm trùng)"
            : "Đã khởi tạo và thêm thành công công việc mới!"
        );
      } else {
        toast.error(json.error || "Không thể tạo công việc");
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối máy chủ: " + (err.message || "Không thể tạo công việc"));
    } finally {
      setIsCreatingPersonal(false);
    }
  };

  // Đợt A: xác nhận đã nhận việc (chỉ khi chưa bắt đầu)
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const handleAcceptTask = async (task: TaskItem) => {
    if (acceptingId) return;
    setAcceptingId(task.id);
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, action: "ACCEPT_TASK" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(json.message || "Đã xác nhận nhận việc!");
        await fetchTasks();
      } else {
        toast.error(json.error || "Không thể nhận việc");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setAcceptingId(null);
    }
  };
  // Lãnh đạo/Trưởng nhóm: mở sửa giao việc với đúng dữ liệu đang lưu
  const openEditAssign = (task: TaskItem) => {
    setEditTask(task);
    setEditTitle(task.title || "");
    setEditOwnerId(task.owner?.id || "");
    setEditCollabs((task.assignees || []).map((a) => a.person.id));
    // YC-38 UAT fix: nạp giờ Việt Nam vào ô datetime-local (không theo múi giờ thiết bị)
    setEditDeadline(utcIsoToVnInputValue(task.currentDeadline));    setEditPriority(task.priority || "Cao");
  };

  // Lãnh đạo/Trưởng nhóm: lưu sửa giao việc (backend phân quyền + lưu vết)
  // Dùng API chi tiết (hỗ trợ đổi tiêu đề/chủ trì/hạn/ưu tiên/phối hợp), không tạo Task mới
  const handleEditAssignSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTask || editSaving || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/tasks/${editTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          ownerId: editOwnerId || undefined,
          assigneeIds: editCollabs,
          currentDeadline: editDeadline ? vnLocalToUtcIso(editDeadline) : undefined,
          priority: editPriority,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Đã lưu sửa giao việc (ghi nhận lịch sử thay đổi)");
        setEditTask(null);
        await fetchTasks();
      } else {
        toast.error(json.error || "Không thể lưu sửa giao việc");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setEditSaving(false);
    }
  };

  // Lãnh đạo/Trưởng nhóm: duyệt hoàn thành ngay trên mobile (chỉ khi chờ duyệt)
  const handleApproveTask = async (task: TaskItem) => {
    if (approvingId) return;
    if (!confirm(`Duyệt hoàn thành nhiệm vụ [${task.code}] ${task.title}?`)) return;
    setApprovingId(task.id);
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, action: "CONFIRM_COMPLETION" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Đã duyệt hoàn thành nhiệm vụ!");
        await fetchTasks();
      } else {
        toast.error(json.error || "Không thể duyệt nhiệm vụ");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setApprovingId(null);
    }
  };

  // Filter tasks based on tabs and query
  // Bộ lọc thời gian theo ca/kỳ (nút Hôm nay / Tuần này / Tháng / Tất cả có onClick thật)
  // Mặc định Tất cả để không giấu việc (đúng như trước khi sửa)
  const [timeFilter, setTimeFilter] = useState<"DAY" | "WEEK" | "MONTH" | "ALL">("ALL");
  const inTimeRange = (task: TaskItem): boolean => {
    if (timeFilter === "ALL") return true;
    const dl = new Date(task.currentDeadline);
    if (isNaN(dl.getTime())) return false;
    const now = new Date();
    if (timeFilter === "DAY") {
      return dl.getFullYear() === now.getFullYear() && dl.getMonth() === now.getMonth() && dl.getDate() === now.getDate();
    }
    if (timeFilter === "MONTH") {
      return dl.getFullYear() === now.getFullYear() && dl.getMonth() === now.getMonth();
    }
    // WEEK: Thứ 2 → Chủ nhật chứa hôm nay
    const start = new Date(now);
    const day = (now.getDay() + 6) % 7;
    start.setDate(now.getDate() - day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return dl >= start && dl < end;
  };
  const filteredTasks = tasks.filter((task) => {
    // Ô tìm kiếm cũ (giữ nguyên) + bộ lọc Nhật ký công việc (thời gian / nguồn / trạng thái)
    const matchesSearch =
      task.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.title.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (!inTimeRange(task)) return false;

    // Bộ lọc Nhật ký công việc
    const range = journalPeriodRange(journalFilter.period);
    if (!journalDateInRange(task.currentDeadline, null, range)) return false;
    if (
      !journalTextMatches(
        journalFilter.query,
        task.code,
        task.title,
        task.description
      )
    ) {
      return false;
    }
    // Nguồn: "Công việc phát sinh" = nhiệm vụ được giao (Task);
    //        "Công việc từ kế hoạch" = đầu việc kế hoạch (PersonalWorkItem, hiển thị ở MyWorkItemsSection).
    if (journalFilter.source === "plan") return false;
    if (journalFilter.status === "active") {
      return task.status !== "COMPLETED" && task.status !== "CANCELED" && !task.isOverdue;
    }
    if (journalFilter.status === "overdue") return !!task.isOverdue || !!task.hasIssue;
    if (journalFilter.status === "done") return task.status === "COMPLETED";

    if (activeTab === "ALL") return true;
    if (activeTab === "IN_PROGRESS") return task.status === "IN_PROGRESS" || task.status === "NOT_STARTED";
    if (activeTab === "WAITING_REVIEW") return task.status === "WAITING_REVIEW";
    if (activeTab === "OVERDUE") return task.isOverdue || task.hasIssue;
    if (activeTab === "COMPLETED") return task.status === "COMPLETED";
    return true;
  });

  const overdueTask = tasks.find((t) => t.isOverdue || t.hasIssue);

  return (
    <div className="w-full min-h-screen bg-app-bg pb-12">
      {/* =========================================================================
          DESKTOP VIEW (Pixel-accurate Google Stitch ID a1afd1c794c6454a8e161b43f25f4024)
          ========================================================================= */}
      <div className="hidden lg:flex flex-col gap-space-lg p-space-lg">
        {/* BANNER CẢNH BÁO VIỆC QUÁ HẠN & GIẢI TRÌNH */}
        {overdueTask && (
          <section className="bg-status-danger-bg rounded-xl p-space-md shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md border border-status-danger/20 transition-panel">
            <div className="flex items-start gap-space-md">
              <div className="w-10 h-10 rounded-lg bg-status-danger/10 text-status-danger flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">warning</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-space-xs flex-wrap">
                  <span className="font-label-sm text-label-sm bg-status-danger text-on-error px-2 py-0.5 rounded font-bold">
                    CẢNH BÁO QUÁ HẠN
                  </span>
                  <span className="font-body-semibold text-body-semibold text-status-danger">
                    Đầu việc {overdueTask.code}: {overdueTask.title}
                  </span>
                  <span className="font-label-sm text-label-sm text-outline">· Đã trễ hạn nghiệp vụ</span>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
                  Quy chế nghiệp vụ yêu cầu hoàn thành giải trình chậm hạn hoặc gửi phiếu đề xuất gia hạn trình Trưởng bộ phận trước 15:00 hôm nay.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-space-sm shrink-0 w-full md:w-auto justify-end">
              <button
                onClick={() => openDrawerForTask(overdueTask)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-lowest text-status-danger font-label-md text-label-md hover:bg-status-danger hover:text-on-error transition-fast shadow-sm active-press"
              >
                <span className="material-symbols-outlined text-[18px]">assignment_late</span>
                <span>Giải trình chậm hạn</span>
              </button>
              <button
                onClick={() => openDrawerForTask(overdueTask)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-danger text-on-error font-label-md text-label-md hover:opacity-90 transition-fast shadow-sm active-press"
              >
                <span className="material-symbols-outlined text-[18px]">more_time</span>
                <span>Xin gia hạn khẩn</span>
              </button>
            </div>
          </section>
        )}

        {/* HEADER KHU VỰC LÀM VIỆC & THAO TÁC NHANH */}
        <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md border border-border-default/50">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-space-xs text-outline">
                <span className="font-label-sm text-label-sm uppercase tracking-wide text-secondary font-bold">
                  TÁC NGHIỆP CÁ NHÂN
                </span>
                <span>•</span>
                <span className="font-label-sm text-label-sm">HẢI QUAN CỬA KHẨU QUỐC TẾ TÀ LÙNG</span>
                <span>•</span>
                <span className="font-label-sm text-label-sm text-status-success font-semibold">
                  CA TRỰC CHÍNH 07:30 - 17:00
                </span>
              </div>
              <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
                Nhật ký công việc — Không Gian Tác Nghiệp Cán Bộ
              </h1>
              <div className="flex items-center gap-space-md mt-1 flex-wrap">
                <div className="inline-flex items-center gap-2 bg-surface-subtle px-3 py-1 rounded-lg">
                  <span className="material-symbols-outlined text-secondary text-[18px]">badge</span>
                  <span className="font-body-semibold text-body-semibold text-primary">{currentUser.fullName}</span>
                  <span className="font-label-sm text-label-sm text-outline">Mã: {currentUser.personCode}</span>
                </div>
                <span className="font-label-md text-label-md text-on-surface-variant">
                  {currentUser.positionTitle} · <strong>{currentUser.unitName}</strong>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-label-sm font-label-sm bg-status-success-bg text-status-success font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-success" />
                  Sẵn sàng xử lý
                </span>
              </div>
            </div>

            <div className="flex items-center gap-space-sm flex-wrap self-start lg:self-auto">
              <button
                onClick={() => setIsNewTaskModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-on-secondary font-label-md text-label-md hover:bg-secondary/90 transition-fast shadow-sm active-press font-semibold"
              >
                <span className="material-symbols-outlined text-[18px]">add_task</span>
                <span>+ Thêm việc mới (Tùy biến)</span>
              </button>
              <Link
                href="/routine"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-subtle text-primary font-label-md text-label-md hover:bg-surface-container transition-fast active-press"
              >
                <span className="material-symbols-outlined text-[18px]">history_edu</span>
                <span>Nhật ký tác nghiệp</span>
              </Link>
              <button
                onClick={() => fetchTasks()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-subtle text-on-surface-variant font-label-md text-label-md hover:bg-surface-container transition-fast active-press"
              >
                <span className="material-symbols-outlined text-[18px]">sync</span>
                <span>Làm mới</span>
              </button>
            </div>
          </div>

          {/* BỘ LỌC THỜI GIAN THEO CA/KỲ TÁC NGHIỆP */}
          <div data-tour="time-filter" className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pt-space-sm bg-surface-container-low p-space-sm rounded-lg">
            <div className="flex items-center gap-1 bg-surface-container-lowest p-1 rounded-lg shadow-sm">
              <button
                onClick={() => setTimeFilter("DAY")}
                className={`px-3 py-1.5 rounded font-label-md text-label-md transition-fast ${timeFilter === "DAY" ? "bg-secondary text-on-secondary shadow-sm font-semibold" : "text-on-surface-variant hover:text-primary hover:bg-surface-subtle"}`}
              >
                Hôm nay ({todayLabel})
              </button>
              <button
                onClick={() => setTimeFilter("WEEK")}
                className={`px-3 py-1.5 rounded font-label-md text-label-md transition-fast ${timeFilter === "WEEK" ? "bg-secondary text-on-secondary shadow-sm font-semibold" : "text-on-surface-variant hover:text-primary hover:bg-surface-subtle"}`}
              >
                Tuần này ({periodLabels.weekShort})
              </button>
              <button
                onClick={() => setTimeFilter("MONTH")}
                className={`px-3 py-1.5 rounded font-label-md text-label-md transition-fast ${timeFilter === "MONTH" ? "bg-secondary text-on-secondary shadow-sm font-semibold" : "text-on-surface-variant hover:text-primary hover:bg-surface-subtle"}`}
              >
                {periodLabels.monthShort}
              </button>
              <button
                onClick={() => setTimeFilter("ALL")}
                className={`px-3 py-1.5 rounded font-label-md text-label-md transition-fast ${timeFilter === "ALL" ? "bg-secondary text-on-secondary shadow-sm font-semibold" : "text-on-surface-variant hover:text-primary hover:bg-surface-subtle"}`}
              >
                Tất cả nhiệm vụ
              </button>
            </div>
            <div className="flex items-center gap-3 text-outline font-label-sm text-label-sm px-2">
              <span className="flex items-center gap-1 text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px] text-secondary">update</span>
                Đồng bộ lúc: {lastSyncAt ? lastSyncAt.toLocaleTimeString("vi-VN") : "chưa đồng bộ"}
              </span>
              <button
                onClick={() => fetchTasks({ page: 1 })}
                className="p-1 hover:text-primary transition-fast"
                title="Tải lại dữ liệu"
              >
                <span className="material-symbols-outlined text-[16px]">sync</span>
              </button>
            </div>
          </div>
        </section>

        {/* THANH SỐ LIỆU TỔNG QUAN HÔM NAY (4 KPI CARDS) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
          {/* Card 1 */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between hover-lift border border-border-default/40">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface-variant">Cần xử lý hôm nay</span>
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[20px]">assignment</span>
              </div>
            </div>
            <div className="my-space-sm flex items-baseline gap-2">
              <span className="font-headline-xl text-headline-xl text-primary font-bold">
                {String(myStats.active).padStart(2, "0")}
              </span>
              <span className="font-label-sm text-label-sm text-outline">đầu việc</span>
            </div>
            <div className="flex items-center justify-between pt-space-xs bg-surface-container-low px-2 py-1 rounded">
              <span className="font-label-sm text-label-sm text-status-danger font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">priority_high</span> {String(myStats.high).padStart(2, "0")} việc ưu tiên cao
              </span>
              <span className="font-label-sm text-label-sm text-outline">{String(myStats.done).padStart(2, "0")} đã xong</span>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between hover-lift border border-border-default/40">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface-variant">Sắp đến hạn / Hôm nay</span>
              <div className="w-8 h-8 rounded-lg bg-status-warning-bg flex items-center justify-center text-status-warning">
                <span className="material-symbols-outlined text-[20px]">schedule</span>
              </div>
            </div>
            <div className="my-space-sm flex items-baseline gap-2">
              <span className="font-headline-xl text-headline-xl text-status-warning font-bold">{String(myStats.dueSoon).padStart(2, "0")}</span>
              <span className="font-label-sm text-label-sm text-outline">nhiệm vụ</span>
            </div>
            <div className="flex items-center justify-between pt-space-xs bg-status-warning-bg/40 px-2 py-1 rounded">
              <span className="font-label-sm text-label-sm text-status-warning font-semibold">
                Hạn trong 24 giờ tới
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">{myStats.dueSoon > 0 ? "Cần xử lý" : "Không có việc gấp"}</span>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between hover-lift border border-border-default/40">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface-variant">Quá hạn / Cần giải trình</span>
              <div className="w-8 h-8 rounded-lg bg-status-danger-bg flex items-center justify-center text-status-danger">
                <span className="material-symbols-outlined text-[20px]">error_outline</span>
              </div>
            </div>
            <div className="my-space-sm flex items-baseline gap-2">
              <span className="font-headline-xl text-headline-xl text-status-danger font-bold">
                {String(myStats.overdue).padStart(2, "0")}
              </span>
              <span className="font-label-sm text-label-sm text-outline">hồ sơ trễ</span>
            </div>
            <div className="flex items-center justify-between pt-space-xs bg-status-danger-bg/50 px-2 py-1 rounded">
              <button
                onClick={() => overdueTask && openDrawerForTask(overdueTask)}
                className="font-label-sm text-label-sm text-status-danger hover:underline font-semibold flex items-center gap-1 active-press"
              >
                <span className="material-symbols-outlined text-[14px]">edit_note</span> Giải trình ngay
              </button>
              <span className="font-label-sm text-label-sm text-status-danger">{myStats.overdue > 0 ? `Chậm ${myStats.maxOverdueDays} ngày` : "Không trễ hạn"}</span>
            </div>
          </div>

          {/* Card 4 */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between hover-lift border border-border-default/40">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface-variant">Chờ phối hợp &amp; Phê duyệt</span>
              <div className="w-8 h-8 rounded-lg bg-status-unassigned-bg flex items-center justify-center text-status-unassigned">
                <span className="material-symbols-outlined text-[20px]">verified</span>
              </div>
            </div>
            <div className="my-space-sm flex items-baseline gap-2">
              <span className="font-headline-xl text-headline-xl text-primary font-bold">
                {String(myStats.waiting).padStart(2, "0")}
              </span>
              <span className="font-label-sm text-label-sm text-outline">đã nộp kết quả</span>
            </div>
            <div className="flex items-center justify-between pt-space-xs bg-status-unassigned-bg px-2 py-1 rounded">
              <span className="font-label-sm text-label-sm text-status-unassigned font-semibold">
                Chờ Trưởng BP ký
              </span>
              <span className="font-label-sm text-label-sm text-outline">Đang duyệt</span>
            </div>
          </div>
        </section>

        {/* YC-30 (bổ sung): NHẬT KÝ CÔNG VIỆC — bộ lọc dùng chung cho cả 2 nguồn dữ liệu */}
        <JournalFilterBar
          value={journalFilter}
          onChange={setJournalFilter}
          counts={{ total: tasks.length }}
        />

        {/* YC-31/YC-32: đầu việc kế hoạch — hạn, ngày hoàn thành, minh chứng */}
        <MyWorkItemsSection personId={currentUser.personId} journalFilter={journalFilter} />

        {/* KHU VỰC DANH SÁCH CÔNG VIỆC CÁ NHÂN VÀ TÁC NGHIỆP TRỰC TIẾP */}
        <section data-tour="task-list" className="bg-surface-container-lowest rounded-xl shadow-sm flex flex-col overflow-hidden border border-border-default/50">
          {/* TAB ĐIỀU HƯỚNG TRẠNG THÁI & TÌM KIẾM NHANH */}
          <div className="p-space-md bg-surface-subtle flex flex-col md:flex-row md:items-center justify-between gap-space-md border-b border-border-default">
            <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
              <button
                onClick={() => setActiveTab("ALL")}
                className={`px-3 py-1.5 rounded font-label-md text-label-md font-semibold shrink-0 transition-fast ${
                  activeTab === "ALL"
                    ? "bg-secondary text-on-secondary shadow-sm"
                    : "text-on-surface-variant hover:text-primary hover:bg-surface-container"
                }`}
              >
                Tất cả ({tasks.length})
              </button>
              <button
                onClick={() => setActiveTab("IN_PROGRESS")}
                className={`px-3 py-1.5 rounded font-label-md text-label-md shrink-0 transition-fast ${
                  activeTab === "IN_PROGRESS"
                    ? "bg-secondary text-on-secondary shadow-sm font-semibold"
                    : "text-on-surface-variant hover:text-primary hover:bg-surface-container"
                }`}
              >
                Đang thực hiện ({tasks.filter((t) => t.status === "IN_PROGRESS" || t.status === "NOT_STARTED").length})
              </button>
              <button
                onClick={() => setActiveTab("OVERDUE")}
                className={`px-3 py-1.5 rounded font-label-md text-label-md shrink-0 transition-fast ${
                  activeTab === "OVERDUE"
                    ? "bg-status-danger text-on-error shadow-sm font-semibold"
                    : "text-status-danger bg-status-danger-bg/80 font-semibold"
                }`}
              >
                Sắp hạn / Quá hạn ({tasks.filter((t) => t.isOverdue || t.hasIssue).length})
              </button>
              <button
                onClick={() => setActiveTab("WAITING_REVIEW")}
                className={`px-3 py-1.5 rounded font-label-md text-label-md shrink-0 transition-fast ${
                  activeTab === "WAITING_REVIEW"
                    ? "bg-secondary text-on-secondary shadow-sm font-semibold"
                    : "text-on-surface-variant hover:text-primary hover:bg-surface-container"
                }`}
              >
                Chờ xác nhận ({tasks.filter((t) => t.status === "WAITING_REVIEW").length})
              </button>
              <button
                onClick={() => setActiveTab("COMPLETED")}
                className={`px-3 py-1.5 rounded font-label-md text-label-md shrink-0 transition-fast ${
                  activeTab === "COMPLETED"
                    ? "bg-secondary text-on-secondary shadow-sm font-semibold"
                    : "text-on-surface-variant hover:text-primary hover:bg-surface-container"
                }`}
              >
                Đã hoàn thành ({tasks.filter((t) => t.status === "COMPLETED").length})
              </button>
            </div>
            <div className="flex items-center gap-space-sm shrink-0">
              <div className="relative w-full sm:w-64">
                <span className="material-symbols-outlined absolute left-2.5 top-2 text-outline text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo mã việc, tên việc..."
                  className="w-full h-8 pl-8 pr-3 rounded bg-surface-container-lowest text-body-md font-body-md text-on-surface placeholder:text-outline border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary transition-fast"
                />
              </div>
              <button
                onClick={() => fetchTasks()}
                className="h-8 px-2.5 rounded bg-surface-container-lowest text-on-surface-variant font-label-md text-label-md hover:bg-surface-container flex items-center gap-1 shadow-sm border border-border-subtle transition-fast active-press"
              >
                <span className="material-symbols-outlined text-[16px]">tune</span>
                <span className="hidden sm:inline">Phân loại</span>
              </button>
            </div>
          </div>

          {/* BẢNG TÁC NGHIỆP CHI TIẾT & QUICK ACTIONS */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-subtle text-primary font-table-header text-table-header border-b border-border-default">
                  <th className="py-3 px-space-md w-[260px]">MÃ &amp; TÊN ĐẦU VIỆC</th>
                  <th className="py-3 px-space-sm w-[170px]">NGUỒN &amp; DANH MỤC</th>
                  <th className="py-3 px-space-sm w-[160px]">HẠN CHÓT</th>
                  <th className="py-3 px-space-sm w-[110px]">ƯU TIÊN</th>
                  <th className="py-3 px-space-sm w-[160px]">PHỐI HỢP</th>
                  <th className="py-3 px-space-sm w-[150px]">TIẾN ĐỘ</th>
                  <th className="py-3 px-space-md text-right w-[240px]">THAO TÁC TRỰC TIẾP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container font-table-data text-table-data text-on-surface">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-outline">
                      Chưa có công việc nào trong danh mục lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task, idx) => {
                    const isOverdue = task.isOverdue || task.hasIssue;
                    const isWaiting = task.status === "WAITING_REVIEW";
                    const isCompleted = task.status === "COMPLETED";

                    return (
                      <tr
                        key={task.id}
                        className={`hover:bg-surface-container-low transition-fast ${
                          idx === 0 ? "bg-secondary-fixed/10" : ""
                        }`}
                      >
                        <td className="py-3 px-space-md align-top">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-body-semibold text-body-semibold text-primary font-bold">
                                {task.code}
                              </span>
                              <span className="font-label-sm text-[11px] px-1.5 py-0.5 rounded bg-secondary/10 text-secondary font-semibold">
                                {task.planLinks?.[0]?.planItem?.plan?.title || "Kế hoạch tuần"}
                              </span>
                            </div>
                            <span
                              onClick={() => openDrawerForTask(task)}
                              className="font-body-semibold text-body-semibold text-on-surface leading-tight hover:text-secondary cursor-pointer"
                            >
                              {task.title}
                            </span>
                            <span className="font-label-sm text-label-sm text-outline">
                              {task.description || "Nhiệm vụ trực tiếp"}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-space-sm align-top">
                          <div className="flex flex-col">
                            {/* YC-38 UAT fix: hien thi ma TX thuoc (bo nhan "TTHQ-ĐT" hard-code) */}
                            <TxSourceBadge source={task.txSource} />
                            <span className="font-label-sm text-[11px] text-outline">
                              {originLabel(task.originKind)}
                            </span>
                            <span className="text-on-surface-variant font-label-sm text-[12px] truncate max-w-[150px]">
                              {task.expectedResultText || "Theo quy trình hải quan"}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-space-sm align-top">
                          <div className="flex flex-col">
                            {isOverdue ? (
                              <>
                                <span className="font-body-semibold text-body-semibold text-status-danger">
                                  {formatDateTime(task.currentDeadline)}
                                </span>
                                <span className="font-label-sm text-label-sm text-status-danger font-semibold flex items-center gap-0.5">
                                  <span className="material-symbols-outlined text-[13px]">warning</span>
                                  Chậm tiến độ
                                </span>
                              </>
                            ) : isCompleted ? (
                              <>
                                <span className="font-body-semibold text-body-semibold text-status-success">
                                  Đã hoàn tất
                                </span>
                                <span className="font-label-sm text-label-sm text-outline">
                                  Hoàn thành 100%
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="font-body-semibold text-body-semibold text-primary">
                                  {formatDateTime(task.currentDeadline)}
                                </span>
                                <span className="font-label-sm text-label-sm text-status-warning font-semibold">
                                  Đang xử lý
                                </span>
                              </>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-space-sm align-top">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-label-sm font-label-sm font-semibold ${
                              task.priority === "Cao" || task.priority === "Khẩn"
                                ? "bg-status-danger-bg text-status-danger"
                                : "bg-surface-container text-on-surface-variant"
                            }`}
                          >
                            <span className="material-symbols-outlined text-[14px]">flag</span>
                            {task.priority}
                          </span>
                        </td>

                        <td className="py-3 px-space-sm align-top">
                          <div className="flex flex-col">
                            <span className="font-label-sm text-label-sm text-primary font-semibold">
                              {task.owner?.fullName || currentUser.fullName}
                            </span>
                            <span className="text-on-surface-variant font-label-sm text-[11px]">
                              {task.unit?.name || currentUser.unitName || "Hải quan cửa khẩu Quốc tế Tà Lùng"}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-space-sm align-top">
                          {isWaiting ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-label-sm font-label-sm bg-status-unassigned-bg text-status-unassigned font-semibold">
                              <span className="material-symbols-outlined text-[14px]">hourglass_top</span> Chờ ký duyệt
                            </span>
                          ) : isCompleted ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-label-sm font-label-sm bg-status-success-bg text-status-success font-semibold">
                              <span className="material-symbols-outlined text-[14px]">check_circle</span> 100% Đạt
                            </span>
                          ) : (
                            <div className="flex flex-col gap-1 w-28">
                              <div className="flex items-center justify-between text-label-sm">
                                <span className="text-secondary font-semibold">
                                  {task.progressPercent ?? (isCompleted ? 100 : 0)}%
                                </span>
                                <span className="text-outline">Đang chạy</span>
                              </div>
                              <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-secondary h-full rounded-full transition-all duration-300"
                                  style={{ width: `${task.progressPercent ?? (isCompleted ? 100 : 0)}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-space-md align-top text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {isWaiting ? (
                              <button
                                onClick={(e) => handleSendReminder(task.id, e)}
                                disabled={remindingTaskId === task.id}
                                className="px-2.5 py-1 rounded bg-surface-subtle text-on-surface font-label-sm text-label-sm hover:bg-surface-container flex items-center gap-1 active-press disabled:opacity-50"
                                title="Gửi thông báo nhắc Trưởng bộ phận phê duyệt"
                              >
                                <span className={`material-symbols-outlined text-[14px] ${remindingTaskId === task.id ? "animate-spin" : ""}`}>
                                  {remindingTaskId === task.id ? "progress_activity" : "notifications_active"}
                                </span>
                                <span>{remindingTaskId === task.id ? "Đang gửi..." : "Nhắc duyệt"}</span>
                              </button>
                            ) : !isTaskTerminal(task.status) ? (
                              <button
                                onClick={() => openDrawerForTask(task)}
                                className="px-2.5 py-1 rounded bg-secondary text-on-secondary font-label-sm text-label-sm hover:bg-secondary/90 shadow-sm flex items-center gap-1 active-press font-semibold"
                              >
                                <span className="material-symbols-outlined text-[14px]">fact_check</span>
                                <span>Tác nghiệp 1 chạm</span>
                              </button>
                            ) : null}

                            <Link
                              href={`/tasks/${task.id}`}
                              className="p-1 rounded text-outline hover:text-primary hover:bg-surface-container transition-fast"
                              title="Xem chi tiết"
                            >
                              <span className="material-symbols-outlined text-[16px]">visibility</span>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* PHÂN TRANG BẢNG NGHIỆP VỤ (server, 50/trang) */}
          <div className="p-space-sm bg-surface-subtle flex flex-col sm:flex-row items-center justify-between text-label-sm text-on-surface-variant gap-space-sm border-t border-border-default">
            <div className="flex items-center gap-2">
              <span>Đã tải <strong>{tasks.length}</strong> trên tổng số <strong>{totalCount}</strong> nhiệm vụ</span>
            </div>
            {page < totalPages ? (
              <button
                onClick={() => fetchTasks({ page: page + 1, append: true })}
                disabled={loadingMore}
                className="px-4 py-1.5 rounded bg-secondary text-on-secondary font-semibold disabled:opacity-50 active-press"
              >
                {loadingMore ? "Đang tải..." : `Xem thêm (trang ${page + 1}/${totalPages})`}
              </button>
            ) : (
              <span className="text-xs text-outline">Đã hiển thị tất cả</span>
            )}
          </div>
        </section>

        {/* BẢNG NGUYÊN TẮC TÁC NGHIỆP & AUDIT TIMELINE TÓM TẮT */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-space-md">
          {/* KHỐI 1 & 2: NHẬT KÝ THAO TÁC AUDIT TRAIL GẦN NHẤT */}
          <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between border border-border-default/40">
            <div className="flex items-center justify-between pb-space-sm border-b border-surface-container">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">manage_history</span>
                <h2 className="font-headline-sm text-headline-sm text-primary">Nhật Ký Tác Nghiệp Cá Nhân Tự Động (Audit Trail)</h2>
              </div>
              <span className="font-label-sm text-label-sm text-outline">Ghi nhận UTC+7 (Hải quan cửa khẩu Quốc tế Tà Lùng)</span>
            </div>
            <div className="flex flex-col gap-space-sm my-space-sm">
              {recentActivity.length === 0 ? (
                <div className="text-xs text-outline text-center py-4">
                  Chưa có hoạt động nào. Cập nhật tiến độ công việc để ghi nhận tại đây.
                </div>
              ) : (
                recentActivity.map((a, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-2 rounded-lg bg-surface-container-low">
                    <span className="material-symbols-outlined text-secondary text-[18px] shrink-0 mt-0.5">update</span>
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-body-semibold text-body-semibold text-primary truncate">
                          [{a.taskCode}] {a.taskTitle}
                        </span>
                        <span className="font-label-sm text-[11px] text-outline shrink-0">
                          {new Date(a.at).toLocaleString("vi-VN")}
                        </span>
                      </div>
                      <p className="font-table-data text-[13px] text-on-surface-variant mt-0.5">
                        {a.author ? `${a.author}: ` : ""}{a.notes}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center justify-between pt-2 text-label-sm text-outline">
              <span>Toàn bộ hành vi tác nghiệp được lưu trữ vĩnh viễn trên máy chủ nội bộ.</span>
              <Link href="/admin/audit" className="text-secondary font-semibold hover:underline">
                Xem toàn bộ lịch sử (Audit Log)
              </Link>
            </div>
          </div>

          {/* KHỐI 3: HƯỚNG DẪN THAO TÁC NHANH */}
          <div className="bg-primary text-on-primary rounded-xl p-space-md shadow-sm flex flex-col justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-secondary-fixed">
                <span className="material-symbols-outlined text-[22px]">policy</span>
                <h3 className="font-headline-sm text-headline-sm">Hướng dẫn thao tác</h3>
              </div>
              <p className="font-body-md text-body-md text-on-primary-container leading-relaxed">
                Cập nhật tiến độ thường xuyên để lãnh đạo nắm tình hình và hỗ trợ kịp thời.
              </p>
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-secondary-fixed text-[18px] shrink-0 mt-0.5">check_circle</span>
                  <span className="font-label-md text-label-md text-surface-container-high">Xong việc: bấm Báo hoàn thành để trình nghiệm thu.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-secondary-fixed text-[18px] shrink-0 mt-0.5">check_circle</span>
                  <span className="font-label-md text-label-md text-surface-container-high">Cần thêm thời gian: xin lùi hạn kèm lý do, chờ phê duyệt.</span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-primary-container flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-on-primary-container">Cần hỗ trợ? Liên hệ quản trị hệ thống.</span>
              <span className="material-symbols-outlined text-secondary-fixed text-[18px]">support_agent</span>
            </div>
          </div>
        </section>
      </div>

      {/* =========================================================================
          MOBILE VIEW (Pixel-accurate Google Stitch ID 2443cdf63e214979b5a74c40779511ba)
          ========================================================================= */}
      <div className="lg:hidden flex flex-col w-full pb-16">
        {/* BANNER ĐIỀU HÀNH CHÍNH THỨC */}
        <div className="w-full bg-primary/10 border-b border-border-default/40 px-margin py-2 flex items-center justify-between gap-space-sm shadow-sm">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="material-symbols-outlined text-primary text-[16px] shrink-0">verified</span>
            <span className="font-label-sm text-primary truncate uppercase tracking-wider text-[11px] font-bold">
              KHÔNG GIAN LÀM VIỆC CÁ NHÂN — HẢI QUAN CỬA KHẨU QUỐC TẾ TÀ LÙNG
            </span>
          </div>
          <span
            title="Nhãn HỆ THỐNG vận hành chính thức — không phải xác nhận cho số liệu hiển thị."
            className="px-1.5 py-0.5 rounded bg-primary/15 text-primary font-label-sm text-[10px] shrink-0 font-bold"
          >
            {ENV_BADGE_LABEL}
          </span>
        </div>

        {/* PHẦN CHÀO & ĐƠN VỊ TÁC NGHIỆP */}
        <div className="px-margin pt-3 pb-2 flex items-center justify-between">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-status-success shrink-0" />
              <h2 className="font-headline-sm text-headline-sm text-primary truncate">Đ/c {currentUser.fullName}</h2>
            </div>
            <p className="font-label-md text-label-md text-on-surface-variant truncate">
              {currentUser.unitName || "Hải quan CKQT Tà Lùng"} • Trực ban tác nghiệp
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => fetchTasks()}
              aria-label="Làm mới tác vụ"
              className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary-container hover:bg-surface-container-high transition-fast active-press"
            >
              <span className="material-symbols-outlined text-[19px]">sync</span>
            </button>
          </div>
        </div>

        {/* CHỌN KỲ TÁC NGHIỆP (SEGMENTED PILLS) */}
        <div className="px-margin py-2">
          <div data-tour="time-filter" className="bg-surface-container p-1 rounded-lg flex items-center justify-between gap-1 shadow-inner">
            <button
              onClick={() => setTimeFilter("DAY")}
              className={`flex-1 py-1.5 px-2 rounded-md font-body-semibold text-label-md text-center shadow-sm flex items-center justify-center gap-1 transition-fast ${timeFilter === "DAY" ? "bg-secondary text-on-secondary" : "text-on-surface-variant"}`}
            >
              <span className="material-symbols-outlined text-[15px]">event</span>
              <span>Hôm nay ({todayShort || "..."})</span>
            </button>
            <button
              onClick={() => setTimeFilter("WEEK")}
              className={`flex-1 py-1.5 px-2 rounded-md font-label-md text-label-md text-center transition-fast ${timeFilter === "WEEK" ? "bg-secondary text-on-secondary font-body-semibold shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}
            >
              {periodLabels.weekShort}
            </button>
            <button
              onClick={() => setTimeFilter("MONTH")}
              className={`flex-1 py-1.5 px-2 rounded-md font-label-md text-label-md text-center transition-fast ${timeFilter === "MONTH" ? "bg-secondary text-on-secondary font-body-semibold shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}
            >
              {periodLabels.monthShort}
            </button>
            <button
              onClick={() => setTimeFilter("ALL")}
              className={`flex-1 py-1.5 px-2 rounded-md font-label-md text-label-md text-center transition-fast ${timeFilter === "ALL" ? "bg-secondary text-on-secondary font-body-semibold shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}
            >
              Tất cả
            </button>
          </div>
        </div>

        {/* THỐNG KÊ NHANH TÁC VỤ CÁ NHÂN (GRID 2x2 ĐẶC THÙ NGHIỆP VỤ) — số liệu THẬT từ tasks */}
        <div className="px-margin py-2">
          <div className="grid grid-cols-2 gap-2.5">
            {/* Card 1: Cần xử lý hôm nay */}
            <div className="bg-surface-container-lowest p-3 rounded-lg shadow-sm flex flex-col justify-between border border-border-default/40">
              <div className="flex items-center justify-between">
                <span className="font-label-md text-label-md text-on-surface-variant">Cần xử lý hôm nay</span>
                <span className="w-6 h-6 rounded bg-primary-container/10 text-primary-container flex items-center justify-center">
                  <span className="material-symbols-outlined text-[15px]">assignment</span>
                </span>
              </div>
              <div className="my-1.5 flex items-baseline gap-1.5">
                <span className="font-headline-xl text-headline-xl text-primary font-bold">
                  {String(myStats.active).padStart(2, "0")}
                </span>
                <span className="font-label-sm text-label-sm text-status-danger font-medium">
                  {myStats.high > 0 ? `${myStats.high} việc ưu tiên cao` : "Không có việc gấp"}
                </span>
              </div>
              <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${myStats.active > 0 ? Math.round((myStats.high / myStats.active) * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* Card 2: Sắp đến hạn */}
            <div className="bg-surface-container-lowest p-3 rounded-lg shadow-sm flex flex-col justify-between border border-border-default/40">
              <div className="flex items-center justify-between">
                <span className="font-label-md text-label-md text-on-surface-variant">Sắp đến hạn</span>
                <span className="w-6 h-6 rounded bg-status-warning-bg text-status-warning flex items-center justify-center">
                  <span className="material-symbols-outlined text-[15px]">alarm</span>
                </span>
              </div>
              <div className="my-1.5 flex items-baseline gap-1.5">
                <span className="font-headline-xl text-headline-xl text-status-warning font-bold">
                  {String(myStats.dueSoon).padStart(2, "0")}
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">trong 24 giờ tới</span>
              </div>
              <span className="font-label-sm text-[11px] text-status-warning font-medium truncate">
                {myStats.dueSoon > 0 ? "Cần xử lý" : "Không có việc gấp"}
              </span>
            </div>

            {/* Card 3: Quá hạn */}
            <div className="bg-status-danger-bg p-3 rounded-lg shadow-sm flex flex-col justify-between border border-status-danger/20">
              <div className="flex items-center justify-between">
                <span className="font-label-md text-label-md text-status-danger font-semibold">Quá hạn xử lý</span>
                <span className="w-6 h-6 rounded bg-status-danger/10 text-status-danger flex items-center justify-center">
                  <span className="material-symbols-outlined text-[15px]">priority_high</span>
                </span>
              </div>
              <div className="my-1.5 flex items-baseline gap-1.5">
                <span className="font-headline-xl text-headline-xl text-status-danger font-bold">
                  {String(myStats.overdue).padStart(2, "0")}
                </span>
                <span className="font-label-sm text-label-sm text-status-danger">
                  {myStats.overdue > 0 ? (overdueTask?.code || "hồ sơ trễ") : "Không trễ hạn"}
                </span>
              </div>
              <span className="font-label-sm text-[11px] text-status-danger font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">gavel</span>
                {myStats.overdue > 0 ? `Chậm ${myStats.maxOverdueDays} ngày • Cần giải trình` : "Đúng hạn"}
              </span>
            </div>

            {/* Card 4: Chờ xác nhận */}
            <div className="bg-surface-container-lowest p-3 rounded-lg shadow-sm flex flex-col justify-between border border-border-default/40">
              <div className="flex items-center justify-between">
                <span className="font-label-md text-label-md text-on-surface-variant">Chờ xác nhận</span>
                <span className="w-6 h-6 rounded bg-status-unassigned-bg text-status-unassigned flex items-center justify-center">
                  <span className="material-symbols-outlined text-[15px]">hourglass_top</span>
                </span>
              </div>
              <div className="my-1.5 flex items-baseline gap-1.5">
                <span className="font-headline-xl text-headline-xl text-status-unassigned font-bold">
                  {String(myStats.waiting).padStart(2, "0")}
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">đầu việc</span>
              </div>
              <span className="font-label-sm text-[11px] text-status-unassigned font-medium truncate">
                {myStats.waiting > 0 ? "Chờ Trưởng BP duyệt" : "Không có hồ sơ chờ duyệt"}
              </span>
            </div>
          </div>
        </div>

        {/* YC-30 (bổ sung): NHẬT KÝ CÔNG VIỆC — bộ lọc dùng chung (mobile) */}
        <div className="px-margin py-2">
          <JournalFilterBar
            value={journalFilter}
            onChange={setJournalFilter}
            counts={{ total: tasks.length }}
          />
        </div>

        {/* YC-31/YC-32: đầu việc kế hoạch — hạn, ngày hoàn thành, minh chứng (bản mobile) */}
        <div className="px-margin py-2">
          <MyWorkItemsSection personId={currentUser.personId} journalFilter={journalFilter} />
        </div>

        {/* TAB TRẠNG THÁI CÔNG VIỆC (HORIZONTAL SCROLL CHIPS) */}
        <div className="py-2.5">
          <div className="flex items-center gap-2 overflow-x-auto px-margin no-scrollbar">
            <button
              onClick={() => setActiveTab("ALL")}
              className={`px-3 py-1.5 rounded-full font-body-semibold text-label-md shrink-0 flex items-center gap-1.5 shadow-sm transition-fast ${
                activeTab === "ALL"
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container text-on-surface-variant"
              }`}
            >
              <span>Tất cả</span>
            </button>
            <button
              onClick={() => setActiveTab("IN_PROGRESS")}
              className={`px-3 py-1.5 rounded-full font-body-semibold text-label-md shrink-0 transition-fast ${
                activeTab === "IN_PROGRESS"
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container text-on-surface-variant"
              }`}
            >
              <span>Đang làm ({myStats.active})</span>
            </button>
            <button
              onClick={() => setActiveTab("OVERDUE")}
              className={`px-3 py-1.5 rounded-full font-body-semibold text-label-md shrink-0 transition-fast ${
                activeTab === "OVERDUE"
                  ? "bg-status-danger text-on-error"
                  : "bg-status-danger-bg text-status-danger"
              }`}
            >
              <span>Quá hạn ({myStats.overdue})</span>
            </button>
            <button
              onClick={() => setActiveTab("WAITING_REVIEW")}
              className={`px-3 py-1.5 rounded-full font-body-semibold text-label-md shrink-0 transition-fast ${
                activeTab === "WAITING_REVIEW"
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container text-on-surface-variant"
              }`}
            >
              <span>Chờ duyệt ({myStats.waiting})</span>
            </button>
          </div>
        </div>

        {/* DANH SÁCH THẺ NHIỆM VỤ MOBILE */}
        {/* DANH SÁCH THẺ NHIỆM VỤ MOBILE BÁM SÁT STITCH */}
        <div data-tour="task-list" className="px-margin flex flex-col gap-3">
          {filteredTasks.map((task) => {
            const isOverdue = task.isOverdue || task.hasIssue;
            const isWaiting = task.status === "WAITING_REVIEW";
            const deadlineAt = new Date(task.currentDeadline).getTime();
            const overdueDays = isNaN(deadlineAt) ? 0 : Math.max(0, Math.floor((Date.now() - deadlineAt) / 86400000));

            if (isOverdue) {
              return (
                <div
                  key={task.id}
                  className="bg-surface-container-lowest rounded-xl p-3.5 shadow-sm flex flex-col gap-3 relative overflow-hidden"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-status-danger" />
                  <div className="flex items-start justify-between gap-2 pl-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-label-sm text-label-sm font-bold text-status-danger bg-status-danger-bg px-2 py-0.5 rounded">
                        {task.code}
                      </span>
                      {task.hasIssue && (
                        <span className="px-2 py-0.5 rounded bg-status-warning-bg text-status-warning font-label-sm text-[11px] font-semibold flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[13px]">report_problem</span> Có vướng mắc
                        </span>
                      )}
                    </div>
                    <span className="px-2 py-0.5 rounded bg-status-danger text-on-primary font-label-sm text-[11px] font-bold flex items-center gap-1 shrink-0 shadow-xs">
                      <span className="material-symbols-outlined text-[13px]">alarm_off</span>{" "}
                      {task.isOverdue ? `Quá hạn ${overdueDays} ngày` : "Cần xử lý"}
                    </span>
                  </div>
                  <div className="pl-1">
                    <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold leading-tight">
                      {task.title}
                    </h3>
                    <p className="font-label-sm text-[12px] text-on-surface-variant mt-1">
                      Hạn: {formatDateTime(task.currentDeadline)}
                      {task.owner ? ` • ${task.owner.fullName}` : ""}
                    </p>
                    {task.issueNotes && (
                      <div className="mt-2.5 p-2.5 rounded-lg bg-status-warning-bg/80 flex items-start gap-2">
                        <span className="material-symbols-outlined text-status-warning text-[18px] shrink-0 mt-0.5">info</span>
                        <div className="flex flex-col text-[12px]">
                          <span className="font-body-semibold text-status-warning">Vướng mắc phát sinh:</span>
                          <span className="text-on-surface">{task.issueNotes}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 pl-1">
                    <button
                      onClick={() => openDrawerForTask(task)}
                      className="h-11 px-2.5 rounded-lg bg-surface-container text-on-surface font-body-semibold text-body-md flex items-center justify-center gap-1 hover:bg-surface-container-high active:scale-[0.98] transition-all"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[18px] text-status-warning">schedule_send</span>
                      <span className="text-[13px] leading-tight truncate">Xin lùi hạn</span>
                    </button>
                    <button
                      onClick={() => openDrawerForTask(task)}
                      className="h-11 px-2.5 rounded-lg bg-status-danger text-on-primary font-body-semibold text-body-md flex items-center justify-center gap-1 hover:opacity-95 active:scale-[0.98] transition-all shadow-sm"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[18px]">gavel</span>
                      <span className="text-[13px] leading-tight truncate">Nộp giải trình</span>
                    </button>
                  </div>
                </div>
              );
            }

            if (isWaiting) {
              return (
                <div
                  key={task.id}
                  className="bg-surface-container-lowest rounded-xl p-3.5 shadow-sm flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-label-sm text-label-sm font-bold text-primary-container bg-surface-container px-2 py-0.5 rounded">
                        {task.code}
                      </span>
                      <span className="font-label-sm text-on-surface-variant text-[11px]">
                        {task.planLinks?.[0]?.planItem?.plan?.title || "Đầu việc phát sinh"}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-status-warning-bg text-status-warning font-label-sm text-[11px] font-bold flex items-center gap-1 shrink-0">
                      <span className="material-symbols-outlined text-[13px]">pending</span> Chờ Trưởng BP duyệt
                    </span>
                  </div>
                  <div>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold leading-tight">
                      {task.title}
                    </h3>
                    <div className="mt-2.5 p-2 rounded-lg bg-surface-container-low flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-secondary text-[20px] shrink-0">assignment_turned_in</span>
                        <div className="flex flex-col min-w-0">
                          <span className="font-body-semibold text-on-surface truncate">Đã nộp kết quả</span>
                          <span className="text-on-surface-variant text-[11px]">
                            Hạn: {formatDateTime(task.currentDeadline)}
                          </span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-status-success-bg text-status-success font-label-sm text-[10px] font-bold shrink-0">
                        ĐÃ GỬI DUYỆT
                      </span>
                    </div>
                  </div>
                  <div className="pt-0.5 flex items-center justify-between gap-2">
                    <Link
                      href={`/tasks/${task.id}`}
                      className="flex-1 h-11 px-3 rounded-lg bg-surface-container text-on-surface-variant font-label-md text-label-md flex items-center justify-center gap-1 hover:bg-surface-container-high transition-all"
                    >
                      <span className="material-symbols-outlined text-[17px]">visibility</span>
                      <span>Xem chi tiết hồ sơ nộp</span>
                    </Link>
                    <button
                      onClick={() => openDrawerForTask(task)}
                      className="h-11 px-3 rounded-lg bg-surface-container text-status-danger hover:bg-status-danger-bg font-label-md text-label-md flex items-center justify-center gap-1 transition-all"
                      title="Thu hồi để hiệu chỉnh"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[17px]">undo</span>
                      <span>Thu hồi</span>
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={task.id}
                className="bg-surface-container-lowest rounded-xl p-3.5 shadow-sm flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-label-sm text-label-sm font-bold text-primary-container bg-surface-container px-2 py-0.5 rounded">
                      {task.code}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-status-danger-bg text-status-danger font-label-sm text-[11px] font-bold flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-[13px]">flag</span> {task.priority || "Cao"}
                    </span>
                    <span className="text-on-surface-variant font-label-sm text-[11px]">TTHQ</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-status-warning-bg text-status-warning font-label-sm text-[11px] font-semibold flex items-center gap-1 shrink-0">
                    <span className="material-symbols-outlined text-[13px]">schedule</span> {formatDateTime(task.currentDeadline)}
                  </span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold leading-tight">
                    {task.title}
                  </h3>
                  <div className="mt-2 flex items-center gap-1.5 text-on-surface-variant font-label-md text-label-md">
                    <span className="material-symbols-outlined text-[16px] text-secondary">assignment_ind</span>
                    <span className="truncate">
                      {isSelfInitiated(task.originKind) ? (
                        <>Nguồn: <strong className="text-on-surface font-body-semibold">Công việc tự khởi tạo</strong></>
                      ) : (
                        <>Người giao: <strong className="text-on-surface font-body-semibold">{task.owner?.fullName || "Lãnh đạo bộ phận"}</strong> ({task.owner?.position || "Phụ trách"})</>
                      )}
                    </span>
                  </div>
                </div>
                <div className="bg-surface-container-low p-2 rounded-lg flex items-center justify-between text-[12px] text-on-surface-variant">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px] text-secondary">inventory_2</span>
                    <span>{task.unit?.name || "Hải quan cửa khẩu Quốc tế Tà Lùng"}</span>
                  </span>
                  <span className="font-body-semibold text-secondary">Tiến độ {task.progressPercent ?? (task.status === "COMPLETED" ? 100 : 0)}%</span>
                </div>
                {/* YC-38 UAT fix: khoi "Nguon cong viec" — ma TX + nguon phat sinh */}
                <div className="bg-surface-container-lowest border border-border-default/50 rounded-lg p-2 flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-on-surface-variant font-semibold">
                    Nguồn công việc
                  </span>
                  <TxSourceBadge source={task.txSource} />
                  <span className="text-[11px] text-on-surface-variant">
                    {originLabel(task.originKind)}
                  </span>
                </div>
                {isTaskTerminal(task.status) ? (
                  <div className="rounded-lg bg-surface-container px-3 py-2 text-[12px] text-on-surface-variant">
                    Nhiệm vụ đã được nghiệm thu — bạn có thể xem kết quả và lịch sử, nhưng không thể cập nhật hoặc nộp lại.
                  </div>
                ) : task.status === "NOT_STARTED" && !isSelfInitiated(task.originKind) ? (
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    <button
                      onClick={() => handleAcceptTask(task)}
                      disabled={acceptingId === task.id}
                      className="h-11 px-3 rounded-lg bg-secondary text-on-secondary font-body-semibold text-body-md flex items-center justify-center gap-1.5 hover:opacity-95 active:scale-[0.98] transition-all shadow-sm disabled:opacity-50"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[18px]">handshake</span>
                      <span>{acceptingId === task.id ? "Đang xác nhận..." : "Nhận việc"}</span>
                    </button>
                  </div>
                ) : (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => openDrawerForTask(task)}
                    className="h-11 px-3 rounded-lg bg-surface-container text-primary font-body-semibold text-body-md flex items-center justify-center gap-1.5 hover:bg-surface-container-high active:scale-[0.98] transition-all"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit_note</span>
                    <span>Cập nhật tiến độ</span>
                  </button>
                  <button
                    onClick={() => openDrawerForTask(task)}
                    className="h-11 px-3 rounded-lg bg-secondary text-on-secondary font-body-semibold text-body-md flex items-center justify-center gap-1.5 hover:opacity-95 active:scale-[0.98] transition-all shadow-sm"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">task_alt</span>
                    <span>Báo hoàn thành</span>
                  </button>
                </div>
                )}
                {canApprove && task.status !== "COMPLETED" && task.status !== "CANCELED" && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => openEditAssign(task)}
                      className="h-10 px-3 rounded-lg bg-surface-container-lowest text-primary font-body-semibold text-body-md flex items-center justify-center gap-1.5 border border-border-default active:scale-[0.98] transition-all"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
                      <span>Sửa giao việc</span>
                    </button>
                    {task.status === "WAITING_REVIEW" ? (
                      <button
                        onClick={() => handleApproveTask(task)}
                        disabled={approvingId === task.id}
                        className="h-10 px-3 rounded-lg bg-status-success text-white font-body-semibold text-body-md flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-50"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[18px]">verified</span>
                        <span>{approvingId === task.id ? "Đang duyệt..." : "Duyệt hoàn thành"}</span>
                      </button>
                    ) : (
                      <Link
                        href={`/tasks/${task.id}`}
                        className="h-10 px-3 rounded-lg bg-surface-container-lowest text-primary font-body-semibold text-body-md flex items-center justify-center gap-1.5 border border-border-default active:scale-[0.98] transition-all"
                      >
                        <span className="material-symbols-outlined text-[18px]">visibility</span>
                        <span>Chi tiết & duyệt</span>
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-1 pt-1">
          <span className="text-[11px] text-outline">Đã tải {tasks.length}/{totalCount} nhiệm vụ</span>
          {page < totalPages && (
            <button
              onClick={() => fetchTasks({ page: page + 1, append: true })}
              disabled={loadingMore}
              className="w-full h-11 rounded-lg bg-surface-container-lowest text-primary font-body-semibold text-body-md shadow-sm border border-border-default active-press disabled:opacity-50"
            >
              {loadingMore ? "Đang tải..." : `Xem thêm (trang ${page + 1}/${totalPages})`}
            </button>
          )}
        </div>

        {/* FLOATING ACTION BUTTON (FAB) GÓC DƯỚI PHẢI */}
        <div data-tour="fab-add" className="fixed bottom-20 right-4 z-40">
          <button
            onClick={() => setIsNewTaskModalOpen(true)}
            aria-label="Thêm đầu việc mới"
            className="h-13 px-4 py-3 rounded-full bg-secondary text-on-secondary shadow-lg flex items-center gap-2 active:scale-95 transition-transform hover:shadow-xl font-body-semibold text-body-md tracking-tight"
            type="button"
          >
            <span className="material-symbols-outlined text-[24px]">add_task</span>
            <span>+ Thêm việc</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          INTERACTIVE SLIDE-OVER DRAWER (TSK-1042 / Selected Task - 1-Touch Action)
          RESPONSIVE: max-w-full on mobile, sm:max-w-[520px] on desktop
          ========================================================================= */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          />

          <aside className="relative w-full max-w-full sm:max-w-[520px] sm:w-[520px] bg-surface-container-lowest shadow-2xl z-50 flex flex-col h-full transform transition-transform duration-300 ease-in-out">
            {/* DRAWER HEADER */}
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between shrink-0">
              <div className="flex items-center gap-space-sm min-w-0 flex-1">
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-on-secondary shadow-sm shrink-0">
                  <span className="material-symbols-outlined text-[20px]">fact_check</span>
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-label-sm text-label-sm text-secondary-fixed font-semibold uppercase">
                    Tác nghiệp một chạm
                  </span>
                  <h2 className="font-headline-sm text-headline-sm text-white truncate">
                    Cập Nhật Tiến Độ &amp; Kết Quả Tác Nghiệp
                  </h2>
                </div>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-1 rounded text-on-primary-container hover:text-white hover:bg-primary-container transition-fast shrink-0 ml-2"
                title="Đóng bảng"
              >
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>

            {/* DRAWER THÔNG TIN NHANH */}
            {selectedTask && (
              <div className="bg-surface-subtle p-space-md flex flex-col gap-2 shrink-0 border-b border-border-default">
                <div className="flex items-center justify-between">
                  <span className="font-headline-sm text-headline-sm text-primary font-bold">
                    Mã việc: {selectedTask.code}
                  </span>
                  <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-secondary/15 text-secondary font-semibold">
                    {selectedTask.planLinks?.[0]?.planItem?.plan?.title || "Kế hoạch tuần"}
                  </span>
                </div>
                <p className="font-body-semibold text-body-semibold text-on-surface">
                  {selectedTask.title}
                </p>
                <div className="grid grid-cols-2 gap-2 text-label-sm mt-1">
                  <div className="text-outline">
                    Hạn xử lý: <strong className="text-status-warning">{formatDateTime(selectedTask.currentDeadline)}</strong>
                  </div>
                  <div className="text-outline text-right">
                    Phối hợp: <strong className="text-primary">{selectedTask.assignees?.[0]?.person?.fullName || selectedTask.unit?.name || "Hải quan cửa khẩu Quốc tế Tà Lùng"}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Action Feedback Alerts */}
            {actionSuccess && (
              <div className="p-3 bg-status-success-bg border-b border-status-success/30 text-status-success text-xs font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                <span>{actionSuccess}</span>
              </div>
            )}
            {actionError && (
              <div className="p-3 bg-status-danger-bg border-b border-status-danger/30 text-status-danger text-xs font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                <span>{actionError}</span>
              </div>
            )}

            {/* DRAWER FORM THAO TÁC CÁN BỘ */}
            <div className="flex-1 overflow-y-auto p-space-md flex flex-col gap-space-md">
              {/* Chuyển trạng thái */}
              <div className="flex flex-col gap-1.5">
                <label className="font-body-semibold text-body-semibold text-primary">
                  1. Chuyển trạng thái công việc
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    onClick={() => setDrawerStatus("IN_PROGRESS")}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-fast ${
                      drawerStatus === "IN_PROGRESS"
                        ? "bg-secondary/15 border border-secondary text-primary font-semibold"
                        : "bg-surface-subtle hover:bg-surface-container text-on-surface"
                    }`}
                  >
                    <input
                      type="radio"
                      name="drawer-status"
                      checked={drawerStatus === "IN_PROGRESS"}
                      onChange={() => setDrawerStatus("IN_PROGRESS")}
                      className="accent-secondary"
                    />
                    <span className="font-label-md text-label-md">Đang xử lý (Tiếp tục)</span>
                  </label>
                  <label
                    onClick={() => {
                      setDrawerStatus("COMPLETED");
                      setDrawerProgress(100);
                    }}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-fast ${
                      drawerStatus === "COMPLETED"
                        ? "bg-status-success-bg border border-status-success text-status-success font-semibold"
                        : "bg-surface-subtle hover:bg-surface-container text-on-surface"
                    }`}
                  >
                    <input
                      type="radio"
                      name="drawer-status"
                      checked={drawerStatus === "COMPLETED"}
                      onChange={() => {
                        setDrawerStatus("COMPLETED");
                        setDrawerProgress(100);
                      }}
                      className="accent-status-success"
                    />
                    <span className="font-label-md text-label-md">Hoàn thành (Đạt kết quả)</span>
                  </label>
                </div>
              </div>

              {/* Thanh trượt tiến độ % */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-body-semibold text-body-semibold text-primary">
                    2. Tỷ lệ hoàn thành nhiệm vụ
                  </label>
                  <span className="font-headline-sm text-headline-sm text-secondary font-bold">
                    {drawerProgress}%
                  </span>
                </div>
                {/* Thanh trượt tiến độ % — YC-09: bước 5% (0,5,...,100) */}
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={drawerProgress}
                  onChange={(e) => setDrawerProgress(Number(e.target.value))}
                  className="w-full accent-secondary cursor-pointer h-2 bg-surface-container rounded-lg"
                />
                <div className="flex justify-between text-label-sm text-outline px-0.5">
                  <span>0% Bắt đầu</span>
                  <span>50% Đang xử lý</span>
                  <span className="text-secondary font-semibold">100% Hoàn tất</span>
                </div>
              </div>

              {/* Nội dung kết quả thực tế */}
              <div className="flex flex-col gap-1.5">
                <label className="font-body-semibold text-body-semibold text-primary">
                  3. Kết quả nghiệp vụ chi tiết
                </label>
                <textarea
                  rows={3}
                  value={drawerNotes}
                  onChange={(e) => setDrawerNotes(e.target.value)}
                  placeholder="Nhập tóm tắt kết quả, số hồ sơ xử lý, số tờ khai..."
                  className="w-full p-2.5 rounded-lg bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-2 focus:ring-secondary resize-none"
                />
                <span className="font-label-sm text-[12px] text-outline">
                  Gợi ý: Ghi rõ số lượng tờ khai, vướng mắc nếu có để cấp trên kiểm tra.
                </span>
              </div>

              {/* Đính kèm biên bản / tài liệu */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-body-semibold text-body-semibold text-primary">
                    4. Đính kèm biên bản / tài liệu ({attachments.length})
                  </label>
                  {uploadingFile && (
                    <span className="text-secondary font-label-sm text-xs flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                      Đang tải lên Supabase...
                    </span>
                  )}
                </div>

                {/* Danh sách tệp đính kèm thực tế từ Supabase Storage */}
                <div className="flex flex-col gap-1.5">
                  {attachmentsLoading ? (
                    <div className="p-3 rounded-lg bg-surface-container-low text-center text-label-sm text-outline flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                      Đang tải danh sách tài liệu...
                    </div>
                  ) : attachments.length === 0 ? (
                    <div className="p-3 rounded-lg bg-surface-container-low border border-dashed border-border-default text-center">
                      <p className="font-label-sm text-label-sm text-outline">
                        Chưa có tệp đính kèm. Tải lên biên bản kiểm tra điện tử, chứng từ hoặc ảnh giám định hiện trường.
                      </p>
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
                          className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low border border-border-default hover:border-secondary/40 transition-fast"
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <span
                              className={`material-symbols-outlined text-[22px] shrink-0 ${
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
                                className="font-label-md text-label-md text-primary font-semibold truncate hover:underline hover:text-secondary"
                                title={`Mở tệp: ${att.fileName}`}
                              >
                                {att.fileName}
                              </a>
                              <span className="font-label-sm text-[11px] text-outline">
                                {sizeFormatted} · {att.uploadedBy?.fullName || "Cán bộ"}
                                {att.isSigned ? " · Đã xác thực nghiệp vụ" : ""}
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
                                className="p-1 text-outline hover:text-secondary transition-fast rounded hover:bg-surface-container"
                                title="Xem nhanh tệp"
                              >
                                <span className="material-symbols-outlined text-[18px]">visibility</span>
                              </button>
                            )}
                            <a
                              href={att.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              download
                              className="p-1 text-outline hover:text-secondary transition-fast rounded hover:bg-surface-container"
                              title="Tải về máy tính"
                            >
                              <span className="material-symbols-outlined text-[18px]">download</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => handleDeleteAttachment(att.id)}
                              className="p-1 text-outline hover:text-status-danger transition-fast rounded hover:bg-surface-container"
                              title="Xóa tệp"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
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
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  type="button"
                  className="mt-1 w-full py-2.5 rounded-lg bg-surface-subtle text-secondary font-label-md text-label-md hover:bg-surface-container flex items-center justify-center gap-2 transition-fast active-press border border-border-subtle disabled:opacity-50"
                >
                  <span className={`material-symbols-outlined text-[18px] ${uploadingFile ? "animate-spin" : ""}`}>
                    {uploadingFile ? "progress_activity" : "upload_file"}
                  </span>
                  <span>
                    {uploadingFile
                      ? "Đang tải tệp lên..."
                      : "Tải thêm tệp tin đính kèm (PDF, XLSX, DOCX, Ảnh)"}
                  </span>
                </button>
              </div>

              {/* Lưu ý nghiệp vụ */}
              <div className="p-space-sm rounded-lg bg-status-warning-bg/40 flex items-start gap-2 border border-status-warning/30">
                <span className="material-symbols-outlined text-status-warning text-[18px] shrink-0 mt-0.5">
                  info
                </span>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  Bấm <strong>&quot;Báo hoàn thành &amp; Trình duyệt&quot;</strong> hệ thống sẽ tự động cập nhật Dashboard lãnh đạo và chuyển thông báo tới Trưởng bộ phận.
                </p>
              </div>
            </div>

            {/* DRAWER ACTIONS FOOTER */}
            <div className="p-space-md bg-surface-subtle flex items-center justify-between gap-space-sm shrink-0 border-t border-border-default">
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="px-4 py-2 rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md hover:bg-surface-container transition-fast border border-border-subtle active-press"
              >
                Hủy bỏ
              </button>
              <div className="flex items-center gap-space-sm">
                <button
                  disabled={drawerLoading}
                  onClick={() => handleDrawerSubmit(false)}
                  className="px-3 py-2 rounded-lg bg-surface-container text-primary font-label-md text-label-md hover:bg-surface-container-high transition-fast active-press"
                >
                  {drawerLoading ? "Đang lưu..." : "Lưu nháp"}
                </button>
                <button
                  disabled={drawerLoading}
                  onClick={() => handleDrawerSubmit(true)}
                  className="px-4 py-2 rounded-lg bg-secondary text-on-secondary font-label-md text-label-md hover:opacity-90 shadow-sm flex items-center gap-1.5 font-semibold transition-fast active-press"
                >
                  <span className="material-symbols-outlined text-[18px]">send_time_extension</span>
                  <span>{drawerLoading ? "Đang gửi..." : "Báo hoàn thành & Trình duyệt"}</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* =========================================================================
          MODAL: SỬA GIAO VIỆC (lãnh đạo/trưởng nhóm, mobile-friendly)
          ========================================================================= */}
      {editTask && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-lg bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-default">
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <h3 className="font-headline-sm font-semibold">Sửa giao việc [{editTask.code}]</h3>
              <button onClick={() => setEditTask(null)}>
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleEditAssignSave}>
              <div className="p-space-md flex flex-col gap-space-md max-h-[70vh] overflow-y-auto">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-primary">Tên / Nội dung chỉ đạo *</label>
                  <input type="text" required value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Nhập nội dung công việc chỉ đạo..."
                    className="h-10 px-3 rounded bg-surface-container-low text-sm border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary" />
                </div>
                <div className="grid grid-cols-2 gap-space-sm">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-primary">Cán bộ chủ trì</label>
                    <select value={editOwnerId} onChange={(e) => setEditOwnerId(e.target.value)}
                      className="h-10 px-2 rounded bg-surface-container-low text-sm border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary">
                      {editTask.owner && <option value={editTask.owner.id}>{editTask.owner.fullName}</option>}
                      {people.filter((p) => p.id !== editTask.owner?.id).map((p) => (
                        <option key={p.id} value={p.id}>{p.fullName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-primary">Ưu tiên</label>
                    <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)}
                      className="h-10 px-2 rounded bg-surface-container-low text-sm border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary">
                      <option value="Khẩn">Khẩn cấp</option>
                      <option value="Cao">Cao</option>
                      <option value="Trung bình">Trung bình</option>
                      <option value="Thấp">Thấp</option>
                    </select>
                  </div>
                </div>
                <CollaboratorPicker people={people} value={editCollabs} onChange={setEditCollabs} excludeId={editOwnerId} disabled={editSaving} />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-primary">Hạn hoàn thành</label>
                  <input type="datetime-local" value={editDeadline} onChange={(e) => setEditDeadline(e.target.value)}
                    className="h-10 px-3 rounded bg-surface-container-low text-sm border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary" />
                </div>
              </div>
              <div className="p-space-md bg-surface-subtle flex items-center justify-end gap-2 border-t border-border-default">
                <button type="button" onClick={() => setEditTask(null)} className="px-4 py-2 rounded text-xs font-semibold">Hủy</button>
                <button type="submit" disabled={editSaving} className="px-4 py-2 rounded bg-secondary text-on-secondary text-xs font-semibold disabled:opacity-50">
                  {editSaving ? "Đang lưu..." : "Lưu sửa giao việc"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: THÊM ĐẦU VIỆC MỚI TÙY BIẾN CHO CÁN BỘ
          ========================================================================= */}
      {isNewTaskModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-lg bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-default transition-panel">
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary-fixed text-[22px]">
                  add_circle
                </span>
                <h3 className="font-headline-sm text-headline-sm text-white">
                  Thêm Đầu Việc Cá Nhân Tùy Biến
                </h3>
              </div>
              <button
                onClick={() => setIsNewTaskModalOpen(false)}
                className="text-on-primary-container hover:text-white transition-fast"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateTask}>
              <div className="p-space-md flex flex-col gap-space-md max-h-[70vh] overflow-y-auto">
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Tên đầu việc cá nhân *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Nhập nội dung kết quả, số hồ sơ liên quan..."
                    className="h-9 px-3 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>

                {/* YC-38B: bộ chọn nguồn thông minh — gợi ý TX theo tên vừa nhập */}
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Nguồn công việc (tuỳ chọn)
                  </label>
                  <WorkSourcePicker
                    title={newTaskTitle}
                    catalogEntry={newTaskCatalogEntry}
                    product={newTaskProduct}
                    onCatalogChange={setNewTaskCatalogEntry}
                    onProductChange={setNewTaskProduct}
                    storageKey="yc38b:my-work"
                  />
                </div>

                <div className="grid grid-cols-2 gap-space-sm">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-primary font-semibold">
                      Phân loại nguồn
                    </label>                    <select
                      value={newTaskSource}
                      onChange={(e) => setNewTaskSource(e.target.value)}
                      className="h-9 px-2 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    >
                      <option value="PLAN">Kế hoạch công tác tuần</option>
                      <option value="SELF_INITIATED">Tự khởi tạo phát sinh</option>
                      <option value="OUTSIDE_DIRECTIVE">
                        Tự ghi nhận theo chỉ đạo ngoài hệ thống (không phải lệnh giao chính thức)
                      </option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-primary font-semibold">
                      Mức độ ưu tiên
                    </label>
                    <select
                      value={newTaskPriority}
                      onChange={(e) => setNewTaskPriority(e.target.value as any)}
                      className="h-9 px-2 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    >
                      <option value="Cao">Cao</option>
                      <option value="Trung bình">Trung bình</option>
                      <option value="Thấp">Thấp</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-space-sm">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-primary font-semibold">
                      Hạn hoàn thành
                    </label>
                    <input
                      type="date"
                      value={newTaskDeadline}
                      onChange={(e) => setNewTaskDeadline(e.target.value)}
                      className="h-9 px-2 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-primary font-semibold">
                      Giờ kết thúc
                    </label>
                    <input
                      type="time"
                      value={newTaskTime}
                      onChange={(e) => setNewTaskTime(e.target.value)}
                      className="h-9 px-2 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    />
                  </div>
                </div>
              </div>

              <div className="p-space-md bg-surface-subtle flex items-center justify-end gap-space-sm border-t border-border-default">
                <button
                  type="button"
                  onClick={() => setIsNewTaskModalOpen(false)}
                  className="px-4 py-2 rounded bg-surface-container-lowest text-on-surface font-label-md text-label-md hover:bg-surface-container border border-border-subtle transition-fast active-press"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-secondary text-on-secondary font-label-md text-label-md font-semibold hover:opacity-90 shadow-sm transition-fast active-press"
                >
                  Lưu đầu việc
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
                  rel="noreferrer"
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


