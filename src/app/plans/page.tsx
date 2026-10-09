"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  Plus,
  Send,
  Building2,
  BookOpen,
  User,
  Shield,
  Layers,
  ChevronDown,
  ChevronRight,
  Filter,
  RefreshCw,
  Check,
  X,
} from "lucide-react";

interface PlanItem {
  id: string;
  title: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED" | "IN_EFFECT";
  approvedBy?: string;
  approvedAt?: string;
  period: { id: string; name: string; code: string; year: number; weekNumber?: number; periodType: string };
  unit: { id: string; name: string; code: string };
  items: Array<{
    id: string;
    title: string;
    sortOrder: number;
    group?: { name: string; code: string };
    workItems: Array<{
      id: string;
      title: string;
      status: string;
      person: { fullName: string };
      template?: { code: string; title: string };
    }>;
    taskLinks: Array<{
      task: {
        id: string;
        code: string;
        title: string;
        status: string;
        priority: string;
        currentDeadline: string;
        hasIssue: boolean;
        owner: { fullName: string };
      };
    }>;
  }>;
}

interface ActivityTemplate {
  id: string;
  code: string;
  title: string;
  activityGroup?: { name: string };
}

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [templates, setTemplates] = useState<ActivityTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnNotes, setReturnNotes] = useState("");
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);

  // Form thêm đầu việc mới
  const [newWorkItemTitle, setNewWorkItemTitle] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const [resPlans, resTemplates] = await Promise.all([
        fetch("/api/plans"),
        fetch("/api/catalog/templates"),
      ]);

      if (resPlans.ok) {
        const json = await resPlans.json();
        const planList = Array.isArray(json) ? json : (json.data || []);
        setPlans(planList);
      }

      if (resTemplates.ok) {
        const jsonTpl = await resTemplates.json();
        setTemplates(Array.isArray(jsonTpl) ? jsonTpl : (jsonTpl.data || []));
      }
    } catch (err) {
      console.error("Error fetching plans data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const activePlan = plans[selectedPlanIndex] || null;

  // Thêm đầu việc cá nhân vào kế hoạch
  const handleAddWorkItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkItemTitle.trim() && !selectedTemplateId) return;

    if (!activePlan || !activePlan.items[0]) {
      alert("Chưa có cấu trúc kế hoạch để gắn đầu việc");
      return;
    }

    let finalTitle = newWorkItemTitle.trim();
    if (!finalTitle && selectedTemplateId) {
      const tpl = templates.find((t) => t.id === selectedTemplateId);
      if (tpl) finalTitle = tpl.title;
    }

    try {
      const res = await fetch("/api/personal-work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodId: activePlan.period.id,
          planItemId: activePlan.items[0].id,
          templateId: selectedTemplateId || undefined,
          title: finalTitle,
        }),
      });

      if (res.ok) {
        setNewWorkItemTitle("");
        setSelectedTemplateId("");
        setShowAddModal(false);
        setWorkflowMessage("Đã thêm thành công đầu việc vào kế hoạch cá nhân");
        fetchPlans();
        setTimeout(() => setWorkflowMessage(null), 3000);
      }
    } catch (err) {
      console.error("Error adding work item:", err);
    }
  };

  // Workflow Action (SUBMIT, APPROVE, RETURN)
  const handleWorkflowAction = async (action: "SUBMIT" | "APPROVE" | "RETURN") => {
    if (!activePlan) return;

    try {
      const res = await fetch(`/api/plans/${activePlan.id}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reviewNotes: action === "RETURN" ? returnNotes : undefined,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setWorkflowMessage(json.message);
        setShowReturnModal(false);
        setReturnNotes("");
        fetchPlans();
        setTimeout(() => setWorkflowMessage(null), 3500);
      } else {
        alert(json.error || "Không thể thực hiện thao tác");
      }
    } catch (err: any) {
      alert("Lỗi kết nối máy chủ: " + err.message);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
            <CheckCircle className="w-3.5 h-3.5" /> ĐÃ PHÊ DUYỆT
          </span>
        );
      case "SUBMITTED":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200 animate-pulse">
            <Clock className="w-3.5 h-3.5" /> ĐÃ TRÌNH DUYỆT (Chờ Lãnh đạo)
          </span>
        );
      case "RETURNED":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded bg-rose-50 text-rose-700 text-xs font-semibold border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5" /> YÊU CẦU CHỈNH SỬA
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
            DỰ THẢO (LƯU NHÁP)
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12">
      {/* Top Command Panel */}
      <div className="bg-white p-5 lg:p-6 rounded-xl border border-border-default shadow-sm flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-teal-100 text-teal-800 text-xs font-bold uppercase tracking-wide">
                {activePlan ? `${activePlan.period.name} — ${activePlan.period.year}` : "KẾ HOẠCH CÔNG TÁC"}
              </span>
              {activePlan && getStatusBadge(activePlan.status)}
              <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-600 text-xs font-mono font-medium">
                {activePlan?.unit?.code || "HQ-TALUNG"}
              </span>
            </div>
            <h1 className="text-xl lg:text-2xl font-bold text-primary tracking-tight">
              {activePlan?.title || "Kế hoạch công tác điều hành"}
            </h1>
            <p className="text-xs lg:text-sm text-slate-500 flex items-center gap-2">
              <span>Chi cục Hải quan Cửa khẩu Quốc tế Tà Lùng</span>
              <span className="text-slate-300">•</span>
              <span className="font-semibold text-secondary">
                {activePlan?.unit?.name || "Bộ phận nghiệp vụ"}
              </span>
            </p>
          </div>

          {/* Workflow Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-blue-900 hover:bg-blue-800 text-white text-xs lg:text-sm font-semibold transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm đầu việc cá nhân</span>
            </button>

            {/* Trình duyệt (Khi DRAFT hoặc RETURNED) */}
            {activePlan && (activePlan.status === "DRAFT" || activePlan.status === "RETURNED") && (
              <button
                onClick={() => handleWorkflowAction("SUBMIT")}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs lg:text-sm font-semibold transition-colors shadow-sm"
              >
                <Send className="w-4 h-4" />
                <span>Trình duyệt kế hoạch</span>
              </button>
            )}

            {/* Phê duyệt & Trả lại (Khi SUBMITTED) */}
            {activePlan && activePlan.status === "SUBMITTED" && (
              <>
                <button
                  onClick={() => handleWorkflowAction("APPROVE")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs lg:text-sm font-semibold transition-colors shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  <span>Phê duyệt</span>
                </button>
                <button
                  onClick={() => setShowReturnModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-rose-600 hover:bg-rose-700 text-white text-xs lg:text-sm font-semibold transition-colors shadow-sm"
                >
                  <X className="w-4 h-4" />
                  <span>Trả lại</span>
                </button>
              </>
            )}

            <button
              onClick={fetchPlans}
              className="p-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {workflowMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm flex items-center justify-between">
          <span>{workflowMessage}</span>
          <button onClick={() => setWorkflowMessage(null)} className="text-emerald-600 hover:underline text-xs">
            Đóng
          </button>
        </div>
      )}

      {/* Sheet Table View: 8 Cột theo đúng Project Context */}
      <div className="bg-white rounded-xl border border-border-default shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-900" />
            <h2 className="text-sm font-bold text-slate-900">
              Biểu Kế Hoạch Tuần — Cột C: "Danh mục đầu việc" (Biến động theo từng cá nhân)
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {activePlan?.items?.length || 0} Nhóm hạng mục
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-bold">
                <th className="py-3 px-3 w-16 text-center">A. Thứ/Ngày</th>
                <th className="py-3 px-4 w-44">B. Nhóm nhiệm vụ</th>
                <th className="py-3 px-4">C. Danh mục đầu việc (Cá nhân hóa linh hoạt)</th>
                <th className="py-3 px-3 w-36">D. Cán bộ phụ trách</th>
                <th className="py-3 px-3 w-36">E. Đơn vị phối hợp</th>
                <th className="py-3 px-3 w-24 text-center">F. Ưu tiên</th>
                <th className="py-3 px-4 w-48">G. Kết quả dự kiến</th>
                <th className="py-3 px-3 w-32 text-center">H. Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
                    Đang nạp dữ liệu kế hoạch từ PostgreSQL...
                  </td>
                </tr>
              ) : !activePlan || activePlan.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Chưa có hạng mục kế hoạch nào. Bấm nút "+ Thêm đầu việc cá nhân" ở trên để bắt đầu.
                  </td>
                </tr>
              ) : (
                activePlan.items.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3 text-center font-mono text-slate-500">
                      T{idx + 2}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {item.title}
                      {item.group && (
                        <span className="block text-[11px] font-normal text-slate-500 mt-0.5">
                          {item.group.name}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {item.workItems && item.workItems.length > 0 ? (
                        <div className="space-y-1.5">
                          {item.workItems.map((wi) => (
                            <div key={wi.id} className="p-2 bg-slate-50 rounded border border-slate-200/80 flex items-start justify-between gap-2">
                              <div>
                                <span className="font-semibold text-slate-900 block">{wi.title}</span>
                                <span className="text-[11px] text-slate-500">Cán bộ: {wi.person.fullName}</span>
                              </div>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-50 text-blue-700">
                                {wi.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Chưa gắn đầu việc cá nhân</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-800 font-medium">
                      {activePlan.unit.name}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      Doanh nghiệp XNK, Trạm BP
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                        Cao
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      Đạt chỉ tiêu thông quan và giám sát cửa khẩu
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <CheckCircle className="w-3.5 h-3.5" /> Đang triển khai
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Thêm đầu việc cá nhân */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Thêm Đầu Việc Cá Nhân Vào Kế Hoạch
            </h3>
            <p className="text-xs text-slate-500">
              Đầu việc biến động linh hoạt theo từng cá nhân. Bạn có thể chọn từ 48 mẫu gợi ý HOẶC tự nhập đầu việc mới.
            </p>

            <form onSubmit={handleAddWorkItem} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Cách 1: Chọn từ Danh mục 48 hoạt động mẫu (Tùy chọn)
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => {
                    setSelectedTemplateId(e.target.value);
                    const tpl = templates.find((t) => t.id === e.target.value);
                    if (tpl) setNewWorkItemTitle(tpl.title);
                  }}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="">-- Để trống nếu muốn tự nhập đầu việc mới --</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      [{tpl.code}] {tpl.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Cách 2: Tự nhập tiêu đề đầu việc cá nhân mới *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Ví dụ: Rà soát 15 bộ hồ sơ tham vấn giá lô hàng nông sản"
                  value={newWorkItemTitle}
                  onChange={(e) => setNewWorkItemTitle(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-900 rounded-lg hover:bg-blue-800 shadow-sm"
                >
                  Thêm đầu việc
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Trả lại kế hoạch */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600" />
              Trả Lại Kế Hoạch Yêu Cầu Chỉnh Sửa
            </h3>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Lý do trả lại hoặc ý kiến chỉ đạo bổ sung *
              </label>
              <textarea
                rows={3}
                required
                placeholder="Nêu rõ các nội dung cần bổ sung, đầu việc còn thiếu..."
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowReturnModal(false)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => handleWorkflowAction("RETURN")}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 rounded-lg hover:bg-rose-700 shadow-sm"
              >
                Xác nhận trả lại
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
