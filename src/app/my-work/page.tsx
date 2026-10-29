"use client";

import { V5Icon } from "@/components/v5/ui/icon";

import React, { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { isSelfInitiated, originLabel } from "@/lib/task-origin";
import { isMyPendingAcceptance } from "@/lib/task-acceptance";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Plus,
  RefreshCw,
  Timer,
} from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { Badge } from "@/components/v5/ui/badge";
import { Button } from "@/components/v5/ui/button";
import { DataTable } from "@/components/v5/ui/data-table";
import { FilterBar, FilterChip } from "@/components/v5/ui/filter-bar";
import { PageHeader } from "@/components/v5/ui/page-header";
import { StatCard } from "@/components/v5/ui/stat-card";
import { getCurrentPeriodLabels } from "@/lib/period-helper";
import { formatVnDateTime, vnLocalToUtcIso, utcIsoToVnInputValue } from "@/lib/datetime";
import { usePermissions } from "@/hooks/usePermissions";
import { CollaboratorPicker } from "@/components/tasks/CollaboratorPicker";
import WorkSourcePicker from "@/components/work/WorkSourcePicker";
import TxSourceBadge from "@/components/work/TxSourceBadge";
import MyWorkItemsSection from "./MyWorkItemsSection";
import {
  ALL_TIME_JOURNAL_FILTER,
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
  } | null;
  // YC-10: bắt buộc chọn mức chất lượng khi duyệt AGREE (flag server-side).
  qualityEnabled?: boolean;
  // UX Phase 1: trạng thái phần việc của CHÍNH người dùng hiện tại (nếu là phối hợp).
  myPartStatus?: string | null;
}

