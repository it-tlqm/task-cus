"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/Toast";
import { getDaysOfWeekFromStart, formatPeriodRangeFromDates, getCurrentPeriodLabels } from "@/lib/period-helper";

interface ActivityGroup {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  description?: string;
}

interface ActivityTemplate {
  id: string;
  code: string;
  title: string;
  groupId: string;
  group?: { id: string; name: string; code: string };
  defaultPriority?: string;
  reviewStatus?: string;
}

interface PersonalWorkItemData {
  id: string;
  title: string;
  status: string;
  person?: { id: string; fullName: string };
  workDate?: string | null;
  dateText?: string | null;
  groupId?: string | null;
  group?: { id: string; name: string; code: string } | null;
  coordinationUnit?: string | null;
  priority?: string | null;
  expectedResult?: string | null;
  templateId?: string | null;
  template?: { id: string; code: string; title: string; groupId?: string; group?: { id: string; name: string; code: string } } | null;
  // YC-25: đầu việc chọn từ danh mục riêng của bộ phận
  deptWorkItemId?: string | null;
  deptWorkItem?: { id: string; title: string; status: string; unit?: { id: string; code: string; name: string } | null } | null;
  // YC-23: sản phẩm đầu ra theo QĐ1277 gắn kèm đầu việc (tuỳ chọn)
  productItemId?: string | null;
  product?: { id: string; code: string; taskName: string; outputProduct?: string | null; convertFactor?: number | null; groupName?: string | null } | null;
  // YC-31: đầu việc từ Danh mục công việc thường xuyên (phiên bản đang áp dụng)
  catalogEntryId?: string | null;
  catalogEntry?: { id: string; code: string; title: string; department: string; status: string } | null;
  // YC-32: hạn xử lý và ngày hoàn thành thực tế (tách biệt); liên kết nhiệm vụ hai chiều
  dueDate?: string | null;
  completedDate?: string | null;
  taskId?: string | null;
  task?: { id: string; code: string; title: string; status: string } | null;
}

// YC-25 — Danh mục đầu việc riêng theo bộ phận
interface DepartmentWorkItemData {
  id: string;
  unitId: string;
  title: string;
  description?: string | null;
  status: string;
  sortOrder: number;
  usageCount?: number;
  unit?: { id: string; code: string; name: string } | null;
  createdBy?: { id: string; fullName: string } | null;
}

interface ProductPickerItem {
  id: string;
  code: string;
  taskName: string;
  outputProduct?: string | null;
  convertFactor?: number | null;
  groupName?: string | null;
}

// YC-31 — Danh mục công việc thường xuyên (phiên bản đang áp dụng)
interface WorkCatalogEntryPicker {
  id: string;
  code: string;
  department: string;
  departmentOrder: number;
  title: string;
  sortOrder: number;
  status: string;
}

interface WorkCatalogDepartment {
  name: string;
  order: number;
  count: number;
}

