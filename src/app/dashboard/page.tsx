"use client";

import React, { useEffect, useState } from "react";
import {
  TrendingUp,
  FileText,
  Clock,
  CheckCircle2,
  AlertOctagon,
  HelpCircle,
  Calendar,
  Download,
  PlusCircle,
  RefreshCw,
  Filter,
  ArrowRight,
  ShieldAlert,
  Building,
} from "lucide-react";

interface KPIData {
  totalTasks: number;
  inProgress: number;
  waitingReview: number;
  completed: number;
  overdue: number;
  hasIssue: number;
}

interface TaskItem {
  id: string;
  code: string;
  title: string;
  priority: string;
  status: string;
  currentDeadline: string;
  owner: { fullName: string };
  unit: { name: string };
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<KPIData>({
    totalTasks: 128,
    inProgress: 64,
    waitingReview: 18,
    completed: 38,
    overdue: 8,
    hasIssue: 5,
  });
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [period, setPeriod] = useState<"today" | "w41" | "month10" | "custom">("w41");
  const [unitFilter, setUnitFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [kpiRes, tasksRes] = await Promise.all([
        fetch(`/api/dashboard/kpi?unitId=${unitFilter}`),
        fetch(`/api/tasks`),
      ]);

      if (kpiRes.ok) {
        const kpiJson = await kpiRes.json();
        if (kpiJson.kpis) setKpis(kpiJson.kpis);
      }

      if (tasksRes.ok) {
        const tasksJson = await tasksRes.json();
        const taskList = Array.isArray(tasksJson) ? tasksJson : (tasksJson.data || []);
        setTasks(taskList);
      }
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [unitFilter]);

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* TOP COMMAND PANEL */}
      <div className="bg-white p-5 lg:p-6 rounded-xl border border-border-default shadow-sm flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-lg bg-primary-container text-white flex items-center justify-center shrink-0 shadow-sm">
              <TrendingUp className="w-6 h-6 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl lg:text-2xl font-bold text-primary tracking-tight">
                  Trung tâm Điều hành Công tác Nghiệp vụ
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-50 text-secondary border border-teal-200">
                  TRỰC BAN LÃNH ĐẠO
                </span>
              </div>
              <p className="text-xs lg:text-sm text-slate-500 flex items-center gap-2 mt-0.5">
                <span>Chi cục Hải quan Cửa khẩu quốc tế Tà Lùng</span>
                <span className="text-slate-300">•</span>
                <span className="font-mono text-xs text-slate-600 font-medium">Kỳ giám sát tuần 41 — Năm 2026</span>
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => alert("Chức năng xuất báo cáo giao ban XLSX mẫu chuẩn đang được chuẩn bị tại phân hệ Báo cáo.")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-primary font-semibold text-xs lg:text-sm transition-colors shadow-sm"
            >
              <Download className="w-4 h-4 text-emerald-700" />
              <span>Xuất báo cáo giao ban (.xlsx)</span>
            </button>
            <button
              onClick={() => alert("Mở form giao nhiệm vụ chỉ đạo đột xuất.")}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-secondary hover:bg-secondary/90 text-white font-semibold text-xs lg:text-sm transition-colors shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Giao nhiệm vụ đột xuất</span>
            </button>
            <button
              onClick={fetchDashboardData}
              title="Làm mới dữ liệu"
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Filter Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 bg-slate-50 p-3 rounded-lg border border-slate-200/60">
          {/* Period Selector Segmented */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-border-subtle shadow-sm">
            <button
              onClick={() => setPeriod("today")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                period === "today" ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:text-primary"
              }`}
            >
              Hôm nay
            </button>
            <button
              onClick={() => setPeriod("w41")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                period === "w41" ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:text-primary"
              }`}
            >
              Tuần 41 (Hiện hành)
            </button>
            <button
              onClick={() => setPeriod("month10")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                period === "month10" ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:text-primary"
              }`}
            >
              Tháng 10/2026
            </button>
          </div>

          {/* Scope Selector & Date Display */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-border-subtle text-xs text-slate-700 shadow-sm">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="font-semibold text-slate-900">06/10/2026 — 12/10/2026</span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                ĐANG MỞ
              </span>
            </div>

            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="h-8.5 px-3 rounded-lg bg-white border border-border-subtle text-xs font-semibold text-primary focus:outline-none focus:border-secondary cursor-pointer shadow-sm"
            >
              <option value="ALL">Toàn đơn vị — HQ CKQT Tà Lùng</option>
              <option value="BP_NGHIEPVU_A">Bộ phận Nghiệp vụ A (Thủ tục Hải quan)</option>
              <option value="BP_GIAMSAT_B">Bộ phận Giám sát B (Barie & Bãi xe)</option>
              <option value="BP_TONDONG_C">Bộ phận Xử lý nghiệp vụ tồn đọng C</option>
              <option value="BP_TONGHOP_D">Bộ phận Tổng hợp & Đánh giá D</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI SUMMARY: 6 STANDARDIZED EXECUTIVE CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5 lg:gap-4">
        {/* Card 1: Total Tasks */}
        <div className="bg-white p-4 rounded-xl border border-border-default shadow-sm flex flex-col justify-between hover:translate-y-[-2px] transition-transform">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Tổng việc giao kỳ</span>
            <div className="w-7 h-7 rounded-md bg-blue-50 text-blue-700 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2.5">
            <div className="text-2xl lg:text-3xl font-bold text-primary tracking-tight font-mono">
              {kpis.totalTasks}
            </div>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[11px]">
            <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" /> 100%
            </span>
            <span className="text-slate-400">Có chủ trì</span>
          </div>
        </div>

        {/* Card 2: In Progress */}
        <div className="bg-white p-4 rounded-xl border border-border-default shadow-sm flex flex-col justify-between hover:translate-y-[-2px] transition-transform">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Đang triển khai</span>
            <div className="w-7 h-7 rounded-md bg-sky-50 text-sky-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2.5">
            <div className="text-2xl lg:text-3xl font-bold text-primary tracking-tight font-mono">
              {kpis.inProgress}
            </div>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[11px]">
            <span className="text-sky-700 font-medium">Chiếm 50%</span>
            <span className="text-slate-400">Đang làm</span>
          </div>
        </div>

        {/* Card 3: Waiting Review */}
        <div className="bg-white p-4 rounded-xl border border-border-default shadow-sm flex flex-col justify-between hover:translate-y-[-2px] transition-transform">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Chờ xác nhận</span>
            <div className="w-7 h-7 rounded-md bg-amber-50 text-amber-700 flex items-center justify-center">
              <HelpCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2.5">
            <div className="text-2xl lg:text-3xl font-bold text-amber-700 tracking-tight font-mono">
              {kpis.waitingReview}
            </div>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[11px]">
            <span className="text-amber-700 font-semibold">Cần lãnh đạo duyệt</span>
          </div>
        </div>

        {/* Card 4: Completed */}
        <div className="bg-white p-4 rounded-xl border border-border-default shadow-sm flex flex-col justify-between hover:translate-y-[-2px] transition-transform">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Đã hoàn thành</span>
            <div className="w-7 h-7 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2.5">
            <div className="text-2xl lg:text-3xl font-bold text-emerald-700 tracking-tight font-mono">
              {kpis.completed}
            </div>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[11px]">
            <span className="text-emerald-700 font-semibold">Đạt chuẩn</span>
            <span className="text-slate-400">Đã chốt</span>
          </div>
        </div>

        {/* Card 5: Overdue */}
        <div className="bg-white p-4 rounded-xl border border-border-default shadow-sm flex flex-col justify-between hover:translate-y-[-2px] transition-transform">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Quá hạn giải quyết</span>
            <div className="w-7 h-7 rounded-md bg-rose-50 text-rose-700 flex items-center justify-center">
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2.5">
            <div className="text-2xl lg:text-3xl font-bold text-rose-700 tracking-tight font-mono">
              {kpis.overdue}
            </div>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[11px]">
            <span className="text-rose-700 font-semibold">Cần đôn đốc</span>
            <span className="text-slate-400">Trễ hạn</span>
          </div>
        </div>

        {/* Card 6: Has Issues */}
        <div className="bg-white p-4 rounded-xl border border-border-default shadow-sm flex flex-col justify-between hover:translate-y-[-2px] transition-transform">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Có vướng mắc</span>
            <div className="w-7 h-7 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2.5">
            <div className="text-2xl lg:text-3xl font-bold text-rose-600 tracking-tight font-mono">
              {kpis.hasIssue}
            </div>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[11px]">
            <span className="text-rose-600 font-semibold">Cần tháo gỡ</span>
            <span className="text-slate-400">Nghiệp vụ</span>
          </div>
        </div>
      </div>

      {/* CORE OPERATIONAL DATA SECTION */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Urgent & Important Tasks Table (2 Cols) */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-border-default shadow-sm p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-600" />
              <h2 className="text-base font-bold text-primary">Nhiệm vụ trọng điểm & Cần đôn đốc xử lý</h2>
            </div>
            <span className="text-xs text-slate-500">Đếm theo mã nhiệm vụ duy nhất (Single Task ID)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-700 uppercase font-semibold text-[11px]">
                  <th className="py-2.5 px-3">Mã việc</th>
                  <th className="py-2.5 px-3">Tiêu đề nhiệm vụ</th>
                  <th className="py-2.5 px-3">Chủ trì</th>
                  <th className="py-2.5 px-3">Hạn chót</th>
                  <th className="py-2.5 px-3">Ưu tiên</th>
                  <th className="py-2.5 px-3 text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.length > 0 ? (
                  tasks.map((task) => (
                    <tr key={task.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-primary">{task.code}</td>
                      <td className="py-3 px-3 font-medium text-slate-900 max-w-xs truncate">
                        {task.title}
                      </td>
                      <td className="py-3 px-3 text-slate-700">{task.owner?.fullName || "Chưa giao"}</td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {new Date(task.currentDeadline).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          {task.priority}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            task.status === "DONE"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : task.status === "WAITING_REVIEW"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-sky-50 text-sky-700 border border-sky-200"
                          }`}
                        >
                          {task.status === "DONE"
                            ? "Hoàn thành"
                            : task.status === "WAITING_REVIEW"
                            ? "Chờ duyệt"
                            : "Đang làm"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      Chưa có nhiệm vụ phát sinh trong bộ lọc.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Department Overview (1 Col) */}
        <div className="bg-white rounded-xl border border-border-default shadow-sm p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h2 className="text-base font-bold text-primary flex items-center gap-2">
              <Building className="w-4 h-4 text-secondary" />
              Khối lượng theo Bộ phận
            </h2>
          </div>

          <div className="flex flex-col gap-3">
            {[
              { name: "Bộ phận Nghiệp vụ A", count: 42, pct: 68, active: true },
              { name: "Bộ phận Giám sát B", count: 35, pct: 82, active: true },
              { name: "Bộ phận Xử lý tồn đọng C", count: 18, pct: 45, active: true },
              { name: "Bộ phận Tổng hợp & Đánh giá D", count: 33, pct: 90, active: true },
            ].map((dept, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-50 border border-slate-200/60 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">{dept.name}</span>
                  <span className="font-mono font-bold text-primary">{dept.count} việc</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-secondary h-full rounded-full transition-all"
                    style={{ width: `${dept.pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Tiến độ hoàn thành</span>
                  <span className="font-semibold text-teal-800">{dept.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
