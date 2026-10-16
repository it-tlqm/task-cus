"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/Toast";
import { CollaboratorPicker } from "@/components/tasks/CollaboratorPicker";
import { usePermissions } from "@/hooks/usePermissions";
import { getRoleDisplayName } from "@/lib/unit-info";

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
  deadlineRequests?: Array<{
    id: string;
    requestedDeadline: string;
    reason: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
  }>;
  planLinks?: Array<{
    planItem?: {
      title?: string;
      plan?: { title?: string };
    };
  }>;
}

function formatDateTime(isoStr?: string) {
  if (!isoStr) return "--";
  try {
    const d = new Date(isoStr);
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${hours}:${minutes} ${day}/${month}/${year}`;
  } catch {
    return isoStr;
  }
}

function getOverdueText(isoStr: string) {
  const diffMs = Date.now() - new Date(isoStr).getTime();
  if (diffMs <= 0) return null;
  const hours = Math.floor(diffMs / (1000 * 3600));
  const days = Math.floor(hours / 24);
  if (days > 0) return `Trễ ${days} ngày`;
  return `Trễ ${Math.max(1, hours)}h`;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"ALL" | "IN_PROGRESS" | "WAITING_REVIEW" | "EXTENSIONS" | "OVERDUE">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilterUnit, setSelectedFilterUnit] = useState<string>("ALL");
  // UX: phân trang server + tìm kiếm server (API giới hạn 50/trang)
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const { canAssign, canApprove, canAudit, user: permUser } = usePermissions();

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showExtModal, setShowExtModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  // Units & People from DB
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [people, setPeople] = useState<Array<{ id: string; fullName: string; assignments?: any[] }>>([]);

  // Forms
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<"Cao" | "Trung bình" | "Thấp" | "Khẩn">("Cao");
  const [newDeadline, setNewDeadline] = useState("2026-10-15T17:00");
  const [newSource, setNewSource] = useState("Chỉ đạo đột xuất Lãnh đạo");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [newExpectedResult, setNewExpectedResult] = useState("");
  // YC-01: cán bộ phối hợp (mỗi người một hàng, không trùng, không trùng chủ trì)
  const [collabIds, setCollabIds] = useState<string[]>([]);
  // YC-04: chặn bấm trùng nút giao việc
  const [isCreating, setIsCreating] = useState(false);
  // Đợt A: ảnh/văn bản đính kèm ngay khi giao (tải sau khi Task được tạo)
  const [newAttachFiles, setNewAttachFiles] = useState<File[]>([]);
  // AI soạn nháp (tự ẩn khi máy chủ chưa cấu hình key)
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiIdea, setAiIdea] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const uploadCreateAttachments = async (taskId: string, files: File[]): Promise<number> => {
    let ok = 0;
    for (const f of files.slice(0, 5)) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("isSigned", "false");
        const r = await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: fd });
        if (r.ok) ok++;
      } catch {}
    }
    return ok;
  };

  // Approval review notes
  const [approvalNotes, setApprovalNotes] = useState("");
  const [extDecisionNotes, setExtDecisionNotes] = useState("");

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
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Tìm kiếm server (debounce): gõ xong 500ms mới tải lại từ trang 1 (bỏ qua lần đầu)
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

    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const q = sp.get("q");
      if (q) setSearchQuery(q);
      const u = sp.get("unitId");
      if (u) setSelectedFilterUnit(u);
    }

    fetch("/api/org-units/tree")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.flatList) {
          const list = json.flatList.map((u: any) => ({ id: u.id, name: u.name }));
          setUnits(list);
          if (list.length > 0) setSelectedUnitId(list[0].id);
        }
      })
      .catch(() => {});

    fetch("/api/people")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data) {
          setPeople(json.data);
          if (json.data.length > 0) setSelectedOwnerId(json.data[0].id);
        }
      })
      .catch(() => {});

    fetch("/api/ai")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.enabled) setAiEnabled(true);
      })
      .catch(() => {});
  }, []);

  // AI soạn nháp nội dung chỉ đạo từ vài từ khóa (người duyệt vẫn sửa tay)
  const handleAiDraft = async () => {
    if (aiLoading || !aiIdea.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "draft", idea: aiIdea.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data) {
        if (json.data.title) setNewTitle(json.data.title);
        if (json.data.content) setNewSource(json.data.content);
        toast.success("AI đã soạn nháp — kiểm tra và sửa lại trước khi chuyển!");
      } else {
        toast.error(json.error || "AI bận, thử lại sau");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || isCreating) return;

    // YC-04: khóa nút ngay khi bấm — một thao tác chỉ gửi một request
    setIsCreating(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          priority: newPriority,
          currentDeadline: new Date(newDeadline).toISOString(),
          description: newSource,
          expectedResultText: newExpectedResult || undefined,
          unitId: selectedUnitId || undefined,
          ownerId: selectedOwnerId || undefined,
          assigneeIds: collabIds,
          status: "IN_PROGRESS",
          progressPercent: 0,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        // Đợt A: tải tài liệu đính kèm kèm theo chỉ đạo (nếu có)
        let attachMsg = "";
        if (newAttachFiles.length > 0 && json.data?.id) {
          const n = await uploadCreateAttachments(json.data.id, newAttachFiles);
          attachMsg = n > 0 ? ` (đính kèm ${n} tệp)` : " (tải đính kèm thất bại, bổ sung ở chi tiết)";
        }
        setShowCreateModal(false);
        setNewTitle("");
        setNewExpectedResult("");
        setCollabIds([]);
        setNewAttachFiles([]);
        fetchTasks();
        toast.success(
          json.deduplicated
            ? "Nhiệm vụ vừa được tạo (hệ thống chặn bấm trùng, không tạo thêm bản ghi)"
            : `Đã chuyển ý kiến chỉ đạo thành công!${attachMsg}`
        );
      } else {
        toast.error(json.error || "Không thể tạo nhiệm vụ");
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối máy chủ: " + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleApproveResult = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "COMPLETED",
          actualResultText: approvalNotes || "Lãnh đạo đơn vị đã ký duyệt kết quả hoàn thành.",
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setShowApproveModal(false);
        setApprovalNotes("");
        fetchTasks();
        toast.success("Đã phê duyệt kết quả hoàn thành nhiệm vụ thành công!");
      } else {
        toast.error(json.error || "Không thể phê duyệt nhiệm vụ");
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối máy chủ: " + err.message);
    }
  };

  const handleApproveExtension = async (taskId: string, reqId?: string) => {
    try {
      const pendingReqId = reqId || selectedTask?.deadlineRequests?.find((dr) => dr.status === "PENDING")?.id;
      if (pendingReqId) {
        const res = await fetch(`/api/tasks/${taskId}/deadline-request/${pendingReqId}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "APPROVE",
            reviewNotes: extDecisionNotes || "Lãnh đạo đơn vị đồng ý gia hạn thời gian giải quyết.",
          }),
        });

        if (res.ok) {
          setShowExtModal(false);
          setExtDecisionNotes("");
          fetchTasks();
          toast.success("Đã phê duyệt gia hạn thời gian giải quyết nhiệm vụ!");
          return;
        }
      }

      // Fallback: cập nhật hạn chót trực tiếp
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentDeadline: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        }),
      });

      if (res.ok) {
        setShowExtModal(false);
        setExtDecisionNotes("");
        fetchTasks();
        toast.success("Đã phê duyệt gia hạn thời gian giải quyết nhiệm vụ!");
      }
    } catch {
      // ignore
    }
  };

  // Computed KPI counts
  const loadedCount = tasks.length;
  const inProgressCount = tasks.filter((t) => t.status === "IN_PROGRESS" || t.status === "NOT_STARTED").length;
  const waitingReviewCount = tasks.filter((t) => t.status === "WAITING_REVIEW").length;
  const extCount = tasks.filter((t) => (t.deadlineRequests && t.deadlineRequests.length > 0) || t.hasIssue).length;
  const overdueCount = tasks.filter((t) => t.isOverdue || t.hasIssue).length;

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    if (selectedFilterUnit !== "ALL" && task.unit?.id !== selectedFilterUnit) {
      return false;
    }

    const matchesSearch =
      task.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.title.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (activeTab === "ALL") return true;
    if (activeTab === "IN_PROGRESS") return task.status === "IN_PROGRESS" || task.status === "NOT_STARTED";
    if (activeTab === "WAITING_REVIEW") return task.status === "WAITING_REVIEW";
    if (activeTab === "EXTENSIONS") return (task.deadlineRequests && task.deadlineRequests.length > 0) || task.hasIssue;
    if (activeTab === "OVERDUE") return task.isOverdue || task.hasIssue;
    return true;
  });

  return (
    <div className="w-full min-h-screen bg-app-bg pb-12">
      <div className="flex flex-col w-full p-space-lg gap-space-lg">
        {/* 1. Header Trang & Thao tác trọng tâm */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-border-default/50">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm">
              <span>HQ CK Quốc tế Tà Lùng</span>
              <span className="text-outline">/</span>
              <span className="text-secondary font-body-semibold">Nhiệm vụ chỉ đạo &amp; Giao việc</span>
            </div>
            <div className="flex items-center gap-space-sm">
              <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
                Nhiệm Vụ Chỉ Đạo &amp; Điều Hành Giao Việc
              </h1>
              <span className="px-2.5 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed-variant font-label-sm text-label-sm uppercase font-bold">
                {permUser?.role ? getRoleDisplayName(permUser.role) : "Đang tải..."}
              </span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
              Hệ thống phân công chỉ đạo nghiệp vụ đột xuất, giám sát tiến độ thực hiện liên bộ phận, giải quyết đề xuất gia hạn và phê duyệt kết quả công tác.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-space-sm shrink-0">
            {canAssign && (
              <button
                data-tour="create-btn"
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-space-md h-10 bg-secondary hover:bg-secondary/90 text-on-secondary font-body-semibold text-body-md rounded-lg transition-fast shadow-sm active-press font-semibold"
              >
                <span className="material-symbols-outlined text-[18px]">add_task</span>
                <span>+ Giao nhiệm vụ đột xuất / Chỉ đạo mới</span>
              </button>
            )}
            {canApprove && (
              <Link
                href="/reports/excel"
                className="flex items-center gap-2 px-space-md h-10 bg-surface-container-lowest hover:bg-surface-subtle text-on-surface font-body-semibold text-body-md rounded-lg shadow-sm transition-fast border border-border-default active-press"
              >
                <span className="material-symbols-outlined text-[18px] text-secondary">file_download</span>
                <span>Xuất phiếu giao việc (.xlsx)</span>
              </Link>
            )}
            {canAudit && (
              <Link
                href="/admin/audit"
                className="flex items-center gap-2 px-space-md h-10 bg-surface-container hover:bg-surface-container-high text-primary font-body-semibold text-body-md rounded-lg transition-fast active-press"
              >
                <span className="material-symbols-outlined text-[18px]">manage_history</span>
                <span>Lịch sử chỉ đạo</span>
              </Link>
            )}
          </div>
        </div>

        {/* 2. Thống kê & Bộ lọc điều hành thông minh */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-space-md">
          {/* Card KPI 1 */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-border-default/50 flex flex-col justify-between hover-lift">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface-variant">Tổng chỉ đạo lũy kế</span>
              <span className="material-symbols-outlined text-[20px] text-primary">folder_supervised</span>
            </div>
            <div className="my-space-xs">
              <span className="font-headline-xl text-headline-xl text-primary font-bold">{String(totalCount).padStart(2, "0")}</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant ml-1">nhiệm vụ</span>
            </div>
            <div className="font-label-sm text-label-sm text-secondary flex items-center gap-1 font-semibold">
              <span className="material-symbols-outlined text-[14px]">insights</span>
              <span>Toàn bộ phận đã nhận việc</span>
            </div>
          </div>

          {/* Card KPI 2 */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-border-default/50 flex flex-col justify-between hover-lift">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface-variant">Đang triển khai</span>
              <span className="material-symbols-outlined text-[20px] text-secondary">sync</span>
            </div>
            <div className="my-space-xs">
              <span className="font-headline-xl text-headline-xl text-primary font-bold">{String(inProgressCount).padStart(2, "0")}</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant ml-1">đúng tiến độ</span>
            </div>
            <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
              <div className="bg-secondary h-full rounded-full" style={{ width: `${totalCount > 0 ? (inProgressCount / totalCount) * 100 : 0}%` }} />
            </div>
          </div>

          {/* Card KPI 3 */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-border-default/50 flex flex-col justify-between hover-lift">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface-variant">Chờ duyệt kết quả</span>
              <span className="material-symbols-outlined text-[20px] text-status-warning">pending_actions</span>
            </div>
            <div className="my-space-xs">
              <span className="font-headline-xl text-headline-xl text-status-warning font-bold">{String(waitingReviewCount).padStart(2, "0")}</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant ml-1">hồ sơ nộp</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-status-warning-bg text-status-warning font-label-sm text-label-sm w-fit inline-flex items-center gap-1 font-bold">
              <span className="material-symbols-outlined text-[12px]">schedule</span> Cần lãnh đạo ký
            </span>
          </div>

          {/* Card KPI 4 */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-border-default/50 flex flex-col justify-between hover-lift">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface-variant">Đề xuất xin gia hạn</span>
              <span className="material-symbols-outlined text-[20px] text-status-unassigned">update</span>
            </div>
            <div className="my-space-xs">
              <span className="font-headline-xl text-headline-xl text-status-unassigned font-bold">{String(extCount).padStart(2, "0")}</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant ml-1">chờ ý kiến</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-status-unassigned-bg text-status-unassigned font-label-sm text-label-sm w-fit inline-flex items-center gap-1 font-semibold">
              <span className="material-symbols-outlined text-[12px]">info</span> Có văn bản lý do
            </span>
          </div>

          {/* Card KPI 5 */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-status-danger/30 flex flex-col justify-between hover-lift">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-status-danger font-semibold">Quá hạn / Vướng mắc</span>
              <span className="material-symbols-outlined text-[20px] text-status-danger">warning</span>
            </div>
            <div className="my-space-xs">
              <span className="font-headline-xl text-headline-xl text-status-danger font-bold">{String(overdueCount).padStart(2, "0")}</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant ml-1">điểm nghẽn</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-status-danger-bg text-status-danger font-label-sm text-label-sm w-fit inline-flex items-center gap-1 font-bold">
              <span className="material-symbols-outlined text-[12px]">report_problem</span> Khẩn cấp đôn đốc
            </span>
          </div>
        </div>

        {/* Thanh lọc nghiệp vụ & Tìm kiếm */}
        <div className="flex flex-col xl:flex-row gap-space-md items-stretch xl:items-center justify-between bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-border-default/50">
          {/* Bộ lọc trạng thái Segmented Controls */}
          <div className="flex flex-wrap items-center bg-surface-container p-1 rounded-lg gap-1">
            <button
              onClick={() => setActiveTab("ALL")}
              className={`px-3 py-1.5 rounded font-label-md text-label-md transition-fast ${
                activeTab === "ALL"
                  ? "bg-secondary text-on-secondary shadow-sm font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Tất cả ({totalCount})
            </button>
            <button
              onClick={() => setActiveTab("IN_PROGRESS")}
              className={`px-3 py-1.5 rounded font-label-md text-label-md transition-fast ${
                activeTab === "IN_PROGRESS"
                  ? "bg-secondary text-on-secondary shadow-sm font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Đang thực hiện ({inProgressCount})
            </button>
            <button
              onClick={() => setActiveTab("WAITING_REVIEW")}
              className={`px-3 py-1.5 rounded font-label-md text-label-md transition-fast ${
                activeTab === "WAITING_REVIEW"
                  ? "bg-secondary text-on-secondary shadow-sm font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Chờ phê duyệt ({waitingReviewCount})
            </button>
            <button
              onClick={() => setActiveTab("EXTENSIONS")}
              className={`px-3 py-1.5 rounded font-label-md text-label-md transition-fast ${
                activeTab === "EXTENSIONS"
                  ? "bg-secondary text-on-secondary shadow-sm font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Xin gia hạn ({extCount})
            </button>
            <button
              onClick={() => setActiveTab("OVERDUE")}
              className={`px-3 py-1.5 rounded font-label-md text-label-md transition-fast ${
                activeTab === "OVERDUE"
                  ? "bg-status-danger text-on-error shadow-sm font-semibold"
                  : "text-status-danger hover:bg-status-danger-bg"
              }`}
            >
              Chậm tiến độ ({overdueCount})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-space-sm">
            <select
              value={selectedFilterUnit}
              aria-label="Lọc theo đơn vị nghiệp vụ"
              onChange={(e) => setSelectedFilterUnit(e.target.value)}
              className="h-9 px-3 rounded bg-surface-container-lowest text-xs font-semibold border border-border-default focus:outline-none focus:ring-1 focus:ring-secondary cursor-pointer text-primary"
            >
              <option value="ALL">Toàn đơn vị (Tất cả)</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>

            <div className="relative w-full sm:w-64">
              <span className="material-symbols-outlined absolute left-2.5 top-2 text-outline text-[18px]">
                search
              </span>
              <input
                data-tour="search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm mã việc, tên chỉ đạo..."
                className="w-full h-9 pl-8 pr-3 rounded bg-surface-container-lowest text-sm border border-border-default focus:outline-none focus:ring-1 focus:ring-secondary"
              />
            </div>
          </div>
        </div>

        {/* BẢNG DỮ LIỆU NHIỆM VỤ CHỈ ĐẠO */}
        <div data-tour="task-table" className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col border border-border-default/50">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-dense">
              <thead>
                <tr className="bg-surface-subtle text-primary font-table-header text-table-header border-b border-border-default">
                  <th className="py-3 px-space-md w-[280px]">MÃ &amp; NỘI DUNG CHỈ ĐẠO</th>
                  <th className="py-3 px-space-sm w-[150px]">NGUỒN GIAO VIỆC</th>
                  <th className="py-3 px-space-sm w-[200px]">ĐƠN VỊ &amp; CHỦ TRÌ</th>
                  <th className="py-3 px-space-sm w-[160px]">THỜI HẠN &amp; ĐỀ XUẤT</th>
                  <th className="py-3 px-space-sm w-[150px]">TIẾN ĐỘ &amp; TRẠNG THÁI</th>
                  <th className="py-3 px-space-md text-right w-[200px]">THAO TÁC LÃNH ĐẠO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container font-table-data text-table-data text-on-surface">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-outline">
                      Chưa có nhiệm vụ nào trong danh sách hiện tại.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task) => {
                    const isWaiting = task.status === "WAITING_REVIEW";
                    const isCompleted = task.status === "COMPLETED";
                    const isOverdue = task.isOverdue || task.hasIssue;
                    const overdueText = isOverdue ? getOverdueText(task.currentDeadline) : null;
                    const planTitle = task.planLinks?.[0]?.planItem?.plan?.title;
                    const planItemTitle = task.planLinks?.[0]?.planItem?.title;

                    return (
                      <tr key={task.id} className="hover:bg-surface-container-low transition-fast">
                        <td className="py-3 px-space-md align-top">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-primary">{task.code}</span>
                            <span className="font-semibold text-on-surface">{task.title}</span>
                            <span className="text-xs text-outline">{task.description || "Nhiệm vụ trực tiếp"}</span>
                          </div>
                        </td>

                        <td className="py-3 px-space-sm align-top">
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-primary">
                              {planTitle || "Chỉ đạo Chi cục"}
                            </span>
                            <span className="text-[11px] text-outline">
                              {planItemTitle || (task.expectedResultText ? "Có sản phẩm yêu cầu" : "Giao việc trực tiếp")}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-space-sm align-top">
                          <div className="flex flex-col">
                            <span className="font-semibold text-primary">{task.owner?.fullName || "Chưa phân công"}</span>
                            <span className="text-xs text-on-surface-variant">
                              {task.unit?.name || "Hải quan cửa khẩu Quốc tế Tà Lùng"}
                              {task.assignees && task.assignees.length > 0 ? ` (+${task.assignees.length} phối hợp)` : ""}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-space-sm align-top">
                          <div className="flex flex-col">
                            {isOverdue && overdueText ? (
                              <span className="text-status-danger font-bold text-xs">{overdueText}</span>
                            ) : (
                              <span className="text-primary font-semibold text-xs">{formatDateTime(task.currentDeadline)}</span>
                            )}
                            <span className="text-[11px] text-outline">
                              {task.originalDeadline && task.originalDeadline !== task.currentDeadline
                                ? `Gốc: ${formatDateTime(task.originalDeadline)}`
                                : "Hạn hoàn thành"}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-space-sm align-top">
                          {isCompleted ? (
                            <span className="px-2 py-0.5 rounded bg-status-success-bg text-status-success text-xs font-bold inline-flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px]">check_circle</span> Hoàn thành
                            </span>
                          ) : isWaiting ? (
                            <span className="px-2 py-0.5 rounded bg-status-warning-bg text-status-warning text-xs font-bold inline-flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px]">schedule</span> Chờ duyệt
                            </span>
                          ) : isOverdue ? (
                            <span className="px-2 py-0.5 rounded bg-status-danger-bg text-status-danger text-xs font-bold inline-flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px]">warning</span> Quá hạn
                            </span>
                          ) : (
                            <div className="flex flex-col gap-1 w-24">
                              <div className="flex justify-between text-xs font-semibold text-secondary">
                                <span>{task.progressPercent ?? 0}%</span>
                              </div>
                              <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-secondary h-full rounded-full transition-all"
                                  style={{ width: `${Math.min(100, task.progressPercent ?? 0)}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-space-md align-top text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {isWaiting && canApprove && (
                              <button
                                onClick={() => {
                                  setSelectedTask(task);
                                  setShowApproveModal(true);
                                }}
                                className="px-2.5 py-1 rounded bg-secondary text-on-secondary text-xs font-semibold shadow-sm hover:opacity-90 active-press"
                              >
                                Duyệt kết quả
                              </button>
                            )}
                            {task.deadlineRequests && task.deadlineRequests.some((r) => r.status === "PENDING") && canApprove && (
                              <button
                                onClick={() => {
                                  setSelectedTask(task);
                                  setShowExtModal(true);
                                }}
                                className="px-2.5 py-1 rounded bg-status-warning-bg text-status-warning text-xs font-semibold shadow-sm hover:opacity-90 active-press"
                              >
                                Duyệt hạn
                              </button>
                            )}
                            {isOverdue && !isWaiting && canApprove && (
                              <button
                                onClick={() => {
                                  setSelectedTask(task);
                                  setShowExtModal(true);
                                }}
                                className="px-2.5 py-1 rounded bg-status-danger text-on-error text-xs font-semibold shadow-sm hover:opacity-90 active-press"
                              >
                                Đôn đốc
                              </button>
                            )}
                            <Link
                              href={`/tasks/${task.id}`}
                              className="px-2.5 py-1 rounded bg-surface-subtle text-primary hover:bg-surface-container text-xs font-semibold active-press"
                            >
                              Chi tiết
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
          {/* UX: tải thêm khi còn trang (API giới hạn 50/trang) */}
          <div className="flex items-center justify-center gap-3 p-3 border-t border-border-default/50">
            <span className="text-xs text-outline">
              Đã tải {tasks.length}/{totalCount} nhiệm vụ
            </span>
            {page < totalPages && (
              <button
                onClick={() => fetchTasks({ page: page + 1, append: true })}
                disabled={loadingMore}
                className="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary text-xs font-bold active-press disabled:opacity-50"
              >
                {loadingMore ? "Đang tải..." : `Xem thêm (trang ${page + 1}/${totalPages})`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MODAL GIAO NHIỆM VỤ ĐỘT XUẤT */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-lg bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-default transition-panel">
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary-fixed text-[22px]">add_task</span>
                <h3 className="font-headline-sm text-headline-sm text-white">Giao Nhiệm Vụ Chỉ Đạo Mới</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-on-primary-container hover:text-white">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateTask}>
              <div className="p-space-md flex flex-col gap-space-md max-h-[70vh] overflow-y-auto">
                {aiEnabled && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={aiIdea}
                      onChange={(e) => setAiIdea(e.target.value)}
                      placeholder="Gõ vài từ khóa, AI soạn nháp giúp..."
                      className="flex-1 h-10 px-3 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-dashed border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
                    />
                    <button
                      type="button"
                      onClick={handleAiDraft}
                      disabled={aiLoading}
                      title="AI soạn nháp nội dung chỉ đạo"
                      className="h-10 px-3 rounded bg-secondary text-on-secondary font-label-md text-label-md font-semibold active-press disabled:opacity-50 shrink-0"
                    >
                      {aiLoading ? "..." : "✨ Soạn"}
                    </button>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Tên đầu việc / Nội dung chỉ đạo *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Nhập nội dung công việc chỉ đạo..."
                    className="h-10 px-3 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-space-sm">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-primary font-semibold">Đơn vị chủ trì</label>
                    <select
                      value={selectedUnitId}
                      onChange={(e) => setSelectedUnitId(e.target.value)}
                      className="h-10 px-2 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    >
                      {units.length > 0 ? (
                        units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))
                      ) : (
                        <option value="">Hải quan cửa khẩu Quốc tế Tà Lùng</option>
                      )}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-primary font-semibold">Cán bộ chủ trì</label>
                    <select
                      value={selectedOwnerId}
                      onChange={(e) => setSelectedOwnerId(e.target.value)}
                      className="h-10 px-2 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    >
                      {people.length > 0 ? (
                        people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.fullName}
                          </option>
                        ))
                      ) : (
                        <option value="">Tự động theo phân công</option>
                      )}
                    </select>
                  </div>
                </div>

                <CollaboratorPicker
                  people={people}
                  value={collabIds}
                  onChange={setCollabIds}
                  excludeId={selectedOwnerId}
                  disabled={isCreating}
                />

                <div className="grid grid-cols-2 gap-space-sm">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-primary font-semibold">Mức độ ưu tiên</label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value as any)}
                      className="h-10 px-2 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    >
                      <option value="Khẩn">Khẩn cấp</option>
                      <option value="Cao">Cao</option>
                      <option value="Trung bình">Trung bình</option>
                      <option value="Thấp">Thấp</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-primary font-semibold">Hạn định hoàn thành</label>
                    <input
                      type="datetime-local"
                      value={newDeadline}
                      onChange={(e) => setNewDeadline(e.target.value)}
                      className="h-10 px-3 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">Nguồn gốc / Chỉ đạo từ đâu</label>
                  <input
                    type="text"
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    placeholder="Chỉ đạo đột xuất Lãnh đạo Chi cục..."
                    className="h-10 px-3 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">Sản phẩm / Kết quả yêu cầu</label>
                  <textarea
                    rows={2}
                    value={newExpectedResult}
                    onChange={(e) => setNewExpectedResult(e.target.value)}
                    placeholder="Biên bản kiểm tra điện tử, xác nhận thông quan đúng hạn..."
                    className="p-2.5 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Ảnh / Văn bản kèm theo {newAttachFiles.length > 0 && `(${newAttachFiles.length} tệp)`}
                  </label>
                  <input
                    type="file"
                    multiple
                    accept=".png,.jpg,.jpeg,.pdf,.doc,.docx,.xls,.xlsx"
                    disabled={isCreating}
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      const valid = files.filter((f) => {
                        if (f.size > 10 * 1024 * 1024) {
                          toast.warning(`Tệp ${f.name} quá 10MB — bỏ qua (bổ sung ở chi tiết sau)`);
                          return false;
                        }
                        return true;
                      }).slice(0, 5);
                      setNewAttachFiles(valid);
                    }}
                    className="text-body-md font-body-md text-on-surface file:mr-2 file:px-3 file:py-1.5 file:rounded file:bg-surface-container file:text-primary file:text-xs file:font-semibold file:border file:border-border-subtle"
                  />
                  <p className="text-[11px] text-on-surface-variant">Tối đa 5 tệp, mỗi tệp ≤ 10MB. Tải lên sau khi nhiệm vụ được tạo.</p>
                </div>
              </div>

              <div className="p-space-md bg-surface-subtle flex items-center justify-end gap-space-sm border-t border-border-default">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded bg-surface-container-lowest text-on-surface font-label-md text-label-md hover:bg-surface-container border border-border-subtle active-press"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-2 rounded bg-secondary text-on-secondary font-label-md text-label-md font-semibold hover:opacity-90 shadow-sm active-press disabled:opacity-50"
                >
                  {isCreating ? "Đang chuyển..." : "Chuyển ý kiến chỉ đạo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DUYỆT KẾT QUẢ */}
      {showApproveModal && selectedTask && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-default transition-panel">
            <div className="p-space-md bg-secondary text-on-secondary flex items-center justify-between">
              <h3 className="font-headline-sm font-semibold">Phê Duyệt Kết Quả Hoàn Thành</h3>
              <button onClick={() => setShowApproveModal(false)}>
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="p-space-md flex flex-col gap-space-sm">
              <span className="font-bold text-primary">{selectedTask.code}: {selectedTask.title}</span>
              <label className="text-xs font-semibold text-primary">Ý kiến nhận xét của Lãnh đạo</label>
              <textarea
                rows={3}
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Đạt yêu cầu, thống nhất lưu biên bản điện tử..."
                className="w-full p-2.5 rounded bg-surface-container-low text-sm border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
              />
            </div>
            <div className="p-space-md bg-surface-subtle flex items-center justify-end gap-2 border-t border-border-default">
              <button onClick={() => setShowApproveModal(false)} className="px-4 py-2 rounded bg-surface-container-lowest text-xs font-semibold">
                Hủy
              </button>
              <button
                onClick={() => handleApproveResult(selectedTask.id)}
                className="px-4 py-2 rounded bg-secondary text-on-secondary text-xs font-semibold active-press"
              >
                Xác nhận phê duyệt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GIA HẠN / ĐÔN ĐỐC */}
      {showExtModal && selectedTask && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-default transition-panel">
            <div className="p-space-md bg-status-danger text-on-error flex items-center justify-between">
              <h3 className="font-headline-sm font-semibold">Chỉ Đạo / Cho Phép Gia Hạn</h3>
              <button onClick={() => setShowExtModal(false)}>
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="p-space-md flex flex-col gap-space-sm">
              <span className="font-bold text-primary">{selectedTask.code}: {selectedTask.title}</span>
              <label className="text-xs font-semibold text-primary">Ý kiến chỉ đạo / Chấp thuận lùi hạn</label>
              <textarea
                rows={3}
                value={extDecisionNotes}
                onChange={(e) => setExtDecisionNotes(e.target.value)}
                placeholder="Đồng ý gia hạn giải quyết đến 18:30..."
                className="w-full p-2.5 rounded bg-surface-container-low text-sm border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
              />
            </div>
            <div className="p-space-md bg-surface-subtle flex items-center justify-end gap-2 border-t border-border-default">
              <button onClick={() => setShowExtModal(false)} className="px-4 py-2 rounded bg-surface-container-lowest text-xs font-semibold">
                Hủy
              </button>
              <button
                onClick={() => handleApproveExtension(selectedTask.id)}
                className="px-4 py-2 rounded bg-status-danger text-on-error text-xs font-semibold active-press"
              >
                Gửi ý kiến chỉ đạo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
