"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  GitBranch,
  Search,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  UserCheck,
  Users,
  Shield,
  ChevronRight,
  RefreshCw,
  ArrowRight,
  Filter,
  Check,
  X,
  MessageSquare,
} from "lucide-react";

interface TaskItem {
  id: string;
  code: string;
  title: string;
  description?: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "WAITING_REVIEW" | "COMPLETED" | "DONE" | "CANCELED";
  priority: "Cao" | "Trung bình" | "Thấp";
  originalDeadline: string;
  currentDeadline: string;
  expectedResultText?: string;
  actualResultText?: string;
  hasIssue: boolean;
  issueNotes?: string;
  isOverdue?: boolean;
  owner?: { id: string; fullName: string; position?: string };
  unit?: { id: string; name: string; code: string };
  assignees?: Array<{ person: { id: string; fullName: string } }>;
  deadlineRequests?: Array<{
    id: string;
    requestedDeadline: string;
    reason: string;
    status: string;
    requestedBy: { fullName: string };
  }>;
}

interface Person {
  id: string;
  code: string;
  fullName: string;
  assignments?: Array<{ unit: { id: string; name: string } }>;
}

export default function TasksManagementPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<"ALL" | "IN_PROGRESS" | "WAITING_REVIEW" | "OVERDUE" | "HAS_ISSUE" | "COMPLETED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Form tạo nhiệm vụ mới
  const [newTaskData, setNewTaskData] = useState({
    title: "",
    description: "",
    ownerId: "",
    priority: "Cao",
    deadline: "",
    assigneeIds: [] as string[],
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resTasks, resPeople] = await Promise.all([
        fetch("/api/tasks"),
        fetch("/api/people"),
      ]);

      if (resTasks.ok) {
        const json = await resTasks.json();
        setTasks(Array.isArray(json) ? json : (json.data || []));
      }

      if (resPeople.ok) {
        const jsonPeople = await resPeople.json();
        setPeople(Array.isArray(jsonPeople) ? jsonPeople : (jsonPeople.data || []));
      }
    } catch (err) {
      console.error("Lỗi khi tải dữ liệu:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskData.title || !newTaskData.ownerId || !newTaskData.deadline) return;

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTaskData),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setNewTaskData({
          title: "",
          description: "",
          ownerId: "",
          priority: "Cao",
          deadline: "",
          assigneeIds: [],
        });
        setActionMessage("Đã giao nhiệm vụ mới thành công");
        fetchData();
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch (err) {
      console.error("Lỗi giao việc:", err);
    }
  };

  // Xác nhận hoàn thành hoặc trả lại nhiệm vụ
  const handleReviewCompletion = async (taskId: string, confirm: boolean) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: taskId,
          action: confirm ? "CONFIRM_COMPLETION" : "REJECT_COMPLETION",
          issueNotes: confirm ? undefined : "Yêu cầu kiểm tra bổ sung hồ sơ và đối chiếu thực tế",
        }),
      });

      if (res.ok) {
        setActionMessage(confirm ? "Đã nghiệm thu và xác nhận hoàn thành nhiệm vụ" : "Đã trả lại yêu cầu hoàn thiện thêm");
        fetchData();
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch (err) {
      console.error("Lỗi review nhiệm vụ:", err);
    }
  };

  // Duyệt đề nghị lùi hạn
  const handleReviewDeadlineRequest = async (taskId: string, reqId: string, approve: boolean) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/deadline-request/${reqId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: approve ? "APPROVE" : "REJECT",
          reviewNotes: approve ? "Đồng ý gia hạn theo đề xuất của cán bộ" : "Từ chối, yêu cầu hoàn thành đúng hạn ban đầu",
        }),
      });

      if (res.ok) {
        setActionMessage(approve ? "Đã phê duyệt gia hạn nhiệm vụ" : "Đã từ chối đề nghị lùi hạn");
        fetchData();
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch (err) {
      console.error("Lỗi duyệt lùi hạn:", err);
    }
  };

  // Thống kê số lượng
  const countTotal = tasks.length;
  const countInProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const countWaitingReview = tasks.filter((t) => t.status === "WAITING_REVIEW").length;
  const countOverdue = tasks.filter((t) => t.isOverdue).length;
  const countHasIssue = tasks.filter((t) => t.hasIssue).length;
  const countCompleted = tasks.filter((t) => t.status === "COMPLETED" || t.status === "DONE").length;

  // Lọc nhiệm vụ
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.owner?.fullName && task.owner.fullName.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterTab === "IN_PROGRESS") return task.status === "IN_PROGRESS";
    if (filterTab === "WAITING_REVIEW") return task.status === "WAITING_REVIEW";
    if (filterTab === "OVERDUE") return task.isOverdue;
    if (filterTab === "HAS_ISSUE") return task.hasIssue;
    if (filterTab === "COMPLETED") return task.status === "COMPLETED" || task.status === "DONE";
    return true;
  });

  const getStatusBadge = (task: TaskItem) => {
    if (task.status === "COMPLETED" || task.status === "DONE") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" /> Đã hoàn thành
        </span>
      );
    }
    if (task.status === "WAITING_REVIEW") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 animate-pulse">
          <Clock className="w-3.5 h-3.5" /> Chờ xác nhận
        </span>
      );
    }
    if (task.status === "IN_PROGRESS") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
          <Clock className="w-3.5 h-3.5" /> Đang thực hiện
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
        Chưa bắt đầu
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header (Ref: Stitch Desktop 26cca4106e7047f0af538a76d53f9338) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-indigo-100 text-indigo-800">
              Chỉ đạo & Giao việc
            </span>
            <span className="text-xs text-slate-500">Màn hình S04 • Desktop & Mobile</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Nhiệm vụ Chỉ đạo & Giao việc</h1>
          <p className="text-sm text-slate-600">
            Giao nhiệm vụ, chỉ định người phối hợp, theo dõi thời hạn, xử lý đề nghị lùi hạn và nghiệm thu kết quả
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Giao việc mới
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-emerald-600 hover:underline text-xs">
            Đóng
          </button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div
          onClick={() => setFilterTab("ALL")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            filterTab === "ALL" ? "bg-blue-50 border-blue-300 ring-2 ring-blue-500/20" : "bg-white border-slate-200"
          }`}
        >
          <span className="text-xs text-slate-500">Tổng nhiệm vụ</span>
          <div className="text-xl font-bold text-slate-900 mt-1">{countTotal}</div>
        </div>

        <div
          onClick={() => setFilterTab("IN_PROGRESS")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            filterTab === "IN_PROGRESS" ? "bg-blue-50 border-blue-300 ring-2 ring-blue-500/20" : "bg-white border-slate-200"
          }`}
        >
          <span className="text-xs text-blue-700 font-medium">Đang làm</span>
          <div className="text-xl font-bold text-blue-800 mt-1">{countInProgress}</div>
        </div>

        <div
          onClick={() => setFilterTab("WAITING_REVIEW")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            filterTab === "WAITING_REVIEW" ? "bg-purple-50 border-purple-300 ring-2 ring-purple-500/20" : "bg-white border-slate-200"
          }`}
        >
          <span className="text-xs text-purple-700 font-medium">Chờ xác nhận</span>
          <div className="text-xl font-bold text-purple-800 mt-1">{countWaitingReview}</div>
        </div>

        <div
          onClick={() => setFilterTab("OVERDUE")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            filterTab === "OVERDUE" ? "bg-rose-50 border-rose-300 ring-2 ring-rose-500/20" : "bg-white border-slate-200"
          }`}
        >
          <span className="text-xs text-rose-700 font-medium">Quá hạn</span>
          <div className="text-xl font-bold text-rose-800 mt-1">{countOverdue}</div>
        </div>

        <div
          onClick={() => setFilterTab("HAS_ISSUE")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            filterTab === "HAS_ISSUE" ? "bg-amber-50 border-amber-300 ring-2 ring-amber-500/20" : "bg-white border-slate-200"
          }`}
        >
          <span className="text-xs text-amber-700 font-medium">Vướng mắc</span>
          <div className="text-xl font-bold text-amber-800 mt-1">{countHasIssue}</div>
        </div>

        <div
          onClick={() => setFilterTab("COMPLETED")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            filterTab === "COMPLETED" ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20" : "bg-white border-slate-200"
          }`}
        >
          <span className="text-xs text-emerald-700 font-medium">Đã hoàn thành</span>
          <div className="text-xl font-bold text-emerald-800 mt-1">{countCompleted}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilterTab("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
              filterTab === "ALL" ? "bg-blue-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Tất cả ({countTotal})
          </button>
          <button
            onClick={() => setFilterTab("WAITING_REVIEW")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
              filterTab === "WAITING_REVIEW" ? "bg-purple-700 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Cần nghiệm thu ({countWaitingReview})
          </button>
          <button
            onClick={() => setFilterTab("OVERDUE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
              filterTab === "OVERDUE" ? "bg-rose-700 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Quá hạn ({countOverdue})
          </button>
          <button
            onClick={() => setFilterTab("HAS_ISSUE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
              filterTab === "HAS_ISSUE" ? "bg-amber-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Vướng mắc ({countHasIssue})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo mã, tên, người chủ trì..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Main Task List & Detail Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Task Table (7 cols on lg) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                  <th className="py-3 px-3">Mã NV</th>
                  <th className="py-3 px-3">Nhiệm vụ</th>
                  <th className="py-3 px-3">Chủ trì / Phối hợp</th>
                  <th className="py-3 px-3">Hạn hoàn thành</th>
                  <th className="py-3 px-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      Không có nhiệm vụ nào phù hợp với bộ lọc
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task) => {
                    const isSelected = selectedTask?.id === task.id;
                    return (
                      <tr
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? "bg-blue-50/70" : "hover:bg-slate-50/80"
                        }`}
                      >
                        <td className="py-3 px-3 font-mono font-bold text-blue-900 whitespace-nowrap">
                          {task.code}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900 line-clamp-2">{task.title}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                              {task.unit?.name || "Đơn vị"}
                            </span>
                            {task.hasIssue && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-0.5">
                                <AlertTriangle className="w-2.5 h-2.5" /> Có vướng
                              </span>
                            )}
                            {task.isOverdue && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                                Quá hạn
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-medium text-slate-800">{task.owner?.fullName || "Chưa giao"}</div>
                          {task.assignees && task.assignees.length > 0 && (
                            <div className="text-[11px] text-slate-400">
                              + {task.assignees.length} phối hợp
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-slate-600 font-mono">
                          {new Date(task.currentDeadline).toLocaleDateString("vi-VN")}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {getStatusBadge(task)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Detail & Actions Pane (5 cols on lg) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5 sticky top-20">
          {selectedTask ? (
            <>
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded">
                    {selectedTask.code}
                  </span>
                  {getStatusBadge(selectedTask)}
                </div>
                <h2 className="text-base font-bold text-slate-900 mt-2">{selectedTask.title}</h2>
                {selectedTask.description && (
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                    {selectedTask.description}
                  </p>
                )}
              </div>

              {/* Personnel Assignment Info */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Người chủ trì:</span>
                  <span className="font-bold text-slate-900">{selectedTask.owner?.fullName}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Đơn vị phụ trách:</span>
                  <span className="font-medium text-slate-800">{selectedTask.unit?.name}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Thời hạn hiện tại:</span>
                  <span className={`font-mono font-bold ${selectedTask.isOverdue ? "text-rose-600" : "text-slate-800"}`}>
                    {new Date(selectedTask.currentDeadline).toLocaleDateString("vi-VN")}
                    {selectedTask.isOverdue && " (ĐÃ QUÁ HẠN)"}
                  </span>
                </div>
                {selectedTask.expectedResultText && (
                  <div className="py-1.5 border-b border-slate-100">
                    <span className="text-slate-500 block mb-0.5">Sản phẩm đầu ra dự kiến:</span>
                    <span className="text-slate-800 italic">{selectedTask.expectedResultText}</span>
                  </div>
                )}
                {selectedTask.hasIssue && selectedTask.issueNotes && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
                    <span className="font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Ghi chú vướng mắc:
                    </span>
                    <p className="mt-0.5">{selectedTask.issueNotes}</p>
                  </div>
                )}
              </div>

              {/* Xét duyệt hoàn thành (Khi ở trạng thái WAITING_REVIEW) */}
              {selectedTask.status === "WAITING_REVIEW" && (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                    <Clock className="w-4 h-4 text-purple-700" />
                    Cán bộ đã báo hoàn thành — Chờ Lãnh đạo nghiệm thu
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleReviewCompletion(selectedTask.id, true)}
                      className="py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" /> Xác nhận đạt
                    </button>
                    <button
                      onClick={() => handleReviewCompletion(selectedTask.id, false)}
                      className="py-2 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" /> Trả lại yêu cầu sửa
                    </button>
                  </div>
                </div>
              )}

              {/* Xử lý Đề nghị lùi hạn (Pending Deadline Requests) */}
              {selectedTask.deadlineRequests && selectedTask.deadlineRequests.length > 0 && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
                  <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-blue-700" />
                    Có đề nghị gia hạn thời gian
                  </div>
                  {selectedTask.deadlineRequests.map((req) => (
                    <div key={req.id} className="space-y-2 text-xs bg-white p-3 rounded-lg border border-blue-100">
                      <div className="flex justify-between text-slate-600">
                        <span>Hạn mới đề xuất:</span>
                        <span className="font-bold font-mono text-blue-950">
                          {new Date(req.requestedDeadline).toLocaleDateString("vi-VN")}
                        </span>
                      </div>
                      <div className="text-slate-700">
                        <span className="text-slate-500">Lý do: </span>
                        {req.reason}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleReviewDeadlineRequest(selectedTask.id, req.id, true)}
                          className="flex-1 py-1 bg-blue-900 text-white text-[11px] font-bold rounded hover:bg-blue-800"
                        >
                          Duyệt gia hạn
                        </button>
                        <button
                          onClick={() => handleReviewDeadlineRequest(selectedTask.id, req.id, false)}
                          className="flex-1 py-1 bg-slate-200 text-slate-700 text-[11px] font-bold rounded hover:bg-slate-300"
                        >
                          Từ chối
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-slate-400">
              <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs font-medium">Chọn một nhiệm vụ bên trái để xem chi tiết và duyệt kết quả</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Giao việc mới */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-900" />
              Giao nhiệm vụ mới
            </h3>

            <form onSubmit={handleCreateTask} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Tên nhiệm vụ chỉ đạo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Kiểm tra chuyên sâu lô hàng quá cảnh Barie số 1"
                  value={newTaskData.title}
                  onChange={(e) => setNewTaskData({ ...newTaskData, title: e.target.value })}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Mô tả nội dung chỉ đạo</label>
                <textarea
                  rows={2}
                  placeholder="Yêu cầu cụ thể, phương pháp thực hiện..."
                  value={newTaskData.description}
                  onChange={(e) => setNewTaskData({ ...newTaskData, description: e.target.value })}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Cán bộ chủ trì *</label>
                  <select
                    required
                    value={newTaskData.ownerId}
                    onChange={(e) => setNewTaskData({ ...newTaskData, ownerId: e.target.value })}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                  >
                    <option value="">-- Chọn cán bộ chủ trì --</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Hạn hoàn thành *</label>
                  <input
                    type="date"
                    required
                    value={newTaskData.deadline}
                    onChange={(e) => setNewTaskData({ ...newTaskData, deadline: e.target.value })}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Mức độ ưu tiên</label>
                <select
                  value={newTaskData.priority}
                  onChange={(e) => setNewTaskData({ ...newTaskData, priority: e.target.value as any })}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="Cao">Cao</option>
                  <option value="Trung bình">Trung bình</option>
                  <option value="Thấp">Thấp</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-900 rounded-lg hover:bg-blue-800 shadow-sm"
                >
                  Tạo và giao việc
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
