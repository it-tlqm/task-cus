"use client";

import { V5Icon } from "@/components/v5/ui/icon";

import React, { useState, useEffect } from "react";
import { originLabel } from "@/lib/task-origin";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  Clock3,
  FileDown,
  History,
  Plus,
  Search,
  Timer,
} from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { Badge } from "@/components/v5/ui/badge";
import { Button } from "@/components/v5/ui/button";
import { Card } from "@/components/v5/ui/card";
import { PageHeader } from "@/components/v5/ui/page-header";
import { CollaboratorPicker } from "@/components/tasks/CollaboratorPicker";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import WorkSourcePicker from "@/components/work/WorkSourcePicker";
import TxSourceBadge from "@/components/work/TxSourceBadge";
import { usePermissions } from "@/hooks/usePermissions";
import { getRoleDisplayName } from "@/lib/unit-info";
import { formatVnDateTime, vnLocalToUtcIso } from "@/lib/datetime";

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
  // YC-38: nguon danh muc TX + nguon phat sinh
  txSource?: {
    code: string;
    title?: string | null;
    department?: string | null;
    groupCode?: string | null;
    convertFactor?: number | null;
  } | null;
  originKind?: string | null;
  planLinks?: Array<{
    planItem?: {
      title?: string;
      plan?: { title?: string };
    };
  }>;
}