interface PlanItem {
  id: string;
  title: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED" | "IN_EFFECT";
  approvedBy?: string;
  approvedAt?: string;
  period: { id: string; name?: string; title?: string; code?: string; year?: number; weekNumber?: number; periodType?: string; type?: string; startAt?: string; endAt?: string };
  unit: { id: string; name: string; code: string };
  items: Array<{
    id: string;
    title: string;
    sortOrder: number;
    groupId?: string;
    group?: { name: string; code: string };
    workItems: Array<PersonalWorkItemData>;
    taskLinks: Array<{
      task: {
        id: string;
        code: string;
        title: string;
        status: string;
        priority: string;
        currentDeadline: string;
        hasIssue: boolean;
        expectedResultText?: string;
        ownerId?: string;
        owner: { fullName: string; id?: string };
        assignees?: Array<{ personId?: string; person?: { id?: string; fullName: string } }>;
      };
    }>;
  }>;
}

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [templates, setTemplates] = useState<ActivityTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
  const [selectedOfficerFilter, setSelectedOfficerFilter] = useState("all");
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"day" | "week" | "month" | "gantt">("week");

  const planPeriodType = (p: PlanItem): string =>
    ((p.period as any)?.type || (p.period as any)?.periodType || "").toString().toUpperCase();

  // Lọc kế hoạch theo tab kỳ: dữ liệu thật từ period.type của API (DAY/WEEK/MONTH)
  const filteredPlans = React.useMemo(() => {
    if (viewMode === "gantt") return plans;
    const want = viewMode === "day" ? "DAY" : viewMode === "month" ? "MONTH" : "WEEK";
    const matched = plans.filter((p) => planPeriodType(p) === want);
    // Kỳ không xác định type: giữ lại ở tab Tuần để không mất dữ liệu
    return viewMode === "week" ? plans.filter((p) => ["WEEK", ""].includes(planPeriodType(p))) : matched;
  }, [plans, viewMode]);

  const countBy = (t: string) => plans.filter((p) => planPeriodType(p) === t || (t === "WEEK" && planPeriodType(p) === "")).length;

  const activePlan = filteredPlans[Math.min(selectedPlanIndex, Math.max(0, filteredPlans.length - 1))] || null;

  const switchView = (m: "day" | "week" | "month" | "gantt") => {
    setViewMode(m);
    setSelectedPlanIndex(0);
  };

  const planOfficers = React.useMemo(() => {
    if (!activePlan) return [];
    const map = new Map<string, string>();
    activePlan.items?.forEach((item) => {
      item.workItems?.forEach((wi) => {
        if (wi.person?.fullName) map.set(wi.person.fullName, wi.person.fullName);
      });
      item.taskLinks?.forEach((tl) => {
        if (tl.task?.owner?.fullName) map.set(tl.task.owner.fullName, tl.task.owner.fullName);
      });
    });
    return Array.from(map.values());
  }, [activePlan]);

  const [groups, setGroups] = useState<ActivityGroup[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; personId: string; fullName: string; role: string } | null>(null);
  const [selectedScope, setSelectedScope] = useState<"all" | "personal">("all");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [returnNotes, setReturnNotes] = useState("");
  const [showAmendmentModal, setShowAmendmentModal] = useState(false);
  const [amendmentNotes, setAmendmentNotes] = useState("");
  const [unlockToDraft, setUnlockToDraft] = useState(true);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);

  // Form states for Add / Edit Modal
  const [editingItem, setEditingItem] = useState<PersonalWorkItemData | null>(null);
  const [modalTitle, setModalTitle] = useState("");
  const [modalTemplateId, setModalTemplateId] = useState("");
  const [modalGroupId, setModalGroupId] = useState("");
  const [modalWorkDate, setModalWorkDate] = useState("");
  const [modalDateText, setModalDateText] = useState("");
  const [modalCoordination, setModalCoordination] = useState("");
  const [modalPriority, setModalPriority] = useState("Trung bình");
  const [modalExpectedResult, setModalExpectedResult] = useState("");
  const [modalStatus, setModalStatus] = useState("NOT_STARTED");

  // YC-23 + YC-25: lựa chọn từ danh mục (thường xuyên / sản phẩm QĐ1277 / riêng của bộ phận)
  const [modalDeptWorkItemId, setModalDeptWorkItemId] = useState("");
  const [modalProductItemId, setModalProductItemId] = useState("");
  const [modalProductLabel, setModalProductLabel] = useState("");
  // YC-31/YC-32: nguồn TX, hạn xử lý, ngày hoàn thành thực tế
  const [modalCatalogEntryId, setModalCatalogEntryId] = useState("");
  const [modalDueDate, setModalDueDate] = useState("");
  const [modalCompletedDate, setModalCompletedDate] = useState("");
  const [txEntries, setTxEntries] = useState<WorkCatalogEntryPicker[]>([]);
  const [txDepartments, setTxDepartments] = useState<WorkCatalogDepartment[]>([]);
  const [legacyTemplatesSelectable, setLegacyTemplatesSelectable] = useState(true);
  const [catalogActivationStatus, setCatalogActivationStatus] = useState<
    "NO_VERSION" | "NOT_ACTIVATED" | "ACTIVATED"
  >("NO_VERSION");
  const [templateSearch, setTemplateSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductPickerItem[]>([]);
  const [productPage, setProductPage] = useState(1);
  const [productTotal, setProductTotal] = useState(0);
  const [productSearching, setProductSearching] = useState(false);
  const [deptWorkItems, setDeptWorkItems] = useState<DepartmentWorkItemData[]>([]);
  const [deptCatalogUnits, setDeptCatalogUnits] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [deptCatalogCanManage, setDeptCatalogCanManage] = useState(false);
  const [deptCatalogMsg, setDeptCatalogMsg] = useState<string | null>(null);

  // Modal quản lý danh mục đầu việc bộ phận (Trưởng bộ phận / Lãnh đạo đơn vị)
  const [showDeptCatalogModal, setShowDeptCatalogModal] = useState(false);
  const [deptManageUnitId, setDeptManageUnitId] = useState("");
  const [deptManageItems, setDeptManageItems] = useState<DepartmentWorkItemData[]>([]);
  const [deptManageLoading, setDeptManageLoading] = useState(false);
  const [deptFormTitle, setDeptFormTitle] = useState("");
  const [deptFormDesc, setDeptFormDesc] = useState("");
  const [deptEditingId, setDeptEditingId] = useState<string | null>(null);
  const [deptBusy, setDeptBusy] = useState(false);

  // YC-23: tìm nhanh 48 mẫu thường xuyên phía máy khách (danh mục nhỏ; danh mục sản phẩm 3.000+ mới cần tìm phía máy chủ)
  const filteredTemplates = React.useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    return templates.filter((tpl) => {
      if (tpl.reviewStatus === "RETIRED") return false;
      if (!q) return true;
      return `${tpl.code} ${tpl.title}`.toLowerCase().includes(q);
    });
  }, [templates, templateSearch]);

  // Mobile View Filters
  const [mobilePeriod, setMobilePeriod] = useState<"day" | "week" | "month">("week");
  const mobileLabels = React.useMemo(() => getCurrentPeriodLabels(), []);
  const [mobileScope, setMobileScope] = useState<"personal" | "unit">("personal");
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    "sec-1": true,
    "sec-2": false,
  });

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const [resPlans, resTemplates, resGroups, resUser, resDept, resCatalog] = await Promise.all([
        fetch("/api/plans"),
        fetch("/api/catalog/templates"),
        fetch("/api/catalog/groups"),
        fetch("/api/auth/me"),
        fetch("/api/department-work-items?status=ACTIVE"),
        fetch("/api/work-catalog", { cache: "no-store" }),
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

      if (resGroups.ok) {
        const jsonGrp = await resGroups.json();
        setGroups(Array.isArray(jsonGrp) ? jsonGrp : jsonGrp.data || []);
      }

      if (resUser.ok) {
        const jsonUser = await resUser.json();
        if (jsonUser.user) {
          setCurrentUser(jsonUser.user);
        }
      }

      if (resDept.ok) {
        const jsonDept = await resDept.json();
        setDeptWorkItems(jsonDept.data || []);
        setDeptCatalogUnits(jsonDept.units || []);
        setDeptCatalogCanManage(!!jsonDept.canManage);
      }

      if (resCatalog.ok) {
        const jsonCatalog = await resCatalog.json();
        const catData = jsonCatalog.data || {};
        setTxEntries(catData.entries || []);
        setTxDepartments(catData.departments || []);
        setLegacyTemplatesSelectable(catData.legacyTemplatesSelectable !== false);
        setCatalogActivationStatus(
          catData.activation?.status === "ACTIVATED"
            ? "ACTIVATED"
            : catData.version
              ? "NOT_ACTIVATED"
              : "NO_VERSION"
        );
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

  // Dữ liệu Gantt: nhiệm vụ liên kết của kế hoạch đang chọn (dedupe theo Task.id)
  const ganttData = React.useMemo(() => {
    if (!activePlan) return null;
    const seen = new Map<string, any>();
    (activePlan.items || []).forEach((item) => {
      (item.taskLinks || []).forEach((tl) => {
        if (tl.task && !seen.has(tl.task.id)) seen.set(tl.task.id, tl.task);
      });
    });
    const tasks = Array.from(seen.values());
    if (tasks.length === 0) return { tasks: [], start: null as Date | null, end: null as Date | null, days: 0 };
    const periodStart = activePlan.period?.startAt ? new Date(activePlan.period.startAt) : null;
    const periodEnd = activePlan.period?.endAt ? new Date(activePlan.period.endAt) : null;
    const deadlines = tasks.map((t) => new Date(t.currentDeadline).getTime()).filter((n) => !isNaN(n));
    const minT = Math.min(periodStart ? periodStart.getTime() : Infinity, ...deadlines);
    const maxT = Math.max(periodEnd ? periodEnd.getTime() : -Infinity, ...deadlines);
    const start = new Date(minT);
    start.setHours(0, 0, 0, 0);
    const end = new Date(maxT);
    end.setHours(0, 0, 0, 0);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    return { tasks, start, end, days, periodStart, periodEnd };
  }, [activePlan]);

  // Options for days of the week based on activePlan (Chuẩn hóa ISO 8601 GMT+7)
  const weekDaysOptions = React.useMemo(() => {
    if (!activePlan?.period?.startAt) {
      const base = new Date("2026-10-04T17:00:00.000Z"); // Thứ 2 ngày 05/10/2026 00:00 GMT+7
      return getDaysOfWeekFromStart(base);
    }
    return getDaysOfWeekFromStart(new Date(activePlan.period.startAt));
  }, [activePlan]);

  // Modal Handlers
  const openAddModal = (initialTemplateId = "") => {
    // E1: kế hoạch đã duyệt/có hiệu lực thì mọi bổ sung đi qua luồng trình duyệt bổ sung
    if (activePlan?.status === "APPROVED" || activePlan?.status === "IN_EFFECT") {
      toast.warning("Kế hoạch đã phê duyệt — vui lòng dùng “Trình duyệt bổ sung” để thêm đầu việc theo quy trình");
      return;
    }
    setEditingItem(null);
    setModalTemplateId(initialTemplateId);
    if (initialTemplateId) {
      const tpl = templates.find((t) => t.id === initialTemplateId);
      if (tpl) {
        setModalTitle(tpl.title);
        setModalGroupId(tpl.groupId || groups[0]?.id || "");
        setModalPriority(tpl.defaultPriority || "Cao");
      }
    } else {
      setModalTitle("");
      setModalGroupId(groups[0]?.id || "");
      setModalPriority("Trung bình");
    }
    setModalWorkDate("");
    setModalDateText("");
    setModalCoordination("");
    setModalExpectedResult("");
    setModalStatus("NOT_STARTED");
    setModalDeptWorkItemId("");
    setModalProductItemId("");
    setModalProductLabel("");
    setModalCatalogEntryId("");
    setModalDueDate("");
    setModalCompletedDate("");
    setDeptCatalogMsg(null);
    setTemplateSearch("");
    setProductSearch("");
    setProductResults([]);
    setProductTotal(0);
    setShowAddModal(true);
  };

  const openEditModal = (wi: PersonalWorkItemData) => {
    // E1: kế hoạch đã duyệt/có hiệu lực thì mọi sửa đổi đi qua luồng trình duyệt bổ sung
    if (activePlan?.status === "APPROVED" || activePlan?.status === "IN_EFFECT") {
      toast.warning("Kế hoạch đã phê duyệt — vui lòng dùng “Trình duyệt bổ sung” để điều chỉnh theo quy trình");
      return;
    };
    setEditingItem(wi);
    setModalTemplateId(wi.templateId || "");
    setModalDeptWorkItemId(wi.deptWorkItemId || "");
    setModalProductItemId(wi.productItemId || "");
    setModalProductLabel(wi.product ? `${wi.product.code} — ${wi.product.taskName}` : "");
    setModalCatalogEntryId(wi.catalogEntryId || "");
    setModalDueDate(wi.dueDate ? new Date(wi.dueDate).toISOString().slice(0, 10) : "");
    setModalCompletedDate(
      wi.completedDate ? new Date(wi.completedDate).toISOString().slice(0, 10) : ""
    );
    setDeptCatalogMsg(
      wi.deptWorkItem && wi.deptWorkItem.status !== "ACTIVE"
        ? "Đầu việc gốc của bộ phận đã ngừng sử dụng — hệ thống giữ nguyên liên kết cũ cho đến khi bạn đổi."
        : null
    );
    setTemplateSearch("");
    setProductSearch("");
    setProductResults([]);
    setProductTotal(0);
    setModalTitle(wi.title);
    setModalGroupId(wi.groupId || wi.template?.groupId || wi.template?.group?.id || groups[0]?.id || "");
    setModalWorkDate(wi.workDate ? new Date(wi.workDate).toISOString().slice(0, 10) : "");
    setModalDateText(wi.dateText || "");
    setModalCoordination(wi.coordinationUnit || "");
    setModalPriority(wi.priority || "Trung bình");
    setModalExpectedResult(wi.expectedResult || "");
    setModalStatus(wi.status || "NOT_STARTED");
    setShowAddModal(true);
  };

  const handleSaveWorkItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalTitle.trim()) {
      toast.warning("Vui lòng nhập tên đầu việc");
      return;
    }
    if (!activePlan) {
      toast.warning("Vui lòng chọn kế hoạch công tác");
      return;
    }

    try {
      if (editingItem) {
        const res = await fetch("/api/personal-work-items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingItem.id,
            title: modalTitle.trim(),
            groupId: modalGroupId || null,
            workDate: modalWorkDate || null,
            dateText: modalDateText.trim() || null,
            coordinationUnit: modalCoordination.trim() || null,
            priority: modalPriority,
            expectedResult: modalExpectedResult.trim() || null,
            status: modalStatus,
            deptWorkItemId: modalDeptWorkItemId || null,
            productItemId: modalProductItemId || null,
            catalogEntryId: modalCatalogEntryId || null,
            dueDate: modalDueDate || null,
            completedDate: modalCompletedDate || null,
          }),
        });
        const json = await res.json();
        if (res.ok) {
          setShowAddModal(false);
          setWorkflowMessage("Đã cập nhật đầu việc thành công!");
          toast.success("Đã cập nhật đầu việc thành công!");
          fetchPlans();
          setTimeout(() => setWorkflowMessage(null), 3000);
        } else {
          toast.error(json.error || "Không thể cập nhật đầu việc");
        }
      } else {
        const res = await fetch("/api/personal-work-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodId: activePlan.period?.id,
            planItemId: activePlan.items?.[0]?.id || undefined,
            templateId: modalTemplateId || undefined,
            deptWorkItemId: modalDeptWorkItemId || undefined,
            productItemId: modalProductItemId || undefined,
            catalogEntryId: modalCatalogEntryId || undefined,
            dueDate: modalDueDate || undefined,
            completedDate: modalCompletedDate || undefined,
            groupId: modalGroupId || undefined,
            title: modalTitle.trim(),
            workDate: modalWorkDate || undefined,
            dateText: modalDateText.trim() || undefined,
            coordinationUnit: modalCoordination.trim() || undefined,
            priority: modalPriority,
            expectedResult: modalExpectedResult.trim() || undefined,
            status: modalStatus,
          }),
        });
        const json = await res.json();
        if (res.ok) {
          setShowAddModal(false);
          setWorkflowMessage("Đã thêm thành công đầu việc vào kế hoạch!");
          toast.success("Đã thêm thành công đầu việc vào kế hoạch!");
          fetchPlans();
          setTimeout(() => setWorkflowMessage(null), 3000);
        } else {
          toast.error(json.error || "Không thể thêm đầu việc vào kế hoạch");
        }
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
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

  // YC-23: tìm kiếm sản phẩm phía máy chủ (không nạp toàn bộ 3.000+ dòng)
  const searchModalProducts = async (q: string, page = 1) => {
    setProductSearch(q);
    setProductPage(page);
    if (q.trim().length < 2) {
      setProductResults([]);
      setProductTotal(0);
      return;
    }
    setProductSearching(true);
    try {
      const res = await fetch(
        `/api/products?search=${encodeURIComponent(q.trim())}&page=${page}&pageSize=8`
      );
      const json = await res.json();
      if (res.ok) {
        setProductResults(json.data || []);
        setProductTotal(json.pagination?.total ?? 0);
      } else {
        toast.error(json.error || "Không thể tìm sản phẩm");
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      setProductSearching(false);
    }
  };

  // YC-25: quản lý danh mục đầu việc bộ phận (Trưởng bộ phận / Lãnh đạo đơn vị)
  const loadDeptManageItems = async (unitId: string) => {
    if (!unitId) return;
    setDeptManageLoading(true);
    try {
      const res = await fetch(`/api/department-work-items?unitId=${unitId}&status=ALL`);
      const json = await res.json();
      if (res.ok) setDeptManageItems(json.data || []);
      else toast.error(json.error || "Không tải được danh mục bộ phận");
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      setDeptManageLoading(false);
    }
  };

  const openDeptCatalogManager = () => {
    const firstUnit = deptCatalogUnits[0]?.id || "";
    setDeptManageUnitId(firstUnit);
    setDeptEditingId(null);
    setDeptFormTitle("");
    setDeptFormDesc("");
    setShowDeptCatalogModal(true);
    loadDeptManageItems(firstUnit);
  };

  const submitDeptForm = async () => {
    if (deptBusy) return;
    if (!deptFormTitle.trim()) {
      toast.warning("Vui lòng nhập tên đầu việc");
      return;
    }
    setDeptBusy(true);
    try {
      const payload: any = {
        title: deptFormTitle.trim(),
        description: deptFormDesc.trim() || null,
      };
      let res: Response;
      if (deptEditingId) {
        res = await fetch("/api/department-work-items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, id: deptEditingId }),
        });
      } else {
        res = await fetch("/api/department-work-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, unitId: deptManageUnitId }),
        });
      }
      const json = await res.json();
      if (res.ok) {
        toast.success(deptEditingId ? "Đã cập nhật đầu việc bộ phận" : "Đã thêm đầu việc vào danh mục bộ phận");
        setDeptEditingId(null);
        setDeptFormTitle("");
        setDeptFormDesc("");
        loadDeptManageItems(deptManageUnitId);
        fetchPlans();
      } else {
        toast.error(json.error || "Không thể lưu đầu việc bộ phận");
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      setDeptBusy(false);
    }
  };

  const toggleDeptItemStatus = async (it: DepartmentWorkItemData) => {
    if (deptBusy) return;
    const nextStatus = it.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setDeptBusy(true);
    try {
      const res = await fetch("/api/department-work-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: it.id, status: nextStatus }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(nextStatus === "INACTIVE" ? "Đã ngừng sử dụng đầu việc" : "Đã kích hoạt lại đầu việc");
        loadDeptManageItems(deptManageUnitId);
        fetchPlans();
      } else {
        toast.error(json.error || "Không thể cập nhật trạng thái");
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      setDeptBusy(false);
    }
  };

  const removeDeptItem = async (it: DepartmentWorkItemData) => {
    if (deptBusy) return;
    if (!confirm(`Xoá (hoặc ngừng sử dụng) đầu việc "${it.title}" khỏi danh mục bộ phận?`)) return;
    setDeptBusy(true);
    try {
      const res = await fetch(`/api/department-work-items?id=${it.id}`, { method: "DELETE" });
      const json = await res.json();
      if (res.ok) {
        toast.success(json.message || "Đã xoá đầu việc bộ phận");
        loadDeptManageItems(deptManageUnitId);
        fetchPlans();
      } else {
        toast.error(json.error || "Không thể xoá đầu việc");
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      setDeptBusy(false);
    }
  };

  // YC-23/YC-25: chọn nguồn đầu việc (mẫu thường xuyên / danh mục bộ phận — hai nguồn loại trừ nhau)
  // và sản phẩm đầu ra theo QĐ1277 (độc lập, có thể gắn kèm bất kỳ đầu việc nào)
  const handleSelectRoutineTemplate = (tplId: string) => {
    if (!tplId) {
      setModalTemplateId("");
      return;
    }
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) return;
    setModalTemplateId(tpl.id);
    setModalDeptWorkItemId("");
    setModalCatalogEntryId("");
    setModalTitle(tpl.title);
    if (tpl.groupId) setModalGroupId(tpl.groupId);
    if (tpl.defaultPriority) setModalPriority(tpl.defaultPriority);
  };

  const handleSelectDeptWorkItem = (deptItemId: string) => {
    setModalDeptWorkItemId(deptItemId);
    if (!deptItemId) return;
    const it = deptWorkItems.find((x) => x.id === deptItemId);
    if (!it) return;
    setModalTemplateId("");
    setModalCatalogEntryId("");
    setModalTitle(it.title);
  };

  // YC-31: chọn đầu việc từ Danh mục TX — nguồn loại trừ với mẫu cũ và danh mục bộ phận
  const handleSelectCatalogEntry = (entryId: string) => {
    setModalCatalogEntryId(entryId);
    if (!entryId) return;
    const entry = txEntries.find((x) => x.id === entryId);
    if (!entry) return;
    setModalDeptWorkItemId("");
    setModalTemplateId("");
    setModalTitle(entry.title);
  };

  const handleSelectProduct = (p: ProductPickerItem | null) => {
    if (!p) {
      setModalProductItemId("");
      setModalProductLabel("");
      return;
    }
    setModalProductItemId(p.id);
    setModalProductLabel(`${p.code} — ${p.taskName}`);
    setModalTitle(p.taskName);
  };

  // Workflow Action (SUBMIT, APPROVE, RETURN, REQUEST_AMENDMENT)
  const handleWorkflowAction = async (
    action: "SUBMIT" | "APPROVE" | "RETURN" | "REQUEST_AMENDMENT" | "EFFECT"
  ) => {
    if (!activePlan || workflowBusy) return;
    setWorkflowBusy(true);

    try {
      const res = await fetch(`/api/plans/${activePlan.id}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reviewNotes:
            action === "RETURN"
              ? returnNotes
              : action === "REQUEST_AMENDMENT"
              ? amendmentNotes
              : undefined,
          unlockToDraft: action === "REQUEST_AMENDMENT" ? unlockToDraft : undefined,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setWorkflowMessage(json.message);
        toast.success(json.message || "Thao tác kế hoạch thành công!");
        setShowReturnModal(false);
        setShowAmendmentModal(false);
        setReturnNotes("");
        setAmendmentNotes("");
        fetchPlans();
        setTimeout(() => setWorkflowMessage(null), 3500);
      } else {
        toast.error(json.error || "Không thể thực hiện thao tác");
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối máy chủ: " + err.message);
    } finally {
      setWorkflowBusy(false);
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
                  {activePlan?.status === "IN_EFFECT"
                    ? `CÓ HIỆU LỰC THI HÀNH${activePlan.approvedAt ? ` — từ ${new Date(activePlan.approvedAt).toLocaleDateString("vi-VN")}` : ""}`
                    : activePlan?.status === "APPROVED"
                    ? `ĐÃ PHÊ DUYỆT (chờ ban hành hiệu lực${activePlan.approvedAt ? ` — ${new Date(activePlan.approvedAt).toLocaleDateString("vi-VN")}` : ""})`
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
                {activePlan ? activePlan.title : "Kế hoạch công tác tuần — Hải quan cửa khẩu Quốc tế Tà Lùng"}
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant flex items-center gap-2">
                <span>Hải quan cửa khẩu Quốc tế Tà Lùng</span>
                <span className="text-outline-variant">•</span>
                <span className="font-body-semibold text-secondary">
                  {activePlan?.unit?.name || "Bộ phận Nghiệp vụ A"} — Ca trực điều hành trọng điểm
                </span>
              </p>
            </div>

            {/* Action Group */}
            <div data-tour="workflow-actions" className="flex flex-wrap items-center gap-space-sm shrink-0">
              <button
                data-testid="add-work-item-btn"
                onClick={() => openAddModal()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-secondary hover:bg-secondary/90 text-on-secondary font-label-md text-label-md font-semibold transition-fast shadow-sm active-press"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                <span>+ Thêm đầu việc mới</span>
              </button>
              <button
                onClick={() => openAddModal()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-surface-subtle hover:bg-surface-container-high text-primary font-label-md text-label-md font-semibold transition-fast active-press"
              >
                <span className="material-symbols-outlined text-[18px] text-secondary">library_books</span>
                <span>Chọn từ mẫu nghiệp vụ</span>
              </button>

              {deptCatalogCanManage && (
                <button
                  type="button"
                  data-testid="open-dept-catalog-manager-toolbar"
                  onClick={openDeptCatalogManager}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-surface-subtle hover:bg-surface-container-high text-primary font-label-md text-label-md font-semibold transition-fast active-press"
                >
                  <span className="material-symbols-outlined text-[18px] text-status-warning">settings_applications</span>
                  <span>Danh mục đầu việc bộ phận (YC-25)</span>
                </button>
              )}

              {activePlan?.status === "DRAFT" || activePlan?.status === "RETURNED" ? (
                currentUser?.role === "DEPARTMENT_LEADER" || currentUser?.role === "UNIT_LEADER" ? (
                  <button
                    onClick={() => handleWorkflowAction("SUBMIT")}
                    disabled={workflowBusy}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-primary text-on-primary font-label-md text-label-md font-semibold hover:bg-primary-container transition-fast active-press shadow-sm disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">send</span>
                    <span>{workflowBusy ? "Đang xử lý..." : "Trình duyệt kế hoạch"}</span>
                  </button>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-surface-subtle text-outline font-label-md text-label-md border border-border-subtle cursor-default"
                    title="Kế hoạch cấp Đội đang dự thảo. Chờ Trưởng bộ phận tổng hợp và trình duyệt."
                  >
                    <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
                    <span>Chờ Trưởng Đội trình duyệt</span>
                  </span>
                )
              ) : activePlan?.status === "SUBMITTED" ? (
                currentUser?.role === "DEPARTMENT_LEADER" || currentUser?.role === "UNIT_LEADER" ? (
                  <>
                    <button
                      onClick={() => handleWorkflowAction("APPROVE")}
                      disabled={workflowBusy}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-status-success text-on-primary font-label-md text-label-md font-semibold hover:opacity-90 transition-fast active-press shadow-sm disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      <span>{workflowBusy ? "Đang xử lý..." : "Phê duyệt kế hoạch"}</span>
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
                  <span
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-surface-subtle text-outline font-label-md text-label-md border border-border-subtle cursor-default"
                    title="Kế hoạch đang chờ lãnh đạo phụ trách phê duyệt."
                  >
                    <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
                    <span>Chờ lãnh đạo phê duyệt</span>
                  </span>
                )
              ) : activePlan?.status === "APPROVED" ? (
                currentUser?.role === "DEPARTMENT_LEADER" || currentUser?.role === "UNIT_LEADER" ? (
                  <button
                    onClick={() => handleWorkflowAction("EFFECT")}
                    disabled={workflowBusy}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-status-success text-on-primary font-label-md text-label-md font-semibold hover:opacity-90 transition-fast active-press shadow-sm disabled:opacity-50"
                    title="Ban hành hiệu lực thi hành cho kế hoạch đã phê duyệt"
                  >
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                    <span>{workflowBusy ? "Đang xử lý..." : "Ban hành hiệu lực"}</span>
                  </button>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-surface-subtle text-outline font-label-md text-label-md border border-border-subtle cursor-default"
                    title="Kế hoạch đã phê duyệt, chờ lãnh đạo ban hành hiệu lực thi hành."
                  >
                    <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
                    <span>Chờ ban hành hiệu lực</span>
                  </span>
                )
              ) : (
                <button
                  onClick={() => setShowAmendmentModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-surface-subtle hover:bg-surface-container-high text-on-surface-variant font-label-md text-label-md transition-fast active-press"
                  title="Đề xuất điều chỉnh bổ sung nhiệm vụ cho kế hoạch đã ban hành"
                >
                  <span className="material-symbols-outlined text-[18px]">approval_delegation</span>
                  <span>Trình duyệt bổ sung</span>
                </button>
              )}

              <a
                data-testid="export-xlsx-btn"
                href={`/api/reports/export?template=legacy&planId=${activePlan?.id || ""}&periodId=${activePlan?.period?.id || ""}${selectedScope === "personal" ? "&scope=personal" : ""}`}
                download
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-surface-subtle hover:bg-surface-container-high text-on-surface-variant font-label-md text-label-md transition-fast active-press"
                title="Xuất dữ liệu Excel chuẩn mẫu báo cáo Hải quan (8 cột A-H)"
              >
                <span className="material-symbols-outlined text-[18px] text-status-success">download</span>
                <span>Xuất .XLSX</span>
              </a>
            </div>
          </div>

          {/* View Mode Switcher + Interactive Filters */}
          <div className="mt-space-lg pt-space-md border-t border-border-default/50 flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
            {/* Tabs lọc theo kỳ thật + Góc nhìn Gantt */}
            <div className="inline-flex p-1 rounded-lg bg-surface-subtle gap-1 text-on-surface-variant">
              {(
                [
                  { key: "day", label: `Kế hoạch Ngày (${countBy("DAY")})` },
                  { key: "week", label: `Kế hoạch Tuần (${countBy("WEEK")})` },
                  { key: "month", label: `Kế hoạch Tháng (${countBy("MONTH")})` },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => switchView(t.key)}
                  className={`px-3.5 py-1.5 rounded font-label-md text-label-md transition-fast ${
                    viewMode === t.key
                      ? "bg-surface-container-lowest text-primary font-body-semibold shadow-sm"
                      : "hover:text-on-surface"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <button
                onClick={() => switchView("gantt")}
                className={`px-3.5 py-1.5 rounded font-label-md text-label-md transition-fast flex items-center gap-1 ${
                  viewMode === "gantt"
                    ? "bg-surface-container-lowest text-primary font-body-semibold shadow-sm"
                    : "hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">view_timeline</span>
                Góc nhìn Gantt
              </button>
            </div>

            {/* Filter Controls Bar */}
            <div className="flex flex-wrap items-center gap-space-sm">
              {/* Scope Switcher: All vs Personal Plan */}
              <div className="inline-flex p-1 rounded-lg bg-surface-container-low border border-border-subtle gap-1">
                <button
                  onClick={() => setSelectedScope("all")}
                  className={`px-3 py-1.5 rounded text-xs font-semibold transition-fast ${
                    selectedScope === "all"
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-on-surface-variant hover:text-primary"
                  }`}
                >
                  Toàn đơn vị
                </button>
                <button
                  onClick={() => setSelectedScope("personal")}
                  className={`px-3 py-1.5 rounded text-xs font-semibold transition-fast flex items-center gap-1 ${
                    selectedScope === "personal"
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-on-surface-variant hover:text-primary"
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">person</span>
                  Kế hoạch cá nhân
                </button>
              </div>

              {filteredPlans.length > 0 && (
                <div className="flex items-center gap-1.5 bg-surface-container-low px-3 py-1.5 rounded text-on-surface border border-border-subtle">
                  <span className="font-label-sm text-label-sm text-outline">Kế hoạch:</span>
                  <select
                    data-testid="plan-select"
                    value={Math.min(selectedPlanIndex, Math.max(0, filteredPlans.length - 1))}
                    onChange={(e) => setSelectedPlanIndex(Number(e.target.value))}
                    className="bg-transparent font-label-md text-label-md font-semibold text-primary focus:outline-none cursor-pointer max-w-[280px] truncate"
                  >
                    {filteredPlans.map((p, idx) => (
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

        {/* Góc nhìn Gantt — timeline nhiệm vụ liên kết của kế hoạch đang chọn (dữ liệu thật) */}
        {viewMode === "gantt" && (
          <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col border border-border-default/50">
            <div className="px-space-lg py-2.5 bg-primary-container text-on-primary text-label-sm font-label-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary-fixed text-[18px]">view_timeline</span>
              <span>
                <strong className="text-white uppercase tracking-wider font-semibold">Gantt:</strong>{" "}
                {activePlan ? `${activePlan.title} — ${ganttData?.tasks.length || 0} nhiệm vụ liên kết` : "Chưa có kế hoạch"}
              </span>
            </div>
            {!ganttData || ganttData.tasks.length === 0 ? (
              <div className="p-8 text-center text-sm text-outline">
                Kế hoạch này chưa liên kết nhiệm vụ nào. Dùng thao tác liên kết nhiệm vụ vào hạng mục để xem trên Gantt.
              </div>
            ) : (
              <div className="overflow-x-auto p-space-md">
                <div className="min-w-[720px]">
                  <div className="flex text-[11px] text-outline font-mono mb-1">
                    <div className="w-64 shrink-0 pr-2">Nhiệm vụ / Chủ trì</div>
                    <div className="flex-1 relative h-5">
                      {Array.from({ length: ganttData.days }).map((_, i) => {
                        const d = new Date(ganttData.start!.getTime() + i * 86400000);
                        return (
                          <span key={i} className="absolute text-center" style={{ left: `${(i / ganttData.days) * 100}%` }}>
                            {d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  {ganttData.tasks.map((t: any) => {
                    const dl = new Date(t.currentDeadline).getTime();
                    const s = ganttData.start!.getTime();
                    const total = Math.max(1, ganttData.end!.getTime() - s);
                    const offsetPct = Math.max(0, ((Math.min(dl, ganttData.end!.getTime()) - s) / total) * 100);
                    const barStartPct = ganttData.periodStart
                      ? Math.max(0, ((ganttData.periodStart.getTime() - s) / total) * 100)
                      : 0;
                    const widthPct = Math.max(2, offsetPct - barStartPct);
                    const done = t.status === "COMPLETED" || t.status === "DONE";
                    const overdue = !done && dl < Date.now();
                    const color = done ? "bg-status-success" : t.status === "WAITING_REVIEW" ? "bg-status-warning" : overdue ? "bg-status-danger" : "bg-secondary";
                    return (
                      <div key={t.id} className="flex items-center py-1.5 border-t border-border-subtle/50">
                        <div className="w-64 shrink-0 pr-2 min-w-0">
                          <div className="text-xs font-semibold text-on-surface truncate" title={t.title}>
                            [{t.code}] {t.title}
                          </div>
                          <div className="text-[11px] text-outline truncate">
                            {t.owner?.fullName || "Chưa phân công"} • Hạn {new Date(t.currentDeadline).toLocaleDateString("vi-VN")}
                          </div>
                        </div>
                        <div className="flex-1 relative h-6 bg-surface-subtle rounded">
                          <div
                            className={`absolute top-1 h-4 rounded ${color}`}
                            style={{ left: `${barStartPct}%`, width: `${widthPct}%` }}
                            title={`${t.title} — Hạn ${new Date(t.currentDeadline).toLocaleDateString("vi-VN")}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex gap-4 mt-2 text-[11px] text-outline">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-secondary inline-block" /> Đang thực hiện</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-status-warning inline-block" /> Chờ nghiệm thu</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-status-success inline-block" /> Hoàn thành</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-status-danger inline-block" /> Quá hạn</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

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

          {/* Warning Banner if there are unassigned items */}
          {activePlan?.items?.some((pi) => !pi.group || !pi.groupId) && (
            <div className="px-space-lg py-2.5 bg-status-warning-bg/60 border-b border-status-warning/30 text-status-warning flex items-center justify-between text-label-sm font-label-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">warning</span>
                <span>
                  <strong>Cảnh báo nghiệp vụ:</strong> Kế hoạch này có nhiệm vụ trọng tâm chưa được phân vào 5 nhóm nghiệp vụ quy chuẩn của Hải quan. Vui lòng xác định nhóm nghiệp vụ trước khi phát hành báo cáo chính thức.
                </span>
              </div>
              <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-status-warning-bg text-status-warning border border-status-warning/40">
                Chưa phân nhóm nghiệp vụ
              </span>
            </div>
          )}

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
                    rawWorkItem?: PersonalWorkItemData;
                    rawTask?: any;
                    dayLabel: string;
                    dateStr: string;
                    deadlineText?: string;
                    isUnassignedGroup?: boolean;
                    groupTitle: string;
                    title: string;
                    code?: string;
                    templateCode?: string;
                    deptWorkItemTitle?: string;
                    productCode?: string;
                    ownerName: string;
                    coordinationUnit: string;
                    priority: string;
                    expectedResult: string;
                    status: string;
                    hasIssue?: boolean;
                  }> = [];

                  activePlan.items.forEach((item) => {
                    item.workItems?.forEach((wi) => {
                      let dayLabel = "Cả tuần";
                      let dateStr = "Thường xuyên";

                      if (wi.workDate) {
                        const d = new Date(wi.workDate);
                        const dayNames = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
                        dayLabel = dayNames[d.getDay()];
                        dateStr = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
                      } else if (wi.dateText) {
                        dayLabel = wi.dateText;
                        dateStr = "";
                      }

                      const isUnassigned = !wi.groupId && !wi.template?.groupId && !item.groupId;
                      const groupName = wi.group?.name || wi.template?.group?.name || item.group?.name || (isUnassigned ? "Chưa phân nhóm nghiệp vụ" : "Thực hiện thủ tục hải quan");

                      allRows.push({
                        id: `wi-${wi.id}`,
                        rawWorkItem: wi,
                        dayLabel,
                        dateStr,
                        isUnassignedGroup: isUnassigned,
                        groupTitle: groupName,
                        title: wi.title,
                        templateCode: wi.template?.code,
                        deptWorkItemTitle: wi.deptWorkItem?.title,
                        productCode: wi.product?.code,
                        ownerName: wi.person?.fullName || "Chưa phân công",
                        coordinationUnit: wi.coordinationUnit || "Nội bộ Chi cục",
                        priority: wi.priority || "Trung bình",
                        expectedResult: wi.expectedResult || "Hoàn thành theo ca trực",
                        status: wi.status || "NOT_STARTED",
                      });
                    });

                    item.taskLinks?.forEach((tl) => {
                      const task = tl.task;
                      const isUnassigned = !item.group;
                      const groupName = item.group?.name || "Chưa phân nhóm nghiệp vụ";
                      const deadlineStr = task.currentDeadline ? new Date(task.currentDeadline).toLocaleDateString("vi-VN") : "";

                      const isPersonal = selectedScope === "personal" && currentUser;
                      const isOwner = task.ownerId === currentUser?.personId || task.owner?.fullName === currentUser?.fullName;
                      const isAssignee = task.assignees?.some(
                        (a: any) => a.personId === currentUser?.personId || a.person?.fullName === currentUser?.fullName
                      );

                      let displayTitle = task.title;
                      let displayOwner = task.owner?.fullName || "Chưa phân công";
                      let displayCoord = activePlan.unit?.name ? `${activePlan.unit.name}, Trạm CK` : "Bộ phận phối hợp";

                      if (isPersonal && currentUser) {
                        if (isOwner) {
                          displayOwner = currentUser.fullName;
                          const others = task.assignees
                            ?.filter((a: any) => a.personId !== currentUser.personId && a.person?.fullName !== currentUser.fullName)
                            .map((a: any) => a.person?.fullName)
                            .filter(Boolean);
                          if (others && others.length > 0) {
                            displayCoord = others.join(", ");
                          }
                        } else if (isAssignee) {
                          displayTitle = `[Phối hợp] ${task.title}`;
                          displayOwner = `${task.owner?.fullName || "Chưa rõ"} (Chủ trì)`;
                          displayCoord = `Phối hợp: ${currentUser.fullName}`;
                        }
                      }

                      allRows.push({
                        id: `tl-${tl.task.id}`,
                        rawTask: task,
                        dayLabel: "Trong tuần",
                        dateStr: "",
                        deadlineText: deadlineStr,
                        isUnassignedGroup: isUnassigned,
                        groupTitle: groupName,
                        title: displayTitle,
                        code: task.code,
                        ownerName: displayOwner,
                        coordinationUnit: displayCoord,
                        priority: task.priority === "HIGH" ? "Cao" : task.priority === "LOW" ? "Thấp" : "Trung bình",
                        expectedResult: task.expectedResultText || "Đạt yêu cầu quy trình nghiệp vụ",
                        status: task.status,
                        hasIssue: task.hasIssue,
                      });
                    });
                  });

                  const filteredRows = allRows.filter((r) => {
                    if (selectedScope === "personal" && currentUser) {
                      if (r.rawWorkItem) {
                        const isPersonalItem =
                          r.rawWorkItem.person?.id === currentUser.personId ||
                          r.ownerName === currentUser.fullName;
                        if (!isPersonalItem) return false;
                      } else if (r.rawTask) {
                        const isOwner =
                          r.rawTask.ownerId === currentUser.personId ||
                          r.rawTask.owner?.fullName === currentUser.fullName;
                        const isAssignee = r.rawTask.assignees?.some(
                          (a: any) => a.personId === currentUser.personId || a.person?.fullName === currentUser.fullName
                        );
                        if (!isOwner && !isAssignee) return false;
                      } else if (r.ownerName !== currentUser.fullName) {
                        return false;
                      }
                    }
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
                        {row.dateStr && <div className="font-label-sm text-label-sm text-outline">{row.dateStr}</div>}
                      </td>
                      <td className="py-4 px-space-md align-top">
                        {row.isUnassignedGroup ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-status-warning-bg text-status-warning border border-status-warning/40">
                            <span className="material-symbols-outlined text-[13px]">help_outline</span>
                            Chưa phân nhóm nghiệp vụ
                          </span>
                        ) : (
                          <span className="font-body-semibold text-primary block">{row.groupTitle}</span>
                        )}
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
                            {row.deptWorkItemTitle && (
                              <span className="px-2 py-0.5 rounded text-[11px] bg-surface-container-high text-primary font-semibold border border-border-subtle">
                                BỘ PHẬN: {row.deptWorkItemTitle}
                              </span>
                            )}
                            {row.productCode && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-secondary/15 text-secondary font-semibold">
                                SP: {row.productCode}
                              </span>
                            )}
                            {row.deadlineText && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-surface-container-high text-primary font-semibold border border-border-subtle">
                                Hạn hoàn thành: {row.deadlineText}
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
                              : row.status === "NOT_STARTED"
                              ? "bg-surface-container text-outline"
                              : row.hasIssue
                              ? "bg-status-danger-bg text-status-danger"
                              : "bg-status-warning-bg text-status-warning"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {row.status === "COMPLETED"
                              ? "check_circle"
                              : row.status === "NOT_STARTED"
                              ? "schedule"
                              : row.hasIssue
                              ? "warning"
                              : "hourglass_top"}
                          </span>
                          <span>
                            {row.status === "COMPLETED"
                              ? "Đã hoàn thành"
                              : row.status === "NOT_STARTED"
                              ? "Chưa thực hiện"
                              : row.hasIssue
                              ? "Vướng mắc"
                              : "Đang thực hiện"}
                          </span>
                        </span>
                      </td>
                      <td className="py-4 px-space-md align-top text-center">
                        <div className="flex items-center justify-center gap-1">
                          {row.rawWorkItem && (
                            <button
                              onClick={() => openEditModal(row.rawWorkItem!)}
                              className="p-1 rounded hover:bg-surface-container text-outline hover:text-primary transition-colors inline-block"
                              title="Chỉnh sửa đầu việc"
                            >
                              <span className="material-symbols-outlined text-[18px]">edit</span>
                            </button>
                          )}
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
              {mobileLabels.weekShort} (Hiện tại)
            </button>
            <button
              onClick={() => setMobilePeriod("month")}
              className={`flex-1 py-1.5 rounded-lg font-label-md text-label-md text-center transition-fast ${
                mobilePeriod === "month"
                  ? "bg-surface-container-lowest text-primary shadow-sm font-semibold"
                  : "text-on-surface-variant"
              }`}
            >
              {mobileLabels.monthShort}
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
                <span className="font-headline-sm text-headline-sm">
                  {activePlan?.period
                    ? `${activePlan.period.title || activePlan.period.name || "Kế hoạch tuần"}${
                        activePlan.period.startAt && activePlan.period.endAt
                          ? ` (${formatPeriodRangeFromDates(new Date(activePlan.period.startAt), new Date(activePlan.period.endAt))})`
                          : ""
                      }`
                    : "Kế hoạch tuần"}
                </span>
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant">Kỳ công tác theo kế hoạch</span>
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
                  <span className="font-body-semibold text-primary">{activePlan?.unit?.name || "Hải quan cửa khẩu Quốc tế Tà Lùng"}</span>
                  <span className="text-xs text-on-surface-variant">{activePlan?.title || "Kế hoạch tuần"}</span>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                activePlan?.status === "APPROVED" || activePlan?.status === "IN_EFFECT"
                  ? "bg-status-success-bg text-status-success"
                  : activePlan?.status === "SUBMITTED"
                  ? "bg-status-warning-bg text-status-warning"
                  : "bg-surface-container text-outline"
              }`}>
                {activePlan?.status === "IN_EFFECT"
                  ? "CÓ HIỆU LỰC"
                  : activePlan?.status === "APPROVED"
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
              data-testid="add-work-item-btn-mobile"
              onClick={() => openAddModal()}
              className="w-full h-11 bg-secondary text-on-secondary rounded-lg font-body-semibold text-body-semibold flex items-center justify-center gap-2 shadow-sm hover:opacity-95 active:scale-[0.99] transition-all active-press"
            >
              <span className="material-symbols-outlined text-[20px]">add_task</span>
              <span>+ Thêm đầu việc công tác</span>
            </button>
            {/* Secondary Quick Triggers */}
            <div className="grid grid-cols-2 gap-space-sm">
              <button
                onClick={() => openAddModal()}
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
            {deptCatalogCanManage && (
              <button
                type="button"
                data-testid="open-dept-catalog-manager-toolbar-mobile"
                onClick={openDeptCatalogManager}
                className="w-full h-10 px-space-sm bg-surface-container-lowest text-primary rounded-lg font-label-md text-label-md flex items-center justify-center gap-1.5 shadow-sm hover:bg-surface-subtle transition-colors active-press"
              >
                <span className="material-symbols-outlined text-[18px] text-status-warning">settings_applications</span>
                <span className="truncate">Danh mục đầu việc bộ phận (YC-25)</span>
              </button>
            )}
          </div>
        </section>

        {/* ACCORDION SECTIONS */}
        <section data-tour="plan-items" className="px-margin mt-space-md flex flex-col gap-3">
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
                                  {wi.template ? `[${wi.template.code}]` : wi.deptWorkItem ? "[BỘ PHẬN]" : "ĐẦU VIỆC"}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-secondary/15 text-secondary text-xs font-bold">
                                  {wi.person?.fullName || "Chưa giao"}
                                </span>
                              </div>
                              <h4 className="font-body-semibold text-sm text-primary">
                                {wi.title}
                              </h4>
                              {(wi.deptWorkItem || wi.product) && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {wi.deptWorkItem && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-surface-container-high text-primary border border-border-subtle">
                                      {wi.deptWorkItem.title}
                                    </span>
                                  )}
                                  {wi.product && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-secondary/15 text-secondary font-mono">
                                      SP: {wi.product.code}
                                    </span>
                                  )}
                                </div>
                              )}
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
          MODAL: THÊM / CHỈNH SỬA ĐẦU VIỆC KẾ HOẠCH (Chuẩn hóa 8 Cột Excel A-H)
          ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-4xl bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-default transition-panel">
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary-fixed text-[22px]">
                  {editingItem ? "edit_note" : "post_add"}
                </span>
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-white">
                    {editingItem ? "Chỉnh Sửa Đầu Việc Kế Hoạch" : "Thêm Đầu Việc Vào Kế Hoạch"}
                  </h3>
                  <p className="text-xs text-on-primary-container">
                    {activePlan?.title || "Kế hoạch công tác"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-on-primary-container hover:text-white transition-fast"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveWorkItem}>
              <div className="p-space-md flex flex-col gap-space-md max-h-[75vh] overflow-y-auto">
                {/* 1. YC-23 + YC-25: Khu vực chọn đầu việc từ danh mục — mỗi nguồn một cột riêng */}
                <div
                  data-testid="catalog-picker"
                  className="rounded-xl border border-border-subtle bg-surface-subtle/50 p-3 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-label-md text-label-md text-primary font-semibold flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px] text-secondary">library_books</span>
                      Chọn từ danh mục — tối đa một nguồn đầu việc, không bắt buộc
                    </span>
                    <span className="text-[11px] text-outline">Nguồn: Danh mục TX · bộ phận · 48 mẫu cũ · sản phẩm QĐ1277 gắn kèm</span>
                  </div>

                  {/* YC-31 — Danh mục công việc thường xuyên (phiên bản đang áp dụng) */}
                  {txEntries.length > 0 ? (
                    <div className="flex flex-col gap-1" data-testid="modal-tx-picker">
                      <label className="text-xs font-semibold text-primary flex items-center justify-between gap-2">
                        <span>① Công việc thường xuyên — Danh mục TX</span>
                        <span className="text-[11px] text-outline font-normal">
                          {txEntries.filter((e) => e.status === "ACTIVE").length} đầu việc đang áp dụng
                        </span>
                      </label>
                      <select
                        data-testid="modal-tx-item-select"
                        value={modalCatalogEntryId}
                        onChange={(e) => handleSelectCatalogEntry(e.target.value)}
                        className="h-10 px-3 rounded bg-surface-container-lowest text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                      >
                        <option value="">-- Không chọn từ Danh mục TX --</option>
                        {modalCatalogEntryId &&
                          !txEntries.some((e) => e.id === modalCatalogEntryId) &&
                          editingItem?.catalogEntry && (
                            <option value={modalCatalogEntryId}>
                              {editingItem.catalogEntry.title} (đã ngừng — giữ liên kết cũ)
                            </option>
                          )}
                        {txDepartments.map((d) => {
                          const items = txEntries.filter(
                            (e) => e.department === d.name && e.status === "ACTIVE"
                          );
                          if (items.length === 0) return null;
                          return (
                            <optgroup key={d.name} label={`${d.name} (${items.length})`}>
                              {items.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.title} — {e.code}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                      {modalCatalogEntryId &&
                        (() => {
                          const selected = txEntries.find((e) => e.id === modalCatalogEntryId);
                          return selected ? (
                            <span className="text-[11px] text-emerald-700">
                              Đã chọn: [{selected.department}] {selected.title} · Mã {selected.code}
                            </span>
                          ) : null;
                        })()}
                      <span className="text-[11px] text-outline">
                        Danh mục TX độc lập với 48 mẫu cũ và không tự gắn sản phẩm QĐ1277 — có thể gắn sản phẩm ở Cột B nếu cần.
                      </span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-outline rounded border border-dashed border-border-subtle p-2.5">
                      {catalogActivationStatus === "NO_VERSION"
                        ? "Chưa có Danh mục TX đang áp dụng — tiếp tục dùng danh mục bộ phận hoặc 48 mẫu cũ bên dưới."
                        : "Bộ phận của bạn chưa được kích hoạt Danh mục TX — vẫn dùng danh mục bộ phận hoặc 48 mẫu cũ bên dưới."}
                    </div>
                  )}

                  {!legacyTemplatesSelectable && !modalTemplateId && (
                    <div className="text-[11px] text-status-warning flex items-start gap-1">
                      <span className="material-symbols-outlined text-[14px]">info</span>
                      <span>
                        Bộ phận của bạn đã chuyển sang Danh mục TX — 48 mẫu cũ không còn cho chọn khi tạo đầu việc mới.
                        Đầu việc lịch sử vẫn giữ nguyên liên kết và hiển thị đầy đủ.
                      </span>
                    </div>
                  )}

                  {/* YC-25 — đầu việc riêng của bộ phận (tách biệt 48 mẫu và danh mục sản phẩm) */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-primary flex items-center justify-between gap-2">
                      <span>
                        ② Đầu việc riêng của bộ phận
                        {deptCatalogUnits.length === 1 ? ` — ${deptCatalogUnits[0].name}` : ""}
                      </span>
                      {deptCatalogCanManage && (
                        <button
                          type="button"
                          data-testid="open-dept-catalog-manager"
                          onClick={openDeptCatalogManager}
                          className="text-[11px] font-semibold text-secondary flex items-center gap-0.5 hover:underline"
                        >
                          <span className="material-symbols-outlined text-[14px]">settings</span>
                          Quản lý danh mục bộ phận
                        </button>
                      )}
                    </label>
                    <select
                      data-testid="modal-dept-item-select"
                      value={modalDeptWorkItemId}
                      onChange={(e) => handleSelectDeptWorkItem(e.target.value)}
                      className="h-10 px-3 rounded bg-surface-container-lowest text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    >
                      <option value="">-- Không chọn từ danh mục bộ phận --</option>
                      {modalDeptWorkItemId &&
                        !deptWorkItems.some((x) => x.id === modalDeptWorkItemId) &&
                        editingItem?.deptWorkItem && (
                          <option value={modalDeptWorkItemId}>
                            {editingItem.deptWorkItem.title} (đã ngừng sử dụng — giữ liên kết cũ)
                          </option>
                        )}
                      {deptWorkItems.map((it) => (
                        <option key={it.id} value={it.id}>
                          {deptCatalogUnits.length > 1 && it.unit ? `[${it.unit.name}] ` : ""}
                          {it.title}
                        </option>
                      ))}
                    </select>
                    {deptWorkItems.length === 0 && (
                      <span className="text-[11px] text-outline">
                        Bộ phận chưa có danh mục riêng — có thể chọn từ Cột A hoặc Cột B bên dưới, hoặc tự nhập tên đầu việc.
                      </span>
                    )}
                  </div>

                  {/* Hai cột song song: A — thường xuyên; B — sản phẩm theo quyết định (xếp dọc trên mobile) */}
                  <div className={`grid grid-cols-1 ${!legacyTemplatesSelectable && !modalTemplateId ? "" : "lg:grid-cols-2"} gap-3`}>
                    {/* Cột A — công việc thường xuyên (48 mẫu) */}
                    <div
                      data-testid="picker-col-routine"
                      className={`${!legacyTemplatesSelectable && !modalTemplateId ? "hidden" : "flex"} rounded-lg border border-border-default bg-surface-container-lowest flex-col min-w-0`}
                    >
                      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-primary uppercase tracking-wide">
                          Cột A · Công việc thường xuyên (48 mẫu)
                        </span>
                        {modalTemplateId && (
                          <button
                            type="button"
                            onClick={() => setModalTemplateId("")}
                            className="text-[11px] text-status-danger font-semibold shrink-0"
                          >
                            Bỏ chọn
                          </button>
                        )}
                      </div>
                      {/* Tương thích công cụ kiểm thử cũ: dropdown đồng bộ cùng trạng thái */}
                      <select
                        data-testid="modal-template-select"
                        value={modalTemplateId}
                        onChange={(e) => handleSelectRoutineTemplate(e.target.value)}
                        className="sr-only"
                        aria-hidden="true"
                        tabIndex={-1}
                      >
                        <option value="">-- Tự nhập đầu việc ngoài danh mục mẫu --</option>
                        {templates
                          .filter((tpl) => tpl.reviewStatus !== "RETIRED")
                          .map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>
                              [{tpl.code}] {tpl.title}
                            </option>
                          ))}
                      </select>
                      <div className="p-2 border-b border-border-subtle">
                        <input
                          data-testid="picker-col-routine-search"
                          value={templateSearch}
                          onChange={(e) => setTemplateSearch(e.target.value)}
                          placeholder="Tìm nhanh theo mã hoặc tên mẫu..."
                          className="w-full h-8 px-2 rounded bg-surface-container-low text-xs border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                        />
                      </div>
                      <div className="max-h-52 overflow-y-auto flex flex-col">
                        {filteredTemplates.length === 0 ? (
                          <span className="p-3 text-xs text-outline">Không có mẫu phù hợp.</span>
                        ) : (
                          filteredTemplates.map((tpl) => {
                            const active = modalTemplateId === tpl.id;
                            return (
                              <button
                                type="button"
                                key={tpl.id}
                                data-testid={`picker-tpl-${tpl.code}`}
                                onClick={() => {
                                  if (active) {
                                    setModalTemplateId("");
                                    return;
                                  }
                                  handleSelectRoutineTemplate(tpl.id);
                                }}
                                className={`text-left px-3 py-2 border-b border-border-subtle/60 flex flex-col gap-0.5 transition-colors ${
                                  active
                                    ? "bg-secondary/10 border-l-2 border-l-secondary"
                                    : "hover:bg-surface-container-low"
                                }`}
                              >
                                <span className="text-xs font-semibold text-primary">
                                  [{tpl.code}] {tpl.title}
                                </span>
                                <span className="text-[10px] text-outline">
                                  {groups.find((g) => g.id === tpl.groupId)?.name || ""}
                                  {tpl.defaultPriority ? ` · Ưu tiên: ${tpl.defaultPriority}` : ""}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Cột B — danh mục sản phẩm theo quyết định (tìm phía máy chủ, phân trang) */}
                    <div
                      data-testid="picker-col-product"
                      className="rounded-lg border border-border-default bg-surface-container-lowest flex flex-col min-w-0"
                    >
                      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-primary uppercase tracking-wide">
                          Cột B · Danh mục sản phẩm theo QĐ
                        </span>
                        {modalProductItemId && (
                          <button
                            type="button"
                            onClick={() => handleSelectProduct(null)}
                            className="text-[11px] text-status-danger font-semibold shrink-0"
                          >
                            Bỏ chọn
                          </button>
                        )}
                      </div>
                      <div className="p-2 border-b border-border-subtle">
                        <input
                          data-testid="picker-col-product-search"
                          value={productSearch}
                          onChange={(e) => searchModalProducts(e.target.value, 1)}
                          placeholder="Tìm theo nhiệm vụ / sản phẩm / mã SP (từ 2 ký tự)..."
                          className="w-full h-8 px-2 rounded bg-surface-container-low text-xs border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                        />
                      </div>
                      {modalProductItemId && modalProductLabel && (
                        <div className="px-3 py-1.5 bg-secondary/10 text-[11px] font-semibold text-secondary truncate">
                          Đã chọn: {modalProductLabel}
                        </div>
                      )}
                      <div className="max-h-44 overflow-y-auto flex flex-col">
                        {productSearching ? (
                          <span className="p-3 text-xs text-outline">Đang tìm...</span>
                        ) : productResults.length === 0 ? (
                          <span className="p-3 text-xs text-outline">
                            {productSearch.trim().length < 2
                              ? "Nhập từ 2 ký tự để tìm trong hơn 3.000 sản phẩm (tìm phía máy chủ)."
                              : "Không tìm thấy sản phẩm phù hợp."}
                          </span>
                        ) : (
                          productResults.map((p) => {
                            const active = modalProductItemId === p.id;
                            return (
                              <button
                                type="button"
                                key={p.id}
                                data-testid={`picker-product-${p.code}`}
                                onClick={() => {
                                  if (active) {
                                    handleSelectProduct(null);
                                    return;
                                  }
                                  handleSelectProduct(p);
                                }}
                                className={`text-left px-3 py-2 border-b border-border-subtle/60 flex flex-col gap-0.5 transition-colors ${
                                  active
                                    ? "bg-secondary/10 border-l-2 border-l-secondary"
                                    : "hover:bg-surface-container-low"
                                }`}
                              >
                                <span className="text-xs font-semibold text-primary">{p.taskName}</span>
                                <span className="text-[10px] text-outline font-mono">
                                  {p.code}
                                  {typeof p.convertFactor === "number" ? ` · Hệ số: ${p.convertFactor}` : " · Chưa rõ hệ số"}
                                  {p.groupName ? ` · ${p.groupName}` : ""}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                      {productTotal > 8 && (
                        <div className="px-3 py-2 border-t border-border-subtle flex items-center justify-between text-[11px] text-outline">
                          <span>
                            Trang {productPage}/{Math.ceil(productTotal / 8)} · {productTotal} kết quả
                          </span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={productPage <= 1}
                              onClick={() => searchModalProducts(productSearch, productPage - 1)}
                              className="px-2 py-0.5 rounded border border-border-subtle disabled:opacity-40"
                            >
                              Trước
                            </button>
                            <button
                              type="button"
                              disabled={productPage >= Math.ceil(productTotal / 8)}
                              onClick={() => searchModalProducts(productSearch, productPage + 1)}
                              className="px-2 py-0.5 rounded border border-border-subtle disabled:opacity-40"
                            >
                              Sau
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {deptCatalogMsg && (
                    <div className="text-[11px] text-status-warning flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">info</span>
                      {deptCatalogMsg}
                    </div>
                  )}
                </div>

                {/* 2. Tên đầu việc cụ thể (Cột C) */}
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Cột C: Tên đầu việc cụ thể *
                  </label>
                  <textarea
                    data-testid="modal-title-input"
                    rows={2}
                    required
                    value={modalTitle}
                    onChange={(e) => setModalTitle(e.target.value)}
                    placeholder="Nhập tên nhiệm vụ trong kỳ kế hoạch..."
                    className="p-2.5 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
                  />
                </div>

                {/* 3. Nhóm nhiệm vụ thường xuyên (Cột B) */}
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Cột B: Nhóm nhiệm vụ thường xuyên (1 trong 5 nhóm Excel gốc) *
                  </label>
                  <select
                    data-testid="modal-group-select"
                    required
                    value={modalGroupId}
                    onChange={(e) => setModalGroupId(e.target.value)}
                    className="h-10 px-3 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        [{g.code}] {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Thứ / Ngày (Cột A) & Mức ưu tiên (Cột F) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-primary font-semibold">
                      Cột A: Thứ / Ngày thực hiện
                    </label>
                    <select
                      data-testid="modal-workdate-select"
                      value={modalWorkDate}
                      onChange={(e) => setModalWorkDate(e.target.value)}
                      className="h-10 px-3 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    >
                      <option value="">Cả tuần / Thực hiện thường xuyên</option>
                      {weekDaysOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-primary font-semibold">
                      Cột F: Mức độ ưu tiên
                    </label>
                    <select
                      data-testid="modal-priority-select"
                      value={modalPriority}
                      onChange={(e) => setModalPriority(e.target.value)}
                      className="h-10 px-3 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    >
                      <option value="Cao">Cao (Khẩn cấp / Trọng điểm)</option>
                      <option value="Trung bình">Trung bình (Thường quy)</option>
                      <option value="Thấp">Thấp</option>
                    </select>
                  </div>
                </div>

                {/* YC-32: Hạn xử lý và ngày hoàn thành thực tế — hai mốc tách biệt */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-primary font-semibold">
                      Hạn xử lý
                    </label>
                    <input
                      data-testid="modal-due-date"
                      type="date"
                      value={modalDueDate}
                      onChange={(e) => setModalDueDate(e.target.value)}
                      className="h-10 px-3 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    />
                    <span className="text-[10px] text-outline">
                      Mốc cam kết xử lý — độc lập với ngày hoàn thành thực tế.
                    </span>
                  </div>

                  {editingItem ? (
                    <div className="flex flex-col gap-1">
                      <label className="font-label-md text-label-md text-primary font-semibold">
                        Ngày hoàn thành thực tế
                      </label>
                      <input
                        data-testid="modal-completed-date"
                        type="date"
                        value={modalCompletedDate}
                        onChange={(e) => setModalCompletedDate(e.target.value)}
                        className="h-10 px-3 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                      />
                      <span className="text-[10px] text-outline">
                        Để trống nếu chưa hoàn thành; nhập ngày sẽ chuyển trạng thái sang “Đã hoàn thành”.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center text-[11px] text-outline rounded border border-dashed border-border-subtle p-2.5">
                      Ngày hoàn thành thực tế được ghi nhận khi thực hiện tại mục “Việc của tôi”, tách biệt với hạn
                      xử lý.
                    </div>
                  )}
                </div>

                {/* 5. Đơn vị phối hợp (Cột E) & Tiến độ / Trạng thái (Cột H) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-primary font-semibold">
                      Cột E: Đơn vị phối hợp
                    </label>
                    <input
                      data-testid="modal-coordination-input"
                      type="text"
                      value={modalCoordination}
                      onChange={(e) => setModalCoordination(e.target.value)}
                      placeholder="VD: Doanh nghiệp XNK, Trạm BP..."
                      className="h-10 px-3 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-label-md text-primary font-semibold">
                      Cột H: Tiến độ / Trạng thái
                    </label>
                    <select
                      data-testid="modal-status-select"
                      value={modalStatus}
                      onChange={(e) => setModalStatus(e.target.value)}
                      className="h-10 px-3 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                    >
                      <option value="NOT_STARTED">Chưa thực hiện</option>
                      <option value="IN_PROGRESS">Đang thực hiện</option>
                      <option value="COMPLETED">Đã hoàn thành</option>
                    </select>
                  </div>
                </div>

                {/* 6. Kết quả dự kiến (Cột G) */}
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Cột G: Kết quả dự kiến (Chỉ tiêu định tính / định lượng)
                  </label>
                  <input
                    data-testid="modal-expected-result-input"
                    type="text"
                    value={modalExpectedResult}
                    onChange={(e) => setModalExpectedResult(e.target.value)}
                    placeholder="VD: 100% hồ sơ thông quan đúng quy trình, theo dõi 100% seal GPS..."
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
                  data-testid="modal-submit-btn"
                  type="submit"
                  className="px-4 py-2 rounded bg-secondary text-on-secondary font-label-md text-label-md font-semibold hover:opacity-90 shadow-sm transition-fast active-press flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">save</span>
                  <span>{editingItem ? "Lưu thay đổi" : "Lưu vào kế hoạch"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: QUẢN LÝ DANH MỤC ĐẦU VIỆC RIÊNG CỦA BỘ PHẬN (YC-25)
          ========================================================================= */}
      {showDeptCatalogModal && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-2xl bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-default transition-panel">
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-white">
                  Quản Lý Danh Mục Đầu Việc Bộ Phận
                </h3>
                <p className="text-xs text-on-primary-container">
                  YC-25 — tách biệt với 48 mẫu thường xuyên và danh mục sản phẩm QĐ1277
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeptCatalogModal(false)}
                className="text-on-primary-container hover:text-white transition-fast"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="p-space-md flex flex-col gap-space-sm max-h-[70vh] overflow-y-auto">
              {deptCatalogUnits.length > 1 && (
                <label className="text-xs font-semibold text-primary flex flex-col gap-1">
                  Bộ phận
                  <select
                    data-testid="dept-manager-unit-select"
                    value={deptManageUnitId}
                    onChange={(e) => {
                      setDeptManageUnitId(e.target.value);
                      setDeptEditingId(null);
                      setDeptFormTitle("");
                      setDeptFormDesc("");
                      loadDeptManageItems(e.target.value);
                    }}
                    className="h-10 px-3 rounded bg-surface-container-low text-body-md border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                  >
                    {deptCatalogUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        [{u.code}] {u.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* Form thêm / sửa đầu việc */}
              <div className="rounded-lg border border-border-default p-3 flex flex-col gap-2 bg-surface-subtle/50">
                <span className="text-xs font-bold text-primary">
                  {deptEditingId ? "Sửa đầu việc đang chọn" : "Thêm đầu việc mới vào danh mục bộ phận"}
                </span>
                <input
                  data-testid="dept-form-title"
                  value={deptFormTitle}
                  onChange={(e) => setDeptFormTitle(e.target.value)}
                  placeholder="Tên đầu việc * (VD: Kiểm tra niêm phong GPS ca đêm)"
                  className="h-9 px-3 rounded bg-surface-container-lowest text-sm border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                />
                <input
                  data-testid="dept-form-desc"
                  value={deptFormDesc}
                  onChange={(e) => setDeptFormDesc(e.target.value)}
                  placeholder="Mô tả ngắn (tuỳ chọn)"
                  className="h-9 px-3 rounded bg-surface-container-lowest text-sm border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                />
                <div className="flex justify-end gap-2">
                  {deptEditingId && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeptEditingId(null);
                        setDeptFormTitle("");
                        setDeptFormDesc("");
                      }}
                      className="px-3 py-1.5 rounded text-xs border border-border-subtle hover:bg-surface-container"
                    >
                      Huỷ sửa
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="dept-form-submit"
                    disabled={deptBusy}
                    onClick={submitDeptForm}
                    className="px-3 py-1.5 rounded bg-secondary text-on-secondary text-xs font-semibold disabled:opacity-50 active-press"
                  >
                    {deptEditingId ? "Lưu thay đổi" : "Thêm vào danh mục"}
                  </button>
                </div>
              </div>

              {/* Danh sách đầu việc của bộ phận */}
              {deptManageLoading ? (
                <span className="text-xs text-outline py-2">Đang tải danh mục...</span>
              ) : deptManageItems.length === 0 ? (
                <span className="text-xs text-outline py-2">
                  Bộ phận này chưa có đầu việc nào trong danh mục riêng.
                </span>
              ) : (
                <div className="flex flex-col divide-y divide-border-subtle border border-border-default rounded-lg overflow-hidden">
                  {deptManageItems.map((it) => (
                    <div key={it.id} className="p-3 flex items-center justify-between gap-2" data-testid={`dept-manage-row-${it.id}`}>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-primary truncate">{it.title}</span>
                        <span className="text-[11px] text-outline truncate">
                          {it.description ? `${it.description} · ` : ""}
                          {it.status === "ACTIVE" ? "Đang sử dụng" : "Đã ngừng sử dụng"} · Đã dùng trong {it.usageCount ?? 0} đầu việc kế hoạch
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          title="Sửa"
                          onClick={() => {
                            setDeptEditingId(it.id);
                            setDeptFormTitle(it.title);
                            setDeptFormDesc(it.description || "");
                          }}
                          className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center active-press"
                        >
                          <span className="material-symbols-outlined text-[16px] text-secondary">edit</span>
                        </button>
                        <button
                          type="button"
                          title={it.status === "ACTIVE" ? "Ngừng sử dụng" : "Kích hoạt lại"}
                          onClick={() => toggleDeptItemStatus(it)}
                          className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center active-press"
                        >
                          <span className="material-symbols-outlined text-[16px] text-status-warning">
                            {it.status === "ACTIVE" ? "block" : "restart_alt"}
                          </span>
                        </button>
                        <button
                          type="button"
                          title="Xoá / ngừng sử dụng"
                          onClick={() => removeDeptItem(it)}
                          className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center active-press"
                        >
                          <span className="material-symbols-outlined text-[16px] text-status-danger">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                disabled={workflowBusy}
                className="px-4 py-2 rounded bg-status-danger text-on-error text-xs font-semibold disabled:opacity-50"
              >
                {workflowBusy ? "Đang xử lý..." : "Xác nhận trả lại"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TRÌNH DUYỆT BỔ SUNG / ĐIỀU CHỈNH */}
      {showAmendmentModal && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-default transition-panel">
            <div className="p-space-md bg-secondary text-on-secondary flex items-center justify-between">
              <span className="font-headline-sm font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">approval_delegation</span>
                Trình Duyệt Bổ Sung / Điều Chỉnh
              </span>
              <button onClick={() => setShowAmendmentModal(false)} className="hover:opacity-80">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="p-space-md flex flex-col gap-space-sm">
              <p className="font-label-sm text-xs text-on-surface-variant">
                Kế hoạch hiện tại đã có hiệu lực. Bạn có thể mở khóa kế hoạch về trạng thái Dự thảo để cập nhật bổ sung nhiệm vụ mới hoặc trình Lãnh đạo thẩm định lại.
              </p>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={unlockToDraft}
                  onChange={(e) => setUnlockToDraft(e.target.checked)}
                  className="rounded text-secondary"
                />
                <span className="font-label-md text-xs font-semibold text-primary">
                  Mở khóa kế hoạch về Dự thảo (Cho phép thêm / sửa nhiệm vụ)
                </span>
              </label>

              <div className="flex flex-col gap-1 pt-1">
                <label className="text-xs font-semibold text-primary">Lý do / Căn cứ điều chỉnh bổ sung *</label>
                <textarea
                  rows={3}
                  required
                  value={amendmentNotes}
                  onChange={(e) => setAmendmentNotes(e.target.value)}
                  placeholder="Nhập tên hạng mục bổ sung, số văn bản liên quan..."
                  className="w-full p-2.5 rounded bg-surface-container-low text-sm border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
                />
              </div>
            </div>
            <div className="p-space-md bg-surface-subtle flex items-center justify-end gap-2 border-t border-border-default">
              <button
                onClick={() => setShowAmendmentModal(false)}
                className="px-4 py-2 rounded bg-surface-container-lowest text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                onClick={() => handleWorkflowAction("REQUEST_AMENDMENT")}
                disabled={workflowBusy}
                className="px-4 py-2 rounded bg-secondary text-on-secondary text-xs font-semibold hover:bg-secondary/90 transition-fast disabled:opacity-50"
              >
                {workflowBusy ? "Đang xử lý..." : "Xác nhận đề xuất"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
