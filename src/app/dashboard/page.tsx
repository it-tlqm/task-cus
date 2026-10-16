"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/Toast";
import { getCurrentPeriodLabels } from "@/lib/period-helper";
import { usePermissions } from "@/hooks/usePermissions";
import { CollaboratorPicker } from "@/components/tasks/CollaboratorPicker";

interface KPIData {
  totalTasks: number;
  inProgress: number;
  waitingReview: number;
  completed: number;
  overdue: number;
  hasIssue: number;
  notStarted?: number;
  completionRate: number | null;
  assignedRate: number | null;
  averageProgress: number | null;
  onTimeRate: number | null;
  newTasksCount: number;
  urgentTasksCount: number;
  urgentReviewCount: number;
}

interface DepartmentBreakdown {
  id: string;
  name: string;
  code: string;
  taskCount: number;
  completedTasks: number;
  inProgressTasks: number;
  waitingReviewTasks: number;
  overdueTasks: number;
  completionRate: number | null;
  averageProgress: number | null;
  staffCount: number;
}

interface AttentionTask {
  id: string;
  code: string;
  title: string;
  priority: string;
  status: string;
  isOverdue: boolean;
  hasIssue: boolean;
  issueNotes?: string | null;
  originalDeadline: string;
  currentDeadline: string;
  owner?: { id: string; fullName: string; code?: string } | null;
  unit?: { id: string; name: string; code?: string } | null;
  hasPendingDeadlineRequest?: boolean;
}

interface HotAlert {
  id: string;
  code: string;
  title: string;
  type: string;
  severity: "DANGER" | "WARNING" | "INFO";
  ownerName: string;
  unitName: string;
  message: string;
}

interface ReportingPeriodItem {
  id: string;
  title: string;
  type: string;
  startAt: string;
  endAt: string;
  isLocked: boolean;
}

interface SelectedPeriodInfo {
  key: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<KPIData>({
    totalTasks: 0,
    inProgress: 0,
    waitingReview: 0,
    completed: 0,
    overdue: 0,
    hasIssue: 0,
    completionRate: null,
    assignedRate: null,
    averageProgress: null,
    onTimeRate: null,
    newTasksCount: 0,
    urgentTasksCount: 0,
    urgentReviewCount: 0,
  });

  const [departments, setDepartments] = useState<DepartmentBreakdown[]>([]);
  const [attentionTasks, setAttentionTasks] = useState<AttentionTask[]>([]);
  const [hotAlerts, setHotAlerts] = useState<HotAlert[]>([]);
  const [availablePeriods, setAvailablePeriods] = useState<ReportingPeriodItem[]>([]);
  const [selectedPeriodInfo, setSelectedPeriodInfo] = useState<SelectedPeriodInfo | null>(null);
  const [period, setPeriod] = useState<string>("week");
  const [unitFilter, setUnitFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAdminBlocked, setIsAdminBlocked] = useState(false);
  const periodLabels = React.useMemo(() => getCurrentPeriodLabels(), []);
  const { canAssign, canExport, canApprove } = usePermissions();