function MyWorkPageContent() {
  const searchParams = useSearchParams();
  const tabQuery = searchParams.get("tab");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "ALL" | "WAITING_ACCEPT" | "IN_PROGRESS" | "WAITING_REVIEW" | "OVERDUE" | "COMPLETED"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  // YC-30 (bổ sung) — bộ lọc "Nhật ký công việc" dùng chung cho nhiệm vụ giao + đầu việc kế hoạch.
  const [journalFilter, setJournalFilter] = useState<JournalFilterState>(
    DEFAULT_JOURNAL_FILTER
  );
  // Mở tab "Chờ nhận việc": luôn mở bộ lọc toàn thời gian để số đếm trên tab và
  // danh sách dùng cùng một phạm vi (mặc định "Hôm nay" ẩn việc có hạn ngày khác).
  const openWaitingAcceptTab = React.useCallback(() => {
    setActiveTab("WAITING_ACCEPT");
    setJournalFilter(ALL_TIME_JOURNAL_FILTER);
  }, []);
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

  // Công việc đang chờ CHÍNH người dùng xác nhận nhận việc.
  // Chỉ tính việc mình chủ trì/phối hợp — lãnh đạo có thể thấy việc toàn đơn vị.
  // Đếm trên danh sách đã tải (API trả 50/trang); dữ liệu nghiệp vụ hiện nhỏ.
  const waitingAcceptCount = React.useMemo(
    () =>
      tasks.filter((t) => isMyPendingAcceptance(t, currentUser.personId)).length,
    [tasks, currentUser.personId]
  );

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

  // Deep-link/sidebar theo query "tab" (useSearchParams + Suspense để Next build tĩnh được):
  // - tab=WAITING_ACCEPT → mở tab chờ nhận kèm bộ lọc toàn thời gian.
  // - không có query → sidebar "Nhật ký công việc": đưa tab chờ nhận về "Tất cả",
  //   nhưng KHÔNG reset tab người dùng tự chọn khác.
  useEffect(() => {
    if (tabQuery === "WAITING_ACCEPT") {
      openWaitingAcceptTab();
      return;
    }
    if (!tabQuery) {
      setActiveTab((prev) => (prev === "WAITING_ACCEPT" ? "ALL" : prev));
    }
  }, [tabQuery, openWaitingAcceptTab]);

  // Drawer & Modal States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  // YC-04: chặn bấm trùng nút tạo việc cá nhân
  const [isCreatingPersonal, setIsCreatingPersonal] = useState(false);

  // Lãnh đạo + Trưởng nhóm: sửa giao việc và duyệt ngay trên mobile
  const { canApprove, user: permUser } = usePermissions();
  const [people, setPeople] = useState<Array<{ id: string; fullName: string }>>([]);
  const [editTask, setEditTask] = useState<TaskItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editOwnerId, setEditOwnerId] = useState("");
  const [editCollabs, setEditCollabs] = useState<string[]>([]);
  const [editDeadline, setEditDeadline] = useState("");
  const [editPriority, setEditPriority] = useState("Cao");
  const [editSaving, setEditSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  // YC-10 Phase 2b: quick approve phải chọn quality khi flag bật (không còn 422 dead-end).
  const [qualityEnabled, setQualityEnabled] = useState(false);
  const [quickApproveTask, setQuickApproveTask] = useState<TaskItem | null>(null);
  const [quickApproveQuality, setQuickApproveQuality] = useState("");
  const [quickApproveBusy, setQuickApproveBusy] = useState(false);
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
      const res = await fetch(`/api/tasks?${params.toString()}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        const data = Array.isArray(json) ? json : json.data || [];
        setTasks((prev) => (opts?.append ? [...prev, ...data] : data));
        setQualityEnabled(
          Boolean(json.qualityEnabled ?? data.some((t: TaskItem) => t.qualityEnabled))
        );
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
      const isOwner = selectedTask.owner?.id === currentUser?.personId;
      if (!isOwner && !canApprove) {
        if (finalSubmit && drawerNotes.trim().length < 5) {
          throw new Error("Vui lòng nhập kết quả phần việc (ít nhất 5 ký tự) trước khi báo hoàn thành.");
        }
        const partRes = await fetch(`/api/tasks/${selectedTask.id}/participant-results`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            finalSubmit
              ? {
                  action: "SUBMIT",
                  partResultText: drawerNotes,
                  partCompletedOn: new Date().toISOString().slice(0, 10),
                  partProgressPercent: 100,
                }
              : {
                  action: "PROGRESS",
                  progressPercent: Math.round(drawerProgress / 5) * 5,
                  notes: drawerNotes,
                }
          ),
        });
        const partJson = await partRes.json().catch(() => ({}));
        if (!partRes.ok) throw new Error(partJson.error || "Không thể cập nhật phần việc");
        const successMsg = finalSubmit
          ? "Đã báo phần việc của bạn. Chủ trì sẽ tổng hợp và trình duyệt."
          : "Đã cập nhật tiến độ phần việc của bạn.";
        setActionSuccess(successMsg);
        toast.success(successMsg);
        await fetchTasks();
        setTimeout(() => setIsDrawerOpen(false), 900);
        return;
      }

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
  const performApproveTask = async (
    task: TaskItem,
    qualityPercent: number | null
  ): Promise<boolean> => {
    if (approvingId) return false;
    setApprovingId(task.id);
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: task.id,
          action: "CONFIRM_COMPLETION",
          ...(qualityPercent !== null ? { qualityPercent } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Đã duyệt hoàn thành nhiệm vụ!");
        await fetchTasks();
        return true;
      }
      toast.error(json.error || "Không thể duyệt nhiệm vụ");
      return false;
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
      return false;
    } finally {
      setApprovingId(null);
    }
  };

  const handleApproveTask = (task: TaskItem) => {
    if (approvingId) return;
    // Khi flag YC-10 bật: mở modal chọn quality thay vì gửi thiếu (tránh 422).
    if (qualityEnabled || task.qualityEnabled) {
      setQuickApproveTask(task);
      setQuickApproveQuality("");
      return;
    }
    if (!confirm(`Duyệt hoàn thành nhiệm vụ [${task.code}] ${task.title}?`)) return;
    void performApproveTask(task, null);
  };

  const handleQuickApproveConfirm = async () => {
    if (!quickApproveTask || quickApproveBusy) return;
    const value = Number(quickApproveQuality);
    if (!quickApproveQuality || !Number.isFinite(value)) {
      toast.error("Vui lòng chọn mức chất lượng kết quả (65–100, bước 5).");
      return;
    }
    setQuickApproveBusy(true);
    const ok = await performApproveTask(quickApproveTask, value);
    setQuickApproveBusy(false);
    if (ok) {
      setQuickApproveTask(null);
      setQuickApproveQuality("");
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

    // Tab "Chờ nhận việc": dùng ĐÚNG predicate của badge, xét TRƯỚC mọi bộ lọc
    // ngày/nguồn/trạng thái của Nhật ký. Mặc định "Hôm nay" không được phép làm
    // danh sách rỗng trong khi badge vẫn đếm việc có hạn ngày khác.
    if (activeTab === "WAITING_ACCEPT") {
      return (
        isMyPendingAcceptance(task, currentUser.personId) &&
        journalTextMatches(journalFilter.query, task.code, task.title, task.description)
      );
    }

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
    <div className="w-full min-h-screen bg-transparent pb-12">
      {/* =========================================================================
          DESKTOP VIEW (Pixel-accurate Google Stitch ID a1afd1c794c6454a8e161b43f25f4024)
          ========================================================================= */}
      <div className="hidden lg:flex flex-col gap-space-lg p-space-lg">
        {/* BANNER CẢNH BÁO VIỆC QUÁ HẠN & GIẢI TRÌNH */}
        {overdueTask && (
          <section className="bg-status-danger-bg rounded-xl p-space-md shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md border border-status-danger/20 transition-panel">
            <div className="flex items-start gap-space-md">
              <div className="w-10 h-10 rounded-lg bg-status-danger/10 text-status-danger flex items-center justify-center shrink-0">
                <V5Icon name="warning" className="text-[24px]" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-space-xs flex-wrap">
                  <span className="font-label-sm text-label-sm bg-status-danger text-on-error px-2 py-0.5 rounded font-bold">
                    CẢNH BÁO QUÁ HẠN
                  </span>
                  <span className="font-body-semibold text-body-semibold text-status-danger">
                    Đầu việc {overdueTask.code}: {overdueTask.title}
                  </span>
                  <span className="font-label-sm text-label-sm text-v5-muted">· Đã trễ hạn nghiệp vụ</span>
                </div>
                <p className="font-body-md text-body-md text-v5-muted mt-0.5">
                  Quy chế nghiệp vụ yêu cầu hoàn thành giải trình chậm hạn hoặc gửi phiếu đề xuất gia hạn trình Trưởng bộ phận trước 15:00 hôm nay.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-space-sm shrink-0 w-full md:w-auto justify-end">
              <button
                onClick={() => openDrawerForTask(overdueTask)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-v5-surface text-status-danger font-label-md text-label-md hover:bg-status-danger hover:text-on-error transition-fast shadow-sm active-press"
              >
                <V5Icon name="assignment_late" className="text-[18px]" />
                <span>Giải trình chậm hạn</span>
              </button>
              <button
                onClick={() => openDrawerForTask(overdueTask)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-danger text-on-error font-label-md text-label-md hover:opacity-90 transition-fast shadow-sm active-press"
              >
                <V5Icon name="more_time" className="text-[18px]" />
                <span>Xin gia hạn khẩn</span>
              </button>
            </div>
          </section>
        )}

        {/* HEADER KHU VỰC LÀM VIỆC & THAO TÁC NHANH */}
        <section className="flex flex-col gap-3">
          <PageHeader
            eyebrow="Công việc cá nhân"
            title="Việc của tôi"
            badges={
              <>
                <Badge variant="outline">{currentUser.positionTitle}</Badge>
                <Badge variant="success">Sẵn sàng</Badge>
              </>
            }
            description={
              <>
                {currentUser.fullName} · {currentUser.personCode} · {currentUser.unitName}
                <span className="mt-0.5 block text-[11px]">Ca trực chính 07:30 - 17:00</span>
              </>
            }
            actions={
              <>
                <Button size="sm" onClick={() => setIsNewTaskModalOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Thêm việc
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/routine">
                    <BookOpenCheck className="h-3.5 w-3.5" /> Nhật ký
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={() => fetchTasks()}>
                  <RefreshCw className="h-3.5 w-3.5" /> Làm mới
                </Button>
              </>
            }
          />

          <div data-tour="time-filter">
            <FilterBar
              actions={
                <div className="flex items-center gap-2 px-1 text-[10px] text-v5-muted">
                  <Clock3 className="h-3.5 w-3.5" />
                  <span>Đồng bộ lúc: {lastSyncAt ? lastSyncAt.toLocaleTimeString("vi-VN") : "chưa đồng bộ"}</span>
                  <button
                    onClick={() => fetchTasks({ page: 1 })}
                    className="rounded p-1 text-v5-muted transition-colors hover:bg-v5-bg hover:text-v5-ink"
                    title="Tải lại dữ liệu"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              }
            >
              {[
                { key: "DAY" as const, label: `Hôm nay (${todayLabel})` },
                { key: "WEEK" as const, label: `Tuần này (${periodLabels.weekShort})` },
                { key: "MONTH" as const, label: periodLabels.monthShort },
                { key: "ALL" as const, label: "Tất cả nhiệm vụ" },
              ].map((item) => (
                <FilterChip
                  key={item.key}
                  active={timeFilter === item.key}
                  onClick={() => setTimeFilter(item.key)}
                >
                  {item.label}
                </FilterChip>
              ))}
            </FilterBar>
          </div>
        </section>

        {/* THANH SỐ LIỆU TỔNG QUAN HÔM NAY (4 KPI CARDS) */}
        <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard
            label="Cần xử lý hôm nay"
            value={String(myStats.active).padStart(2, "0")}
            unit="đầu việc"
            icon={ClipboardList}
            tone="accent"
            footer={
              <>
                <span className="flex items-center gap-1 font-semibold text-v5-danger">
                  <AlertTriangle className="h-3 w-3" /> {String(myStats.high).padStart(2, "0")} ưu tiên cao
                </span>
                <span className="text-v5-muted">{String(myStats.done).padStart(2, "0")} đã xong</span>
              </>
            }
          />
          <StatCard
            label="Sắp đến hạn"
            value={String(myStats.dueSoon).padStart(2, "0")}
            unit="nhiệm vụ"
            icon={Timer}
            tone="warning"
            footer={
              <>
                <span className="font-semibold text-v5-gold-ink">Hạn trong 24 giờ</span>
                <span className="text-v5-muted">{myStats.dueSoon > 0 ? "Cần xử lý" : "Không gấp"}</span>
              </>
            }
          />
          <StatCard
            label="Quá hạn"
            value={String(myStats.overdue).padStart(2, "0")}
            unit="hồ sơ trễ"
            icon={AlertTriangle}
            tone="danger"
            footer={
              <>
                <button
                  onClick={() => overdueTask && openDrawerForTask(overdueTask)}
                  className="font-semibold text-v5-danger hover:underline"
                >
                  Giải trình ngay
                </button>
                <span className="text-v5-danger">{myStats.overdue > 0 ? `Chậm ${myStats.maxOverdueDays} ngày` : "Đúng hạn"}</span>
              </>
            }
          />
          <StatCard
            label="Chờ phê duyệt"
            value={String(myStats.waiting).padStart(2, "0")}
            unit="đã nộp"
            icon={CheckCircle2}
            footer={
              <>
                <span className="font-semibold text-v5-muted">Chờ Trưởng BP ký</span>
                <span className="text-v5-muted">Đang duyệt</span>
              </>
            }
          />
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
        <section data-tour="task-list" className="bg-v5-surface rounded-xl shadow-sm flex flex-col overflow-hidden border border-v5-line/50">
          {/* TAB ĐIỀU HƯỚNG TRẠNG THÁI & TÌM KIẾM NHANH */}
          <div className="p-space-md bg-v5-bg flex flex-col md:flex-row md:items-center justify-between gap-space-md border-b border-v5-line">
            <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
              <button
                onClick={() => setActiveTab("ALL")}
                className={`px-3 py-1.5 rounded font-label-md text-label-md font-semibold shrink-0 transition-fast ${
                  activeTab === "ALL"
                    ? "bg-secondary text-on-secondary shadow-sm"
                    : "text-v5-muted hover:text-primary hover:bg-v5-bg"
                }`}
              >
                Tất cả ({tasks.length})
              </button>
              <button
                onClick={openWaitingAcceptTab}
                className={`px-3 py-1.5 rounded font-label-md text-label-md shrink-0 transition-fast ${
                  activeTab === "WAITING_ACCEPT"
                    ? "bg-secondary text-on-secondary shadow-sm font-semibold"
                    : "text-v5-muted hover:text-primary hover:bg-v5-bg"
                }`}
              >
                Chờ nhận việc ({waitingAcceptCount})
              </button>
              <button
                onClick={() => setActiveTab("IN_PROGRESS")}
                className={`px-3 py-1.5 rounded font-label-md text-label-md shrink-0 transition-fast ${
                  activeTab === "IN_PROGRESS"
                    ? "bg-secondary text-on-secondary shadow-sm font-semibold"
                    : "text-v5-muted hover:text-primary hover:bg-v5-bg"
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
                    : "text-v5-muted hover:text-primary hover:bg-v5-bg"
                }`}
              >
                Chờ xác nhận ({tasks.filter((t) => t.status === "WAITING_REVIEW").length})
              </button>
              <button
                onClick={() => setActiveTab("COMPLETED")}
                className={`px-3 py-1.5 rounded font-label-md text-label-md shrink-0 transition-fast ${
                  activeTab === "COMPLETED"
                    ? "bg-secondary text-on-secondary shadow-sm font-semibold"
                    : "text-v5-muted hover:text-primary hover:bg-v5-bg"
                }`}
              >
                Đã hoàn thành ({tasks.filter((t) => t.status === "COMPLETED").length})
              </button>
            </div>
            <div className="flex items-center gap-space-sm shrink-0">
              <div className="relative w-full sm:w-64">
                <V5Icon name="search" className="absolute left-2.5 top-2 text-v5-muted text-[18px]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo mã việc, tên việc..."
                  className="w-full h-8 pl-8 pr-3 rounded bg-v5-surface text-body-md font-body-md text-v5-ink placeholder:text-v5-muted border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary transition-fast"
                />
              </div>
              <button
                onClick={() => fetchTasks()}
                className="h-8 px-2.5 rounded bg-v5-surface text-v5-muted font-label-md text-label-md hover:bg-v5-bg flex items-center gap-1 shadow-sm border border-v5-line transition-fast active-press"
              >
                <V5Icon name="tune" className="text-[16px]" />
                <span className="hidden sm:inline">Phân loại</span>
              </button>
            </div>
          </div>

          {/* BẢNG TÁC NGHIỆP CHI TIẾT & QUICK ACTIONS */}
          <DataTable className="min-w-[1220px] text-left">
            <thead>
                <tr className="bg-v5-bg text-primary font-table-header text-table-header border-b border-v5-line">
                  <th className="whitespace-nowrap py-3 px-space-md w-[280px]">MÃ &amp; TÊN ĐẦU VIỆC</th>
                  <th className="whitespace-nowrap py-3 px-space-sm w-[180px]">NGUỒN &amp; DANH MỤC</th>
                  <th className="whitespace-nowrap py-3 px-space-sm w-[150px]">HẠN CHÓT</th>
                  <th className="whitespace-nowrap py-3 px-space-sm w-[100px]">ƯU TIÊN</th>
                  <th className="whitespace-nowrap py-3 px-space-sm w-[160px]">PHỐI HỢP</th>
                  <th className="whitespace-nowrap py-3 px-space-sm w-[150px]">TIẾN ĐỘ</th>
                  <th className="whitespace-nowrap py-3 px-space-md text-right w-[230px]">THAO TÁC TRỰC TIẾP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container font-table-data text-table-data text-v5-ink">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-v5-muted">
                      Chưa có công việc nào trong danh mục lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task, idx) => {
                    const isOverdue = task.isOverdue || task.hasIssue;
                    const isWaiting = task.status === "WAITING_REVIEW";
                    const isCompleted = task.status === "COMPLETED";
                    const isReturned =
                      task.status === "IN_PROGRESS" &&
                      (task.approval?.action === "REJECT" || task.approval?.action === "CLARIFY");
                    const isPendingAccept = isMyPendingAcceptance(
                      task,
                      currentUser.personId
                    );

                    return (
                      <tr
                        key={task.id}
                        className={`hover:bg-v5-bg transition-fast ${
                          idx === 0 ? "bg-secondary-fixed/10" : ""
                        }`}
                      >
                        <td className="py-3 px-space-md align-top">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="whitespace-nowrap font-body-semibold text-body-semibold text-primary font-bold">
                                {task.code}
                              </span>
                              <span className="font-label-sm text-[11px] px-1.5 py-0.5 rounded bg-secondary/10 text-secondary font-semibold">
                                {task.planLinks?.[0]?.planItem?.plan?.title || "Kế hoạch tuần"}
                              </span>
                            </div>
                            <span
                              onClick={() => openDrawerForTask(task)}
                              className="font-body-semibold text-body-semibold text-v5-ink leading-tight hover:text-secondary cursor-pointer"
                            >
                              {task.title}
                            </span>
                            <span className="font-label-sm text-label-sm text-v5-muted">
                              {task.description || "Nhiệm vụ trực tiếp"}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-space-sm align-top">
                          <div className="flex flex-col">
                            {/* YC-38 UAT fix: hien thi ma TX thuoc (bo nhan "TTHQ-ĐT" hard-code) */}
                            <TxSourceBadge source={task.txSource} />
                            <span className="font-label-sm text-[11px] text-v5-muted">
                              {originLabel(task.originKind)}
                            </span>
                            <span className="text-v5-muted font-label-sm text-[12px] truncate max-w-[150px]">
                              {task.expectedResultText || "Theo quy trình hải quan"}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-space-sm align-top">
                          <div className="flex flex-col">
                            {isOverdue ? (
                              <>
                                <span className="whitespace-nowrap font-body-semibold text-body-semibold text-status-danger">
                                  {formatDateTime(task.currentDeadline)}
                                </span>
                                <span className="font-label-sm text-label-sm text-status-danger font-semibold flex items-center gap-0.5">
                                  <V5Icon name="warning" className="text-[13px]" />
                                  Chậm tiến độ
                                </span>
                              </>
                            ) : isCompleted ? (
                              <>
                                <span className="font-body-semibold text-body-semibold text-status-success">
                                  Đã hoàn tất
                                </span>
                                <span className="font-label-sm text-label-sm text-v5-muted">
                                  Hoàn thành 100%
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="whitespace-nowrap font-body-semibold text-body-semibold text-primary">
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
                                : "bg-v5-bg text-v5-muted"
                            }`}
                          >
                            <V5Icon name="flag" className="text-[14px]" />
                            {task.priority}
                          </span>
                        </td>

                        <td className="py-3 px-space-sm align-top">
                          <div className="flex flex-col">
                            <span className="truncate font-label-sm text-label-sm text-primary font-semibold">
                              {task.owner?.fullName || currentUser.fullName}
                            </span>
                            <span className="text-v5-muted font-label-sm text-[11px]">
                              {task.unit?.name || currentUser.unitName || "Hải quan cửa khẩu Quốc tế Tà Lùng"}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-space-sm align-top">
                          {isReturned ? (
                            <div className="flex flex-col gap-1">
                              <span
                                data-testid={`task-returned-${task.id}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-label-sm font-label-sm bg-status-danger-bg text-status-danger font-semibold"
                                title={task.approval?.reason || task.approval?.content || ""}
                              >
                                <V5Icon name="undo" className="text-[14px]" /> Bị trả lại
                              </span>
                              {task.approval?.reason && (
                                <span className="text-[11px] text-v5-muted line-clamp-2">
                                  {task.approval.reason}
                                </span>
                              )}
                              <span className="text-[10px] text-v5-muted">Giữ nguyên tiến độ</span>
                            </div>
                          ) : isWaiting ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-label-sm font-label-sm bg-status-unassigned-bg text-status-unassigned font-semibold">
                              <V5Icon name="hourglass_top" className="text-[14px]" /> Đã báo hoàn thành — chờ duyệt
                            </span>
                          ) : isCompleted ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-label-sm font-label-sm bg-status-success-bg text-status-success font-semibold">
                              <V5Icon name="check_circle" className="text-[14px]" /> 100% Đạt
                            </span>
                          ) : (
                            <div className="flex flex-col gap-1 w-28">
                              <div className="flex items-center justify-between text-label-sm">
                                <span className="text-secondary font-semibold">
                                  {task.progressPercent ?? (isCompleted ? 100 : 0)}%
                                </span>
                                <span className="text-v5-muted">Đang chạy</span>
                              </div>
                              <div className="w-full bg-v5-bg h-1.5 rounded-full overflow-hidden">
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
                              <>
                                <button
                                  onClick={(e) => handleSendReminder(task.id, e)}
                                  disabled={remindingTaskId === task.id}
                                  className="px-2.5 py-1 rounded bg-v5-bg text-v5-ink font-label-sm text-label-sm hover:bg-v5-bg flex items-center gap-1 active-press disabled:opacity-50"
                                  title="Gửi thông báo nhắc Trưởng bộ phận phê duyệt"
                                >
                                  <V5Icon
                                    name={remindingTaskId === task.id ? "progress_activity" : "notifications_active"}
                                    className={`text-[14px] ${remindingTaskId === task.id ? "animate-spin" : ""}`}
                                  />
                                  <span>{remindingTaskId === task.id ? "Đang gửi..." : "Nhắc duyệt"}</span>
                                </button>
                                {canApprove && task.owner?.id !== permUser?.personId && (
                                  <button
                                    onClick={() => handleApproveTask(task)}
                                    disabled={approvingId === task.id}
                                    className="px-2.5 py-1 rounded bg-status-success text-white font-label-sm text-label-sm hover:bg-status-success/90 shadow-sm flex items-center gap-1 active-press font-semibold disabled:opacity-50"
                                    title="Duyệt hoàn thành và chọn mức chất lượng"
                                  >
                                    <V5Icon name="verified" className="text-[14px]" />
                                    <span>{approvingId === task.id ? "Đang duyệt..." : "Duyệt hoàn thành"}</span>
                                  </button>
                                )}
                              </>
                            ) : isPendingAccept ? (
                              <button
                                onClick={() => handleAcceptTask(task)}
                                disabled={acceptingId === task.id}
                                className="px-2.5 py-1 rounded bg-secondary text-on-secondary font-label-sm text-label-sm hover:bg-secondary/90 shadow-sm flex items-center gap-1 active-press font-semibold disabled:opacity-50"
                                title="Xác nhận đã nhận việc được giao"
                              >
                                <V5Icon name="how_to_reg" className="text-[14px]" />
                                <span>{acceptingId === task.id ? "Đang nhận..." : "Nhận việc"}</span>
                              </button>
                            ) : !isTaskTerminal(task.status) ? (
                              <button
                                onClick={() => openDrawerForTask(task)}
                                className="px-2.5 py-1 rounded bg-secondary text-on-secondary font-label-sm text-label-sm hover:bg-secondary/90 shadow-sm flex items-center gap-1 active-press font-semibold"
                              >
                                <V5Icon name="fact_check" className="text-[14px]" />
                                <span>Tác nghiệp 1 chạm</span>
                              </button>
                            ) : null}

                            <Link
                              href={`/tasks/${task.id}`}
                              className="p-1 rounded text-v5-muted hover:text-primary hover:bg-v5-bg transition-fast"
                              title="Xem chi tiết"
                            >
                              <V5Icon name="visibility" className="text-[16px]" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
          </DataTable>

          {/* PHÂN TRANG BẢNG NGHIỆP VỤ (server, 50/trang) */}
          <div className="p-space-sm bg-v5-bg flex flex-col sm:flex-row items-center justify-between text-label-sm text-v5-muted gap-space-sm border-t border-v5-line">
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
              <span className="text-xs text-v5-muted">Đã hiển thị tất cả</span>
            )}
          </div>
        </section>

        {/* BẢNG NGUYÊN TẮC TÁC NGHIỆP & AUDIT TIMELINE TÓM TẮT */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-space-md">
          {/* KHỐI 1 & 2: NHẬT KÝ THAO TÁC AUDIT TRAIL GẦN NHẤT */}
          <div className="lg:col-span-2 bg-v5-surface rounded-xl p-space-md shadow-sm flex flex-col justify-between border border-v5-line/40">
            <div className="flex items-center justify-between pb-space-sm border-b border-surface-container">
              <div className="flex items-center gap-2">
                <V5Icon name="manage_history" className="text-secondary text-[20px]" />
                <h2 className="text-sm font-semibold text-v5-ink">Lịch sử cập nhật cá nhân</h2>
              </div>
              <span className="font-label-sm text-label-sm text-v5-muted">Ghi nhận UTC+7 (Hải quan cửa khẩu Quốc tế Tà Lùng)</span>
            </div>
            <div className="flex flex-col gap-space-sm my-space-sm">
              {recentActivity.length === 0 ? (
                <div className="text-xs text-v5-muted text-center py-4">
                  Chưa có hoạt động nào. Cập nhật tiến độ công việc để ghi nhận tại đây.
                </div>
              ) : (
                recentActivity.map((a, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-2 rounded-lg bg-v5-bg">
                    <V5Icon name="update" className="text-secondary text-[18px] shrink-0 mt-0.5" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-body-semibold text-body-semibold text-primary truncate">
                          [{a.taskCode}] {a.taskTitle}
                        </span>
                        <span className="font-label-sm text-[11px] text-v5-muted shrink-0">
                          {new Date(a.at).toLocaleString("vi-VN")}
                        </span>
                      </div>
                      <p className="font-table-data text-[13px] text-v5-muted mt-0.5">
                        {a.author ? `${a.author}: ` : ""}{a.notes}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center justify-between pt-2 text-label-sm text-v5-muted">
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
                <V5Icon name="policy" className="text-[22px]" />
                <h3 className="font-headline-sm text-headline-sm">Hướng dẫn thao tác</h3>
              </div>
              <p className="font-body-md text-body-md text-on-primary-container leading-relaxed">
                Cập nhật tiến độ thường xuyên để lãnh đạo nắm tình hình và hỗ trợ kịp thời.
              </p>
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-start gap-2">
                  <V5Icon name="check_circle" className="text-secondary-fixed text-[18px] shrink-0 mt-0.5" />
                  <span className="font-label-md text-label-md text-surface-container-high">Xong việc: bấm Báo hoàn thành để trình nghiệm thu.</span>
                </div>
                <div className="flex items-start gap-2">
                  <V5Icon name="check_circle" className="text-secondary-fixed text-[18px] shrink-0 mt-0.5" />
                  <span className="font-label-md text-label-md text-surface-container-high">Cần thêm thời gian: xin lùi hạn kèm lý do, chờ phê duyệt.</span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-primary-container flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-on-primary-container">Cần hỗ trợ? Liên hệ quản trị hệ thống.</span>
              <V5Icon name="support_agent" className="text-secondary-fixed text-[18px]" />
            </div>
          </div>
        </section>
      </div>

      {/* =========================================================================
          MOBILE VIEW (Pixel-accurate Google Stitch ID 2443cdf63e214979b5a74c40779511ba)
          ========================================================================= */}
      <div className="lg:hidden flex flex-col gap-3 pb-16">
        <PageHeader
          title="Việc của tôi"
          badges={<Badge variant="success">Sẵn sàng</Badge>}
          description={
            <>
              {currentUser.fullName} · {currentUser.unitName}
              <span className="mt-0.5 block text-[10px]">{ENV_BADGE_LABEL} · Ca chính 07:30 - 17:00</span>
            </>
          }
          actions={
            <Button variant="outline" size="icon" onClick={() => fetchTasks()} aria-label="Làm mới">
              <RefreshCw className="h-4 w-4" />
            </Button>
          }
        />

        <div data-tour="time-filter">
          <FilterBar>
            {[
              { key: "DAY" as const, label: `Hôm nay (${todayShort || "..."})` },
              { key: "WEEK" as const, label: periodLabels.weekShort },
              { key: "MONTH" as const, label: periodLabels.monthShort },
              { key: "ALL" as const, label: "Tất cả" },
            ].map((item) => (
              <FilterChip
                key={item.key}
                active={timeFilter === item.key}
                onClick={() => setTimeFilter(item.key)}
                className="flex-1"
              >
                {item.label}
              </FilterChip>
            ))}
          </FilterBar>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label="Cần xử lý"
            value={String(myStats.active).padStart(2, "0")}
            unit="đầu việc"
            icon={ClipboardList}
            tone="accent"
            hint={
              <span className={myStats.high > 0 ? "font-semibold text-v5-danger" : undefined}>
                {myStats.high > 0 ? `${myStats.high} ưu tiên cao` : "Không có việc gấp"}
              </span>
            }
          />
          <StatCard
            label="Sắp đến hạn"
            value={String(myStats.dueSoon).padStart(2, "0")}
            unit="24 giờ"
            icon={Timer}
            tone="warning"
            hint={myStats.dueSoon > 0 ? "Cần xử lý" : "Không có việc gấp"}
          />
          <StatCard
            label="Quá hạn"
            value={String(myStats.overdue).padStart(2, "0")}
            unit="hồ sơ"
            icon={AlertTriangle}
            tone="danger"
            hint={
              <span className="font-semibold text-v5-danger">
                {myStats.overdue > 0 ? `Chậm ${myStats.maxOverdueDays} ngày` : "Đúng hạn"}
              </span>
            }
          />
          <StatCard
            label="Chờ phê duyệt"
            value={String(myStats.waiting).padStart(2, "0")}
            unit="đã nộp"
            icon={CheckCircle2}
            hint="Chờ Trưởng BP ký"
          />
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
                  : "bg-v5-bg text-v5-muted"
              }`}
            >
              <span>Tất cả</span>
            </button>
            <button
              onClick={openWaitingAcceptTab}
              className={`px-3 py-1.5 rounded-full font-body-semibold text-label-md shrink-0 transition-fast ${
                activeTab === "WAITING_ACCEPT"
                  ? "bg-primary text-on-primary"
                  : "bg-v5-bg text-v5-muted"
              }`}
            >
              <span>Chờ nhận việc ({waitingAcceptCount})</span>
            </button>
            <button
              onClick={() => setActiveTab("IN_PROGRESS")}
              className={`px-3 py-1.5 rounded-full font-body-semibold text-label-md shrink-0 transition-fast ${
                activeTab === "IN_PROGRESS"
                  ? "bg-primary text-on-primary"
                  : "bg-v5-bg text-v5-muted"
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
                  : "bg-v5-bg text-v5-muted"
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
            const isReturned =
              task.status === "IN_PROGRESS" &&
              (task.approval?.action === "REJECT" || task.approval?.action === "CLARIFY");
            const deadlineAt = new Date(task.currentDeadline).getTime();
            const overdueDays = isNaN(deadlineAt) ? 0 : Math.max(0, Math.floor((Date.now() - deadlineAt) / 86400000));

            if (isOverdue) {
              return (
                <div
                  key={task.id}
                  className="bg-v5-surface rounded-xl p-3.5 shadow-sm flex flex-col gap-3 relative overflow-hidden"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-status-danger" />
                  <div className="flex items-start justify-between gap-2 pl-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-label-sm text-label-sm font-bold text-status-danger bg-status-danger-bg px-2 py-0.5 rounded">
                        {task.code}
                      </span>
                      {task.hasIssue && (
                        <span className="px-2 py-0.5 rounded bg-status-warning-bg text-status-warning font-label-sm text-[11px] font-semibold flex items-center gap-0.5">
                          <V5Icon name="report_problem" className="text-[13px]" /> Có vướng mắc
                        </span>
                      )}
                      {isReturned && (
                        <span className="px-2 py-0.5 rounded bg-status-danger-bg text-status-danger font-label-sm text-[11px] font-bold flex items-center gap-0.5">
                          <V5Icon name="undo" className="text-[13px]" /> Bị trả lại
                        </span>
                      )}
                    </div>
                    <span className="px-2 py-0.5 rounded bg-status-danger text-on-primary font-label-sm text-[11px] font-bold flex items-center gap-1 shrink-0 shadow-xs">
                      <V5Icon name="alarm_off" className="text-[13px]" />{" "}
                      {task.isOverdue ? `Quá hạn ${overdueDays} ngày` : "Cần xử lý"}
                    </span>
                  </div>
                  <div className="pl-1">
                    <h3 className="font-headline-sm text-headline-sm text-v5-ink font-bold leading-tight">
                      {task.title}
                    </h3>
                    <p className="font-label-sm text-[12px] text-v5-muted mt-1">
                      Hạn: {formatDateTime(task.currentDeadline)}
                      {task.owner ? ` • ${task.owner.fullName}` : ""}
                    </p>
                    {task.issueNotes && (
                      <div className="mt-2.5 p-2.5 rounded-lg bg-status-warning-bg/80 flex items-start gap-2">
                        <V5Icon name="info" className="text-status-warning text-[18px] shrink-0 mt-0.5" />
                        <div className="flex flex-col text-[12px]">
                          <span className="font-body-semibold text-status-warning">Vướng mắc phát sinh:</span>
                          <span className="text-v5-ink">{task.issueNotes}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 pl-1">
                    <button
                      onClick={() => openDrawerForTask(task)}
                      className="h-11 px-2.5 rounded-lg bg-v5-bg text-v5-ink font-body-semibold text-body-md flex items-center justify-center gap-1 hover:bg-v5-bg-high active:scale-[0.98] transition-all"
                      type="button"
                    >
                      <V5Icon name="schedule_send" className="text-[18px] text-status-warning" />
                      <span className="text-[13px] leading-tight truncate">Xin lùi hạn</span>
                    </button>
                    <button
                      onClick={() => openDrawerForTask(task)}
                      className="h-11 px-2.5 rounded-lg bg-status-danger text-on-primary font-body-semibold text-body-md flex items-center justify-center gap-1 hover:opacity-95 active:scale-[0.98] transition-all shadow-sm"
                      type="button"
                    >
                      <V5Icon name="gavel" className="text-[18px]" />
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
                  className="bg-v5-surface rounded-xl p-3.5 shadow-sm flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-label-sm text-label-sm font-bold text-primary-container bg-v5-bg px-2 py-0.5 rounded">
                        {task.code}
                      </span>
                      <span className="font-label-sm text-v5-muted text-[11px]">
                        {task.planLinks?.[0]?.planItem?.plan?.title || "Đầu việc phát sinh"}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-status-warning-bg text-status-warning font-label-sm text-[11px] font-bold flex items-center gap-1 shrink-0">
                      <V5Icon name="pending" className="text-[13px]" /> Chờ Trưởng BP duyệt
                    </span>
                  </div>
                  <div>
                    <h3 className="font-headline-sm text-headline-sm text-v5-ink font-bold leading-tight">
                      {task.title}
                    </h3>
                    <div className="mt-2.5 p-2 rounded-lg bg-v5-bg flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <V5Icon name="assignment_turned_in" className="text-secondary text-[20px] shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="font-body-semibold text-v5-ink truncate">Đã nộp kết quả</span>
                          <span className="text-v5-muted text-[11px]">
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
                      className="flex-1 h-11 px-3 rounded-lg bg-v5-bg text-v5-muted font-label-md text-label-md flex items-center justify-center gap-1 hover:bg-v5-bg-high transition-all"
                    >
                      <V5Icon name="visibility" className="text-[17px]" />
                      <span>Xem chi tiết hồ sơ nộp</span>
                    </Link>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={task.id}
                className="bg-v5-surface rounded-xl p-3.5 shadow-sm flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-label-sm text-label-sm font-bold text-primary-container bg-v5-bg px-2 py-0.5 rounded">
                      {task.code}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-status-danger-bg text-status-danger font-label-sm text-[11px] font-bold flex items-center gap-0.5">
                      <V5Icon name="flag" className="text-[13px]" /> {task.priority || "Cao"}
                    </span>
                    <span className="text-v5-muted font-label-sm text-[11px]">TTHQ</span>
                    {isReturned && (
                      <span className="px-2 py-0.5 rounded bg-status-danger-bg text-status-danger font-label-sm text-[11px] font-bold flex items-center gap-0.5">
                        <V5Icon name="undo" className="text-[13px]" /> Bị trả lại
                      </span>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded bg-status-warning-bg text-status-warning font-label-sm text-[11px] font-semibold flex items-center gap-1 shrink-0">
                    <V5Icon name="schedule" className="text-[13px]" /> {formatDateTime(task.currentDeadline)}
                  </span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-v5-ink font-bold leading-tight">
                    {task.title}
                  </h3>
                  <div className="mt-2 flex items-center gap-1.5 text-v5-muted font-label-md text-label-md">
                    <V5Icon name="assignment_ind" className="text-[16px] text-secondary" />
                    <span className="truncate">
                      {isSelfInitiated(task.originKind) ? (
                        <>Nguồn: <strong className="text-v5-ink font-body-semibold">Công việc tự khởi tạo</strong></>
                      ) : (
                        <>Người giao: <strong className="text-v5-ink font-body-semibold">{task.owner?.fullName || "Lãnh đạo bộ phận"}</strong> ({task.owner?.position || "Phụ trách"})</>
                      )}
                    </span>
                  </div>
                </div>
                <div className="bg-v5-bg p-2 rounded-lg flex items-center justify-between text-[12px] text-v5-muted">
                  <span className="flex items-center gap-1">
                    <V5Icon name="inventory_2" className="text-[15px] text-secondary" />
                    <span>{task.unit?.name || "Hải quan cửa khẩu Quốc tế Tà Lùng"}</span>
                  </span>
                  <span className="font-body-semibold text-secondary">Tiến độ {task.progressPercent ?? (task.status === "COMPLETED" ? 100 : 0)}%</span>
                </div>
                {isReturned && (task.approval?.reason || task.approval?.content) && (
                  <div className="rounded-lg bg-status-danger-bg/50 border border-status-danger/30 px-3 py-2 text-[11px] text-v5-ink">
                    <b className="text-status-danger">Lý do trả lại:</b> {task.approval?.reason || task.approval?.content}
                    {task.approval?.decidedByName ? ` · ${task.approval.decidedByName}` : ""}
                    <span className="block text-v5-muted mt-0.5">
                      Tiến độ hiện tại (kể cả 100%) được giữ nguyên khi trả lại.
                    </span>
                  </div>
                )}
                {/* YC-38 UAT fix: khoi "Nguon cong viec" — ma TX + nguon phat sinh */}
                <div className="bg-v5-surface border border-v5-line/50 rounded-lg p-2 flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-v5-muted font-semibold">
                    Nguồn công việc
                  </span>
                  <TxSourceBadge source={task.txSource} />
                  <span className="text-[11px] text-v5-muted">
                    {originLabel(task.originKind)}
                  </span>
                </div>
                {isTaskTerminal(task.status) ? (
                  <div className="rounded-lg bg-v5-bg px-3 py-2 text-[12px] text-v5-muted">
                    Nhiệm vụ đã được nghiệm thu — bạn có thể xem kết quả và lịch sử, nhưng không thể cập nhật hoặc nộp lại.
                  </div>
                ) : isMyPendingAcceptance(task, currentUser.personId) ? (
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    <button
                      onClick={() => handleAcceptTask(task)}
                      disabled={acceptingId === task.id}
                      className="h-11 px-3 rounded-lg bg-secondary text-on-secondary font-body-semibold text-body-md flex items-center justify-center gap-1.5 hover:opacity-95 active:scale-[0.98] transition-all shadow-sm disabled:opacity-50"
                      type="button"
                    >
                      <V5Icon name="how_to_reg" className="text-[18px]" />
                      <span>{acceptingId === task.id ? "Đang xác nhận..." : "Nhận việc"}</span>
                    </button>
                  </div>
                ) : (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => openDrawerForTask(task)}
                    className="h-11 px-3 rounded-lg bg-v5-bg text-primary font-body-semibold text-body-md flex items-center justify-center gap-1.5 hover:bg-v5-bg-high active:scale-[0.98] transition-all"
                    type="button"
                  >
                    <V5Icon name="edit_note" className="text-[18px]" />
                    <span>Cập nhật tiến độ</span>
                  </button>
                  <button
                    onClick={() => openDrawerForTask(task)}
                    className="h-11 px-3 rounded-lg bg-secondary text-on-secondary font-body-semibold text-body-md flex items-center justify-center gap-1.5 hover:opacity-95 active:scale-[0.98] transition-all shadow-sm"
                    type="button"
                  >
                    <V5Icon name="task_alt" className="text-[18px]" />
                    <span>Báo hoàn thành</span>
                  </button>
                </div>
                )}
                {canApprove && task.status !== "COMPLETED" && task.status !== "CANCELED" && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => openEditAssign(task)}
                      className="h-10 px-3 rounded-lg bg-v5-surface text-primary font-body-semibold text-body-md flex items-center justify-center gap-1.5 border border-v5-line active:scale-[0.98] transition-all"
                      type="button"
                    >
                      <V5Icon name="manage_accounts" className="text-[18px]" />
                      <span>Sửa giao việc</span>
                    </button>
                    {task.status === "WAITING_REVIEW" ? (
                      <button
                        onClick={() => handleApproveTask(task)}
                        disabled={approvingId === task.id}
                        className="h-10 px-3 rounded-lg bg-status-success text-white font-body-semibold text-body-md flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-50"
                        type="button"
                      >
                        <V5Icon name="verified" className="text-[18px]" />
                        <span>{approvingId === task.id ? "Đang duyệt..." : "Duyệt hoàn thành"}</span>
                      </button>
                    ) : (
                      <Link
                        href={`/tasks/${task.id}`}
                        className="h-10 px-3 rounded-lg bg-v5-surface text-primary font-body-semibold text-body-md flex items-center justify-center gap-1.5 border border-v5-line active:scale-[0.98] transition-all"
                      >
                        <V5Icon name="visibility" className="text-[18px]" />
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
          <span className="text-[11px] text-v5-muted">Đã tải {tasks.length}/{totalCount} nhiệm vụ</span>
          {page < totalPages && (
            <button
              onClick={() => fetchTasks({ page: page + 1, append: true })}
              disabled={loadingMore}
              className="w-full h-11 rounded-lg bg-v5-surface text-primary font-body-semibold text-body-md shadow-sm border border-v5-line active-press disabled:opacity-50"
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
            <V5Icon name="add_task" className="text-[24px]" />
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
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          />

          <aside className="relative w-full max-w-full sm:max-w-[520px] sm:w-[520px] bg-v5-surface shadow-2xl z-50 flex flex-col h-full transform transition-transform duration-300 ease-in-out">
            {/* DRAWER HEADER */}
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between shrink-0">
              <div className="flex items-center gap-space-sm min-w-0 flex-1">
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-on-secondary shadow-sm shrink-0">
                  <V5Icon name="fact_check" className="text-[20px]" />
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
                <V5Icon name="close" className="text-[22px]" />
              </button>
            </div>

            {/* DRAWER THÔNG TIN NHANH */}
            {selectedTask && (
              <div className="bg-v5-bg p-space-md flex flex-col gap-2 shrink-0 border-b border-v5-line">
                <div className="flex items-center justify-between">
                  <span className="font-headline-sm text-headline-sm text-primary font-bold">
                    Mã việc: {selectedTask.code}
                  </span>
                  <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-secondary/15 text-secondary font-semibold">
                    {selectedTask.planLinks?.[0]?.planItem?.plan?.title || "Kế hoạch tuần"}
                  </span>
                </div>
                <p className="font-body-semibold text-body-semibold text-v5-ink">
                  {selectedTask.title}
                </p>
                <div className="grid grid-cols-2 gap-2 text-label-sm mt-1">
                  <div className="text-v5-muted">
                    Hạn xử lý: <strong className="text-status-warning">{formatDateTime(selectedTask.currentDeadline)}</strong>
                  </div>
                  <div className="text-v5-muted text-right">
                    Phối hợp: <strong className="text-primary">{selectedTask.assignees?.[0]?.person?.fullName || selectedTask.unit?.name || "Hải quan cửa khẩu Quốc tế Tà Lùng"}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Action Feedback Alerts */}
            {actionSuccess && (
              <div className="p-3 bg-status-success-bg border-b border-status-success/30 text-status-success text-xs font-semibold flex items-center gap-2">
                <V5Icon name="check_circle" className="text-[18px]" />
                <span>{actionSuccess}</span>
              </div>
            )}
            {actionError && (
              <div className="p-3 bg-status-danger-bg border-b border-status-danger/30 text-status-danger text-xs font-semibold flex items-center gap-2">
                <V5Icon name="error" className="text-[18px]" />
                <span>{actionError}</span>
              </div>
            )}

            {/* DRAWER FORM THAO TÁC CÁN BỘ */}
            <div className="flex-1 overflow-y-auto p-space-md flex flex-col gap-space-md">
              {/* Chuyển trạng thái */}
              <div className="flex flex-col gap-1.5">
                <label className="font-body-semibold text-body-semibold text-primary">
                  {selectedTask?.owner?.id === currentUser?.personId
                    ? "1. Chuyển trạng thái công việc"
                    : "1. Trạng thái phần việc của tôi"}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    onClick={() => setDrawerStatus("IN_PROGRESS")}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-fast ${
                      drawerStatus === "IN_PROGRESS"
                        ? "bg-secondary/15 border border-secondary text-primary font-semibold"
                        : "bg-v5-bg hover:bg-v5-bg text-v5-ink"
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
                  {selectedTask?.owner?.id === currentUser?.personId && (
                    <label
                      onClick={() => {
                        setDrawerStatus("COMPLETED");
                        setDrawerProgress(100);
                      }}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-fast ${
                        drawerStatus === "COMPLETED"
                          ? "bg-status-success-bg border border-status-success text-status-success font-semibold"
                          : "bg-v5-bg hover:bg-v5-bg text-v5-ink"
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
                  )}
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
                  className="w-full accent-secondary cursor-pointer h-2 bg-v5-bg rounded-lg"
                />
                <div className="flex justify-between text-label-sm text-v5-muted px-0.5">
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
                  className="w-full p-2.5 rounded-lg bg-v5-bg text-body-md font-body-md text-v5-ink border border-v5-line focus:outline-none focus:ring-2 focus:ring-secondary resize-none"
                />
                <span className="font-label-sm text-[12px] text-v5-muted">
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
                      <V5Icon name="progress_activity" className="text-[14px] animate-spin" />
                      Đang tải lên Supabase...
                    </span>
                  )}
                </div>

                {/* Danh sách tệp đính kèm thực tế từ Supabase Storage */}
                <div className="flex flex-col gap-1.5">
                  {attachmentsLoading ? (
                    <div className="p-3 rounded-lg bg-v5-bg text-center text-label-sm text-v5-muted flex items-center justify-center gap-2">
                      <V5Icon name="progress_activity" className="text-[16px] animate-spin" />
                      Đang tải danh sách tài liệu...
                    </div>
                  ) : attachments.length === 0 ? (
                    <div className="p-3 rounded-lg bg-v5-bg border border-dashed border-v5-line text-center">
                      <p className="font-label-sm text-label-sm text-v5-muted">
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
                          className="flex items-center justify-between p-2.5 rounded-lg bg-v5-bg border border-v5-line hover:border-secondary/40 transition-fast"
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
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
                              className={`shrink-0 text-[22px] ${
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
                                className="font-label-md text-label-md text-primary font-semibold truncate hover:underline hover:text-secondary"
                                title={`Mở tệp: ${att.fileName}`}
                              >
                                {att.fileName}
                              </a>
                              <span className="font-label-sm text-[11px] text-v5-muted">
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
                                className="p-1 text-v5-muted hover:text-secondary transition-fast rounded hover:bg-v5-bg"
                                title="Xem nhanh tệp"
                              >
                                <V5Icon name="visibility" className="text-[18px]" />
                              </button>
                            )}
                            <a
                              href={att.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              download
                              className="p-1 text-v5-muted hover:text-secondary transition-fast rounded hover:bg-v5-bg"
                              title="Tải về máy tính"
                            >
                              <V5Icon name="download" className="text-[18px]" />
                            </a>
                            <button
                              type="button"
                              onClick={() => handleDeleteAttachment(att.id)}
                              className="p-1 text-v5-muted hover:text-status-danger transition-fast rounded hover:bg-v5-bg"
                              title="Xóa tệp"
                            >
                              <V5Icon name="delete" className="text-[18px]" />
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
                  className="mt-1 w-full py-2.5 rounded-lg bg-v5-bg text-secondary font-label-md text-label-md hover:bg-v5-bg flex items-center justify-center gap-2 transition-fast active-press border border-v5-line disabled:opacity-50"
                >
                  <V5Icon
                    name={uploadingFile ? "progress_activity" : "upload_file"}
                    className={`text-[18px] ${uploadingFile ? "animate-spin" : ""}`}
                  />
                  <span>
                    {uploadingFile
                      ? "Đang tải tệp lên..."
                      : "Tải thêm tệp tin đính kèm (PDF, Excel, DOCX, Ảnh)"}
                  </span>
                </button>
              </div>

              {/* Lưu ý nghiệp vụ */}
              <div className="p-space-sm rounded-lg bg-status-warning-bg/40 flex items-start gap-2 border border-status-warning/30">
                <V5Icon name="info" className="text-status-warning text-[18px] shrink-0 mt-0.5" />
                <p className="font-label-sm text-label-sm text-v5-muted">
                  Bấm <strong>&quot;Báo hoàn thành &amp; Trình duyệt&quot;</strong> hệ thống sẽ tự động cập nhật Dashboard lãnh đạo và chuyển thông báo tới Trưởng bộ phận.
                </p>
              </div>
            </div>

            {/* DRAWER ACTIONS FOOTER */}
            <div className="p-space-md bg-v5-bg flex items-center justify-between gap-space-sm shrink-0 border-t border-v5-line">
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="px-4 py-2 rounded-lg bg-v5-surface text-v5-ink font-label-md text-label-md hover:bg-v5-bg transition-fast border border-v5-line active-press"
              >
                Hủy bỏ
              </button>
              <div className="flex items-center gap-space-sm">
                <button
                  disabled={drawerLoading}
                  onClick={() => handleDrawerSubmit(false)}
                  className="px-3 py-2 rounded-lg bg-v5-bg text-primary font-label-md text-label-md hover:bg-v5-bg-high transition-fast active-press"
                >
                  {drawerLoading
                    ? "Đang lưu..."
                    : selectedTask?.owner?.id === currentUser?.personId
                      ? "Lưu nháp"
                      : "Lưu tiến độ phần việc"}
                </button>
                {selectedTask?.owner?.id === currentUser?.personId && (
                  <button
                    disabled={drawerLoading}
                    onClick={() => handleDrawerSubmit(true)}
                    className="px-4 py-2 rounded-lg bg-secondary text-on-secondary font-label-md text-label-md hover:opacity-90 shadow-sm flex items-center gap-1.5 font-semibold transition-fast active-press"
                  >
                    <V5Icon name="send_time_extension" className="text-[18px]" />
                    <span>{drawerLoading ? "Đang gửi..." : "Báo hoàn thành & Trình duyệt"}</span>
                  </button>
                )}
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
          <div className="w-full max-w-lg bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line">
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <h3 className="font-headline-sm font-semibold">Sửa giao việc [{editTask.code}]</h3>
              <button onClick={() => setEditTask(null)}>
                <V5Icon name="close" className="text-[20px]" />
              </button>
            </div>
            <form onSubmit={handleEditAssignSave}>
              <div className="p-space-md flex flex-col gap-space-md max-h-[70vh] overflow-y-auto">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-primary">Tên / Nội dung chỉ đạo *</label>
                  <input type="text" required value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Nhập nội dung công việc chỉ đạo..."
                    className="h-10 px-3 rounded bg-v5-bg text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary" />
                </div>
                <div className="grid grid-cols-2 gap-space-sm">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-primary">Cán bộ chủ trì</label>
                    <select value={editOwnerId} onChange={(e) => setEditOwnerId(e.target.value)}
                      className="h-10 px-2 rounded bg-v5-bg text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary">
                      {editTask.owner && <option value={editTask.owner.id}>{editTask.owner.fullName}</option>}
                      {people.filter((p) => p.id !== editTask.owner?.id).map((p) => (
                        <option key={p.id} value={p.id}>{p.fullName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-primary">Ưu tiên</label>
                    <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)}
                      className="h-10 px-2 rounded bg-v5-bg text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary">
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
                    className="h-10 px-3 rounded bg-v5-bg text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary" />
                </div>
              </div>
              <div className="p-space-md bg-v5-bg flex items-center justify-end gap-2 border-t border-v5-line">
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
          <div className="w-full max-w-lg bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line transition-panel">
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <div className="flex items-center gap-2">
                <V5Icon name="add_circle" className="text-secondary-fixed text-[22px]" />
                <h3 className="font-headline-sm text-headline-sm text-white">
                  Thêm Đầu Việc Cá Nhân Tùy Biến
                </h3>
              </div>
              <button
                onClick={() => setIsNewTaskModalOpen(false)}
                className="text-on-primary-container hover:text-white transition-fast"
              >
                <V5Icon name="close" className="text-[20px]" />
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
                    className="h-9 px-3 rounded bg-v5-bg text-body-md font-body-md text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
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
                      className="h-9 px-2 rounded bg-v5-bg text-body-md font-body-md text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
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
                      className="h-9 px-2 rounded bg-v5-bg text-body-md font-body-md text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
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
                      className="h-9 px-2 rounded bg-v5-bg text-body-md font-body-md text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
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
                      className="h-9 px-2 rounded bg-v5-bg text-body-md font-body-md text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
                    />
                  </div>
                </div>
              </div>

              <div className="p-space-md bg-v5-bg flex items-center justify-end gap-space-sm border-t border-v5-line">
                <button
                  type="button"
                  onClick={() => setIsNewTaskModalOpen(false)}
                  className="px-4 py-2 rounded bg-v5-surface text-v5-ink font-label-md text-label-md hover:bg-v5-bg border border-v5-line transition-fast active-press"
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

      {/* YC-10 Phase 2b: modal duyệt nhanh — bắt buộc chọn quality khi flag bật */}
      {quickApproveTask && (
        <div
          className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4"
          data-testid="quick-approve-quality-modal"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line">
            <div className="p-4 bg-status-success text-white flex items-center justify-between gap-2">
              <h3 className="font-headline-sm text-sm font-bold">
                Duyệt hoàn thành &amp; chọn chất lượng
              </h3>
              <button
                type="button"
                onClick={() => setQuickApproveTask(null)}
                aria-label="Đóng"
                disabled={quickApproveBusy}
              >
                <V5Icon name="close" className="text-[20px]" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <p className="text-xs text-v5-ink">
                Nhiệm vụ <strong>{quickApproveTask.code}</strong> — {quickApproveTask.title}
              </p>
              <label className="text-xs font-semibold text-v5-ink">
                Mức chất lượng kết quả (65–100, bước 5){" "}
                <span className="text-status-danger">*</span>
              </label>
              <select
                data-testid="quick-approve-quality-select"
                value={quickApproveQuality}
                onChange={(e) => setQuickApproveQuality(e.target.value)}
                disabled={quickApproveBusy}
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
                Không tự mặc định 100; mức chất lượng chỉ hiển thị/audit, không tự đổi điểm hoặc xếp loại.
              </p>
            </div>
            <div className="p-4 bg-v5-bg flex items-center justify-end gap-2 border-t border-v5-line">
              <button
                type="button"
                onClick={() => setQuickApproveTask(null)}
                disabled={quickApproveBusy}
                className="px-3 py-1.5 rounded bg-v5-bg text-xs font-semibold disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                data-testid="quick-approve-confirm"
                onClick={handleQuickApproveConfirm}
                disabled={quickApproveBusy || !quickApproveQuality}
                className="px-4 py-1.5 rounded bg-status-success text-white text-xs font-semibold active-press disabled:opacity-50"
              >
                {quickApproveBusy ? "Đang duyệt..." : "Xác nhận duyệt"}
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
                  rel="noreferrer"
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

export default function MyWorkPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen w-full items-center justify-center bg-transparent">
          <div className="flex items-center gap-2 rounded-xl border border-v5-line/50 bg-v5-surface px-4 py-3 text-label-md text-v5-muted shadow-sm">
            <V5Icon name="progress_activity" className="text-[20px] text-secondary animate-spin" />
            <span>Đang tải không gian tác nghiệp...</span>
          </div>
        </div>
      }
    >
      <MyWorkPageContent />
    </Suspense>
  );
}


