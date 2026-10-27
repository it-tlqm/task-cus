"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/Toast";
import { getCurrentPeriodLabels } from "@/lib/period-helper";
import { usePermissions } from "@/hooks/usePermissions";
import { TaxSummarySection } from "@/components/dashboard/TaxSummarySection";
import DashboardActionCenter from "@/components/dashboard/DashboardActionCenter";

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
  const [availablePeriods, setAvailablePeriods] = useState<ReportingPeriodItem[]>([]);
  const [selectedPeriodInfo, setSelectedPeriodInfo] = useState<SelectedPeriodInfo | null>(null);
  const [period, setPeriod] = useState<string>("week");
  const [unitFilter, setUnitFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAdminBlocked, setIsAdminBlocked] = useState(false);
  const periodLabels = React.useMemo(() => getCurrentPeriodLabels(), []);
  // Kỳ nhanh (today/week/month/all) không phải bản ghi CSDL — select chỉ giữ
  // giá trị khi period thực sự là một ReportingPeriod.id, tránh value trỏ option không tồn tại.
  const selectedDbPeriodValue = availablePeriods.some((p) => p.id === period) ? period : "";
  const { canAssign, canExport, canApprove } = usePermissions();

  // AI tóm tắt giao ban (tự ẩn khi máy chủ chưa cấu hình key)
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [aiSummarizing, setAiSummarizing] = useState(false);

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
      }

      if (Array.isArray(data.attentionTasks)) {
        setAttentionTasks(data.attentionTasks);
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

  return (
    <div className="w-full min-h-screen bg-transparent pb-12">
      <DashboardActionCenter
        waitingReview={kpis.waitingReview}
        urgentReview={kpis.urgentReviewCount}
        overdue={kpis.overdue}
        attention={attentionTasks.length}
        canApprove={canApprove}
      />

      {/* =========================================================================
          DESKTOP VIEW (Pixel-accurate Google Stitch ID 089086aec3864b019c5af41b1319cf82)
          ========================================================================= */}
      <div className="hidden lg:flex flex-col w-full p-space-lg gap-space-lg">
        {/* TOP BAR: EXECUTIVE FILTER & SYSTEM CONTEXT */}
        <div className="flex flex-col gap-space-md bg-v5-surface p-space-lg rounded-xl shadow-sm border border-v5-line/50">
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
                <p className="font-body-md text-body-md text-v5-muted flex items-center gap-2">
                  <span>Hải quan cửa khẩu Quốc tế Tà Lùng</span>
                  <span className="text-v5-muted-variant">•</span>
                  <span className="font-mono text-label-sm text-v5-muted">
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
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-v5-bg hover:bg-v5-bg text-primary font-body-semibold text-body-semibold transition-fast shadow-sm active-press disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                  <span>{aiSummarizing ? "Đang tóm tắt..." : "Tóm tắt AI"}</span>
                </button>
              )}
              <Link
                href="/dashboard/v4"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-secondary/10 hover:bg-secondary/15 text-secondary font-body-semibold text-body-semibold transition-fast shadow-sm active-press border border-secondary/20"
              >
                <span className="material-symbols-outlined text-[18px]">insights</span>
                <span>Bản cũ</span>
              </Link>
              <Link
                href="/v5"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-on-primary font-body-semibold text-body-semibold transition-fast shadow-sm active-press hover:opacity-90"
              >
                <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                <span>Bảng điều hành mới</span>
              </Link>
              {canExport && (
                <Link
                  href="/reports/excel"
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-v5-bg hover:bg-v5-bg text-primary font-body-semibold text-body-semibold transition-fast shadow-sm active-press"
                >
                  <span className="material-symbols-outlined text-[18px]">table_view</span>
                  <span>Xuất báo cáo giao ban (.xlsx)</span>
                </Link>
              )}
              {canAssign && (
                <Link
                  href="/tasks?new=1"
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-secondary hover:bg-secondary/90 text-on-secondary font-body-semibold text-body-semibold transition-fast shadow-sm active-press"
                >
                  <span className="material-symbols-outlined text-[18px]">add_task</span>
                  <span>Giao nhiệm vụ đột xuất</span>
                </Link>
              )}
              <button
                onClick={fetchDashboardData}
                disabled={loading}
                className="p-2 rounded-lg bg-v5-bg hover:bg-v5-bg text-v5-muted transition-fast active-press disabled:opacity-50"
                title="Làm mới dữ liệu"
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
                <button onClick={() => setAiSummary("")} className="text-v5-muted hover:text-primary text-xs font-semibold">
                  Ẩn
                </button>
              </div>
              <p className="font-body-md text-body-md text-v5-ink leading-relaxed whitespace-pre-line">{aiSummary}</p>
            </div>
          )}

          {/* Filter Strip */}
          <div className="flex flex-col gap-space-md pt-space-sm bg-v5-bg/60 p-space-md rounded-lg xl:flex-row xl:items-center xl:justify-between">
            {/* Period Selector Segmented & Dynamic Dropdown */}
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center xl:w-auto">
              <div className="grid w-full grid-cols-4 gap-1 bg-v5-surface p-1 rounded-lg shadow-sm border border-v5-line/40 sm:min-w-[440px] sm:max-w-[540px]">
                <button
                  onClick={() => setPeriod("today")}
                  aria-pressed={period === "today"}
                  className={`min-w-0 whitespace-nowrap px-2 py-1.5 rounded-lg text-center text-label-md font-label-md leading-tight transition-fast ${
                    period === "today"
                      ? "bg-primary text-on-primary shadow-sm font-semibold"
                      : "text-v5-muted hover:text-primary"
                  }`}
                >
                  Hôm nay
                </button>
                <button
                  onClick={() => setPeriod("week")}
                  aria-pressed={period === "week"}
                  className={`min-w-0 whitespace-nowrap px-2 py-1.5 rounded-lg text-center text-label-md font-label-md leading-tight transition-fast ${
                    period === "week"
                      ? "bg-primary text-on-primary shadow-sm font-semibold"
                      : "text-v5-muted hover:text-primary"
                  }`}
                >
                  {periodLabels.weekShort}
                </button>
                <button
                  onClick={() => setPeriod("month")}
                  aria-pressed={period === "month"}
                  className={`min-w-0 whitespace-nowrap px-2 py-1.5 rounded-lg text-center text-label-md font-label-md leading-tight transition-fast ${
                    period === "month"
                      ? "bg-primary text-on-primary shadow-sm font-semibold"
                      : "text-v5-muted hover:text-primary"
                  }`}
                >
                  {periodLabels.monthShort}
                </button>
                <button
                  onClick={() => setPeriod("all")}
                  aria-pressed={period === "all"}
                  className={`min-w-0 whitespace-nowrap px-2 py-1.5 rounded-lg text-center text-label-md font-label-md leading-tight transition-fast ${
                    period === "all"
                      ? "bg-primary text-on-primary shadow-sm font-semibold"
                      : "text-v5-muted hover:text-primary"
                  }`}
                >
                  Toàn bộ kỳ
                </button>
              </div>

              {availablePeriods.length > 0 && (
                <div className="relative">
                  <select
                    value={selectedDbPeriodValue}
                    onChange={(e) => {
                      if (e.target.value) setPeriod(e.target.value);
                    }}
                    aria-label="Chọn kỳ báo cáo từ CSDL"
                    data-testid="dashboard-period-select-desktop"
                    className="h-9 px-3 pr-8 rounded-lg bg-v5-surface font-body-semibold text-body-semibold text-primary border border-v5-line focus:outline-none cursor-pointer shadow-sm text-xs"
                    title="Chọn kỳ báo cáo"
                  >
                    <option value="" disabled>
                      Kỳ khác…
                    </option>
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
              <div className="flex items-center gap-2 bg-v5-surface px-3 py-1.5 rounded-lg shadow-sm border border-v5-line">
                <span className="material-symbols-outlined text-v5-muted text-[18px]">date_range</span>
                <span className="font-body-semibold text-body-semibold text-v5-ink text-[13px]">
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
                  className="w-full h-9 pl-3 pr-8 rounded-lg bg-v5-surface font-body-semibold text-body-semibold text-v5-ink border border-v5-line focus:outline-none cursor-pointer shadow-sm text-xs"
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
          <div className="p-6 rounded-xl bg-v5-surface border border-v5-line flex flex-col items-center text-center gap-2">
            <span className="material-symbols-outlined text-[32px] text-secondary">admin_panel_settings</span>
            <p className="font-semibold text-v5-ink">Tài khoản Quản trị hệ thống không xem số liệu điều hành</p>
            <p className="text-sm text-v5-muted max-w-xl">
              Theo phân quyền, tài khoản kỹ thuật chỉ quản trị cơ cấu, tài khoản và cấu hình — không đọc số liệu
              nghiệp vụ. Để theo dõi điều hành, đăng nhập bằng tài khoản Trưởng hải quan cửa khẩu, Trưởng bộ phận
              hoặc Công chức.
            </p>
          </div>
        )}

        {/* Số liệu giao ban (YC-17/YC-19 → YC-29) — trên desktop đặt cùng vị trí như mobile:
            ngay dưới khu lọc, phía trên các thẻ KPI. (Bổ sung 19/10/2026: trước đây khối này
            chỉ nằm trong bố cục mobile nên màn hình máy tính không nhìn thấy.) */}
        <TaxSummarySection className="" />

        {/* KPI SUMMARY: 6 STANDARDIZED EXECUTIVE CARDS WITH REAL METRICS */}
        <div data-tour="kpi-cards" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-space-md">
          {/* Card 1: Total Tasks */}
          <div className="bg-v5-surface p-space-md rounded-xl shadow-sm flex flex-col justify-between hover-lift border border-v5-line/50">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-v5-muted font-medium">
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
            <div className="flex items-center justify-between pt-2 bg-v5-bg/50 px-2 py-1 rounded">
              <span className="text-[11px] font-label-sm text-status-success flex items-center gap-0.5 font-semibold">
                <span className="material-symbols-outlined text-[13px]">trending_up</span>{" "}
                {kpis.newTasksCount > 0 ? `+${kpis.newTasksCount} việc mới` : "0 việc mới"}
              </span>
              <span className="text-[11px] font-label-sm text-v5-muted font-medium">
                {kpis.assignedRate !== null ? `${kpis.assignedRate}% có chủ trì` : "Chưa có dữ liệu"}
              </span>
            </div>
          </div>

          {/* Card 2: In Progress */}
          <div className="bg-v5-surface p-space-md rounded-xl shadow-sm flex flex-col justify-between hover-lift border border-v5-line/50">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-v5-muted font-medium">
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
            <div className="flex items-center justify-between pt-2 bg-v5-bg/50 px-2 py-1 rounded">
              <span className="text-[11px] font-label-sm text-status-unassigned font-semibold">
                {kpis.averageProgress !== null ? `Tiến độ TB ${kpis.averageProgress}%` : "Chưa có tiến độ"}
              </span>
              <span className="text-[11px] font-label-sm text-v5-muted">
                {kpis.inProgress > 0 ? "Đang xử lý" : "Không có việc"}
              </span>
            </div>
          </div>

          {/* Card 3: Completed */}
          <div className="bg-v5-surface p-space-md rounded-xl shadow-sm flex flex-col justify-between hover-lift border border-v5-line/50">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-v5-muted font-medium">
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
              <span className="text-[11px] font-label-sm text-v5-muted">
                {kpis.onTimeRate !== null ? `${kpis.onTimeRate}% đúng hạn` : "Chưa đủ dữ liệu"}
              </span>
            </div>
          </div>

          {/* Card 4: Overdue */}
          <div className="bg-v5-surface p-space-md rounded-xl shadow-sm flex flex-col justify-between hover-lift border border-status-danger/30">
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
          <div className="bg-v5-surface p-space-md rounded-xl shadow-sm flex flex-col justify-between hover-lift border border-status-warning/30">
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
              <span className="text-[11px] font-label-sm text-v5-muted">
                {kpis.hasIssue > 0 ? "Cần hỗ trợ" : "Bình thường"}
              </span>
            </div>
          </div>

          {/* Card 6: Waiting Review */}
          <div className="bg-v5-surface p-space-md rounded-xl shadow-sm flex flex-col justify-between hover-lift border border-v5-line/50">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-v5-muted font-medium">
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
              <span className="text-[11px] font-label-sm text-v5-muted">
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
          <div className="bg-v5-surface rounded-xl p-space-md shadow-sm border border-v5-line/50 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-space-sm border-b border-surface-container">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">donut_large</span>
                <h3 className="font-headline-sm text-headline-sm text-primary">Tiến Độ Theo Bộ Phận</h3>
              </div>
              <span className="font-label-sm text-label-sm text-v5-muted">
                {period === "week" ? periodLabels.weekShort : "Toàn bộ"}
              </span>
            </div>

            <div className="flex flex-col gap-4 my-space-md">
              {loading ? (
                <div className="text-xs text-v5-muted py-4 text-center">Đang tải tiến độ các bộ phận...</div>
              ) : departments.length === 0 ? (
                <div className="text-xs text-v5-muted py-4 text-center">Chưa có dữ liệu bộ phận</div>
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
                        <span className={!hasData ? "text-v5-muted font-normal" : isGood ? "text-secondary font-bold" : "text-status-warning font-bold"}>
                          {hasData ? `${pct}%` : "Chưa có dữ liệu"} ({dept.completedTasks}/{dept.taskCount} việc • {dept.staffCount} CC)
                        </span>
                      </div>
                      <div className="w-full bg-v5-bg h-2 rounded-full overflow-hidden">
                        {hasData ? (
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isGood ? "bg-secondary" : "bg-status-warning"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        ) : (
                          <div className="h-full bg-v5-bg-high w-full" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-surface-container text-xs text-v5-muted flex justify-between">
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
          <div className="lg:col-span-2 bg-v5-surface rounded-xl p-space-md shadow-sm border border-v5-line/50 flex flex-col justify-between">
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
                  <tr className="bg-v5-bg text-primary border-b border-v5-line font-semibold">
                    <th className="py-2.5 px-3">MÃ &amp; TÊN VIỆC</th>
                    <th className="py-2.5 px-2">CHỦ TRÌ</th>
                    <th className="py-2.5 px-2">HẠN ĐỊNH</th>
                    <th className="py-2.5 px-2">TRẠNG THÁI</th>
                    <th className="py-2.5 px-3 text-right">CHỈ ĐẠO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container text-v5-ink">
                  {attentionTasks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-v5-muted">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <span className="material-symbols-outlined text-[28px] text-status-success">check_circle</span>
                          <span>Không có nhiệm vụ nào cần chỉ đạo khẩn trong phạm vi này</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    attentionTasks.map((t) => (
                      <tr key={t.id} className="hover:bg-v5-bg transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="flex flex-col">
                            <span className="font-bold text-primary font-mono">{t.code}</span>
                            <span className="truncate max-w-[220px]" title={t.title}>
                              {t.title}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-v5-ink">
                          {t.owner?.fullName || "Cán bộ tác nghiệp"}
                        </td>
                        <td className="py-2.5 px-2 font-semibold">
                          <span className={t.isOverdue ? "text-status-danger" : "text-v5-muted"}>
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
                                ? "bg-v5-gold-soft text-v5-gold-ink"
                                : t.status === "COMPLETED" || t.status === "DONE"
                                ? "bg-v5-success-soft text-v5-success"
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

            <div className="pt-2 border-t border-surface-container text-xs text-v5-muted flex justify-between">
              <span>Hệ thống tự động kích hoạt cảnh báo trễ hạn trên toàn chi cục.</span>
              <span className="text-secondary font-semibold">Đã cập nhật</span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MOBILE VIEW (Pixel-accurate Google Stitch ID e603607363fd424d95c1e47d9bf41a5a)
          ========================================================================= */}
      <div className="lg:hidden flex flex-col w-full pb-16">
        {/* Official Scope Bar */}
        <div className="w-full bg-primary/10 py-1.5 px-margin flex items-center justify-center gap-1.5 border-b border-v5-line/40">
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
                <span className="font-label-sm text-label-sm text-v5-muted leading-none text-xs whitespace-nowrap">
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
              className="bg-v5-bg-high px-2 py-1 rounded text-primary text-xs font-semibold focus:outline-none max-w-[46%] truncate shrink-0"
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
            <div className="grid w-full grid-cols-4 p-1 bg-v5-bg-highest rounded-lg gap-1">
              <button
                onClick={() => setPeriod("today")}
                className={`min-w-0 px-1 py-1.5 text-center font-label-md text-label-md leading-tight rounded transition-fast text-[11px] ${
                  period === "today"
                    ? "bg-v5-surface text-primary shadow-sm font-semibold"
                    : "text-v5-muted hover:text-primary"
                }`}
              >
                Hôm nay
              </button>
              <button
                onClick={() => setPeriod("week")}
                className={`min-w-0 px-1 py-1.5 text-center font-label-md text-label-md leading-tight rounded transition-fast text-[11px] ${
                  period === "week"
                    ? "bg-v5-surface text-primary shadow-sm font-semibold"
                    : "text-v5-muted hover:text-primary"
                }`}
              >
                {periodLabels.weekShort}
              </button>
              <button
                onClick={() => setPeriod("month")}
                className={`min-w-0 px-1 py-1.5 text-center font-label-md text-label-md leading-tight rounded transition-fast text-[11px] ${
                  period === "month"
                    ? "bg-v5-surface text-primary shadow-sm font-semibold"
                    : "text-v5-muted hover:text-primary"
                }`}
              >
                {periodLabels.monthShort}
              </button>
              <button
                onClick={() => setPeriod("all")}
                className={`min-w-0 px-1 py-1.5 text-center font-label-md text-label-md leading-tight rounded transition-fast text-[11px] ${
                  period === "all"
                    ? "bg-v5-surface text-primary shadow-sm font-semibold"
                    : "text-v5-muted hover:text-primary"
                }`}
              >
                Tất cả
              </button>
            </div>
            {availablePeriods.length > 0 && (
              <select
                value={selectedDbPeriodValue}
                onChange={(e) => {
                  if (e.target.value) setPeriod(e.target.value);
                }}
                aria-label="Chọn kỳ báo cáo từ CSDL"
                data-testid="dashboard-period-select-mobile"
                className="w-full bg-v5-bg-highest px-2 py-1.5 rounded text-primary text-xs font-semibold focus:outline-none"
              >
                <option value="" disabled>
                  Kỳ khác…
                </option>
                {availablePeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        {/* Số liệu giao ban (YC-17/YG-19) — tự ẩn khi chưa bật chỉ tiêu */}
        <TaxSummarySection />

        {/* 6 KPI Cards (2x3 Grid) — đồng bộ đủ bộ chỉ số với bản desktop */}
        <section className="px-margin pt-space-xs">
          <div className="grid grid-cols-2 gap-space-sm">
            {/* KPI 1 */}
            <div className="bg-v5-surface p-3 rounded-lg shadow-sm flex flex-col justify-between h-[116px] border border-v5-line/40">
              <div className="flex items-start justify-between">
                <span className="font-label-sm text-label-sm text-v5-muted leading-tight text-xs">
                  Tổng việc giao kỳ
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

            {/* KPI 2: Đang triển khai */}
            <div className="bg-v5-surface p-3 rounded-lg shadow-sm flex flex-col justify-between h-[116px] border border-v5-line/40">
              <div className="flex items-start justify-between">
                <span className="font-label-sm text-label-sm text-v5-muted leading-tight text-xs">
                  Đang triển khai
                </span>
                <div className="w-6 h-6 rounded bg-status-unassigned-bg flex items-center justify-center">
                  <span className="material-symbols-outlined text-[15px] text-status-unassigned">timelapse</span>
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="font-headline-xl text-headline-xl text-primary leading-none font-bold">
                    {kpis.inProgress}
                  </span>
                  <span className="font-label-sm text-label-sm text-v5-muted text-xs">việc</span>
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-status-unassigned text-xs font-semibold">
                  <span className="material-symbols-outlined text-[13px]">trending_up</span>
                  <span>{kpis.averageProgress !== null ? `Tiến độ TB ${kpis.averageProgress}%` : "Chưa có tiến độ"}</span>
                </div>
              </div>
            </div>

            {/* KPI 3: Đã xong & Nghiệm thu */}
            <div className="bg-v5-surface p-3 rounded-lg shadow-sm flex flex-col justify-between h-[116px] border border-v5-line/40">
              <div className="flex items-start justify-between">
                <span className="font-label-sm text-label-sm text-v5-muted leading-tight text-xs">
                  Đã xong &amp; Nghiệm thu
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
                  <span className="font-label-sm text-label-sm text-v5-muted text-xs">việc</span>
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-v5-muted text-xs">
                  <span className="material-symbols-outlined text-[13px] text-status-success">trending_up</span>
                  <span>{kpis.completionRate !== null ? `${kpis.completionRate}% hoàn thành` : "Chưa có dữ liệu"}</span>
                </div>
              </div>
            </div>

            {/* KPI 4: Quá hạn / Xử lý khẩn */}
            <div className="bg-v5-surface p-3 rounded-lg shadow-sm flex flex-col justify-between h-[116px] border border-status-danger/30">
              <div className="flex items-start justify-between">
                <span className="font-label-sm text-label-sm text-v5-muted leading-tight text-xs">
                  Quá hạn / Xử lý khẩn
                </span>
                <div className="w-6 h-6 rounded bg-status-danger-bg flex items-center justify-center">
                  <span className="material-symbols-outlined text-[15px] text-status-danger">error</span>
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="font-headline-xl text-headline-xl text-status-danger leading-none font-bold">
                    {kpis.overdue}
                  </span>
                  <span className="font-label-sm text-label-sm text-v5-muted text-xs">việc</span>
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-status-danger text-xs font-semibold">
                  <span className="material-symbols-outlined text-[13px]">report</span>
                  <span>{kpis.overdue > 0 ? "Cần giải trình" : "Đúng tiến độ"}</span>
                </div>
              </div>
            </div>

            {/* KPI 5: Hồ sơ vướng mắc */}
            <div className="bg-v5-surface p-3 rounded-lg shadow-sm flex flex-col justify-between h-[116px] border border-v5-line/40">
              <div className="flex items-start justify-between">
                <span className="font-label-sm text-label-sm text-v5-muted leading-tight text-xs">
                  Hồ sơ vướng mắc
                </span>
                <div className="w-6 h-6 rounded bg-status-warning-bg flex items-center justify-center">
                  <span className="material-symbols-outlined text-[15px] text-status-warning">report_problem</span>
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="font-headline-xl text-headline-xl text-status-warning leading-none font-bold">
                    {kpis.hasIssue}
                  </span>
                  <span className="font-label-sm text-label-sm text-v5-muted text-xs">hồ sơ</span>
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-v5-muted text-xs">
                  <span className="material-symbols-outlined text-[13px] text-status-warning">info</span>
                  <span>{kpis.hasIssue > 0 ? "Cần hỗ trợ" : "Thông suốt"}</span>
                </div>
              </div>
            </div>

            {/* KPI 6: Chờ Lãnh đạo duyệt */}
            <div className="bg-v5-surface p-3 rounded-lg shadow-sm flex flex-col justify-between h-[116px] border border-v5-line/40">
              <div className="flex items-start justify-between">
                <span className="font-label-sm text-label-sm text-v5-muted leading-tight text-xs">
                  Chờ Lãnh đạo duyệt
                </span>
                <div className="w-6 h-6 rounded bg-status-warning-bg flex items-center justify-center">
                  <span className="material-symbols-outlined text-[15px] text-status-warning">pending_actions</span>
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="font-headline-xl text-headline-xl text-status-warning leading-none font-bold">
                    {kpis.waitingReview}
                  </span>
                  <span className="font-label-sm text-label-sm text-v5-muted text-xs">việc</span>
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-status-warning text-xs font-semibold">
                  <span className="material-symbols-outlined text-[13px]">alarm</span>
                  <span>{kpis.urgentReviewCount > 0 ? `${kpis.urgentReviewCount} việc gấp` : "Chờ nghiệm thu"}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Action Shortcuts */}
        <section className="px-margin pt-space-md">
          <div className="grid grid-cols-3 gap-2">
            {canAssign && (
              <Link
                href="/tasks?new=1"
                className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-secondary text-on-secondary shadow-sm active:opacity-90 transition-fast active-press"
              >
                <span className="material-symbols-outlined text-[20px] mb-1">add_task</span>
                <span className="font-label-sm text-label-sm text-center leading-tight">Giao việc đột xuất</span>
              </Link>
            )}
            {canApprove && (
              <Link
                href="/approvals"
                className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-v5-bg-highest text-primary shadow-sm active:opacity-80 transition-fast active-press"
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
              className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-v5-bg-highest text-primary shadow-sm active:opacity-80 transition-fast active-press"
            >
              <span className="material-symbols-outlined text-[20px] mb-1">query_stats</span>
              <span className="font-label-sm text-label-sm text-center leading-tight">Báo cáo tuần</span>
            </Link>
          </div>
        </section>

        {/* Nhiệm vụ cần lãnh đạo chỉ đạo — dùng CHUNG nguồn attentionTasks với bản desktop
            (trước đây mobile lọc bằng hotAlerts với tiêu chí chặt hơn nên báo 0 việc,
            trong khi desktop vẫn có việc cần chỉ đạo → lệch số liệu giữa 2 bản). */}
        <section className="px-margin pt-space-lg">
          <div className="flex items-center justify-between mb-2.5 gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="material-symbols-outlined text-status-danger text-[20px] shrink-0">warning</span>
              <h2 className="font-headline-sm text-headline-sm text-primary leading-tight">Nhiệm Vụ Cần Lãnh Đạo Chỉ Đạo Khẩn</h2>
            </div>
            <span className="bg-status-danger-bg text-status-danger font-label-sm text-label-sm px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-status-danger" />
              {attentionTasks.length} việc
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {attentionTasks.length === 0 ? (
              <div className="bg-v5-surface rounded-lg p-4 text-center text-xs text-v5-muted border border-v5-line/40">
                <span className="material-symbols-outlined text-status-success text-[24px] block mb-1">check_circle</span>
                Không có nhiệm vụ nào cần chỉ đạo khẩn trong phạm vi này
              </div>
            ) : (
              attentionTasks.slice(0, 3).map((task) => {
                const isDanger = task.isOverdue || task.hasIssue;
                const typeLabel = task.isOverdue
                  ? "Quá hạn xử lý"
                  : task.hasIssue
                    ? "Vướng mắc nghiệp vụ"
                    : task.status === "WAITING_REVIEW"
                      ? "Chờ lãnh đạo duyệt"
                      : task.priority === "Khẩn"
                        ? "Nhiệm vụ khẩn cấp"
                        : "Ưu tiên cao";
                const deadlineLabel = task.currentDeadline
                  ? new Date(task.currentDeadline).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                  : "Chưa đặt hạn";
                return (
                  <div
                    key={task.id}
                    className={`bg-v5-surface rounded-lg p-3 shadow-sm border-l-4 ${
                      task.isOverdue ? "border-status-danger" : isDanger ? "border-status-warning" : "border-secondary"
                    } flex flex-col gap-2.5`}
                  >
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className={`font-label-sm text-[11px] px-1.5 py-0.5 rounded font-bold ${
                            task.isOverdue
                              ? "bg-status-danger-bg text-status-danger"
                              : isDanger
                                ? "bg-status-warning-bg text-status-warning"
                                : "bg-secondary/15 text-secondary"
                          }`}
                        >
                          {typeLabel}
                        </span>
                        <span className="font-label-sm text-[11px] text-v5-muted font-mono">
                          {task.code}
                        </span>
                      </div>
                      <p className="font-body-semibold text-body-semibold text-primary line-clamp-2">
                        {task.title}
                      </p>
                      <p className="font-body-md text-xs text-v5-muted mt-0.5 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">schedule</span>
                        Hạn: {deadlineLabel}
                        {task.hasIssue && task.issueNotes ? ` · ${task.issueNotes}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-surface-subtle">
                      <span className="font-label-sm text-[11px] text-v5-muted truncate min-w-0">
                        Chủ trì: {task.owner?.fullName || "Chưa phân công"}
                        {task.unit ? ` (${task.unit.name})` : ""}
                      </span>
                      <Link
                        href={`/tasks/${task.id}`}
                        className="bg-status-danger text-surface-container-lowest font-label-sm text-xs px-3 py-1.5 rounded flex items-center gap-1 active:opacity-90 font-semibold shrink-0"
                      >
                        <span className="material-symbols-outlined text-[15px]">send</span>
                        <span>Chỉ đạo</span>
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Divisional Performance Breakdown (Real Metrics) */}
        <section className="px-margin pt-space-lg">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-secondary text-[20px]">domain_verification</span>
              <h2 className="font-headline-sm text-headline-sm text-primary">Tiến Độ Theo Bộ Phận</h2>
            </div>
            <span className="font-label-sm text-label-sm text-v5-muted">
              Tổng: {kpis.totalTasks} việc
            </span>
          </div>

          <div className="bg-v5-surface rounded-lg p-3 shadow-sm flex flex-col gap-4 border border-v5-line/40">
            {loading ? (
              <div className="text-xs text-v5-muted py-3 text-center">Đang tải tiến độ các bộ phận...</div>
            ) : departments.length === 0 ? (
              <div className="text-xs text-v5-muted py-3 text-center">Chưa có dữ liệu bộ phận</div>
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
                          !hasData ? "text-v5-muted" : isGood ? "text-primary font-bold" : "text-status-warning font-bold"
                        }`}
                      >
                        {hasData ? <strong>{pct}%</strong> : "Chưa có dữ liệu"} ({dept.completedTasks}/{dept.taskCount} việc)
                      </span>
                    </div>
                    <div className="w-full bg-v5-bg h-2 rounded-full overflow-hidden">
                      {hasData ? (
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isGood ? "bg-status-success" : "bg-status-warning"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      ) : (
                        <div className="h-full bg-v5-bg-high w-full" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
