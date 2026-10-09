"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronRight,
  Filter,
  Search,
  MessageSquare,
  FileText,
  Calendar,
  Layers,
  ArrowUpRight,
  RefreshCw,
  Plus,
  Send,
  CalendarClock,
  CheckSquare,
  AlertCircle,
  TrendingUp,
  UserCheck,
  Flag,
} from "lucide-react";

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
}

export default function MyWorkPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "ALL" | "IN_PROGRESS" | "WAITING_REVIEW" | "OVERDUE" | "ISSUES" | "COMPLETED"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal states
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showDeadlineModal, setShowDeadlineModal] = useState(false);
  const [showSubmitCompletionModal, setShowSubmitCompletionModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  // Form states
  const [progressPercent, setProgressPercent] = useState<number>(50);
  const [progressNotes, setProgressNotes] = useState("");
  const [reportHasIssue, setReportHasIssue] = useState(false);
  const [reportIssueNotes, setReportIssueNotes] = useState("");

  const [requestedDeadline, setRequestedDeadline] = useState("");
  const [deadlineReason, setDeadlineReason] = useState("");

  const [completionResultText, setCompletionResultText] = useState("");

  const fetchTasks = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const json = await res.json();
        const taskList: TaskItem[] = Array.isArray(json) ? json : json.data || [];
        setTasks(taskList);
        if (selectedTask) {
          const fresh = taskList.find((t) => t.id === selectedTask.id);
          if (fresh) setSelectedTask(fresh);
        } else if (taskList.length > 0) {
          setSelectedTask(taskList[0]);
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        setActionError(errJson.error || "Không thể tải danh sách nhiệm vụ");
      }
    } catch (err: any) {
      console.error("Error fetching tasks:", err);
      setActionError("Lỗi kết nối khi tải danh sách nhiệm vụ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // Update progress action
  const handleUpdateProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;
    setModalLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          progressPercent: Number(progressPercent),
          notes: progressNotes,
          newStatus: "IN_PROGRESS",
          hasIssue: reportHasIssue,
          issueNotes: reportHasIssue ? reportIssueNotes : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể ghi nhận tiến độ");
      }
      setShowProgressModal(false);
      setProgressNotes("");
      setReportHasIssue(false);
      setReportIssueNotes("");
      setActionSuccess("Đã cập nhật tiến độ công việc thành công!");
      await fetchTasks();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setModalLoading(false);
      setTimeout(() => setActionSuccess(null), 4000);
    }
  };

  // Submit completion action
  const handleSubmitCompletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;
    setModalLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedTask.id,
          action: "SUBMIT_COMPLETION",
          actualResultText: completionResultText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể gửi báo cáo hoàn thành");
      }
      setShowSubmitCompletionModal(false);
      setCompletionResultText("");
      setActionSuccess("Đã gửi đề nghị nghiệm thu! Nhiệm vụ đang ở trạng thái 'Chờ nghiệm thu'.");
      await fetchTasks();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setModalLoading(false);
      setTimeout(() => setActionSuccess(null), 4000);
    }
  };

  // Submit deadline extension request
  const handleRequestDeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;
    setModalLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/deadline-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedDeadline,
          reason: deadlineReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể gửi đề nghị lùi hạn");
      }
      setShowDeadlineModal(false);
      setRequestedDeadline("");
      setDeadlineReason("");
      setActionSuccess("Đã gửi đề xuất lùi hạn đến Lãnh đạo phụ trách xem xét phê duyệt.");
      await fetchTasks();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setModalLoading(false);
      setTimeout(() => setActionSuccess(null), 4000);
    }
  };

  // Metrics
  const totalCount = tasks.length;
  const inProgressCount = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const waitingReviewCount = tasks.filter((t) => t.status === "WAITING_REVIEW").length;
  const completedCount = tasks.filter((t) => t.status === "COMPLETED").length;
  const overdueCount = tasks.filter((t) => t.isOverdue).length;
  const issueCount = tasks.filter((t) => t.hasIssue).length;

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.owner?.fullName && task.owner.fullName.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeTab === "IN_PROGRESS") return task.status === "IN_PROGRESS";
    if (activeTab === "WAITING_REVIEW") return task.status === "WAITING_REVIEW";
    if (activeTab === "OVERDUE") return task.isOverdue;
    if (activeTab === "ISSUES") return task.hasIssue;
    if (activeTab === "COMPLETED") return task.status === "COMPLETED";
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" /> Hoàn thành
          </span>
        );
      case "WAITING_REVIEW":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
            <UserCheck className="w-3.5 h-3.5" /> Chờ nghiệm thu
          </span>
        );
      case "IN_PROGRESS":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            <Clock className="w-3.5 h-3.5 animate-pulse" /> Đang thực hiện
          </span>
        );
      case "NOT_STARTED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            Chưa bắt đầu
          </span>
        );
      case "CANCELED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
            Đã hủy
          </span>
        );
      default:
        return <span className="text-xs text-slate-500">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-sky-100 text-sky-800">
              Cá nhân & Phối hợp
            </span>
            <span className="text-xs text-slate-500">Màn hình Tác nghiệp Công chức • Desktop & Mobile</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Công việc của tôi</h1>
          <p className="text-sm text-slate-600">
            Theo dõi, cập nhật tiến độ, báo vướng mắc và đề xuất nghiệm thu công việc được giao
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTasks}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
          <Link
            href="/tasks"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm"
          >
            <Flag className="w-4 h-4 text-blue-800" />
            Nhiệm vụ chung
          </Link>
          <Link
            href="/plans"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 shadow-sm"
          >
            <Layers className="w-4 h-4" />
            Kế hoạch công tác
          </Link>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm flex items-center justify-between shadow-sm">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-700 font-bold text-xs hover:underline">
            Đóng
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm flex items-center justify-between shadow-sm">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-rose-700 font-bold text-xs hover:underline">
            Đóng
          </button>
        </div>
      )}

      {/* KPI Cards (6 ô chỉ số chi tiết) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          onClick={() => setActiveTab("ALL")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            activeTab === "ALL"
              ? "bg-blue-50 border-blue-400 shadow-sm ring-2 ring-blue-500/20"
              : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Tổng số</span>
            <Layers className="w-4 h-4 text-blue-700" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{totalCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Tất cả nhiệm vụ</div>
        </div>

        <div
          onClick={() => setActiveTab("IN_PROGRESS")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            activeTab === "IN_PROGRESS"
              ? "bg-amber-50 border-amber-400 shadow-sm ring-2 ring-amber-500/20"
              : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-amber-700 font-medium">
            <span>Đang thực hiện</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-800">{inProgressCount}</div>
          <div className="text-[11px] text-amber-700 mt-0.5">Cần cập nhật %</div>
        </div>

        <div
          onClick={() => setActiveTab("WAITING_REVIEW")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            activeTab === "WAITING_REVIEW"
              ? "bg-purple-50 border-purple-400 shadow-sm ring-2 ring-purple-500/20"
              : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-purple-700 font-medium">
            <span>Chờ nghiệm thu</span>
            <UserCheck className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-800">{waitingReviewCount}</div>
          <div className="text-[11px] text-purple-700 mt-0.5">Chờ lãnh đạo duyệt</div>
        </div>

        <div
          onClick={() => setActiveTab("OVERDUE")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            activeTab === "OVERDUE"
              ? "bg-rose-50 border-rose-400 shadow-sm ring-2 ring-rose-500/20"
              : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-rose-700 font-medium">
            <span>Quá hạn</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-800">{overdueCount}</div>
          <div className="text-[11px] text-rose-700 mt-0.5">Cần đề xuất lùi hạn</div>
        </div>

        <div
          onClick={() => setActiveTab("ISSUES")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            activeTab === "ISSUES"
              ? "bg-orange-50 border-orange-400 shadow-sm ring-2 ring-orange-500/20"
              : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-orange-700 font-medium">
            <span>Có vướng mắc</span>
            <AlertTriangle className="w-4 h-4 text-orange-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-orange-800">{issueCount}</div>
          <div className="text-[11px] text-orange-700 mt-0.5">Cần chỉ đạo gỡ khó</div>
        </div>

        <div
          onClick={() => setActiveTab("COMPLETED")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            activeTab === "COMPLETED"
              ? "bg-emerald-50 border-emerald-400 shadow-sm ring-2 ring-emerald-500/20"
              : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-emerald-700 font-medium">
            <span>Đã xong</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-800">{completedCount}</div>
          <div className="text-[11px] text-emerald-700 mt-0.5">
            {totalCount > 0 ? `${Math.round((completedCount / totalCount) * 100)}% tổng số` : "0%"}
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setActiveTab("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "ALL" ? "bg-blue-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Tất cả ({totalCount})
          </button>
          <button
            onClick={() => setActiveTab("IN_PROGRESS")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "IN_PROGRESS" ? "bg-amber-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Đang làm ({inProgressCount})
          </button>
          <button
            onClick={() => setActiveTab("WAITING_REVIEW")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "WAITING_REVIEW" ? "bg-purple-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Chờ nghiệm thu ({waitingReviewCount})
          </button>
          <button
            onClick={() => setActiveTab("OVERDUE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "OVERDUE" ? "bg-rose-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Quá hạn ({overdueCount})
          </button>
          <button
            onClick={() => setActiveTab("ISSUES")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "ISSUES" ? "bg-orange-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Vướng mắc ({issueCount})
          </button>
          <button
            onClick={() => setActiveTab("COMPLETED")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "COMPLETED" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Đã xong ({completedCount})
          </button>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo mã, tên hoặc người chủ trì..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Main Split Layout: Left List / Right Detail Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Task Cards List (7 cols on lg) */}
        <div className="lg:col-span-7 space-y-3">
          {loading ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
              <RefreshCw className="w-6 h-6 text-slate-400 animate-spin mx-auto mb-2" />
              <p className="text-sm text-slate-500">Đang tải dữ liệu nhiệm vụ...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">Không có nhiệm vụ nào trong mục này</p>
              <p className="text-xs text-slate-500 mt-1">
                Hãy chuyển qua bộ lọc khác hoặc kiểm tra lại kế hoạch công tác
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => {
              const isSelected = selectedTask?.id === task.id;
              const deadlineDate = new Date(task.currentDeadline);
              const isOverdue = task.isOverdue;
              const hasIssue = task.hasIssue;

              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={`cursor-pointer p-4 bg-white rounded-xl border transition-all ${
                    isSelected
                      ? "border-blue-600 ring-2 ring-blue-500/15 shadow-md"
                      : "border-slate-200 hover:border-slate-300 shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {task.code}
                        </span>
                        {getStatusBadge(task.status)}
                        {isOverdue && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 animate-pulse">
                            <AlertCircle className="w-3 h-3" /> Quá hạn
                          </span>
                        )}
                        {hasIssue && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                            <AlertTriangle className="w-3 h-3" /> Vướng mắc
                          </span>
                        )}
                        <span className="text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-medium">
                          {task.unit?.name || "Đơn vị"}
                        </span>
                      </div>

                      <h3 className="text-sm font-semibold text-slate-900 leading-snug">{task.title}</h3>

                      {task.description && (
                        <p className="text-xs text-slate-600 line-clamp-2">{task.description}</p>
                      )}

                      {/* Progress bar preview */}
                      <div className="flex items-center gap-3 pt-1">
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              task.status === "COMPLETED"
                                ? "bg-emerald-500"
                                : task.status === "WAITING_REVIEW"
                                ? "bg-purple-500"
                                : isOverdue
                                ? "bg-rose-500"
                                : "bg-blue-600"
                            }`}
                            style={{
                              width: `${
                                task.status === "COMPLETED"
                                  ? 100
                                  : task.progressPercent !== undefined
                                  ? task.progressPercent
                                  : task.status === "WAITING_REVIEW"
                                  ? 90
                                  : 40
                              }%`,
                            }}
                          />
                        </div>
                        <span className="text-[11px] font-medium text-slate-600">
                          {task.status === "COMPLETED"
                            ? "100%"
                            : task.progressPercent !== undefined
                            ? `${task.progressPercent}%`
                            : task.status === "WAITING_REVIEW"
                            ? "90%"
                            : "40%"}
                        </span>
                      </div>

                      {/* Bottom Meta */}
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-100">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          Hạn: {deadlineDate.toLocaleDateString("vi-VN")}
                        </span>
                        {task.owner && (
                          <span className="text-slate-600">
                            Chủ trì: <strong className="text-slate-800">{task.owner.fullName}</strong>
                          </span>
                        )}
                        {task.assignees && task.assignees.length > 0 && (
                          <span className="text-slate-500">
                            Phối hợp: {task.assignees.length} cán bộ
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight
                      className={`w-5 h-5 text-slate-400 transition-transform ${
                        isSelected ? "rotate-90 text-blue-600" : ""
                      }`}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Task Detail Panel (5 cols on lg - matches Stitch Mobile & Desktop Detail Screen) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-5 sticky top-20">
          {selectedTask ? (
            <>
              {/* Task Header info */}
              <div className="border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-900 bg-blue-50 px-2.5 py-1 rounded border border-blue-200">
                    {selectedTask.code}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {getStatusBadge(selectedTask.status)}
                    {selectedTask.isOverdue && (
                      <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        Quá hạn
                      </span>
                    )}
                  </div>
                </div>

                <h2 className="text-base font-bold text-slate-900 mt-2.5 leading-snug">
                  {selectedTask.title}
                </h2>

                <div className="mt-2 text-xs text-slate-600 space-y-1">
                  <div>
                    <span className="font-medium text-slate-700">Đơn vị: </span>
                    {selectedTask.unit?.name || "Chi cục Hải quan CKQT Tà Lùng"}
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">Chủ trì thực hiện: </span>
                    <strong className="text-slate-900">{selectedTask.owner?.fullName}</strong> ({selectedTask.owner?.position || "Công chức"})
                  </div>
                  {selectedTask.assignees && selectedTask.assignees.length > 0 && (
                    <div>
                      <span className="font-medium text-slate-700">Cán bộ phối hợp: </span>
                      {selectedTask.assignees.map((a) => a.person.fullName).join(", ")}
                    </div>
                  )}
                  <div>
                    <span className="font-medium text-slate-700">Thời hạn hoàn thành: </span>
                    <strong className="text-slate-900">
                      {new Date(selectedTask.currentDeadline).toLocaleDateString("vi-VN")}
                    </strong>
                    {selectedTask.originalDeadline &&
                      new Date(selectedTask.originalDeadline).getTime() !==
                        new Date(selectedTask.currentDeadline).getTime() && (
                        <span className="text-slate-400 ml-1.5 line-through">
                          (Gốc: {new Date(selectedTask.originalDeadline).toLocaleDateString("vi-VN")})
                        </span>
                      )}
                  </div>
                </div>
              </div>

              {/* Requirement & Description */}
              {selectedTask.description && (
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-700 space-y-1">
                  <div className="font-semibold text-slate-800">Yêu cầu nội dung:</div>
                  <p className="whitespace-pre-line leading-relaxed">{selectedTask.description}</p>
                </div>
              )}

              {/* Expected Result */}
              {selectedTask.expectedResultText && (
                <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 text-xs text-blue-900 space-y-1">
                  <div className="font-semibold text-blue-800">Sản phẩm đầu ra dự kiến:</div>
                  <p className="whitespace-pre-line leading-relaxed">{selectedTask.expectedResultText}</p>
                </div>
              )}

              {/* Issue Banner if any */}
              {selectedTask.hasIssue && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-orange-800">
                    <AlertTriangle className="w-4 h-4 text-orange-600" />
                    Vướng mắc đang gặp phải:
                  </div>
                  <p>{selectedTask.issueNotes || "Đã ghi nhận vướng mắc cần lãnh đạo tháo gỡ."}</p>
                </div>
              )}

              {/* Action Buttons for Staff */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-700 block">Thao tác tác nghiệp công chức</label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setProgressPercent(selectedTask.progressPercent || 50);
                      setShowProgressModal(true);
                    }}
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-900 border border-blue-200 hover:bg-blue-100 transition-colors"
                  >
                    <TrendingUp className="w-3.5 h-3.5 text-blue-700" />
                    Cập nhật tiến độ
                  </button>

                  <button
                    type="button"
                    disabled={selectedTask.status === "COMPLETED" || selectedTask.status === "WAITING_REVIEW"}
                    onClick={() => setShowSubmitCompletionModal(true)}
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 text-xs font-medium rounded-lg bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100 transition-colors disabled:opacity-50"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-purple-700" />
                    Báo hoàn thành
                  </button>

                  <button
                    type="button"
                    disabled={selectedTask.status === "COMPLETED"}
                    onClick={() => setShowDeadlineModal(true)}
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-50"
                  >
                    <CalendarClock className="w-3.5 h-3.5 text-amber-700" />
                    Đề nghị lùi hạn
                  </button>
                </div>
              </div>

              {/* Operational Log & History Timeline (Nhật ký tác nghiệp - Screen a82b540bccfa44f18a4613e415e5efa4) */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    Nhật ký tác nghiệp & Tiến độ ({selectedTask.updates?.length || 0})
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono">TIMELINE</span>
                </div>

                {selectedTask.updates && selectedTask.updates.length > 0 ? (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {selectedTask.updates.map((up) => (
                      <div
                        key={up.id}
                        className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="font-semibold text-slate-700">
                            {up.author?.fullName || "Công chức"}
                          </span>
                          <span>{new Date(up.createdAt).toLocaleString("vi-VN")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                            {up.progressPercent}%
                          </span>
                          <span className="text-slate-600 font-medium">
                            {up.notes || "Cập nhật tiến độ định kỳ"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-dashed border-slate-200 text-center">
                    Chưa có nhật ký tác nghiệp nào được ghi chép. Hãy dùng nút "Cập nhật tiến độ" để lưu nhật ký.
                  </div>
                )}
              </div>

              {/* Pending Deadline Extension Requests */}
              {selectedTask.deadlineRequests && selectedTask.deadlineRequests.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5 text-amber-600" />
                    Đề nghị lùi hạn đã gửi
                  </h4>
                  <div className="space-y-1.5">
                    {selectedTask.deadlineRequests.map((req) => (
                      <div
                        key={req.id}
                        className="p-2.5 bg-amber-50/50 border border-amber-200 rounded-lg text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-amber-900">
                            Xin gia hạn đến: {new Date(req.requestedDeadline).toLocaleDateString("vi-VN")}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              req.status === "PENDING"
                                ? "bg-amber-100 text-amber-800"
                                : req.status === "APPROVED"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {req.status === "PENDING"
                              ? "Chờ duyệt"
                              : req.status === "APPROVED"
                              ? "Đã duyệt"
                              : "Từ chối"}
                          </span>
                        </div>
                        <p className="text-amber-800/90 text-[11px]">{req.reason}</p>
                        {req.reviewNotes && (
                          <p className="text-slate-600 text-[11px] italic">
                            Ý kiến lãnh đạo: {req.reviewNotes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-slate-400">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-40 text-blue-900" />
              <p className="text-xs font-medium">Chọn một nhiệm vụ từ danh sách để xem chi tiết và tác nghiệp</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal 1: Cập nhật tiến độ & Báo vướng */}
      {showProgressModal && selectedTask && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-700" />
                Cập nhật tiến độ & Nhật ký tác nghiệp
              </h3>
              <button
                onClick={() => setShowProgressModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateProgress} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Tiến độ hoàn thành: <span className="font-bold text-blue-700">{progressPercent}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={progressPercent}
                  onChange={(e) => setProgressPercent(Number(e.target.value))}
                  className="w-full accent-blue-900 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>0% Chưa làm</span>
                  <span>50% Đang xử lý</span>
                  <span>100% Xong việc</span>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Ghi chú nhật ký tác nghiệp / Kết quả cụ thể đã làm:
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Ví dụ: Đã kiểm tra hồ sơ 12 tờ khai, phát hiện 01 trường hợp thiếu C/O..."
                  value={progressNotes}
                  onChange={(e) => setProgressNotes(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Báo vướng mắc */}
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-900">
                  <input
                    type="checkbox"
                    checked={reportHasIssue}
                    onChange={(e) => setReportHasIssue(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span>Báo cáo có khó khăn, vướng mắc phát sinh</span>
                </label>

                {reportHasIssue && (
                  <div>
                    <label className="text-[11px] font-semibold text-amber-800 block mb-1">
                      Chi tiết vướng mắc & Đề xuất kiến nghị:
                    </label>
                    <textarea
                      rows={2}
                      required={reportHasIssue}
                      placeholder="Mô tả cụ thể vướng mắc về cơ chế, hệ thống VNACCS hoặc phối hợp liên ngành..."
                      value={reportIssueNotes}
                      onChange={(e) => setReportIssueNotes(e.target.value)}
                      className="w-full p-2 border border-amber-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowProgressModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 font-semibold shadow-sm disabled:opacity-50"
                >
                  {modalLoading ? "Đang lưu..." : "Lưu cập nhật"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Báo hoàn thành (Trình nghiệm thu) */}
      {showSubmitCompletionModal && selectedTask && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-purple-700" />
                Báo cáo hoàn thành & Trình nghiệm thu
              </h3>
              <button
                onClick={() => setShowSubmitCompletionModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Nhiệm vụ sẽ chuyển sang trạng thái <strong>"Chờ nghiệm thu"</strong> (WAITING_REVIEW) để Lãnh đạo hoặc Người giao việc kiểm tra và xác nhận hoàn thành chính thức.
            </p>

            <form onSubmit={handleSubmitCompletion} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Báo cáo kết quả thực hiện thực tế:
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Mô tả kết quả đạt được, số lượng hồ sơ/văn bản đã xử lý, đường dẫn tài liệu đính kèm (nếu có)..."
                  value={completionResultText}
                  onChange={(e) => setCompletionResultText(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSubmitCompletionModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-4 py-2 bg-purple-700 text-white rounded-lg hover:bg-purple-800 font-semibold shadow-sm disabled:opacity-50"
                >
                  {modalLoading ? "Đang gửi..." : "Gửi trình nghiệm thu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Đề nghị lùi hạn hoàn thành */}
      {showDeadlineModal && selectedTask && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-amber-700" />
                Đề nghị gia hạn / lùi thời hạn hoàn thành
              </h3>
              <button
                onClick={() => setShowDeadlineModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Hạn hoàn thành hiện tại:{" "}
              <strong className="text-slate-800 font-mono">
                {new Date(selectedTask.currentDeadline).toLocaleDateString("vi-VN")}
              </strong>
              . Đề nghị sẽ được gửi tới Lãnh đạo phụ trách xem xét phê duyệt.
            </p>

            <form onSubmit={handleRequestDeadline} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Thời hạn hoàn thành mới đề xuất:
                </label>
                <input
                  type="date"
                  required
                  value={requestedDeadline}
                  onChange={(e) => setRequestedDeadline(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Lý do đề nghị lùi hạn:
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Nêu rõ lý do khách quan/chủ quan (chờ kết quả giám định, chờ DN bổ sung tài liệu, sự cố hệ thống...)"
                  value={deadlineReason}
                  onChange={(e) => setDeadlineReason(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDeadlineModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-4 py-2 bg-amber-700 text-white rounded-lg hover:bg-amber-800 font-semibold shadow-sm disabled:opacity-50"
                >
                  {modalLoading ? "Đang gửi..." : "Gửi đề nghị lùi hạn"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
