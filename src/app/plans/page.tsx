"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/Toast";

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
  reviewStatus?: string;
}

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [templates, setTemplates] = useState<ActivityTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
  const [selectedOfficerFilter, setSelectedOfficerFilter] = useState("all");
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState("all");

  const planOfficers = React.useMemo(() => {
    const currentPlan = plans[selectedPlanIndex];
    if (!currentPlan) return [];
    const map = new Map<string, string>();
    currentPlan.items?.forEach((item) => {
      item.workItems?.forEach((wi) => {
        if (wi.person?.fullName) map.set(wi.person.fullName, wi.person.fullName);
      });
      item.taskLinks?.forEach((tl) => {
        if (tl.task?.owner?.fullName) map.set(tl.task.owner.fullName, tl.task.owner.fullName);
      });
    });
    return Array.from(map.values());
  }, [plans, selectedPlanIndex]);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnNotes, setReturnNotes] = useState("");
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);

  // Form states
  const [newWorkItemTitle, setNewWorkItemTitle] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  // Mobile View Filters
  const [mobilePeriod, setMobilePeriod] = useState<"day" | "week" | "month">("week");
  const [mobileScope, setMobileScope] = useState<"personal" | "unit">("personal");
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    "sec-1": true,
    "sec-2": false,
  });

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const [resPlans, resTemplates] = await Promise.all([
        fetch("/api/plans"),
        fetch("/api/catalog/templates"),
      ]);

      if (resPlans.ok) {
        const json = await resPlans.json();
        const planList = Array.isArray(json) ? json : json.data || [];
        setPlans(planList);
      }

      if (resTemplates.ok) {
        const jsonTpl = await resTemplates.json();
        setTemplates(Array.isArray(jsonTpl) ? jsonTpl : jsonTpl.data || []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const activePlan = plans[selectedPlanIndex] || null;

  // Add work item to plan
  const handleAddWorkItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkItemTitle.trim() && !selectedTemplateId) return;

    if (!activePlan) {
      toast.warning("Vui lòng chọn kế hoạch công tác");
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
          periodId: activePlan.period?.id,
          planItemId: activePlan.items?.[0]?.id || undefined,
          templateId: selectedTemplateId || undefined,
          title: finalTitle,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setNewWorkItemTitle("");
        setSelectedTemplateId("");
        setShowAddModal(false);
        setWorkflowMessage("Đã thêm thành công đầu việc vào kế hoạch!");
        toast.success("Đã thêm thành công đầu việc vào kế hoạch!");
        fetchPlans();
        setTimeout(() => setWorkflowMessage(null), 3000);
      } else {
        toast.error(json.error || "Không thể thêm đầu việc vào kế hoạch");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    }
  };

  const handleDeleteWorkItem = async (workItemId: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa đầu việc này khỏi kế hoạch?")) return;
    try {
      const res = await fetch(`/api/personal-work-items?id=${workItemId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(json.message || "Đã xóa đầu việc khỏi kế hoạch thành công!");
        fetchPlans();
      } else {
        toast.error(json.error || "Không thể xóa đầu việc");
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối máy chủ: " + err.message);
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
        toast.success(json.message || "Thao tác phê duyệt kế hoạch thành công!");
        setShowReturnModal(false);
        setReturnNotes("");
        fetchPlans();
        setTimeout(() => setWorkflowMessage(null), 3500);
      } else {
        toast.error(json.error || "Không thể thực hiện thao tác");
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối máy chủ: " + err.message);
    }
  };

  const toggleAccordion = (id: string) => {
    setOpenAccordions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="w-full min-h-screen bg-app-bg pb-12">
      {/* Toast message */}
      {workflowMessage && (
        <div className="fixed top-24 right-6 z-50 p-4 rounded-xl bg-status-success text-on-primary font-body-semibold text-sm shadow-xl flex items-center gap-2 transition-panel">
          <span className="material-symbols-outlined text-[20px]">verified</span>
          <span>{workflowMessage}</span>
        </div>
      )}

      {/* =========================================================================
          DESKTOP VIEW (Pixel-accurate Google Stitch ID d8279bd2bf0c4198b665f567223d0bf4)
          ========================================================================= */}
      <div className="hidden lg:flex flex-col w-full p-space-lg gap-space-lg">
        {/* Top Command Panel & Period Navigator */}
        <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-border-default/50">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-space-md">
            {/* Title & Official Approval Status */}
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-space-sm">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary-fixed text-on-secondary-fixed-variant font-label-sm text-label-sm font-semibold tracking-wide uppercase">
                  <span className="material-symbols-outlined text-[15px]">event_repeat</span>
                  {activePlan ? `${activePlan.period?.name || "KỲ KẾ HOẠCH"} — NĂM ${activePlan.period?.year || 2026}` : "KẾ HOẠCH TUẦN — NĂM 2026"}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-status-success-bg text-status-success font-label-sm text-label-sm font-semibold">
                  <span className="material-symbols-outlined text-[15px]">verified</span>
                  {activePlan?.status === "APPROVED"
                    ? `ĐÃ PHÊ DUYỆT (Lãnh đạo đơn vị${activePlan.approvedAt ? ` — ${new Date(activePlan.approvedAt).toLocaleDateString("vi-VN")}` : ""})`
                    : activePlan?.status === "SUBMITTED"
                    ? "ĐÃ TRÌNH DUYỆT (Chờ Lãnh đạo phê duyệt)"
                    : activePlan?.status === "RETURNED"
                    ? "YÊU CẦU CHỈNH SỬA"
                    : "DỰ THẢO KẾ HOẠCH"}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-subtle text-outline font-label-sm text-label-sm">
                  <span className="material-symbols-outlined text-[15px]">tag</span>
                  {activePlan?.period?.code || (activePlan ? `KH-TL-W42` : "KH-TL")}
                </span>
              </div>
              <h1 className="font-headline-xl text-headline-xl text-primary mt-1 tracking-tight">
                {activePlan ? activePlan.title : "Kế hoạch công tác tuần — Chi cục Hải quan Cửa khẩu Quốc tế Tà Lùng"}
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant flex items-center gap-2">
                <span>Chi cục Hải quan Cửa khẩu Quốc tế Tà Lùng</span>
                <span className="text-outline-variant">•</span>
                <span className="font-body-semibold text-secondary">
                  {activePlan?.unit?.name || "Bộ phận Nghiệp vụ A"} — Ca trực điều hành trọng điểm
                </span>
              </p>
            </div>

            {/* Action Group */}
            <div className="flex flex-wrap items-center gap-space-sm shrink-0">
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-secondary hover:bg-secondary/90 text-on-secondary font-label-md text-label-md font-semibold transition-fast shadow-sm active-press"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                <span>+ Thêm đầu việc mới</span>
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-surface-subtle hover:bg-surface-container-high text-primary font-label-md text-label-md font-semibold transition-fast active-press"
              >
                <span className="material-symbols-outlined text-[18px] text-secondary">library_books</span>
                <span>Chọn từ mẫu nghiệp vụ</span>
              </button>

              {activePlan?.status === "DRAFT" || activePlan?.status === "RETURNED" ? (
                <button
                  onClick={() => handleWorkflowAction("SUBMIT")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-primary text-on-primary font-label-md text-label-md font-semibold hover:bg-primary-container transition-fast active-press shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">send</span>
                  <span>Trình duyệt kế hoạch</span>
                </button>
              ) : activePlan?.status === "SUBMITTED" ? (
                <>
                  <button
                    onClick={() => handleWorkflowAction("APPROVE")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-status-success text-on-primary font-label-md text-label-md font-semibold hover:opacity-90 transition-fast active-press shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    <span>Phê duyệt kế hoạch</span>
                  </button>
                  <button
                    onClick={() => setShowReturnModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-status-danger text-on-primary font-label-md text-label-md font-semibold hover:opacity-90 transition-fast active-press shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[18px]">undo</span>
                    <span>Trả lại</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => toast.info("Kế hoạch đã có hiệu lực chính thức.")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-surface-subtle hover:bg-surface-container-high text-on-surface-variant font-label-md text-label-md transition-fast active-press"
                >
                  <span className="material-symbols-outlined text-[18px]">approval_delegation</span>
                  <span>Trình duyệt bổ sung</span>
                </button>
              )}

              <Link
                href="/reports/excel"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-surface-subtle hover:bg-surface-container-high text-on-surface-variant font-label-md text-label-md transition-fast active-press"
                title="Xuất dữ liệu Excel chuẩn mẫu báo cáo"
              >
                <span className="material-symbols-outlined text-[18px] text-status-success">download</span>
                <span>Xuất .XLSX</span>
              </Link>
            </div>
          </div>

          {/* View Mode Switcher + Interactive Filters */}
          <div className="mt-space-lg pt-space-md border-t border-border-default/50 flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
            {/* Tabs */}
            <div className="inline-flex p-1 rounded-lg bg-surface-subtle gap-1 text-on-surface-variant">
              <button className="px-3.5 py-1.5 rounded font-label-md text-label-md hover:text-on-surface transition-fast">
                Kế hoạch Ngày
              </button>
              <button className="px-3.5 py-1.5 rounded bg-surface-container-lowest text-primary font-body-semibold text-label-md shadow-sm">
                Kế hoạch Tuần (W41)
              </button>
              <button className="px-3.5 py-1.5 rounded font-label-md text-label-md hover:text-on-surface transition-fast">
                Kế hoạch Tháng 10
              </button>
              <button className="px-3.5 py-1.5 rounded font-label-md text-label-md hover:text-on-surface transition-fast flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">view_timeline</span>
                Góc nhìn Gantt
              </button>
            </div>

            {/* Filter Controls Bar */}
            <div className="flex flex-wrap items-center gap-space-sm">
              {plans.length > 0 && (
                <div className="flex items-center gap-1.5 bg-surface-container-low px-3 py-1.5 rounded text-on-surface border border-border-subtle">
                  <span className="font-label-sm text-label-sm text-outline">Kế hoạch:</span>
                  <select
                    value={selectedPlanIndex}
                    onChange={(e) => setSelectedPlanIndex(Number(e.target.value))}
                    className="bg-transparent font-label-md text-label-md font-semibold text-primary focus:outline-none cursor-pointer max-w-[280px] truncate"
                  >
                    {plans.map((p, idx) => (
                      <option key={p.id} value={idx}>
                        {p.unit?.name || "Đơn vị"}: {p.title} ({p.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-1.5 bg-surface-container-low px-3 py-1.5 rounded text-on-surface border border-border-subtle">
                <span className="font-label-sm text-label-sm text-outline">Cán bộ phụ trách:</span>
                <select
                  value={selectedOfficerFilter}
                  onChange={(e) => setSelectedOfficerFilter(e.target.value)}
                  className="bg-transparent font-label-md text-label-md text-primary focus:outline-none cursor-pointer"
                >
                  <option value="all">Tất cả cán bộ ({planOfficers.length} cán bộ)</option>
                  {planOfficers.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5 bg-surface-container-low px-3 py-1.5 rounded text-on-surface border border-border-subtle">
                <span className="font-label-sm text-label-sm text-outline">Mức ưu tiên:</span>
                <select
                  value={selectedPriorityFilter}
                  onChange={(e) => setSelectedPriorityFilter(e.target.value)}
                  className="bg-transparent font-label-md text-label-md text-primary focus:outline-none cursor-pointer"
                >
                  <option value="all">Tất cả mức độ</option>
                  <option value="HIGH">Cao (Khẩn cấp)</option>
                  <option value="MEDIUM">Trung bình</option>
                  <option value="LOW">Thấp</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Main Administrative Data-Dense Table (Excel Grid Representation - Stitch d8279bd2bf0c4198b665f567223d0bf4) */}
        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col border border-border-default/50">
          {/* Visual Informative Banner for Column C Business Logic */}
          <div className="px-space-lg py-2.5 bg-primary-container text-on-primary flex items-center justify-between text-label-sm font-label-sm">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary-fixed text-[18px]">rule_settings</span>
              <span>
                <strong className="text-white uppercase tracking-wider font-semibold">Quy tắc nghiệp vụ Cột C:</strong>{" "}
                "Danh mục đầu việc" biến động linh hoạt theo từng Cán bộ phụ trách và kỳ công tác, hỗ trợ liên kết mẫu nghiệp vụ chuẩn hóa [Mã Mẫu] hoặc đăng ký đầu việc đặc thù.
              </span>
            </div>
            <span className="text-on-primary-container hidden md:inline">Phiên bản biểu mẫu công tác chuẩn V1.1</span>
          </div>

          <div className="overflow-x-auto w-full custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1240px]">
              <thead className="sticky top-0 z-10 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                <tr className="bg-surface-subtle font-table-header text-table-header text-primary">
                  <th className="py-3 px-space-md w-[110px] uppercase tracking-wider text-center">Thứ / Ngày</th>
                  <th className="py-3 px-space-md w-[200px] uppercase tracking-wider">Nhóm nhiệm vụ</th>
                  <th className="py-3 px-space-lg min-w-[340px] uppercase tracking-wider bg-surface-container-highest/40 text-primary">
                    <div className="flex items-center justify-between">
                      <span>Cột C: Danh mục đầu việc (Biến động theo cá nhân)</span>
                      <span className="text-[11px] font-normal text-secondary uppercase px-1.5 py-0.5 rounded bg-secondary-fixed font-semibold">
                        Mẫu &amp; Tùy biến
                      </span>
                    </div>
                  </th>
                  <th className="py-3 px-space-md w-[210px] uppercase tracking-wider">Cán bộ phụ trách</th>
                  <th className="py-3 px-space-md w-[160px] uppercase tracking-wider">Đơn vị phối hợp</th>
                  <th className="py-3 px-space-sm w-[110px] uppercase tracking-wider text-center">Mức ưu tiên</th>
                  <th className="py-3 px-space-md w-[220px] uppercase tracking-wider">Kết quả dự kiến</th>
                  <th className="py-3 px-space-md w-[150px] uppercase tracking-wider text-center">Kết quả &amp; Trạng thái</th>
                  <th className="py-3 px-space-md w-[90px] uppercase tracking-wider text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md divide-y divide-border-default/40">
                {(() => {
                  if (!activePlan || !activePlan.items || activePlan.items.length === 0) {
                    return (
                      <tr>
                        <td colSpan={9} className="py-16 text-center text-on-surface-variant">
                          <span className="material-symbols-outlined text-outline text-[40px] block mb-2">
                            assignment
                          </span>
                          <p className="font-body-semibold text-body-semibold text-on-surface">
                            Chưa có dữ liệu đầu việc cho kế hoạch này
                          </p>
                          <p className="font-table-data text-[12px] text-outline mt-1">
                            Nhấn &quot;+ Thêm đầu việc công tác&quot; để bổ sung nhiệm vụ vào kế hoạch
                          </p>
                        </td>
                      </tr>
                    );
                  }

                  const allRows: Array<{
                    id: string;
                    dayLabel: string;
                    dateStr: string;
                    groupTitle: string;
                    title: string;
                    code?: string;
                    templateCode?: string;
                    ownerName: string;
                    coordinationUnit: string;
                    priority: string;
                    expectedResult: string;
                    status: string;
                    hasIssue?: boolean;
                  }> = [];

                  const weekdays = [
                    { day: "Thứ 2", date: "06/10/2026" },
                    { day: "Thứ 3", date: "07/10/2026" },
                    { day: "Thứ 4", date: "08/10/2026" },
                    { day: "Thứ 5", date: "09/10/2026" },
                    { day: "Thứ 6", date: "10/10/2026" },
                    { day: "Thứ 7", date: "11/10/2026" },
                    { day: "Chủ nhật", date: "12/10/2026" },
                  ];

                  let idx = 0;
                  activePlan.items.forEach((item) => {
                    const groupName = item.group?.name || item.title || "Nhiệm vụ thường xuyên";

                    item.workItems?.forEach((wi) => {
                      const dayInfo = weekdays[idx % weekdays.length];
                      allRows.push({
                        id: `wi-${wi.id}`,
                        dayLabel: dayInfo.day,
                        dateStr: dayInfo.date,
                        groupTitle: groupName,
                        title: wi.title,
                        templateCode: wi.template?.code,
                        ownerName: wi.person?.fullName || "Chưa phân công",
                        coordinationUnit: activePlan.unit?.name ? `${activePlan.unit.name}, Trạm CK` : "Bộ phận phối hợp",
                        priority: "Trung bình",
                        expectedResult: "Đạt 100% chỉ tiêu theo ca trực",
                        status: wi.status,
                      });
                      idx++;
                    });

                    item.taskLinks?.forEach((tl) => {
                      const task = tl.task;
                      const dayInfo = weekdays[idx % weekdays.length];
                      allRows.push({
                        id: `tl-${tl.task.id}`,
                        dayLabel: dayInfo.day,
                        dateStr: task.currentDeadline ? new Date(task.currentDeadline).toLocaleDateString("vi-VN") : dayInfo.date,
                        groupTitle: groupName,
                        title: task.title,
                        code: task.code,
                        ownerName: task.owner?.fullName || "Chưa phân công",
                        coordinationUnit: activePlan.unit?.name ? `${activePlan.unit.name}, Trạm CK` : "Bộ phận phối hợp",
                        priority: task.priority === "HIGH" ? "Cao" : task.priority === "LOW" ? "Thấp" : "Trung bình",
                        expectedResult: "Đạt yêu cầu quy trình nghiệp vụ",
                        status: task.status,
                        hasIssue: task.hasIssue,
                      });
                      idx++;
                    });
                  });

                  const filteredRows = allRows.filter((r) => {
                    if (selectedOfficerFilter !== "all" && r.ownerName !== selectedOfficerFilter) return false;
                    if (selectedPriorityFilter !== "all") {
                      if (selectedPriorityFilter === "HIGH" && r.priority !== "Cao") return false;
                      if (selectedPriorityFilter === "MEDIUM" && r.priority !== "Trung bình") return false;
                      if (selectedPriorityFilter === "LOW" && r.priority !== "Thấp") return false;
                    }
                    return true;
                  });

                  if (filteredRows.length === 0) {
                    return (
                      <tr>
                        <td colSpan={9} className="py-16 text-center text-on-surface-variant">
                          <span className="material-symbols-outlined text-outline text-[40px] block mb-2">
                            filter_alt_off
                          </span>
                          <p className="font-body-semibold text-body-semibold text-on-surface">
                            Không tìm thấy đầu việc nào phù hợp với bộ lọc cán bộ / mức ưu tiên
                          </p>
                        </td>
                      </tr>
                    );
                  }

                  return filteredRows.map((row) => (
                    <tr key={row.id} className="hover:bg-surface-container-low/40 transition-colors">
                      <td className="py-4 px-space-md text-center align-top bg-surface-subtle/30">
                        <div className="font-body-semibold text-primary">{row.dayLabel}</div>
                        <div className="font-label-sm text-label-sm text-outline">{row.dateStr}</div>
                      </td>
                      <td className="py-4 px-space-md align-top">
                        <span className="font-body-semibold text-primary block">{row.groupTitle}</span>
                      </td>
                      <td className="py-4 px-space-lg align-top bg-surface-container-lowest">
                        <div className="flex flex-col gap-1.5">
                          <div className="font-body-semibold text-primary text-[14px]">
                            {row.title}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {row.code && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-surface-container text-primary font-semibold">
                                {row.code}
                              </span>
                            )}
                            {row.templateCode && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-secondary-fixed text-on-secondary-fixed-variant font-semibold">
                                MÃ MẪU: {row.templateCode}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-space-md align-top">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-xs shrink-0">
                            {row.ownerName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-body-semibold text-on-surface block text-sm">{row.ownerName}</span>
                            <span className="text-xs text-outline">{activePlan?.unit?.name || "Bộ phận"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-space-md align-top">
                        <span className="text-xs text-on-surface-variant font-medium">{row.coordinationUnit}</span>
                      </td>
                      <td className="py-4 px-space-sm align-top text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                            row.priority === "Cao"
                              ? "bg-status-danger-bg text-status-danger"
                              : row.priority === "Thấp"
                              ? "bg-status-success-bg text-status-success"
                              : "bg-status-warning-bg text-status-warning"
                          }`}
                        >
                          {row.priority}
                        </span>
                      </td>
                      <td className="py-4 px-space-md align-top">
                        <span className="text-xs text-on-surface-variant">{row.expectedResult}</span>
                      </td>
                      <td className="py-4 px-space-md align-top text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold ${
                            row.status === "COMPLETED"
                              ? "bg-status-success-bg text-status-success"
                              : row.hasIssue
                              ? "bg-status-danger-bg text-status-danger"
                              : "bg-status-warning-bg text-status-warning"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {row.status === "COMPLETED" ? "check_circle" : row.hasIssue ? "warning" : "hourglass_top"}
                          </span>
                          <span>{row.status === "COMPLETED" ? "Đạt chỉ tiêu" : row.hasIssue ? "Vướng mắc" : "Đang thực hiện"}</span>
                        </span>
                      </td>
                      <td className="py-4 px-space-md align-top text-center">
                        <div className="flex items-center justify-center gap-1">
                          {row.id.startsWith("wi-") ? (
                            <button
                              onClick={() => handleDeleteWorkItem(row.id.replace("wi-", ""))}
                              className="p-1 rounded hover:bg-status-danger-bg text-outline hover:text-status-danger transition-colors inline-block"
                              title="Xóa đầu việc"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          ) : (
                            <Link
                              href={`/tasks/${row.id.replace("tl-", "")}`}
                              className="p-1 rounded hover:bg-surface-container text-outline hover:text-primary transition-colors inline-block"
                              title="Xem chi tiết nhiệm vụ"
                            >
                              <span className="material-symbols-outlined text-[18px]">visibility</span>
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MOBILE VIEW (Pixel-accurate Google Stitch ID 6835e08c233044cebdd3c966fef7fb1e)
          ========================================================================= */}
      <div className="lg:hidden flex flex-col w-full pb-16">


        {/* Operational Filter Section */}
        <section className="px-margin mt-space-md flex flex-col gap-space-sm">
          {/* Period Segmented Control */}
          <div className="bg-surface-container-high p-1 rounded-xl flex items-center justify-between">
            <button
              onClick={() => setMobilePeriod("day")}
              className={`flex-1 py-1.5 rounded-lg font-label-md text-label-md text-center transition-fast ${
                mobilePeriod === "day"
                  ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                  : "text-on-surface-variant"
              }`}
            >
              Ngày
            </button>
            <button
              onClick={() => setMobilePeriod("week")}
              className={`flex-1 py-1.5 rounded-lg font-label-md text-label-md text-center transition-fast ${
                mobilePeriod === "week"
                  ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                  : "text-on-surface-variant"
              }`}
            >
              Tuần 41 (Hiện tại)
            </button>
            <button
              onClick={() => setMobilePeriod("month")}
              className={`flex-1 py-1.5 rounded-lg font-label-md text-label-md text-center transition-fast ${
                mobilePeriod === "month"
                  ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                  : "text-on-surface-variant"
              }`}
            >
              Tháng 10
            </button>
          </div>

          {/* Week Picker */}
          <div className="flex items-center justify-between bg-surface-container-lowest px-space-md py-space-sm rounded-xl shadow-sm border border-border-default/40">
            <button
              aria-label="Tuần trước"
              className="w-9 h-9 rounded-lg bg-surface-subtle flex items-center justify-center text-on-surface hover:bg-surface-container transition-fast"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1 text-primary">
                <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                <span className="font-headline-sm text-headline-sm">Tuần 41 (06/10 - 12/10/2026)</span>
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant">Kỳ công tác 6 ngày</span>
            </div>
            <button
              aria-label="Tuần sau"
              className="w-9 h-9 rounded-lg bg-surface-subtle flex items-center justify-center text-on-surface hover:bg-surface-container transition-fast"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          </div>

          {/* Scope Filter Switch */}
          <div className="flex gap-space-sm">
            <button
              onClick={() => setMobileScope("personal")}
              className={`flex-1 py-2 px-space-sm rounded-lg font-body-semibold text-center shadow-sm flex items-center justify-center gap-1.5 transition-fast ${
                mobileScope === "personal"
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">person</span>
              <span>Kế hoạch cá nhân</span>
            </button>
            <button
              onClick={() => setMobileScope("unit")}
              className={`flex-1 py-2 px-space-sm rounded-lg font-body-semibold text-center flex items-center justify-center gap-1.5 transition-fast ${
                mobileScope === "unit"
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">group</span>
              <span>Toàn bộ phận A</span>
            </button>
          </div>
        </section>

        {/* Plan Metadata & Approval State Card */}
        <section className="px-margin mt-space-md">
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col gap-space-sm border border-border-default/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <div className="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-headline-sm text-headline-sm font-bold">
                  {activePlan?.unit?.name?.slice(0, 2).toUpperCase() || "HQ"}
                </div>
                <div className="flex flex-col">
                  <span className="font-body-semibold text-primary">{activePlan?.unit?.name || "Chi cục Hải quan"}</span>
                  <span className="text-xs text-on-surface-variant">{activePlan?.title || "Kế hoạch tuần"}</span>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                activePlan?.status === "APPROVED"
                  ? "bg-status-success-bg text-status-success"
                  : activePlan?.status === "SUBMITTED"
                  ? "bg-status-warning-bg text-status-warning"
                  : "bg-surface-container text-outline"
              }`}>
                {activePlan?.status === "APPROVED"
                  ? "ĐÃ DUYỆT"
                  : activePlan?.status === "SUBMITTED"
                  ? "CHỜ DUYỆT"
                  : "BẢN NHÁP"}
              </span>
            </div>
          </div>
        </section>

        {/* Quick Action Toolbar (Stitch 6835e08c233044cebdd3c966fef7fb1e) */}
        <section className="px-margin mt-space-md">
          <div className="flex flex-col gap-2">
            {/* Primary Action CTA */}
            <button
              onClick={() => setShowAddModal(true)}
              className="w-full h-11 bg-secondary text-on-secondary rounded-lg font-body-semibold text-body-semibold flex items-center justify-center gap-2 shadow-sm hover:opacity-95 active:scale-[0.99] transition-all active-press"
            >
              <span className="material-symbols-outlined text-[20px]">add_task</span>
              <span>+ Thêm đầu việc công tác</span>
            </button>
            {/* Secondary Quick Triggers */}
            <div className="grid grid-cols-2 gap-space-sm">
              <button
                onClick={() => setShowAddModal(true)}
                className="h-10 px-space-sm bg-surface-container-lowest text-primary rounded-lg font-label-md text-label-md flex items-center justify-center gap-1.5 shadow-sm hover:bg-surface-subtle transition-colors active-press"
              >
                <span className="material-symbols-outlined text-[18px] text-secondary">library_books</span>
                <span className="truncate">Từ mẫu 48 đầu việc</span>
              </button>
              <Link
                href="/reports"
                className="h-10 px-space-sm bg-surface-container-lowest text-primary rounded-lg font-label-md text-label-md flex items-center justify-center gap-1.5 shadow-sm hover:bg-surface-subtle transition-colors active-press"
              >
                <span className="material-symbols-outlined text-[18px] text-primary">description</span>
                <span className="truncate">Xem phiếu tuần</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ACCORDION SECTIONS */}
        <section className="px-margin mt-space-md flex flex-col gap-3">
          {activePlan?.items && activePlan.items.length > 0 ? (
            activePlan.items.map((item, idx) => {
              const secKey = `sec-${idx}`;
              const isOpen = openAccordions[secKey] ?? (idx === 0);
              const totalItems = (item.workItems?.length || 0) + (item.taskLinks?.length || 0);

              return (
                <div key={item.id} className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm border border-border-default/50">
                  <button
                    onClick={() => toggleAccordion(secKey)}
                    className="w-full p-space-md bg-surface-container-low flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-secondary" />
                      <span className="font-headline-sm text-[13px] uppercase font-bold text-primary">
                        {item.title} ({totalItems})
                      </span>
                    </div>
                    <span
                      className={`material-symbols-outlined text-[20px] transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    >
                      expand_more
                    </span>
                  </button>

                  {isOpen && (
                    <div className="p-3 flex flex-col gap-3">
                      {totalItems === 0 ? (
                        <p className="text-xs text-outline py-2 text-center">Chưa có đầu việc nào trong mục này</p>
                      ) : (
                        <>
                          {item.workItems?.map((wi) => (
                            <div key={wi.id} className="p-3 rounded-lg bg-surface-subtle border border-border-default flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <span className="font-label-sm font-bold text-primary">
                                  {wi.template ? `[${wi.template.code}]` : "ĐẦU VIỆC"}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-secondary/15 text-secondary text-xs font-bold">
                                  {wi.person?.fullName || "Chưa giao"}
                                </span>
                              </div>
                              <h4 className="font-body-semibold text-sm text-primary">
                                {wi.title}
                              </h4>
                              <div className="flex items-center justify-between text-xs text-outline pt-1 border-t border-border-default">
                                <span>Trạng thái: {wi.status}</span>
                                <button
                                  onClick={() => handleDeleteWorkItem(wi.id)}
                                  className="text-status-danger font-bold flex items-center gap-0.5 active:scale-95"
                                >
                                  <span className="material-symbols-outlined text-[15px]">delete</span>
                                  <span>Xóa</span>
                                </button>
                              </div>
                            </div>
                          ))}

                          {item.taskLinks?.map((tl) => (
                            <div key={tl.task.id} className="p-3 rounded-lg bg-surface-subtle border border-border-default flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <span className="font-label-sm font-bold text-primary">
                                  {tl.task.code}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                  tl.task.status === "COMPLETED"
                                    ? "bg-status-success-bg text-status-success"
                                    : tl.task.hasIssue
                                    ? "bg-status-danger-bg text-status-danger"
                                    : "bg-status-warning-bg text-status-warning"
                                }`}>
                                  {tl.task.owner?.fullName || "Chưa giao"}
                                </span>
                              </div>
                              <h4 className="font-body-semibold text-sm text-primary">
                                {tl.task.title}
                              </h4>
                              <div className="flex items-center justify-between text-xs text-outline pt-1 border-t border-border-default">
                                <span>Ưu tiên: {tl.task.priority}</span>
                                <Link href={`/tasks/${tl.task.id}`} className="text-secondary font-bold flex items-center gap-0.5">
                                  <span>Xử lý</span>
                                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                                </Link>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-6 bg-surface-container-lowest rounded-xl text-center text-outline text-sm">
              Chưa có dữ liệu đầu việc cho kế hoạch này
            </div>
          )}
        </section>
      </div>

      {/* =========================================================================
          MODAL: THÊM ĐẦU VIỆC MỚI VÀO KẾ HOẠCH
          ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-lg bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-default transition-panel">
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary-fixed text-[22px]">
                  post_add
                </span>
                <h3 className="font-headline-sm text-headline-sm text-white">
                  Thêm Đầu Việc Vào Kế Hoạch
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-on-primary-container hover:text-white transition-fast"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleAddWorkItem}>
              <div className="p-space-md flex flex-col gap-space-md max-h-[70vh] overflow-y-auto">
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Chọn từ danh mục mẫu nghiệp vụ
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => {
                      setSelectedTemplateId(e.target.value);
                      const tpl = templates.find((t) => t.id === e.target.value);
                      if (tpl) setNewWorkItemTitle(tpl.title);
                    }}
                    className="h-10 px-3 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                  >
                    <option value="">-- Tùy chọn đầu việc tự nhập --</option>
                    {templates
                      .filter((tpl) => tpl.reviewStatus !== "RETIRED")
                      .map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          [{tpl.code}] {tpl.title}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Tên đầu việc cụ thể *
                  </label>
                  <input
                    type="text"
                    required
                    value={newWorkItemTitle}
                    onChange={(e) => setNewWorkItemTitle(e.target.value)}
                    placeholder="Nhập tên nhiệm vụ trong kỳ kế hoạch..."
                    className="h-10 px-3 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>
              </div>

              <div className="p-space-md bg-surface-subtle flex items-center justify-end gap-space-sm border-t border-border-default">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded bg-surface-container-lowest text-on-surface font-label-md text-label-md hover:bg-surface-container border border-border-subtle transition-fast active-press"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-secondary text-on-secondary font-label-md text-label-md font-semibold hover:opacity-90 shadow-sm transition-fast active-press"
                >
                  Lưu vào kế hoạch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TRẢ LẠI CHỈNH SỬA */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-default transition-panel">
            <div className="p-space-md bg-status-danger text-on-error flex items-center justify-between">
              <span className="font-headline-sm font-semibold">Yêu Cầu Chỉnh Sửa Kế Hoạch</span>
              <button onClick={() => setShowReturnModal(false)}>
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="p-space-md flex flex-col gap-space-sm">
              <label className="text-xs font-semibold text-primary">Lý do yêu cầu điều chỉnh *</label>
              <textarea
                rows={3}
                required
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Nhập ý kiến chỉ đạo, nội dung cần bổ sung..."
                className="w-full p-2.5 rounded bg-surface-container-low text-sm border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
              />
            </div>
            <div className="p-space-md bg-surface-subtle flex items-center justify-end gap-2 border-t border-border-default">
              <button
                onClick={() => setShowReturnModal(false)}
                className="px-4 py-2 rounded bg-surface-container-lowest text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                onClick={() => handleWorkflowAction("RETURN")}
                className="px-4 py-2 rounded bg-status-danger text-on-error text-xs font-semibold"
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