  // Quick Task Assign Modal State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTitle, setAssignTitle] = useState("");
  const [assignUnit, setAssignUnit] = useState("");
  const [assignPriority, setAssignPriority] = useState("Cao");
  const [assignDeadline, setAssignDeadline] = useState(() => {
    const d = new Date(Date.now() + 24 * 3600 * 1000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T17:00`;
  });
  // AI tóm tắt giao ban (tự ẩn khi máy chủ chưa cấu hình key)
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [aiSummarizing, setAiSummarizing] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  // YC-01: chủ trì + phối hợp trong modal giao việc nhanh
  const [assignOwner, setAssignOwner] = useState("");
  const [assignCollabs, setAssignCollabs] = useState<string[]>([]);
  const [assignPeople, setAssignPeople] = useState<Array<{ id: string; fullName: string }>>([]);
  // Đợt A: ảnh/văn bản đính kèm ngay khi giao
  const [assignFiles, setAssignFiles] = useState<File[]>([]);

  const uploadAssignAttachments = async (taskId: string, files: File[]): Promise<number> => {
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

  const fetchDashboardData = async () => {
    setLoading(true);
    setErrorMsg(null);
    setIsAdminBlocked(false);
    try {
      const res = await fetch(`/api/dashboard/kpi?unitId=${unitFilter}&period=${period}`);
      const data = await res.json();

      if (!res.ok) {
        // Tài khoản quản trị kỹ thuật bị chặn xem số liệu nghiệp vụ theo thiết kế —
        // hiển thị panel giải thích thay vì báo lỗi đỏ
        if (res.status === 403 && /Quản trị kỹ thuật/.test(data.error || "")) {
          setIsAdminBlocked(true);
          return;
        }
        throw new Error(data.error || "Không thể tải số liệu KPI");
      }

      if (data.kpis) {
        setKpis(data.kpis);
      }

      if (Array.isArray(data.availablePeriods)) {
        setAvailablePeriods(data.availablePeriods);
      }

      if (data.selectedPeriod) {
        setSelectedPeriodInfo(data.selectedPeriod);
      }

      if (Array.isArray(data.departmentBreakdown)) {
        setDepartments(data.departmentBreakdown);
        if (data.departmentBreakdown.length > 0 && !assignUnit) {
          setAssignUnit(data.departmentBreakdown[0].id);
        }
      }

      if (Array.isArray(data.attentionTasks)) {
        setAttentionTasks(data.attentionTasks);
      }

      if (Array.isArray(data.hotAlerts)) {
        setHotAlerts(data.hotAlerts);
      }
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
      setErrorMsg(err.message || "Lỗi tải dữ liệu Dashboard");
      toast.error(err.message || "Lỗi tải dữ liệu Dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    fetch("/api/ai")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.enabled) setAiEnabled(true);
      })
      .catch(() => {});
    // YC-01: nạp danh sách nhân sự thật cho chọn chủ trì/phối hợp
    fetch("/api/people?pageSize=100")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const list = Array.isArray(json) ? json : json?.data || [];
        setAssignPeople(list.map((p: any) => ({ id: p.id, fullName: p.fullName })));
        if (list.length > 0) setAssignOwner((cur) => cur || list[0].id);
      })
      .catch(() => {});
  }, [unitFilter, period]);

  // AI tóm tắt tình hình từ số liệu thật (người đọc sửa tay trước khi dùng)
  const handleAiSummarize = async () => {
    if (aiSummarizing) return;
    setAiSummarizing(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "summarize" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data?.text) {
        setAiSummary(json.data.text);
      } else {
        toast.error(json.error || "AI bận, thử lại sau");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setAiSummarizing(false);
    }
  };

  const handleQuickAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    // YC-04: một thao tác chỉ gửi một request
    if (!assignTitle.trim() || isAssigning) return;

    setIsAssigning(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: assignTitle.trim(),
          priority: assignPriority,
          currentDeadline: new Date(assignDeadline).toISOString(),
          description: "Chỉ đạo trực ban lãnh đạo giao khẩn",
          unitId: assignUnit && assignUnit !== "ALL" ? assignUnit : undefined,
          ownerId: assignOwner || undefined,
          assigneeIds: assignCollabs,
          status: "IN_PROGRESS",
          progressPercent: 0,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        let attachMsg = "";
        if (assignFiles.length > 0 && data.data?.id) {
          const n = await uploadAssignAttachments(data.data.id, assignFiles);
          attachMsg = n > 0 ? ` (đính kèm ${n} tệp)` : " (tải đính kèm thất bại, bổ sung ở chi tiết)";
        }
        setShowAssignModal(false);
        setAssignTitle("");
        setAssignCollabs([]);
        setAssignFiles([]);
        toast.success(
          data.deduplicated
            ? "Nhiệm vụ vừa được tạo (hệ thống chặn bấm trùng, không tạo thêm bản ghi)"
            : `Đã chuyển ý kiến chỉ đạo thành công!${attachMsg}`
        );
        await fetchDashboardData();
      } else {
        toast.error(data.error || "Không thể giao nhiệm vụ");
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi mạng khi giao việc");
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-app-bg pb-12">
      {/* =========================================================================
          DESKTOP VIEW (Pixel-accurate Google Stitch ID 089086aec3864b019c5af41b1319cf82)
          ========================================================================= */}
      <div className="hidden lg:flex flex-col w-full p-space-lg gap-space-lg">
        {/* TOP BAR: EXECUTIVE FILTER & SYSTEM CONTEXT */}
        <div className="flex flex-col gap-space-md bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-border-default/50">
          <div className="flex flex-wrap items-center justify-between gap-space-md">
            <div className="flex items-center gap-space-md">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary-container text-on-primary shadow-sm">
                <span className="material-symbols-outlined text-[28px]">query_stats</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-headline-lg text-headline-lg text-primary tracking-tight">
                    Trung tâm Điều hành Công tác Nghiệp vụ
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-label-sm font-semibold bg-secondary/15 text-secondary">
                    TRỰC BAN LÃNH ĐẠO
                  </span>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant flex items-center gap-2">
                  <span>Hải quan cửa khẩu Quốc tế Tà Lùng</span>
                  <span className="text-outline-variant">•</span>
                  <span className="font-mono text-label-sm text-outline">
                    {selectedPeriodInfo ? selectedPeriodInfo.title : "Kỳ giám sát hiện tại"}
                  </span>
                </p>
              </div>
            </div>

            {/* Quick Actions (chỉ hiện nút được phép dùng) */}
            <div data-tour="quick-actions" className="flex flex-wrap items-center gap-space-sm">
              {aiEnabled && (
                <button
                  onClick={handleAiSummarize}
                  disabled={aiSummarizing}
                  title="AI tóm tắt tình hình từ số liệu thật để đọc giao ban"
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-subtle hover:bg-surface-container text-primary font-body-semibold text-body-semibold transition-fast shadow-sm active-press disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                  <span>{aiSummarizing ? "Đang tóm tắt..." : "Tóm tắt AI"}</span>
                </button>
              )}
              {canExport && (
                <Link
                  href="/reports/excel"
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-subtle hover:bg-surface-container text-primary font-body-semibold text-body-semibold transition-fast shadow-sm active-press"
                >
                  <span className="material-symbols-outlined text-[18px]">table_view</span>
                  <span>Xuất báo cáo giao ban (.xlsx)</span>
                </Link>
              )}
              {canAssign && (
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-secondary hover:bg-secondary/90 text-on-secondary font-body-semibold text-body-semibold transition-fast shadow-sm active-press"
                >
                  <span className="material-symbols-outlined text-[18px]">add_task</span>
                  <span>Giao nhiệm vụ đột xuất</span>
                </button>
              )}
              <button
                onClick={fetchDashboardData}
                disabled={loading}
                className="p-2 rounded-lg bg-surface-subtle hover:bg-surface-container text-on-surface-variant transition-fast active-press disabled:opacity-50"
                title="Làm mới dữ liệu tức thì từ PostgreSQL"
              >
                <span className={`material-symbols-outlined text-[20px] ${loading ? "animate-spin" : ""}`}>
                  autorenew
                </span>
              </button>
            </div>
          </div>

          {/* Kết quả tóm tắt AI (từ số liệu thật — đọc và sửa tay trước khi dùng) */}
          {aiSummary && (
            <div className="bg-secondary/10 border border-secondary/30 p-space-md rounded-xl shadow-sm flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-label-md text-label-md font-bold text-secondary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                  Tóm tắt AI (tham khảo)
                </span>
                <button onClick={() => setAiSummary("")} className="text-outline hover:text-primary text-xs font-semibold">
                  Ẩn
                </button>
              </div>
              <p className="font-body-md text-body-md text-on-surface leading-relaxed whitespace-pre-line">{aiSummary}</p>
            </div>
          )}

          {/* Filter Strip */}
          <div className="flex flex-wrap items-center justify-between gap-space-md pt-space-sm bg-surface-container-low/60 p-space-md rounded-lg">
            {/* Period Selector Segmented & Dynamic Dropdown */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-surface-container-lowest p-1 rounded-lg shadow-sm border border-border-default/40">
                <button
                  onClick={() => setPeriod("today")}
                  className={`px-3 py-1.5 rounded-lg text-label-md font-label-md transition-fast ${
                    period === "today"
                      ? "bg-primary text-on-primary shadow-sm font-semibold"
                      : "text-on-surface-variant hover:text-primary"
                  }`}
                >
                  Hôm nay
                </button>
                <button
                  onClick={() => setPeriod("week")}
                  className={`px-3 py-1.5 rounded-lg text-label-md font-label-md transition-fast ${
                    period === "week"
                      ? "bg-primary text-on-primary shadow-sm font-semibold"
                      : "text-on-surface-variant hover:text-primary"
                  }`}
                >
                  {periodLabels.weekShort}
                </button>
                <button
                  onClick={() => setPeriod("month")}
                  className={`px-3 py-1.5 rounded-lg text-label-md font-label-md transition-fast ${
                    period === "month"
                      ? "bg-primary text-on-primary shadow-sm font-semibold"
                      : "text-on-surface-variant hover:text-primary"
                  }`}
                >
                  {periodLabels.monthShort}
                </button>
                <button
                  onClick={() => setPeriod("all")}
                  className={`px-3 py-1.5 rounded-lg text-label-md font-label-md transition-fast ${
                    period === "all"
                      ? "bg-primary text-on-primary shadow-sm font-semibold"
                      : "text-on-surface-variant hover:text-primary"
                  }`}
                >
                  Toàn bộ kỳ
                </button>
              </div>

              {availablePeriods.length > 0 && (
                <div className="relative">
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="h-9 px-3 pr-8 rounded-lg bg-surface-container-lowest font-body-semibold text-body-semibold text-primary border border-border-default focus:outline-none cursor-pointer shadow-sm text-xs"
                    title="Chọn kỳ báo cáo từ CSDL PostgreSQL"
                  >
                    <option value="all">-- Chọn kỳ CSDL (Toàn bộ) --</option>
                    <option value="today">Hôm nay</option>
                    {availablePeriods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Scope Selector */}
            <div className="flex flex-wrap items-center gap-space-sm">
              <div className="flex items-center gap-2 bg-surface-container-lowest px-3 py-1.5 rounded-lg shadow-sm border border-border-default">
                <span className="material-symbols-outlined text-outline text-[18px]">date_range</span>
                <span className="font-body-semibold text-body-semibold text-on-surface text-[13px]">
                  {selectedPeriodInfo?.startAt && selectedPeriodInfo?.endAt
                    ? `${new Date(selectedPeriodInfo.startAt).toLocaleDateString("vi-VN")} — ${new Date(selectedPeriodInfo.endAt).toLocaleDateString("vi-VN")}`
                    : selectedPeriodInfo?.title || "Toàn bộ thời gian"}
                </span>
                <span className="text-[11px] font-label-sm text-status-success bg-status-success-bg px-1.5 py-0.5 rounded font-bold">
                  Dữ liệu thực tế
                </span>
              </div>
              <div className="relative min-w-[280px]">
                <select
                  value={unitFilter}
                  onChange={(e) => setUnitFilter(e.target.value)}
                  className="w-full h-9 pl-3 pr-8 rounded-lg bg-surface-container-lowest font-body-semibold text-body-semibold text-on-surface border border-border-default focus:outline-none cursor-pointer shadow-sm text-xs"
                >
                  <option value="ALL">Toàn đơn vị - Hải quan cửa khẩu Quốc tế Tà Lùng</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} ({dept.taskCount} việc)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ERROR BANNER IF API FAILED */}
        {errorMsg && !isAdminBlocked && (
          <div className="p-4 rounded-xl bg-status-danger-bg border border-status-danger text-status-danger flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[22px]">error</span>
              <span className="font-semibold text-sm">{errorMsg}</span>
            </div>
            <button
              onClick={fetchDashboardData}
              className="px-3 py-1 rounded bg-status-danger text-white text-xs font-semibold hover:opacity-90 active-press"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* PANEL GIẢI THÍCH CHO TÀI KHOẢN QUẢN TRỊ KỸ THUẬT */}
        {isAdminBlocked && (
          <div className="p-6 rounded-xl bg-surface-container-lowest border border-border-default flex flex-col items-center text-center gap-2">
            <span className="material-symbols-outlined text-[32px] text-secondary">admin_panel_settings</span>
            <p className="font-semibold text-on-surface">Tài khoản Quản trị hệ thống không xem số liệu điều hành</p>
            <p className="text-sm text-on-surface-variant max-w-xl">
              Theo phân quyền, tài khoản kỹ thuật chỉ quản trị cơ cấu, tài khoản và cấu hình — không đọc số liệu
              nghiệp vụ. Để theo dõi điều hành, đăng nhập bằng tài khoản Trưởng hải quan cửa khẩu, Trưởng bộ phận
              hoặc Công chức.
            </p>
          </div>
        )}

        {/* KPI SUMMARY: 6 STANDARDIZED EXECUTIVE CARDS WITH REAL METRICS */}
        <div data-tour="kpi-cards" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-space-md">
          {/* Card 1: Total Tasks */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between hover-lift border border-border-default/50">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface-variant font-medium">
                Tổng việc giao kỳ
              </span>
              <div className="w-7 h-7 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[18px]">assignment</span>
              </div>
            </div>
            <div className="my-3">
              <div className="font-headline-xl text-headline-xl text-primary font-bold tracking-tight">
                {kpis.totalTasks}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 bg-surface-subtle/50 px-2 py-1 rounded">
              <span className="text-[11px] font-label-sm text-status-success flex items-center gap-0.5 font-semibold">
                <span className="material-symbols-outlined text-[13px]">trending_up</span>{" "}
                {kpis.newTasksCount > 0 ? `+${kpis.newTasksCount} việc mới` : "0 việc mới"}
              </span>
              <span className="text-[11px] font-label-sm text-outline font-medium">
                {kpis.assignedRate !== null ? `${kpis.assignedRate}% có chủ trì` : "Chưa có dữ liệu"}
              </span>
            </div>
          </div>

          {/* Card 2: In Progress */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between hover-lift border border-border-default/50">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface-variant font-medium">
                Đang triển khai
              </span>
              <div className="w-7 h-7 rounded-lg bg-status-unassigned-bg flex items-center justify-center text-status-unassigned">
                <span className="material-symbols-outlined text-[18px]">timelapse</span>
              </div>
            </div>
            <div className="my-3">
              <div className="font-headline-xl text-headline-xl text-primary font-bold tracking-tight">
                {kpis.inProgress}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 bg-surface-subtle/50 px-2 py-1 rounded">
              <span className="text-[11px] font-label-sm text-status-unassigned font-semibold">
                {kpis.averageProgress !== null ? `Tiến độ TB ${kpis.averageProgress}%` : "Chưa có tiến độ"}
              </span>
              <span className="text-[11px] font-label-sm text-outline">
                {kpis.inProgress > 0 ? "Đang xử lý" : "Không có việc"}
              </span>
            </div>
          </div>

          {/* Card 3: Completed */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between hover-lift border border-border-default/50">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface-variant font-medium">
                Đã xong &amp; Nghiệm thu
              </span>
              <div className="w-7 h-7 rounded-lg bg-status-success-bg flex items-center justify-center text-status-success">
                <span className="material-symbols-outlined text-[18px]">verified</span>
              </div>
            </div>
            <div className="my-3">
              <div className="font-headline-xl text-headline-xl text-status-success font-bold tracking-tight">
                {kpis.completed}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 bg-status-success-bg/40 px-2 py-1 rounded">
              <span className="text-[11px] font-label-sm text-status-success font-semibold">
                {kpis.completionRate !== null ? `${kpis.completionRate}% hoàn thành` : "Chưa có dữ liệu"}
              </span>
              <span className="text-[11px] font-label-sm text-on-surface-variant">
                {kpis.onTimeRate !== null ? `${kpis.onTimeRate}% đúng hạn` : "Chưa đủ dữ liệu"}
              </span>
            </div>
          </div>

          {/* Card 4: Overdue */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between hover-lift border border-status-danger/30">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-status-danger font-semibold">
                Quá hạn / Xử lý khẩn
              </span>
              <div className="w-7 h-7 rounded-lg bg-status-danger-bg flex items-center justify-center text-status-danger">
                <span className="material-symbols-outlined text-[18px]">error</span>
              </div>
            </div>
            <div className="my-3">
              <div className="font-headline-xl text-headline-xl text-status-danger font-bold tracking-tight">
                {kpis.overdue}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 bg-status-danger-bg/50 px-2 py-1 rounded">
              <span className="text-[11px] font-label-sm text-status-danger font-semibold flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[13px]">warning</span>{" "}
                {kpis.overdue > 0 ? "Cần giải trình" : "Đúng tiến độ"}
              </span>
              <span className="text-[11px] font-label-sm text-status-danger">
                {kpis.overdue > 0 ? `Tồn ${kpis.overdue} việc` : "Không tồn đọng"}
              </span>
            </div>
          </div>

          {/* Card 5: Issues */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between hover-lift border border-status-warning/30">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-status-warning font-semibold">
                Hồ sơ vướng mắc
              </span>
              <div className="w-7 h-7 rounded-lg bg-status-warning-bg flex items-center justify-center text-status-warning">
                <span className="material-symbols-outlined text-[18px]">report_problem</span>
              </div>
            </div>
            <div className="my-3">
              <div className="font-headline-xl text-headline-xl text-status-warning font-bold tracking-tight">
                {kpis.hasIssue}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 bg-status-warning-bg/40 px-2 py-1 rounded">
              <span className="text-[11px] font-label-sm text-status-warning font-semibold">
                {kpis.hasIssue > 0 ? `${kpis.hasIssue} hồ sơ vướng` : "Thông suốt"}
              </span>
              <span className="text-[11px] font-label-sm text-outline">
                {kpis.hasIssue > 0 ? "Cần hỗ trợ" : "Bình thường"}
              </span>
            </div>
          </div>

          {/* Card 6: Waiting Review */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between hover-lift border border-border-default/50">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface-variant font-medium">
                Chờ Lãnh đạo duyệt
              </span>
              <div className="w-7 h-7 rounded-lg bg-secondary-fixed flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[18px]">pending_actions</span>
              </div>
            </div>
            <div className="my-3">
              <div className="font-headline-xl text-headline-xl text-primary font-bold tracking-tight">
                {kpis.waitingReview}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 bg-secondary/10 px-2 py-1 rounded">
              <Link href="/approvals" className="text-[11px] font-label-sm text-secondary font-bold hover:underline">
                Duyệt ngay →
              </Link>
              <span className="text-[11px] font-label-sm text-outline">
                {kpis.urgentReviewCount > 0
                  ? `${String(kpis.urgentReviewCount).padStart(2, "0")} việc gấp`
                  : `${kpis.waitingReview} việc chờ`}
              </span>
            </div>
          </div>
        </div>

        {/* OPERATIONAL RADAR & ATTENTION TASKS TABLE */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
          {/* Tiến độ các bộ phận (Tính theo tỷ lệ hoàn thành thực tế) */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-border-default/50 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-space-sm border-b border-surface-container">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">donut_large</span>
                <h3 className="font-headline-sm text-headline-sm text-primary">Tiến Độ Theo Bộ Phận</h3>
              </div>
              <span className="font-label-sm text-label-sm text-outline">
                {period === "week" ? periodLabels.weekShort : "Toàn bộ"}
              </span>
            </div>

            <div className="flex flex-col gap-4 my-space-md">
              {loading ? (
                <div className="text-xs text-slate-400 py-4 text-center">Đang tải tiến độ các bộ phận...</div>
              ) : departments.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">Chưa có dữ liệu bộ phận</div>
              ) : (
                departments.map((dept) => {
                  const hasData = dept.taskCount > 0 && dept.completionRate !== null;
                  const pct = dept.completionRate ?? 0;
                  const isGood = hasData && pct >= 70;
                  return (
                    <div key={dept.id}>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="truncate max-w-[190px]" title={dept.name}>
                          {dept.name}
                        </span>
                        <span className={!hasData ? "text-outline font-normal" : isGood ? "text-secondary font-bold" : "text-status-warning font-bold"}>
                          {hasData ? `${pct}%` : "Chưa có dữ liệu"} ({dept.completedTasks}/{dept.taskCount} việc • {dept.staffCount} CC)
                        </span>
                      </div>
                      <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                        {hasData ? (
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isGood ? "bg-secondary" : "bg-status-warning"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        ) : (
                          <div className="h-full bg-surface-container-high w-full" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-surface-container text-xs text-outline flex justify-between">
              <span>
                {kpis.completionRate !== null
                  ? `Toàn đơn vị: ${kpis.completionRate}% hoàn thành (${kpis.completed}/${kpis.totalTasks} việc)`
                  : "Toàn đơn vị: Chưa có dữ liệu"}
              </span>
              <span className={kpis.completionRate !== null && kpis.completionRate >= 70 ? "text-status-success font-semibold" : "text-status-warning font-semibold"}>
                {kpis.completionRate !== null && kpis.completionRate >= 70 ? "Đạt chuẩn SLA" : "Cần tăng tốc"}
              </span>
            </div>
          </div>

          {/* Attention Tasks (2 columns) */}
          <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-border-default/50 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-space-sm border-b border-surface-container">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-status-danger text-[20px]">warning</span>
                <h3 className="font-headline-sm text-headline-sm text-primary">Nhiệm Vụ Cần Lãnh Đạo Chỉ Đạo Khẩn</h3>
              </div>
              <Link href="/tasks" className="font-label-sm text-label-sm text-secondary font-bold hover:underline">
                Xem toàn bộ việc →
              </Link>
            </div>

            <div className="overflow-x-auto my-space-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-subtle text-primary border-b border-border-default font-semibold">
                    <th className="py-2.5 px-3">MÃ &amp; TÊN VIỆC</th>
                    <th className="py-2.5 px-2">CHỦ TRÌ</th>
                    <th className="py-2.5 px-2">HẠN ĐỊNH</th>
                    <th className="py-2.5 px-2">TRẠNG THÁI</th>
                    <th className="py-2.5 px-3 text-right">CHỈ ĐẠO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container text-on-surface">
                  {attentionTasks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <span className="material-symbols-outlined text-[28px] text-status-success">check_circle</span>
                          <span>Không có nhiệm vụ nào cần chỉ đạo khẩn trong phạm vi này</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    attentionTasks.map((t) => (
                      <tr key={t.id} className="hover:bg-surface-container-low transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="flex flex-col">
                            <span className="font-bold text-primary font-mono">{t.code}</span>
                            <span className="truncate max-w-[220px]" title={t.title}>
                              {t.title}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-slate-700">
                          {t.owner?.fullName || "Cán bộ tác nghiệp"}
                        </td>
                        <td className="py-2.5 px-2 font-semibold">
                          <span className={t.isOverdue ? "text-status-danger" : "text-slate-600"}>
                            {t.currentDeadline
                              ? new Date(t.currentDeadline).toLocaleDateString("vi-VN", {
                                  day: "2-digit",
                                  month: "2-digit",
                                })
                              : "N/A"}
                          </span>
                        </td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                              t.isOverdue
                                ? "bg-status-danger-bg text-status-danger"
                                : t.status === "WAITING_REVIEW"
                                ? "bg-amber-100 text-amber-800"
                                : t.status === "COMPLETED" || t.status === "DONE"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-secondary/15 text-secondary"
                            }`}
                          >
                            {t.isOverdue
                              ? "Quá hạn"
                              : t.status === "WAITING_REVIEW"
                              ? "Chờ duyệt"
                              : t.status === "COMPLETED" || t.status === "DONE"
                              ? "Đã xong"
                              : "Đang làm"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Link
                            href={`/tasks/${t.id}`}
                            className="px-2 py-1 rounded bg-secondary text-on-secondary font-semibold hover:opacity-90 active-press text-xs inline-block"
                          >
                            Chi tiết
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-2 border-t border-surface-container text-xs text-outline flex justify-between">
              <span>Hệ thống tự động kích hoạt cảnh báo trễ hạn trên toàn chi cục.</span>
              <span className="text-secondary font-semibold">Cập nhật PostgreSQL</span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MOBILE VIEW (Pixel-accurate Google Stitch ID e603607363fd424d95c1e47d9bf41a5a)
          ========================================================================= */}
      <div className="lg:hidden flex flex-col w-full pb-16">
        {/* Official Scope Bar */}
        <div className="w-full bg-primary/10 py-1.5 px-margin flex items-center justify-center gap-1.5 border-b border-border-default/40">
          <span className="material-symbols-outlined text-[13px] text-primary">verified</span>
          <span className="font-label-sm text-label-sm text-primary tracking-wider uppercase text-[10px] font-bold">
            BẢNG ĐIỀU HÀNH TỔNG QUAN — HẢI QUAN CỬA KHẨU QUỐC TẾ TÀ LÙNG
          </span>
        </div>

        {/* Command Scope Bar */}
        <section className="px-margin pt-space-sm pb-space-xs flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[18px] text-on-primary-fixed">corporate_fare</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-sm text-label-sm text-on-surface-variant leading-none text-xs">
                  Phạm vi giám sát
                </span>
                <span className="font-body-semibold text-body-semibold text-primary truncate text-sm">
                  {unitFilter === "ALL"
                    ? "HQCK Quốc tế Tà Lùng"
                    : departments.find((d) => d.id === unitFilter)?.name || "HQCK Tà Lùng"}
                </span>
              </div>
            </div>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="bg-surface-container-high px-2 py-1 rounded text-primary text-xs font-semibold focus:outline-none"
            >
              <option value="ALL">Toàn đơn vị</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Period Pill Switcher & Dynamic Dropdown */}
          <div className="flex flex-col gap-1.5">
            <div className="flex p-1 bg-surface-container-highest rounded-lg gap-1">
              <button
                onClick={() => setPeriod("today")}
                className={`flex-1 py-1.5 text-center font-label-md text-label-md rounded transition-fast text-xs ${
                  period === "today"
                    ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                    : "text-on-surface-variant hover:text-primary"
                }`}
              >
                Hôm nay
              </button>
              <button
                onClick={() => setPeriod("week")}
                className={`flex-1 py-1.5 text-center font-label-md text-label-md rounded transition-fast text-xs ${
                  period === "week"
                    ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                    : "text-on-surface-variant hover:text-primary"
                }`}
              >
                {periodLabels.weekShort}
              </button>
              <button
                onClick={() => setPeriod("month")}
                className={`flex-1 py-1.5 text-center font-label-md text-label-md rounded transition-fast text-xs ${
                  period === "month"
                    ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                    : "text-on-surface-variant hover:text-primary"
                }`}
              >
                {periodLabels.monthShort}
              </button>
              <button
                onClick={() => setPeriod("all")}
                className={`flex-1 py-1.5 text-center font-label-md text-label-md rounded transition-fast text-xs ${
                  period === "all"
                    ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                    : "text-on-surface-variant hover:text-primary"
                }`}
              >
                Tất cả
              </button>
            </div>
            {availablePeriods.length > 0 && (
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full bg-surface-container-highest px-2 py-1.5 rounded text-primary text-xs font-semibold focus:outline-none"
              >
                <option value="all">Toàn bộ nhiệm vụ</option>
                <option value="today">Hôm nay</option>
                {availablePeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        {/* 4 KPI Cards (2x2 Grid) */}
        <section className="px-margin pt-space-xs">
          <div className="grid grid-cols-2 gap-space-sm">
            {/* KPI 1 */}
            <div className="bg-surface-container-lowest p-3 rounded-lg shadow-sm flex flex-col justify-between h-[116px] border border-border-default/40">
              <div className="flex items-start justify-between">
                <span className="font-label-sm text-label-sm text-on-surface-variant leading-tight text-xs">
                  Tổng việc giao
                </span>
                <div className="w-6 h-6 rounded bg-primary-fixed flex items-center justify-center">
                  <span className="material-symbols-outlined text-[15px] text-primary">assignment</span>
                </div>
              </div>
              <div>
                <div className="font-headline-xl text-headline-xl text-primary leading-none tracking-tight font-bold">
                  {kpis.totalTasks}
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-status-success text-xs font-semibold">
                  <span className="material-symbols-outlined text-[13px]">verified_user</span>
                  <span>{kpis.assignedRate !== null ? `${kpis.assignedRate}% có chủ trì` : "Chưa có dữ liệu"}</span>
                </div>
              </div>
            </div>

            {/* KPI 2 */}
            <div className="bg-surface-container-lowest p-3 rounded-lg shadow-sm flex flex-col justify-between h-[116px] border border-border-default/40">
              <div className="flex items-start justify-between">
                <span className="font-label-sm text-label-sm text-on-surface-variant leading-tight text-xs">
                  Đã xong &amp; xác nhận
                </span>
                <div className="w-6 h-6 rounded bg-status-success-bg flex items-center justify-center">
                  <span className="material-symbols-outlined text-[15px] text-status-success">check_circle</span>
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="font-headline-xl text-headline-xl text-status-success leading-none font-bold">
                    {kpis.completed}
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant text-xs">việc</span>
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-on-surface-variant text-xs">
                  <span className="material-symbols-outlined text-[13px] text-status-success">trending_up</span>
                  <span>{kpis.completionRate !== null ? `${kpis.completionRate}% hoàn thành` : "Chưa có dữ liệu"}</span>
                </div>
              </div>
            </div>

            {/* KPI 3 */}
            <div className="bg-surface-container-lowest p-3 rounded-lg shadow-sm flex flex-col justify-between h-[116px] border border-border-default/40">
              <div className="flex items-start justify-between">
                <span className="font-label-sm text-label-sm text-on-surface-variant leading-tight text-xs">
                  Chờ lãnh đạo duyệt
                </span>
                <div className="w-6 h-6 rounded bg-status-warning-bg flex items-center justify-center">
                  <span className="material-symbols-outlined text-[15px] text-status-warning">pending_actions</span>
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="font-headline-xl text-headline-xl text-status-warning leading-none font-bold">
                    {String(kpis.waitingReview).padStart(2, "0")}
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant text-xs">việc</span>
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-status-warning text-xs font-semibold">
                  <span className="material-symbols-outlined text-[13px]">alarm</span>
                  <span>{kpis.urgentReviewCount > 0 ? `${kpis.urgentReviewCount} việc gấp` : "Chờ nghiệm thu"}</span>
                </div>
              </div>
            </div>

            {/* KPI 4 */}
            <div className="bg-surface-container-lowest p-3 rounded-lg shadow-sm flex flex-col justify-between h-[116px] border border-status-danger/30">
              <div className="flex items-start justify-between">
                <span className="font-label-sm text-label-sm text-on-surface-variant leading-tight text-xs">
                  Quá hạn / Nghẽn
                </span>
                <div className="w-6 h-6 rounded bg-status-danger-bg flex items-center justify-center">
                  <span className="material-symbols-outlined text-[15px] text-status-danger">error</span>
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="font-headline-xl text-headline-xl text-status-danger leading-none font-bold">
                    {String(kpis.overdue).padStart(2, "0")}
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant text-xs">hồ sơ</span>
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-status-danger text-xs font-semibold">
                  <span className="material-symbols-outlined text-[13px]">report</span>
                  <span>{kpis.overdue > 0 ? "Cần giải trình" : "Đúng tiến độ"}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Action Shortcuts */}
        <section className="px-margin pt-space-md">
          <div className="grid grid-cols-3 gap-2">
            {canAssign && (
              <button
                onClick={() => setShowAssignModal(true)}
                className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-secondary text-on-secondary shadow-sm active:opacity-90 transition-fast active-press"
              >
                <span className="material-symbols-outlined text-[20px] mb-1">add_task</span>
                <span className="font-label-sm text-label-sm text-center leading-tight">Giao việc đột xuất</span>
              </button>
            )}
            {canApprove && (
              <Link
                href="/approvals"
                className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-surface-container-highest text-primary shadow-sm active:opacity-80 transition-fast active-press"
              >
                <div className="relative">
                  <span className="material-symbols-outlined text-[20px] mb-1">rate_review</span>
                  {kpis.waitingReview > 0 && (
                    <span className="absolute -top-1 -right-2 w-3.5 h-3.5 bg-status-warning text-surface-container-lowest font-label-sm text-[9px] flex items-center justify-center rounded-full leading-none font-bold">
                      {kpis.waitingReview}
                    </span>
                  )}
                </div>
                <span className="font-label-sm text-label-sm text-center leading-tight">Duyệt nhanh</span>
              </Link>
            )}
            <Link
              href="/reports"
              className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-surface-container-highest text-primary shadow-sm active:opacity-80 transition-fast active-press"
            >
              <span className="material-symbols-outlined text-[20px] mb-1">query_stats</span>
              <span className="font-label-sm text-label-sm text-center leading-tight">Báo cáo tuần</span>
            </Link>
          </div>
        </section>

        {/* High-Priority Alerts & Urgent Directive (Real Database Alerts) */}
        <section className="px-margin pt-space-lg">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-status-danger text-[20px]">notifications_active</span>
              <h2 className="font-headline-sm text-headline-sm text-primary">Cảnh Báo Nóng &amp; Chỉ Đạo</h2>
            </div>
            <span className="bg-status-danger-bg text-status-danger font-label-sm text-label-sm px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-status-danger" />
              {hotAlerts.length} Nhiệm vụ
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {hotAlerts.length === 0 ? (
              <div className="bg-surface-container-lowest rounded-lg p-4 text-center text-xs text-on-surface-variant border border-border-default/40">
                <span className="material-symbols-outlined text-status-success text-[24px] block mb-1">check_circle</span>
                Hiện không có cảnh báo nóng vi phạm hoặc quá hạn trong ca trực
              </div>
            ) : (
              hotAlerts.slice(0, 3).map((alert) => (
                <div
                  key={alert.id}
                  className={`bg-surface-container-lowest rounded-lg p-3 shadow-sm border-l-4 ${
                    alert.severity === "DANGER" ? "border-status-danger" : "border-status-warning"
                  } flex flex-col gap-2.5`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className={`font-label-sm text-[11px] px-1.5 py-0.5 rounded font-bold ${
                            alert.severity === "DANGER"
                              ? "bg-status-danger-bg text-status-danger"
                              : "bg-status-warning-bg text-status-warning"
                          }`}
                        >
                          {alert.type}
                        </span>
                        <span className="font-label-sm text-[11px] text-on-surface-variant font-mono">
                          {alert.code}
                        </span>
                      </div>
                      <p className="font-body-semibold text-body-semibold text-primary line-clamp-1">
                        {alert.title}
                      </p>
                      <p className="font-body-md text-xs text-status-danger mt-0.5 flex items-center gap-1 font-medium">
                        <span className="material-symbols-outlined text-[14px]">schedule</span>
                        {alert.message}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-surface-subtle">
                    <span className="font-label-sm text-[11px] text-on-surface-variant">
                      Chủ trì: {alert.ownerName} ({alert.unitName})
                    </span>
                    <Link
                      href={`/tasks/${alert.id}`}
                      className="bg-status-danger text-surface-container-lowest font-label-sm text-xs px-3 py-1.5 rounded flex items-center gap-1 active:opacity-90 font-semibold"
                    >
                      <span className="material-symbols-outlined text-[15px]">send</span>
                      <span>Chỉ đạo xử lý</span>
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Divisional Performance Breakdown (Real Metrics) */}
        <section className="px-margin pt-space-lg">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-secondary text-[20px]">domain_verification</span>
              <h2 className="font-headline-sm text-headline-sm text-primary">Tiến Độ Theo Các Bộ Phận</h2>
            </div>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              Tổng: {kpis.totalTasks} việc
            </span>
          </div>

          <div className="bg-surface-container-lowest rounded-lg p-3 shadow-sm flex flex-col gap-4 border border-border-default/40">
            {loading ? (
              <div className="text-xs text-slate-400 py-3 text-center">Đang tải tiến độ các bộ phận...</div>
            ) : departments.length === 0 ? (
              <div className="text-xs text-slate-400 py-3 text-center">Chưa có dữ liệu bộ phận</div>
            ) : (
              departments.map((dept) => {
                const hasData = dept.taskCount > 0 && dept.completionRate !== null;
                const pct = dept.completionRate ?? 0;
                const isGood = hasData && pct >= 70;
                return (
                  <div key={dept.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            !hasData ? "bg-outline" : isGood ? "bg-status-success" : "bg-status-warning"
                          }`}
                        />
                        <span
                          className="font-body-semibold text-body-semibold text-primary text-xs truncate"
                          title={dept.name}
                        >
                          {dept.name}
                        </span>
                      </div>
                      <span
                        className={`font-label-sm text-label-sm text-xs shrink-0 ${
                          !hasData ? "text-outline" : isGood ? "text-primary font-bold" : "text-status-warning font-bold"
                        }`}
                      >
                        {hasData ? <strong>{pct}%</strong> : "Chưa có dữ liệu"} ({dept.completedTasks}/{dept.taskCount} việc)
                      </span>
                    </div>
                    <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                      {hasData ? (
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isGood ? "bg-status-success" : "bg-status-warning"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      ) : (
                        <div className="h-full bg-surface-container-high w-full" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* QUICK ASSIGN TASK MODAL */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-lg bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-default transition-panel">
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary-fixed text-[22px]">add_task</span>
                <h3 className="font-headline-sm text-headline-sm text-white">
                  Giao Nhiệm Vụ Đột Xuất (Trực Ban Lãnh Đạo)
                </h3>
              </div>
              <button
                onClick={() => setShowAssignModal(false)}
                className="text-on-primary-container hover:text-white"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleQuickAssign}>
              <div className="p-space-md flex flex-col gap-space-md max-h-[70vh] overflow-y-auto">
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Nội dung nhiệm vụ chỉ đạo *
                  </label>
                  <input
                    type="text"
                    required
                    value={assignTitle}
                    onChange={(e) => setAssignTitle(e.target.value)}
                    placeholder="Nhập nội dung nhiệm vụ chỉ đạo..."
                    className="h-10 px-3 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-space-sm">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-primary font-semibold">
                      Đơn vị tiếp nhận
                    </label>
                    <select
                      value={assignUnit}
                      onChange={(e) => setAssignUnit(e.target.value)}
                      className="h-10 px-2 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary text-xs"
                    >
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-primary font-semibold">
                      Mức ưu tiên
                    </label>
                    <select
                      value={assignPriority}
                      onChange={(e) => setAssignPriority(e.target.value)}
                      className="h-10 px-2 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    >
                      <option value="Khẩn">Khẩn cấp</option>
                      <option value="Cao">Cao</option>
                      <option value="Trung bình">Trung bình</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Cán bộ chủ trì
                  </label>
                  <select
                    value={assignOwner}
                    onChange={(e) => setAssignOwner(e.target.value)}
                    className="h-10 px-2 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary text-xs"
                  >
                    {assignPeople.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <CollaboratorPicker
                  people={assignPeople}
                  value={assignCollabs}
                  onChange={setAssignCollabs}
                  excludeId={assignOwner}
                  disabled={isAssigning}
                />

                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Hạn chót hoàn thành
                  </label>
                  <input
                    type="datetime-local"
                    value={assignDeadline}
                    onChange={(e) => setAssignDeadline(e.target.value)}
                    className="h-10 px-3 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Ảnh / Văn bản kèm theo {assignFiles.length > 0 && `(${assignFiles.length} tệp)`}
                  </label>
                  <input
                    type="file"
                    multiple
                    accept=".png,.jpg,.jpeg,.pdf,.doc,.docx,.xls,.xlsx"
                    disabled={isAssigning}
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      const valid = files.filter((f) => {
                        if (f.size > 10 * 1024 * 1024) {
                          toast.error(`Tệp ${f.name} quá 10MB — bỏ qua`);
                          return false;
                        }
                        return true;
                      }).slice(0, 5);
                      setAssignFiles(valid);
                    }}
                    className="text-body-md font-body-md text-on-surface file:mr-2 file:px-3 file:py-1.5 file:rounded file:bg-surface-container file:text-primary file:text-xs file:font-semibold file:border file:border-border-subtle"
                  />
                  <p className="text-[11px] text-on-surface-variant">Tối đa 5 tệp, mỗi tệp ≤ 10MB.</p>
                </div>
              </div>

              <div className="p-space-md bg-surface-subtle flex items-center justify-end gap-space-sm border-t border-border-default">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 rounded bg-surface-container-lowest text-on-surface font-label-md text-label-md hover:bg-surface-container border border-border-subtle transition-fast active-press"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isAssigning}
                  className="px-4 py-2 rounded bg-secondary text-on-secondary font-label-md text-label-md font-semibold hover:opacity-90 shadow-sm transition-fast active-press disabled:opacity-50"
                >
                  {isAssigning ? "Đang chuyển..." : "Chuyển ý kiến chỉ đạo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