// YC-38 UAT fix: hiển thị thời hạn theo giờ Việt Nam, KHÔNG phụ thuộc múi giờ thiết bị
function formatDateTime(isoStr?: string) {
  return isoStr ? formatVnDateTime(isoStr) : "--";
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
  const { canAssign, canApprove, canAudit, user: permUser, loading: permissionsLoading } = usePermissions();

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Dashboard chuyển sang /tasks?new=1 — chờ quyền nạp xong mới mở modal
  const [pendingCreateFromQuery, setPendingCreateFromQuery] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showExtModal, setShowExtModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  // Units & People from DB
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [people, setPeople] = useState<Array<{ id: string; fullName: string; assignments?: any[] }>>([]);

  // Forms
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<"Cao" | "Trung bình" | "Thấp" | "Khẩn">("Cao");
  // Hạn mặc định: 7 ngày kể từ hôm nay lúc 17:00 (trước đây là hạn cứng cũ,
  // việc mới tạo ra đã quá hạn ngay)
  const defaultDeadline = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T17:00`;
  };
  const [newDeadline, setNewDeadline] = useState(defaultDeadline);
  const [newSource, setNewSource] = useState("Chỉ đạo đột xuất Lãnh đạo");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  // YC-38B: nguồn công việc (TX / QĐ1277) + khoá idempotency
  const [newCatalogEntry, setNewCatalogEntry] = useState<{
    id: string;
    code: string;
    title: string;
    department?: string | null;
    convertFactor?: number | null;
  } | null>(null);
  const [newProduct, setNewProduct] = useState<{
    id: string;
    code: string;
    taskName: string;
    convertFactor?: number | null;
    outputProduct?: string | null;
    quantityUnit?: string | null;
  } | null>(null);
  const [newAssignedQty, setNewAssignedQty] = useState("");
  const [newQuantityUnit, setNewQuantityUnit] = useState("");
  const [newIdempotencyKey, setNewIdempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
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
      if (sp.get("new") === "1") setPendingCreateFromQuery(true);
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

  // Dashboard giao việc dùng chung form này: /tasks?new=1 chỉ mở modal đúng một lần
  // sau khi quyền đã nạp, rồi xóa query để F5/back không tự mở lại.
  useEffect(() => {
    if (!pendingCreateFromQuery || permissionsLoading) return;

    if (canAssign) {
      setShowCreateModal(true);
    } else {
      toast.error("Bạn không có quyền giao nhiệm vụ");
    }
    setPendingCreateFromQuery(false);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("new")) {
        url.searchParams.delete("new");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }
  }, [pendingCreateFromQuery, permissionsLoading, canAssign]);

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
          currentDeadline: vnLocalToUtcIso(newDeadline),
          description: newSource,
          expectedResultText: newExpectedResult || undefined,
          assignedQty: newAssignedQty === "" ? undefined : Number(newAssignedQty),
          quantityUnit: newQuantityUnit.trim() || undefined,
          factorSnapshot: newProduct?.convertFactor ?? newCatalogEntry?.convertFactor ?? undefined,
          unitId: selectedUnitId || undefined,
          ownerId: selectedOwnerId || undefined,
          assigneeIds: collabIds,
          status: "IN_PROGRESS",
          progressPercent: 0,
          // YC-38B/YC-38C: nguồn công việc + khoá idempotency (chống bấm trùng)
          catalogEntryId: newCatalogEntry?.id || undefined,
          productItemId: newProduct?.id || undefined,
          idempotencyKey: newIdempotencyKey,
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
        setNewAssignedQty("");
        setNewQuantityUnit("");
        setCollabIds([]);
        setNewAttachFiles([]);
        setNewDeadline(defaultDeadline());
        setAiIdea("");
        setNewCatalogEntry(null);
        setNewProduct(null);
        setNewIdempotencyKey(
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        );
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
    <div className="w-full pb-4">
      <div className="flex w-full flex-col gap-3">
        <PageHeader
          eyebrow="Điều hành công việc"
          title="Giao việc & theo dõi"
          badges={
            <Badge variant="outline">
              {permUser?.role ? getRoleDisplayName(permUser.role) : "Đang tải..."}
            </Badge>
          }
          description="Giao việc, theo dõi tiến độ, xử lý gia hạn và duyệt kết quả công tác."
          actions={
            <>
              {canAssign && permUser?.unitId && (
                <Button size="sm" data-tour="create-btn" onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-3.5 w-3.5" /> Giao việc
                </Button>
              )}
              {canApprove && (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/reports/excel">
                    <FileDown className="h-3.5 w-3.5" /> Xuất phiếu
                  </Link>
                </Button>
              )}
              {canAudit && (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/admin/audit">
                    <History className="h-3.5 w-3.5" /> Lịch sử
                  </Link>
                </Button>
              )}
            </>
          }
        />

        {!permissionsLoading && canAssign && !permUser?.unitId && (
          <div className="rounded-lg border border-v5-danger/30 bg-v5-danger-soft px-3 py-2 text-[11px] text-v5-danger">
            Tài khoản chưa được gán bộ phận chính. Liên hệ quản trị tổ chức để cập nhật phân công trước khi giao việc.
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
          <Card className="p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-v5-muted">Tổng chỉ đạo</span>
              <ClipboardList className="h-4 w-4 text-v5-accent" />
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-v5-ink">{String(totalCount).padStart(2, "0")}</div>
            <div className="mt-1 text-[10px] text-v5-muted">nhiệm vụ đã giao</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-v5-muted">Đang thực hiện</span>
              <Timer className="h-4 w-4 text-v5-accent" />
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-v5-ink">{String(inProgressCount).padStart(2, "0")}</div>
            <div className="mt-1 text-[10px] text-v5-muted">đang triển khai</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-v5-muted">Chờ phê duyệt</span>
              <Clock3 className="h-4 w-4 text-v5-warning" />
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-v5-warning">{String(waitingReviewCount).padStart(2, "0")}</div>
            <div className="mt-1 text-[10px] text-v5-muted">hồ sơ đã nộp</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-v5-muted">Xin gia hạn</span>
              <CalendarClock className="h-4 w-4 text-v5-gold-ink" />
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-v5-gold-ink">{String(extCount).padStart(2, "0")}</div>
            <div className="mt-1 text-[10px] text-v5-muted">đề xuất chờ ý kiến</div>
          </Card>
          <Card className="border-v5-danger/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-v5-danger">Quá hạn</span>
              <AlertTriangle className="h-4 w-4 text-v5-danger" />
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-v5-danger">{String(overdueCount).padStart(2, "0")}</div>
            <div className="mt-1 text-[10px] text-v5-muted">cần đôn đốc</div>
          </Card>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-v5-line bg-v5-surface p-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-md bg-v5-bg p-1">
            {[
              { key: "ALL" as const, label: `Tất cả (${totalCount})` },
              { key: "IN_PROGRESS" as const, label: `Đang thực hiện (${inProgressCount})` },
              { key: "WAITING_REVIEW" as const, label: `Chờ phê duyệt (${waitingReviewCount})` },
              { key: "EXTENSIONS" as const, label: `Xin gia hạn (${extCount})` },
              { key: "OVERDUE" as const, label: `Chậm tiến độ (${overdueCount})` },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`rounded px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  activeTab === item.key
                    ? item.key === "OVERDUE"
                      ? "bg-v5-danger text-white shadow-sm"
                      : "bg-v5-accent text-white shadow-sm"
                    : item.key === "OVERDUE"
                      ? "text-v5-danger hover:bg-v5-danger-soft"
                      : "text-v5-muted hover:bg-v5-surface hover:text-v5-ink"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedFilterUnit}
              aria-label="Lọc theo đơn vị nghiệp vụ"
              onChange={(e) => setSelectedFilterUnit(e.target.value)}
              className="h-9 cursor-pointer rounded-md border border-v5-line bg-v5-surface px-2 text-[11px] font-semibold text-v5-ink focus:outline-none focus:ring-1 focus:ring-v5-accent"
            >
              <option value="ALL">Toàn đơn vị</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-v5-muted" />
              <input
                data-tour="search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm mã việc, tên chỉ đạo..."
                className="h-9 w-full rounded-md border border-v5-line bg-v5-surface pl-8 pr-3 text-[12px] text-v5-ink outline-none focus:border-v5-accent"
              />
            </div>
          </div>
        </div>

        {/* BẢNG DỮ LIỆU NHIỆM VỤ CHỈ ĐẠO */}
        <div data-tour="task-table" className="flex flex-col overflow-hidden rounded-xl border border-v5-line bg-v5-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-dense">
              <thead>
                <tr className="bg-v5-bg text-primary font-table-header text-table-header border-b border-v5-line">
                  <th className="py-3 px-space-md w-[280px]">MÃ &amp; NỘI DUNG CHỈ ĐẠO</th>
                  <th className="py-3 px-space-sm w-[150px]">NGUỒN GIAO VIỆC</th>
                  <th className="py-3 px-space-sm w-[200px]">ĐƠN VỊ &amp; CHỦ TRÌ</th>
                  <th className="py-3 px-space-sm w-[160px]">THỜI HẠN &amp; ĐỀ XUẤT</th>
                  <th className="py-3 px-space-sm w-[150px]">TIẾN ĐỘ &amp; TRẠNG THÁI</th>
                  <th className="py-3 px-space-md text-right w-[200px]">THAO TÁC LÃNH ĐẠO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v5-line/60 font-table-data text-table-data text-v5-ink">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-v5-muted">
                      Chưa có nhiệm vụ nào trong danh sách hiện tại.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task) => {
                    const isWaiting = task.status === "WAITING_REVIEW";
                    const isCompleted = task.status === "COMPLETED";
                    // F5 (YC-38): nhiệm vụ đã nghiệm thu/kết thúc ⇒ không mở hành động ghi
                    const isTaskTerminal =
                      (task.status as string) === "COMPLETED" || (task.status as string) === "DONE" || (task.status as string) === "CANCELED";
                    const isOverdue = task.isOverdue || task.hasIssue;
                    const overdueText = isOverdue ? getOverdueText(task.currentDeadline) : null;
                    const planTitle = task.planLinks?.[0]?.planItem?.plan?.title;
                    const planItemTitle = task.planLinks?.[0]?.planItem?.title;

                    return (
                      <tr key={task.id} className="hover:bg-v5-bg transition-fast">
                        <td className="py-3 px-space-md align-top">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-primary">{task.code}</span>
                            <span className="font-semibold text-v5-ink">{task.title}</span>
                            <span className="text-xs text-v5-muted">{task.description || "Nhiệm vụ trực tiếp"}</span>
                          </div>
                        </td>

                        <td className="py-3 px-space-sm align-top">
                          <div className="flex flex-col gap-1">
                            {/* YC-38 UAT fix: ma TX + nguon phat sinh thay cho nhan hard-code */}
                            <TxSourceBadge source={task.txSource} />
                            <span className="text-[11px] text-v5-muted">
                              {originLabel(task.originKind)}
                            </span>
                            <span className="text-xs font-semibold text-primary">
                              {planTitle || "Chỉ đạo Chi cục"}
                            </span>
                            <span className="text-[11px] text-v5-muted">
                              {planItemTitle || (task.expectedResultText ? "Có sản phẩm yêu cầu" : "Giao việc trực tiếp")}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-space-sm align-top">
                          <div className="flex flex-col">
                            <span className="font-semibold text-primary">{task.owner?.fullName || "Chưa phân công"}</span>
                            <span className="text-xs text-v5-muted">
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
                            <span className="text-[11px] text-v5-muted">
                              {task.originalDeadline && task.originalDeadline !== task.currentDeadline
                                ? `Gốc: ${formatDateTime(task.originalDeadline)}`
                                : "Hạn hoàn thành"}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-space-sm align-top">
                          {isCompleted ? (
                            <span className="px-2 py-0.5 rounded bg-status-success-bg text-status-success text-xs font-bold inline-flex items-center gap-1">
                              <V5Icon name="check_circle" className="text-[13px]" /> Hoàn thành
                            </span>
                          ) : isWaiting ? (
                            <span className="px-2 py-0.5 rounded bg-status-warning-bg text-status-warning text-xs font-bold inline-flex items-center gap-1">
                              <V5Icon name="schedule" className="text-[13px]" /> Chờ duyệt
                            </span>
                          ) : isOverdue ? (
                            <span className="px-2 py-0.5 rounded bg-status-danger-bg text-status-danger text-xs font-bold inline-flex items-center gap-1">
                              <V5Icon name="warning" className="text-[13px]" /> Quá hạn
                            </span>
                          ) : (
                            <div className="flex flex-col gap-1 w-24">
                              <div className="flex justify-between text-xs font-semibold text-secondary">
                                <span>{task.progressPercent ?? 0}%</span>
                              </div>
                              <div className="w-full bg-v5-bg h-1.5 rounded-full overflow-hidden">
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
                            {!isTaskTerminal && task.deadlineRequests && task.deadlineRequests.some((r) => r.status === "PENDING") && canApprove && (
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
                            {isOverdue && !isWaiting && !isTaskTerminal && canApprove && (
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
                              className="px-2.5 py-1 rounded bg-v5-bg text-primary hover:bg-v5-bg text-xs font-semibold active-press"
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
          <div className="flex items-center justify-center gap-3 p-3 border-t border-v5-line/50">
            <span className="text-xs text-v5-muted">
              Đã tải {tasks.length}/{totalCount} nhiệm vụ
            </span>
            {page < totalPages && (
              <button
                onClick={() => fetchTasks({ page: page + 1, append: true })}
                disabled={loadingMore}
                className="px-4 py-2 rounded-lg bg-v5-bg hover:bg-v5-bg-high text-primary text-xs font-bold active-press disabled:opacity-50"
              >
                {loadingMore ? "Đang tải..." : `Xem thêm (trang ${page + 1}/${totalPages})`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal giao nhiệm vụ dùng chung */}
      <TaskFormModal
        open={showCreateModal}
        mode="assign"
        onClose={() => setShowCreateModal(false)}
        onCreated={async () => {
          await fetchTasks();
        }}
        currentPersonId={permUser?.personId}
        currentUnitId={permUser?.unitId}
        people={people}
        units={units}
        canAssign={canAssign}
        aiEnabled={aiEnabled}
      />

      {/* MODAL DUYỆT KẾT QUẢ */}
      {showApproveModal && selectedTask && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-md bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line transition-panel">
            <div className="p-space-md bg-secondary text-on-secondary flex items-center justify-between">
              <h3 className="font-headline-sm font-semibold">Phê Duyệt Kết Quả Hoàn Thành</h3>
              <button onClick={() => setShowApproveModal(false)}>
                <V5Icon name="close" className="text-[20px]" />
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
                className="w-full p-2.5 rounded bg-v5-bg text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
              />
            </div>
            <div className="p-space-md bg-v5-bg flex items-center justify-end gap-2 border-t border-v5-line">
              <button onClick={() => setShowApproveModal(false)} className="px-4 py-2 rounded bg-v5-surface text-xs font-semibold">
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
          <div className="w-full max-w-md bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line transition-panel">
            <div className="p-space-md bg-status-danger text-on-error flex items-center justify-between">
              <h3 className="font-headline-sm font-semibold">Chỉ Đạo / Cho Phép Gia Hạn</h3>
              <button onClick={() => setShowExtModal(false)}>
                <V5Icon name="close" className="text-[20px]" />
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
                className="w-full p-2.5 rounded bg-v5-bg text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
              />
            </div>
            <div className="p-space-md bg-v5-bg flex items-center justify-end gap-2 border-t border-v5-line">
              <button onClick={() => setShowExtModal(false)} className="px-4 py-2 rounded bg-v5-surface text-xs font-semibold">
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
