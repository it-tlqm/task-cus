"use client";

import { V5Icon } from "@/components/v5/ui/icon";
import { FilterChip } from "@/components/v5/ui/filter-bar";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/Toast";
import WorkSourcePicker, { type PickedCatalogEntry, type PickedProduct } from "@/components/work/WorkSourcePicker";
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

interface PlanOptions {
  canCreatePlan: boolean;
  currentUnitId: string | null;
  units: Array<{ id: string; code: string; name: string; parentId?: string | null }>;
  groups: Array<{ id: string; code: string; name: string }>;
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
  // V3.0.2: nhiều sản phẩm QĐ1277 trên cùng một đầu việc (độc lập với nguồn TX).
  linkedProducts?: Array<{
    id: string;
    productItemId: string;
    isPrimary: boolean;
    reviewState?: string | null;
    quantityUnit?: string | null;
    factorSnapshot?: number | null;
    productItem: {
      id: string;
      code: string;
      taskName: string;
      outputProduct?: string | null;
      convertFactor?: number | null;
      groupName?: string | null;
      group?: { code?: string | null; title?: string | null } | null;
    };
  }>;
  reviewState?: string | null;
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

interface PlanItem {
  id: string;
  title: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED" | "IN_EFFECT";
  creatorId?: string;
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
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [planOptions, setPlanOptions] = useState<PlanOptions | null>(null);
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

  // ID kế hoạch ổn định — không dùng index (danh sách đổi thứ tự sau mỗi lần tải lại).
  const activePlan = React.useMemo(
    () => filteredPlans.find((p) => p.id === selectedPlanId) || filteredPlans[0] || null,
    [filteredPlans, selectedPlanId]
  );

  useEffect(() => {
    if (filteredPlans.length === 0) {
      if (selectedPlanId) setSelectedPlanId("");
      return;
    }
    if (!selectedPlanId || !filteredPlans.some((p) => p.id === selectedPlanId)) {
      setSelectedPlanId(filteredPlans[0].id);
    }
  }, [filteredPlans, selectedPlanId]);

  const clearWorkItemFilters = () => {
    setSelectedOfficerFilter("all");
    setSelectedPriorityFilter("all");
  };

  const switchView = (m: "day" | "week" | "month" | "gantt") => {
    setViewMode(m);
    setSelectedPlanId("");
    setSelectedOfficerFilter("all");
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
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    personId: string;
    fullName: string;
    role: string;
    unitId?: string;
    permissions?: string[];
  } | null>(null);
  const [selectedScope, setSelectedScope] = useState<"all" | "personal">("all");

  const isLeaderRole =
    currentUser?.role === "UNIT_LEADER" || currentUser?.role === "DEPARTMENT_LEADER";
  const planContentEditable =
    !!activePlan && (activePlan.status === "DRAFT" || activePlan.status === "RETURNED");
  const canManageActivePlan =
    !!activePlan &&
    !!planOptions?.canCreatePlan &&
    (isLeaderRole || activePlan.creatorId === currentUser?.personId);
  const canEditActivePlanContent = planContentEditable && canManageActivePlan;
  const canAddWorkItemToActivePlan =
    planContentEditable && !!activePlan?.items?.length && !!currentUser;
  const canSubmitActivePlan =
    planContentEditable &&
    !!planOptions?.canCreatePlan &&
    (isLeaderRole || !!currentUser?.personId);
  const isActivePlanCreator =
    !!activePlan?.creatorId && activePlan.creatorId === currentUser?.personId;
  const canEditActivePlanTitle =
    planContentEditable &&
    !!activePlan &&
    (isActivePlanCreator || (isLeaderRole && !!planOptions?.canCreatePlan));
  // Task 3C: chỉ hủy mềm kế hoạch DRAFT/RETURNED chưa có hạng mục/liên kết.
  // Người tạo được hủy bản nháp của mình (khớp API `canCancelPlan`); lãnh đạo
  // cần quyền lập kế hoạch trong phạm vi.
  const canCancelActivePlan =
    planContentEditable &&
    !!activePlan &&
    (activePlan.items?.length || 0) === 0 &&
    (isActivePlanCreator || (isLeaderRole && !!planOptions?.canCreatePlan));
  const canApproveActivePlan =
    activePlan?.status === "SUBMITTED" && isLeaderRole && !isActivePlanCreator;
  const canEffectActivePlan = activePlan?.status === "APPROVED" && isLeaderRole;
  const canRequestAmendment = !!activePlan &&
    (activePlan.status === "APPROVED" || activePlan.status === "IN_EFFECT") &&
    !!planOptions?.canCreatePlan;
  const selfApprovalBlocked =
    activePlan?.status === "SUBMITTED" && isLeaderRole && isActivePlanCreator;

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
  // A2/D6: cán bộ phụ trách phải được chọn tường minh khi lãnh đạo lập kế hoạch
  // cho đơn vị; không mặc định danh tính người đang đăng nhập nếu họ ngoài đơn vị.
  const [modalPersonId, setModalPersonId] = useState("");
  const [modalPeople, setModalPeople] = useState<
    Array<{ id: string; fullName: string; code?: string | null; position?: string | null }>
  >([]);
  const [modalPeopleLoading, setModalPeopleLoading] = useState(false);
  const [modalPeopleError, setModalPeopleError] = useState<string | null>(null);
  const [modalWorkDate, setModalWorkDate] = useState("");
  const [modalDateText, setModalDateText] = useState("");
  const [modalCoordination, setModalCoordination] = useState("");
  const [modalPriority, setModalPriority] = useState("Trung bình");
  const [modalExpectedResult, setModalExpectedResult] = useState("");
  const [modalStatus, setModalStatus] = useState("NOT_STARTED");

  // YC-23 + YC-25: lựa chọn từ danh mục (thường xuyên / sản phẩm QĐ1277 / riêng của bộ phận)
  const [modalDeptWorkItemId, setModalDeptWorkItemId] = useState("");
  // V3.0.2: danh sách sản phẩm QĐ1277 được chọn — một đầu việc có thể gắn nhiều mã.
  const [modalProducts, setModalProducts] = useState<PickedProduct[]>([]);
  // Q-B4/A-1: chỉ người thực hiện được đề xuất/bỏ sản phẩm QĐ1277.
  // Lãnh đạo lập hộ chỉ giao việc; không thay cán bộ đề xuất sản phẩm.
  const modalProductOwnerId = editingItem?.person?.id || modalPersonId;
  const canEditModalProducts =
    !!currentUser?.personId && modalProductOwnerId === currentUser.personId;
  // YC-31/YC-32: nguồn TX, hạn xử lý
  const [modalCatalogEntryId, setModalCatalogEntryId] = useState("");
  // YC-38C: hạng mục kế hoạch được chọn — liên kết ĐÚNG việc (không mặc định items[0])
  const [modalPlanItemId, setModalPlanItemId] = useState("");
  // YC-38B: đối tượng nguồn đã chọn (hiển thị trong bộ chọn thông minh)
  const [pickedCatalogLocal, setPickedCatalogLocal] = useState<PickedCatalogEntry | null>(null);

  const [modalDueDate, setModalDueDate] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalFieldErrors, setModalFieldErrors] = useState<Record<string, string>>({});
  const [savingWorkItem, setSavingWorkItem] = useState(false);
  const savingWorkItemRef = useRef(false);
  const [modalIdempotencyKey, setModalIdempotencyKey] = useState("");
  const [txEntries, setTxEntries] = useState<WorkCatalogEntryPicker[]>([]);

  // Đồng bộ với danh mục TX đã tải (kể cả khi chọn qua select cũ)
  const pickedCatalogEntry = useMemo(() => {
    if (!modalCatalogEntryId) return null;
    const e = txEntries.find((x) => x.id === modalCatalogEntryId);
    if (!e) return pickedCatalogLocal;
    return {
      id: e.id,
      code: e.code,
      title: e.title,
      department: e.department,
      convertFactor: null,
    };
  }, [modalCatalogEntryId, txEntries, pickedCatalogLocal]);
  const [legacyTemplatesSelectable, setLegacyTemplatesSelectable] = useState(true);
  const [catalogActivationStatus, setCatalogActivationStatus] = useState<
    "NO_VERSION" | "NOT_ACTIVATED" | "ACTIVATED"
  >("NO_VERSION");
  const [templateSearch, setTemplateSearch] = useState("");
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

  // Phase A — lập kế hoạch & quản lý hạng mục (chỉ hiển thị khi có quyền plans.create)
  const [showPlanCreateModal, setShowPlanCreateModal] = useState(false);
  const [planFormType, setPlanFormType] = useState<"DAY" | "WEEK" | "MONTH">("WEEK");
  const [planFormDate, setPlanFormDate] = useState("");
  const [planFormUnitId, setPlanFormUnitId] = useState("");
  const [planFormTitle, setPlanFormTitle] = useState("");
  const [planFormFirstItem, setPlanFormFirstItem] = useState("");
  const [planFormError, setPlanFormError] = useState<string | null>(null);
  const [duplicatePlanId, setDuplicatePlanId] = useState<string | null>(null);
  const [planFormFieldErrors, setPlanFormFieldErrors] = useState<Record<string, string>>({});
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const planSubmittingRef = useRef(false);

  // Phase 2A/2A2 — sửa tiêu đề kế hoạch (không mở rộng sang hạng mục/đầu việc)
  const [showPlanTitleModal, setShowPlanTitleModal] = useState(false);
  const [planTitleDraft, setPlanTitleDraft] = useState("");
  const [planTitleError, setPlanTitleError] = useState<string | null>(null);
  const [planTitleBusy, setPlanTitleBusy] = useState(false);
  const planTitleBusyRef = useRef(false);

  // Task 3C — hủy mềm kế hoạch trùng (bắt buộc lý do, không xóa cứng).
  const [showPlanCancelModal, setShowPlanCancelModal] = useState(false);
  const [planCancelReason, setPlanCancelReason] = useState("");
  const [planCancelError, setPlanCancelError] = useState<string | null>(null);
  const [planCancelBusy, setPlanCancelBusy] = useState(false);
  const planCancelBusyRef = useRef(false);

  const [showPlanItemsModal, setShowPlanItemsModal] = useState(false);
  const [planItemEditingId, setPlanItemEditingId] = useState<string | null>(null);
  const [planItemTitle, setPlanItemTitle] = useState("");
  const [planItemGroupId, setPlanItemGroupId] = useState("");
  const [planItemBusy, setPlanItemBusy] = useState(false);
  const [planItemError, setPlanItemError] = useState<string | null>(null);

  // YC-23: tìm nhanh 48 mẫu thường xuyên phía máy khách (danh mục nhỏ; danh mục sản phẩm 3.000+ mới cần tìm phía máy chủ)
  const filteredTemplates = React.useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    return templates.filter((tpl) => {
      if (tpl.reviewStatus === "RETIRED") return false;
      if (!q) return true;
      return `${tpl.code} ${tpl.title}`.toLowerCase().includes(q);
    });
  }, [templates, templateSearch]);

  // Mobile View Filters — dùng chung viewMode/selectedScope để Desktop và Mobile nhất quán.
  const mobileLabels = React.useMemo(() => getCurrentPeriodLabels(), []);
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    "sec-1": true,
    "sec-2": false,
  });

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const [resPlans, resTemplates, resGroups, resUser, resDept, resCatalog, resPlanOptions] =
        await Promise.all([
          fetch("/api/plans"),
          fetch("/api/catalog/templates"),
          fetch("/api/catalog/groups"),
          fetch("/api/auth/me"),
          fetch("/api/department-work-items?status=ACTIVE"),
          fetch("/api/work-catalog", { cache: "no-store" }),
          fetch("/api/plans/options", { cache: "no-store" }),
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

      if (resPlanOptions.ok) {
        const jsonOptions = await resPlanOptions.json();
        setPlanOptions({
          canCreatePlan: !!jsonOptions.canCreatePlan,
          currentUnitId: jsonOptions.currentUnitId || null,
          units: jsonOptions.units || [],
          groups: jsonOptions.groups || [],
        });
      }

      if (resCatalog.ok) {
        const jsonCatalog = await resCatalog.json();
        const catData = jsonCatalog.data || {};
        setTxEntries(catData.entries || []);
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

  /**
   * Danh sách cán bộ có thể giao đầu việc trong kế hoạch:
   * - Lãnh đạo: cán bộ đang hoạt động thuộc đúng đơn vị của kế hoạch.
   * - Cán bộ: chỉ chính mình (backend cũng chặn giao cho người khác).
   * Không tự chọn người đầu tiên khi lãnh đạo không thuộc đơn vị kế hoạch.
   */
  useEffect(() => {
    if (!showAddModal || editingItem) return;
    const unitId = activePlan?.unit?.id;
    if (!unitId) {
      setModalPeople([]);
      setModalPeopleError("Chưa xác định đơn vị của kế hoạch");
      return;
    }
    let cancelled = false;
    setModalPeopleLoading(true);
    setModalPeopleError(null);
    fetch(
      `/api/people?unitId=${encodeURIComponent(unitId)}&status=ACTIVE&pageSize=100`,
      { cache: "no-store" }
    )
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || "Không tải được danh sách cán bộ");
        }
        const people = (Array.isArray(json.data) ? json.data : []).map((p: any) => ({
          id: p.id,
          fullName: p.fullName,
          code: p.code || null,
          position: p.position || null,
        }));
        return isLeaderRole
          ? people
          : people.filter((p: any) => p.id === currentUser?.personId);
      })
      .then((people: Array<{ id: string; fullName: string; code?: string | null; position?: string | null }>) => {
        if (cancelled) return;
        setModalPeople(people);
        setModalPersonId((prev) => {
          if (prev && people.some((p) => p.id === prev)) return prev;
          const self = people.find((p) => p.id === currentUser?.personId);
          return self?.id || "";
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        setModalPeople([]);
        setModalPeopleError(err?.message || "Không tải được danh sách cán bộ");
      })
      .finally(() => {
        if (!cancelled) setModalPeopleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    showAddModal,
    editingItem,
    activePlan?.unit?.id,
    currentUser?.personId,
    isLeaderRole,
  ]);

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
  const toDateInput = (value?: string | null) => {
    if (!value) return "";
    const d = new Date(value);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  };

  const isWorkItemLocked = (wi: PersonalWorkItemData) =>
    wi.reviewState === "SUBMITTED" || wi.reviewState === "CONFIRMED";

  const canModifyWorkItem = (wi: PersonalWorkItemData) =>
    planContentEditable &&
    wi.status !== "COMPLETED" &&
    !isWorkItemLocked(wi) &&
    // Cán bộ chỉ sửa đầu việc của mình; lãnh đạo được sửa trong phạm vi
    // kế hoạch đang xem. Backend vẫn kiểm tra lại quyền và phạm vi.
    (wi.person?.id === currentUser?.personId || isLeaderRole);

  const reviewStateText = (state?: string | null) => {
    if (state === "SUBMITTED") return "Chờ lãnh đạo xác nhận";
    if (state === "CONFIRMED") return "Lãnh đạo đã xác nhận";
    if (state === "RETURNED") return "Lãnh đạo trả lại";
    if (state === "DRAFT" || !state) return "Chưa gửi xác nhận";
    return state;
  };

  const workItemProducts = (wi: PersonalWorkItemData): PickedProduct[] => {
    const out: PickedProduct[] = [];
    const seen = new Set<string>();
    (wi.linkedProducts || []).forEach((link) => {
      if (!link.productItem || seen.has(link.productItemId)) return;
      seen.add(link.productItemId);
      out.push({
        id: link.productItemId,
        code: link.productItem.code,
        taskName: link.productItem.taskName,
        outputProduct: link.productItem.outputProduct || null,
        convertFactor: link.factorSnapshot ?? link.productItem.convertFactor ?? null,
        groupName: link.productItem.group?.title || link.productItem.groupName || null,
        quantityUnit: link.quantityUnit || null,
        reviewState: link.reviewState || null,
        linkId: link.id,
        isPrimary: link.isPrimary,
      });
    });
    if (wi.product && !seen.has(wi.product.id)) {
      out.push({
        id: wi.product.id,
        code: wi.product.code,
        taskName: wi.product.taskName,
        outputProduct: wi.product.outputProduct || null,
        convertFactor: wi.product.convertFactor ?? null,
        groupName: wi.product.groupName || null,
        reviewState: wi.reviewState || null,
        isPrimary: true,
      });
    }
    return out;
  };

  const newIdempotencyKey = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `wi-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };

  const openAddModal = (initialTemplateId = "") => {
    if (!activePlan) {
      toast.warning("Vui lòng chọn hoặc tạo kế hoạch công tác trước khi thêm đầu việc");
      return;
    }
    if (activePlan.status === "APPROVED" || activePlan.status === "IN_EFFECT") {
      toast.warning("Kế hoạch đã phê duyệt — vui lòng dùng “Trình duyệt bổ sung” để thêm đầu việc theo quy trình");
      return;
    }
    if (activePlan.status === "SUBMITTED") {
      toast.warning("Kế hoạch đang chờ duyệt — nội dung đã khóa, không thể thêm đầu việc");
      return;
    }
    if (!activePlan.items?.length) {
      toast.warning("Kế hoạch chưa có hạng mục — hãy tạo hạng mục trước khi thêm đầu việc");
      if (canEditActivePlanContent) openPlanItemsManager();
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
    setModalPersonId("");
    setModalPeople([]);
    setModalPeopleError(null);
    setModalDeptWorkItemId("");
    setModalProducts([]);
    setModalCatalogEntryId("");
    setPickedCatalogLocal(null);
    // YC-38C: mặc định hạng mục CHƯA có đầu việc — không trỏ mặc định vào items[0]
    const firstFreeItem = (activePlan.items || []).find((it) => (it.workItems || []).length === 0);
    setModalPlanItemId(firstFreeItem?.id || activePlan.items[0]?.id || "");
    setModalDueDate("");
    setModalError(null);
    setModalFieldErrors({});
    setModalIdempotencyKey(newIdempotencyKey());
    setDeptCatalogMsg(null);
    setTemplateSearch("");
    setShowAddModal(true);
  };

  const openEditModal = (wi: PersonalWorkItemData) => {
    if (!canModifyWorkItem(wi)) {
      toast.warning(
        !planContentEditable
          ? "Kế hoạch đang khóa nội dung — không thể sửa đầu việc"
          : wi.status === "COMPLETED"
            ? "Đầu việc đã hoàn thành — chỉ xem, không sửa trực tiếp"
            : isWorkItemLocked(wi)
              ? "Đầu việc đã gửi/đã được lãnh đạo xác nhận — nội dung đã khóa"
              : "Bạn chỉ được sửa đầu việc do mình phụ trách"
      );
      return;
    }
    setEditingItem(wi);
    setModalPersonId(wi.person?.id || "");
    setModalPeople(wi.person ? [{ id: wi.person.id, fullName: wi.person.fullName }] : []);
    setModalPeopleError(null);
    setModalTemplateId(wi.templateId || "");
    setModalDeptWorkItemId(wi.deptWorkItemId || "");
    setModalProducts(workItemProducts(wi));
    setModalCatalogEntryId(wi.catalogEntryId || "");
    setPickedCatalogLocal(
      wi.catalogEntry
        ? {
            id: wi.catalogEntry.id,
            code: wi.catalogEntry.code,
            title: wi.catalogEntry.title,
            department: wi.catalogEntry.department,
            convertFactor: null,
          }
        : null
    );
    setModalDueDate(toDateInput(wi.dueDate));
    setDeptCatalogMsg(
      wi.deptWorkItem && wi.deptWorkItem.status !== "ACTIVE"
        ? "Đầu việc gốc của bộ phận đã ngừng sử dụng — hệ thống giữ nguyên liên kết cũ cho đến khi bạn đổi."
        : null
    );
    setTemplateSearch("");
    setModalTitle(wi.title);
    setModalGroupId(wi.groupId || wi.template?.groupId || groups[0]?.id || "");
    setModalWorkDate(toDateInput(wi.workDate));
    setModalDateText(wi.dateText || "");
    setModalCoordination(wi.coordinationUnit || "");
    setModalPriority(wi.priority || "Trung bình");
    setModalExpectedResult(wi.expectedResult || "");
    setModalStatus(
      wi.status === "ACTIVE" || wi.status === "IN_PROGRESS"
        ? "IN_PROGRESS"
        : wi.status === "DISCONTINUED"
          ? "DISCONTINUED"
          : "NOT_STARTED"
    );
    setModalPlanItemId(
      (activePlan?.items || []).find((it) => (it.workItems || []).some((x) => x.id === wi.id))?.id ||
        activePlan?.items?.[0]?.id ||
        ""
    );
    setModalError(null);
    setModalFieldErrors({});
    setShowAddModal(true);
  };

  /**
   * Đồng bộ liên kết nhiều sản phẩm QĐ1277 với danh sách đang chọn.
   * Không tự suy hệ số/điểm; chỉ thêm/bớt liên kết qua API chuyên trách.
   */
  const syncWorkItemProducts = async (
    workItemId: string,
    desired: PickedProduct[]
  ): Promise<string[]> => {
    const errors: string[] = [];
    const res = await fetch(
      `/api/work-item-products?workItemId=${encodeURIComponent(workItemId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return [json.error || "Không đọc được liên kết sản phẩm hiện có"];
    }
    const json = await res.json();
    const existing: Array<{ productItemId: string; reviewState?: string | null }> =
      json.data || [];
    const desiredIds = new Set(desired.map((p) => p.id));
    const existingIds = new Set(existing.map((l) => l.productItemId));

    for (const product of desired) {
      if (existingIds.has(product.id)) continue;
      const addRes = await fetch("/api/work-item-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workItemId, productItemId: product.id }),
      });
      if (!addRes.ok) {
        const addJson = await addRes.json().catch(() => ({}));
        errors.push(`Không gắn được SP ${product.code}: ${addJson.error || "lỗi không xác định"}`);
      }
    }

    for (const link of existing) {
      if (desiredIds.has(link.productItemId)) continue;
      if (link.reviewState === "CONFIRMED") {
        errors.push("Một sản phẩm đã được xác nhận nên không thể bỏ khỏi đầu việc.");
        continue;
      }
      const delRes = await fetch("/api/work-item-products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workItemId, productItemId: link.productItemId }),
      });
      if (!delRes.ok) {
        const delJson = await delRes.json().catch(() => ({}));
        errors.push(delJson.error || "Không bỏ được một sản phẩm QĐ1277");
      }
    }
    return errors;
  };

  const handleSaveWorkItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingWorkItemRef.current) return;
    if (!activePlan) {
      setModalError("Vui lòng chọn kế hoạch công tác");
      return;
    }
    if (!activePlan.items?.length) {
      setModalError("Kế hoạch chưa có hạng mục — không thể lưu đầu việc");
      return;
    }
    if (activePlan.status !== "DRAFT" && activePlan.status !== "RETURNED") {
      setModalError("Kế hoạch đang khóa nội dung — không thể lưu đầu việc");
      return;
    }

    const fieldErrors: Record<string, string> = {};
    if (!modalTitle.trim()) fieldErrors.title = "Nhập tên đầu việc";
    if (!modalPlanItemId) fieldErrors.planItemId = "Chọn hạng mục kế hoạch";
    if (!modalGroupId) fieldErrors.groupId = "Chọn nhóm nhiệm vụ";
    if (!editingItem && !modalPersonId) {
      fieldErrors.personId = "Chọn cán bộ phụ trách";
    }
    setModalFieldErrors(fieldErrors);
    setModalError(null);
    if (Object.keys(fieldErrors).length > 0) {
      setModalError("Vui lòng hoàn thiện các trường được đánh dấu.");
      return;
    }

    savingWorkItemRef.current = true;
    setSavingWorkItem(true);
    try {
      const basePayload = {
        title: modalTitle.trim(),
        groupId: modalGroupId || null,
        workDate: modalWorkDate || null,
        dateText: modalDateText.trim() || null,
        coordinationUnit: modalCoordination.trim() || null,
        priority: modalPriority,
        expectedResult: modalExpectedResult.trim() || null,
        status: modalStatus,
        deptWorkItemId: modalDeptWorkItemId || null,
        // Không ghi con trỏ sản phẩm chính khi người đang lưu không phải
        // người thực hiện — tránh liên kết mồ côi không có WorkItemProduct.
        productItemId: canEditModalProducts ? modalProducts[0]?.id || null : undefined,
        catalogEntryId: modalCatalogEntryId || null,
        dueDate: modalDueDate || null,
        planItemId: modalPlanItemId,
        templateId: modalTemplateId || null,
      };

      let workItemId = "";
      if (editingItem) {
        const res = await fetch("/api/personal-work-items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingItem.id,
            ...basePayload,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setModalError(json.error || "Không thể cập nhật đầu việc");
          toast.error(json.error || "Không thể cập nhật đầu việc");
          return;
        }
        workItemId = editingItem.id;
      } else {
        const res = await fetch("/api/personal-work-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodId: activePlan.period?.id,
            personId: modalPersonId,
            ...basePayload,
            idempotencyKey: modalIdempotencyKey || undefined,
            templateId: modalTemplateId || undefined,
            deptWorkItemId: modalDeptWorkItemId || undefined,
            catalogEntryId: modalCatalogEntryId || undefined,
            planItemId: modalPlanItemId,
            workDate: modalWorkDate || undefined,
            dateText: modalDateText.trim() || undefined,
            coordinationUnit: modalCoordination.trim() || undefined,
            expectedResult: modalExpectedResult.trim() || undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setModalError(json.error || "Không thể thêm đầu việc vào kế hoạch");
          toast.error(json.error || "Không thể thêm đầu việc vào kế hoạch");
          return;
        }
        workItemId = json.data?.id || "";
      }

      let linkErrors: string[] = [];
      if (workItemId && canEditModalProducts) {
        try {
          linkErrors = await syncWorkItemProducts(workItemId, modalProducts);
        } catch (err: any) {
          linkErrors = [err?.message || "Không đồng bộ được sản phẩm QĐ1277"];
        }
      }

      setShowAddModal(false);
      setModalIdempotencyKey(newIdempotencyKey());
      if (linkErrors.length > 0) {
        const message = `Đã lưu đầu việc nhưng chưa đồng bộ đủ sản phẩm: ${linkErrors[0]}`;
        setWorkflowMessage(message);
        toast.warning(message);
        setTimeout(() => setWorkflowMessage(null), 5000);
      } else {
        const message = editingItem
          ? "Đã cập nhật đầu việc thành công!"
          : "Đã thêm thành công đầu việc vào kế hoạch!";
        setWorkflowMessage(message);
        toast.success(message);
        setTimeout(() => setWorkflowMessage(null), 3000);
      }
      await fetchPlans();
    } catch (err: any) {
      setModalError("Lỗi kết nối: " + err.message);
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      savingWorkItemRef.current = false;
      setSavingWorkItem(false);
    }
  };

  const handleDeleteWorkItem = async (workItemId: string) => {
    const wi = activePlan?.items
      ?.flatMap((it) => it.workItems || [])
      .find((x) => x.id === workItemId);
    if (!planContentEditable) {
      toast.warning("Kế hoạch đang khóa nội dung — không thể xóa đầu việc");
      return;
    }
    if (wi && !canModifyWorkItem(wi)) {
      toast.warning(
        wi.status === "COMPLETED"
          ? "Đầu việc đã hoàn thành — không thể xóa trực tiếp"
          : "Đầu việc đã gửi/đã được xác nhận — nội dung đã khóa"
      );
      return;
    }
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

  const openPlanCreateModal = () => {
    if (!planOptions?.canCreatePlan) {
      toast.warning("Bạn không có quyền lập kế hoạch công tác");
      return;
    }
    const defaultUnit =
      planOptions.units.find((u) => u.id === planOptions.currentUnitId)?.id ||
      planOptions.units[0]?.id ||
      "";
    const defaultDate =
      toDateInput(activePlan?.period?.startAt) || new Date().toISOString().slice(0, 10);
    setPlanFormType(viewMode === "day" ? "DAY" : viewMode === "month" ? "MONTH" : "WEEK");
    setPlanFormDate(defaultDate);
    setPlanFormUnitId(defaultUnit);
    setPlanFormTitle("");
    setPlanFormFirstItem("I. Công tác trọng tâm");
    setPlanFormError(null);
    setDuplicatePlanId(null);
    setPlanFormFieldErrors({});
    setShowPlanCreateModal(true);
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (planSubmittingRef.current) return;
    if (!planOptions?.canCreatePlan) {
      setPlanFormError("Bạn không có quyền lập kế hoạch công tác");
      return;
    }
    const errors: Record<string, string> = {};
    if (!planFormUnitId) errors.unitId = "Chọn đơn vị lập kế hoạch";
    if (!planFormDate) errors.date = "Chọn ngày trong kỳ kế hoạch";
    if (!planFormTitle.trim()) errors.title = "Nhập tiêu đề kế hoạch";
    if (!planFormFirstItem.trim()) errors.firstItem = "Nhập hạng mục đầu tiên";
    setPlanFormFieldErrors(errors);
    setPlanFormError(null);
    if (Object.keys(errors).length > 0) {
      setPlanFormError("Vui lòng hoàn thiện các trường được đánh dấu.");
      return;
    }

    planSubmittingRef.current = true;
    setPlanSubmitting(true);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: planFormUnitId,
          title: planFormTitle.trim(),
          type: planFormType,
          date: planFormDate,
          items: [{ title: planFormFirstItem.trim(), sortOrder: 1 }],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Task 3C: backend trả 409 kèm duplicatePlanId khi trùng đơn vị+kỳ+tiêu đề.
        const duplicateNote =
          res.status === 409 && json.duplicatePlanId
            ? ` Mã kế hoạch trùng: ${json.duplicatePlanId}.`
            : "";
        const message = `${json.error || "Không thể tạo kế hoạch"}${duplicateNote}`;
        setPlanFormError(message);
        setDuplicatePlanId(res.status === 409 && json.duplicatePlanId ? String(json.duplicatePlanId) : null);
        toast.error(message);
        return;
      }
      const createdId = json.data?.id || "";
      setDuplicatePlanId(null);
      setShowPlanCreateModal(false);
      setViewMode(
        planFormType === "DAY" ? "day" : planFormType === "MONTH" ? "month" : "week"
      );
      toast.success("Đã tạo kế hoạch công tác");
      setWorkflowMessage("Đã tạo kế hoạch công tác");
      setTimeout(() => setWorkflowMessage(null), 3000);
      // Chọn sau khi danh sách đã tải lại: effect chọn kế hoạch mặc định có thể
      // ghi đè ID mới nếu đặt trước khi kế hoạch xuất hiện trong filteredPlans.
      await fetchPlans();
      if (createdId) setSelectedPlanId(createdId);
    } catch (err: any) {
      setPlanFormError("Lỗi kết nối: " + err.message);
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      planSubmittingRef.current = false;
      setPlanSubmitting(false);
    }
  };

  const openDuplicatePlan = async () => {
    if (!duplicatePlanId) return;
    setShowPlanCreateModal(false);
    setPlanFormError(null);
    await fetchPlans();
    setSelectedPlanId(duplicatePlanId);
    setWorkflowMessage("Đã mở kế hoạch trùng — dùng nút Sửa kế hoạch hoặc Hủy kế hoạch trùng.");
    setTimeout(() => setWorkflowMessage(null), 4000);
  };

  const openPlanTitleModal = () => {
    if (!activePlan) {
      toast.warning("Chưa chọn kế hoạch công tác");
      return;
    }
    if (!canEditActivePlanTitle) {
      toast.warning("Kế hoạch đang khóa hoặc bạn không có quyền sửa");
      return;
    }
    setPlanTitleDraft(activePlan.title);
    setPlanTitleError(null);
    setShowPlanTitleModal(true);
  };

  const handleUpdatePlanTitle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (planTitleBusyRef.current || !activePlan) return;
    const title = planTitleDraft.trim();
    if (!title) {
      setPlanTitleError("Nhập tiêu đề kế hoạch");
      return;
    }
    if (title.length > 300) {
      setPlanTitleError("Tiêu đề kế hoạch không được vượt quá 300 ký tự");
      return;
    }

    planTitleBusyRef.current = true;
    setPlanTitleBusy(true);
    setPlanTitleError(null);
    try {
      const res = await fetch(`/api/plans/${activePlan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = json.error || "Không thể sửa kế hoạch";
        setPlanTitleError(message);
        toast.error(message);
        return;
      }
      setShowPlanTitleModal(false);
      toast.success("Đã cập nhật tiêu đề kế hoạch");
      setWorkflowMessage("Đã cập nhật tiêu đề kế hoạch");
      setTimeout(() => setWorkflowMessage(null), 3000);
      await fetchPlans();
    } catch (err: any) {
      const message = "Lỗi kết nối: " + err.message;
      setPlanTitleError(message);
      toast.error(message);
    } finally {
      planTitleBusyRef.current = false;
      setPlanTitleBusy(false);
    }
  };

  const openPlanCancelModal = () => {
    if (!activePlan) {
      toast.warning("Chưa chọn kế hoạch công tác");
      return;
    }
    if (!canCancelActivePlan) {
      toast.warning("Chỉ hủy được kế hoạch DRAFT/RETURNED chưa có hạng mục/liên kết");
      return;
    }
    setPlanCancelReason("");
    setPlanCancelError(null);
    setShowPlanCancelModal(true);
  };

  const handleCancelPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (planCancelBusyRef.current || !activePlan) return;
    const reason = planCancelReason.trim();
    if (!reason) {
      setPlanCancelError("Nhập lý do hủy kế hoạch trùng");
      return;
    }
    if (reason.length > 500) {
      setPlanCancelError("Lý do hủy không được vượt quá 500 ký tự");
      return;
    }

    planCancelBusyRef.current = true;
    setPlanCancelBusy(true);
    setPlanCancelError(null);
    try {
      const res = await fetch(`/api/plans/${activePlan.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = json.error || "Không thể hủy kế hoạch";
        setPlanCancelError(message);
        toast.error(message);
        return;
      }
      setShowPlanCancelModal(false);
      toast.success(json.message || "Đã hủy kế hoạch trùng");
      setWorkflowMessage("Đã hủy mềm kế hoạch trùng");
      setTimeout(() => setWorkflowMessage(null), 3000);
      await fetchPlans();
    } catch (err: any) {
      const message = "Lỗi kết nối: " + err.message;
      setPlanCancelError(message);
      toast.error(message);
    } finally {
      planCancelBusyRef.current = false;
      setPlanCancelBusy(false);
    }
  };

  const openPlanItemsManager = () => {
    if (!activePlan) {
      toast.warning("Chưa chọn kế hoạch công tác");
      return;
    }
    if (!canEditActivePlanContent) {
      toast.warning("Kế hoạch không còn ở trạng thái được sửa hạng mục");
      return;
    }
    setPlanItemEditingId(null);
    setPlanItemTitle("");
    setPlanItemGroupId(groups[0]?.id || planOptions?.groups[0]?.id || "");
    setPlanItemError(null);
    setShowPlanItemsModal(true);
  };

  const savePlanItem = async () => {
    if (planItemBusy || !activePlan) return;
    if (!canEditActivePlanContent) {
      setPlanItemError("Kế hoạch không còn ở trạng thái được sửa hạng mục");
      return;
    }
    const title = planItemTitle.trim();
    if (!title) {
      setPlanItemError("Nhập tên hạng mục");
      return;
    }
    setPlanItemBusy(true);
    setPlanItemError(null);
    try {
      const res = await fetch(`/api/plans/${activePlan.id}/items`, {
        method: planItemEditingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: planItemEditingId || undefined,
          title,
          groupId: planItemGroupId || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPlanItemError(json.error || "Không lưu được hạng mục");
        return;
      }
      setPlanItemEditingId(null);
      setPlanItemTitle("");
      await fetchPlans();
      toast.success("Đã lưu hạng mục kế hoạch");
    } catch (err: any) {
      setPlanItemError("Lỗi kết nối: " + err.message);
    } finally {
      setPlanItemBusy(false);
    }
  };

  const deletePlanItem = async (itemId: string, title: string) => {
    if (!activePlan || planItemBusy) return;
    if (!canEditActivePlanContent) {
      setPlanItemError("Kế hoạch không còn ở trạng thái được sửa hạng mục");
      return;
    }
    if (!confirm(`Xóa hạng mục "${title}"? Hạng mục đã có đầu việc/nhiệm vụ sẽ không thể xóa.`)) return;
    setPlanItemBusy(true);
    setPlanItemError(null);
    try {
      const res = await fetch(
        `/api/plans/${activePlan.id}/items?itemId=${encodeURIComponent(itemId)}`,
        { method: "DELETE" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPlanItemError(json.error || "Không xóa được hạng mục");
        return;
      }
      if (planItemEditingId === itemId) {
        setPlanItemEditingId(null);
        setPlanItemTitle("");
      }
      await fetchPlans();
      toast.success("Đã xóa hạng mục kế hoạch");
    } catch (err: any) {
      setPlanItemError("Lỗi kết nối: " + err.message);
    } finally {
      setPlanItemBusy(false);
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

  // Workflow Action (SUBMIT, APPROVE, RETURN, REQUEST_AMENDMENT)
  const workflowBusyRef = useRef(false);
  const handleWorkflowAction = async (
    action: "SUBMIT" | "APPROVE" | "RETURN" | "REQUEST_AMENDMENT" | "EFFECT"
  ) => {
    if (!activePlan || workflowBusyRef.current) return;
    if (action === "SUBMIT" && !activePlan.items?.some((it) => (it.workItems || []).length > 0)) {
      toast.warning("Kế hoạch phải có ít nhất một hạng mục đã có đầu việc trước khi trình duyệt");
      return;
    }
    if (action === "APPROVE" && selfApprovalBlocked) {
      toast.error("Không thể tự phê duyệt kế hoạch do chính bạn lập/trình");
      return;
    }
    if (action === "RETURN" && !returnNotes.trim()) {
      toast.warning("Vui lòng nhập lý do trả lại chỉnh sửa");
      return;
    }
    if (action === "REQUEST_AMENDMENT" && !amendmentNotes.trim()) {
      toast.warning("Vui lòng nhập lý do/căn cứ điều chỉnh bổ sung");
      return;
    }
    workflowBusyRef.current = true;
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
      workflowBusyRef.current = false;
      setWorkflowBusy(false);
    }
  };

  const toggleAccordion = (id: string) => {
    setOpenAccordions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const unassignedItemCount =
    activePlan?.items?.filter((item) => !item.group || !item.groupId).length || 0;

  return (
    <div className="w-full min-h-screen bg-transparent pb-12">
      {/* Toast message */}
      {workflowMessage && (
        <div className="fixed top-24 right-6 z-50 p-4 rounded-xl bg-status-success text-on-primary font-body-semibold text-sm shadow-xl flex items-center gap-2 transition-panel">
          <V5Icon name="verified" className="text-[20px]" />
          <span>{workflowMessage}</span>
        </div>
      )}

      {/* =========================================================================
          DESKTOP VIEW (Pixel-accurate Google Stitch ID d8279bd2bf0c4198b665f567223d0bf4)
          ========================================================================= */}
      <div className="hidden w-full flex-col gap-3 p-4 lg:flex">
        {/* Top Command Panel & Period Navigator */}
        <div className="rounded-xl border border-v5-line bg-v5-surface p-4 shadow-sm">
          <div className="flex flex-col gap-space-md">
            {/* Title & Official Approval Status */}
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-space-sm">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary-fixed text-on-secondary-fixed-variant font-label-sm text-label-sm font-semibold tracking-wide uppercase">
                  <V5Icon name="event_repeat" className="text-[15px]" />
                  {activePlan
                    ? `${activePlan.period?.name || "KỲ KẾ HOẠCH"}${
                        activePlan.period?.year ? ` — NĂM ${activePlan.period.year}` : ""
                      }`
                    : "CHƯA CHỌN KỲ KẾ HOẠCH"}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-status-success-bg text-status-success font-label-sm text-label-sm font-semibold">
                  <V5Icon name="verified" className="text-[15px]" />
                  {activePlan?.status === "IN_EFFECT"
                    ? `CÓ HIỆU LỰC THI HÀNH${activePlan.approvedAt ? ` — từ ${new Date(activePlan.approvedAt).toLocaleDateString("vi-VN")}` : ""}`
                    : activePlan?.status === "APPROVED"
                    ? `ĐÃ PHÊ DUYỆT (chờ ban hành hiệu lực${activePlan.approvedAt ? ` — ${new Date(activePlan.approvedAt).toLocaleDateString("vi-VN")}` : ""})`
                    : activePlan?.status === "SUBMITTED"
                    ? "ĐÃ TRÌNH DUYỆT (Chờ Lãnh đạo phê duyệt)"
                    : activePlan?.status === "RETURNED"
                    ? "YÊU CẦU CHỈNH SỬA"
                    : activePlan
                    ? "DỰ THẢO KẾ HOẠCH"
                    : "CHƯA CÓ KẾ HOẠCH"}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-v5-bg text-v5-muted font-label-sm text-label-sm">
                  <V5Icon name="tag" className="text-[15px]" />
                  {activePlan?.period?.code || (activePlan ? "CHƯA CÓ MÃ KỲ" : "CHƯA CÓ KẾ HOẠCH")}
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-v5-ink">
                {activePlan ? activePlan.title : "Chưa có kế hoạch công tác"}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-body-sm text-v5-muted">
                <span className="font-semibold text-v5-ink">
                  {activePlan?.unit?.name || "Chưa xác định đơn vị"}
                </span>
                <span className="rounded-full border border-v5-line bg-v5-bg px-2 py-0.5 text-[11px] font-semibold">
                  Kế hoạch cấp đơn vị
                </span>
                <span className="rounded-full border border-v5-line bg-v5-bg px-2 py-0.5 text-[11px] font-semibold">
                  Dữ liệu theo phân quyền
                </span>
              </div>
            </div>

            {/* Action Group */}
            <div
              data-tour="workflow-actions"
              className="flex flex-wrap items-center gap-2 border-t border-v5-line/60 pt-3"
            >
              {planOptions?.canCreatePlan && (
                <button
                  type="button"
                  data-testid="create-plan-btn"
                  onClick={openPlanCreateModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-v5-bg hover:bg-v5-bg-high text-primary font-label-md text-label-md font-semibold transition-fast active-press"
                >
                  <V5Icon name="note_add" className="text-[18px]" />
                  <span>Tạo kế hoạch</span>
                </button>
              )}

              {canEditActivePlanTitle && (
                <button
                  type="button"
                  data-testid="edit-plan-title-btn"
                  onClick={openPlanTitleModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-v5-bg hover:bg-v5-bg-high text-primary font-label-md text-label-md font-semibold transition-fast active-press"
                >
                  <V5Icon name="edit" className="text-[18px] text-secondary" />
                  <span>Sửa kế hoạch</span>
                </button>
              )}

              {canCancelActivePlan && (
                <button
                  type="button"
                  data-testid="cancel-plan-btn"
                  onClick={openPlanCancelModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded border border-status-danger/40 bg-status-danger-bg text-status-danger hover:brightness-95 font-label-md text-label-md font-semibold transition-fast active-press"
                >
                  <V5Icon name="cancel" className="text-[18px]" />
                  <span>Hủy kế hoạch trùng</span>
                </button>
              )}

              <button
                data-testid="add-work-item-btn"
                onClick={() => openAddModal()}
                disabled={!canAddWorkItemToActivePlan}
                title={
                  !activePlan
                    ? "Chưa có kế hoạch công tác"
                    : !planContentEditable
                      ? "Kế hoạch đang khóa nội dung"
                      : !activePlan.items?.length
                        ? "Kế hoạch chưa có hạng mục — hãy tạo hạng mục trước"
                        : "Thêm đầu việc vào kế hoạch"
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-secondary hover:bg-secondary/90 text-on-secondary font-label-md text-label-md font-semibold transition-fast shadow-sm active-press disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <V5Icon name="add" className="text-[18px]" />
                <span>+ Thêm đầu việc mới</span>
              </button>

              {canEditActivePlanContent && (
                <button
                  type="button"
                  data-testid="manage-plan-items-btn"
                  onClick={openPlanItemsManager}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-v5-bg hover:bg-v5-bg-high text-primary font-label-md text-label-md font-semibold transition-fast active-press"
                >
                  <V5Icon name="account_tree" className="text-[18px] text-secondary" />
                  <span>Quản lý hạng mục</span>
                </button>
              )}

              {deptCatalogCanManage && (
                <button
                  type="button"
                  data-testid="open-dept-catalog-manager-toolbar"
                  onClick={openDeptCatalogManager}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-v5-bg hover:bg-v5-bg-high text-primary font-label-md text-label-md font-semibold transition-fast active-press"
                >
                  <V5Icon name="settings_applications" className="text-[18px] text-status-warning" />
                  <span>Danh mục đầu việc bộ phận</span>
                </button>
              )}

              {!activePlan ? null : planContentEditable ? (
                canSubmitActivePlan ? (
                  <button
                    onClick={() => handleWorkflowAction("SUBMIT")}
                    disabled={workflowBusy}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-primary text-on-primary font-label-md text-label-md font-semibold hover:bg-primary-container transition-fast active-press shadow-sm disabled:opacity-50"
                  >
                    <V5Icon name="send" className="text-[18px]" />
                    <span>{workflowBusy ? "Đang xử lý..." : "Trình duyệt kế hoạch"}</span>
                  </button>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-v5-bg text-v5-muted font-label-md text-label-md border border-v5-line cursor-default"
                    title="Bạn không có quyền trình duyệt kế hoạch này."
                  >
                    <V5Icon name="hourglass_top" className="text-[18px]" />
                    <span>Chờ người có thẩm quyền trình duyệt</span>
                  </span>
                )
              ) : activePlan.status === "SUBMITTED" ? (
                canApproveActivePlan ? (
                  <>
                    <button
                      onClick={() => handleWorkflowAction("APPROVE")}
                      disabled={workflowBusy}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-status-success text-on-primary font-label-md text-label-md font-semibold hover:opacity-90 transition-fast active-press shadow-sm disabled:opacity-50"
                    >
                      <V5Icon name="check_circle" className="text-[18px]" />
                      <span>{workflowBusy ? "Đang xử lý..." : "Phê duyệt kế hoạch"}</span>
                    </button>
                    <button
                      onClick={() => setShowReturnModal(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-status-danger text-on-primary font-label-md text-label-md font-semibold hover:opacity-90 transition-fast active-press shadow-sm"
                    >
                      <V5Icon name="undo" className="text-[18px]" />
                      <span>Trả lại</span>
                    </button>
                  </>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-v5-bg text-v5-muted font-label-md text-label-md border border-v5-line cursor-default"
                    title={
                      selfApprovalBlocked
                        ? "Người lập/trình không được tự phê duyệt kế hoạch của mình."
                        : "Kế hoạch đang chờ lãnh đạo phụ trách phê duyệt."
                    }
                  >
                    <V5Icon
                      name={selfApprovalBlocked ? "block" : "hourglass_top"}
                      className="text-[18px]"
                    />
                    <span>
                      {selfApprovalBlocked
                        ? "Không thể tự phê duyệt — chờ cấp khác"
                        : "Chờ lãnh đạo phê duyệt"}
                    </span>
                  </span>
                )
              ) : activePlan.status === "APPROVED" ? (
                canEffectActivePlan ? (
                  <button
                    onClick={() => handleWorkflowAction("EFFECT")}
                    disabled={workflowBusy}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-status-success text-on-primary font-label-md text-label-md font-semibold hover:opacity-90 transition-fast active-press shadow-sm disabled:opacity-50"
                    title="Ban hành hiệu lực thi hành cho kế hoạch đã phê duyệt"
                  >
                    <V5Icon name="verified" className="text-[18px]" />
                    <span>{workflowBusy ? "Đang xử lý..." : "Ban hành hiệu lực"}</span>
                  </button>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-v5-bg text-v5-muted font-label-md text-label-md border border-v5-line cursor-default"
                    title="Kế hoạch đã phê duyệt, chờ lãnh đạo ban hành hiệu lực thi hành."
                  >
                    <V5Icon name="hourglass_top" className="text-[18px]" />
                    <span>Chờ ban hành hiệu lực</span>
                  </span>
                )
              ) : canRequestAmendment ? (
                <button
                  onClick={() => setShowAmendmentModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-v5-bg hover:bg-v5-bg-high text-v5-muted font-label-md text-label-md transition-fast active-press"
                  title="Đề xuất điều chỉnh bổ sung nhiệm vụ cho kế hoạch đã ban hành"
                >
                  <V5Icon name="approval_delegation" className="text-[18px]" />
                  <span>Trình duyệt bổ sung</span>
                </button>
              ) : null}

              {activePlan && (
                <a
                  data-testid="export-xlsx-btn"
                  href={`/api/reports/export?template=legacy&planId=${activePlan.id}&periodId=${activePlan.period?.id || ""}${selectedScope === "personal" ? "&scope=personal" : ""}`}
                  download
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-v5-bg hover:bg-v5-bg-high text-v5-muted font-label-md text-label-md transition-fast active-press"
                  title="Xuất dữ liệu Excel chuẩn mẫu báo cáo Hải quan (8 cột A-H)"
                >
                  <V5Icon name="download" className="text-[18px] text-status-success" />
                  <span>Xuất .Excel</span>
                </a>
              )}
            </div>
          </div>

          {/* View Mode Switcher + Interactive Filters */}
          <div className="sticky top-14 z-20 mt-space-lg flex flex-col gap-space-md rounded-lg border border-v5-line bg-v5-surface/95 p-2 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
            {/* Tabs lọc theo kỳ thật + Góc nhìn Gantt */}
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-v5-bg p-1">
              {(
                [
                  { key: "day", label: `Ngày (${countBy("DAY")})` },
                  { key: "week", label: `Tuần (${countBy("WEEK")})` },
                  { key: "month", label: `Tháng (${countBy("MONTH")})` },
                ] as const
              ).map((t) => (
                <FilterChip
                  key={t.key}
                  active={viewMode === t.key}
                  onClick={() => switchView(t.key)}
                >
                  {t.label}
                </FilterChip>
              ))}
              <FilterChip
                active={viewMode === "gantt"}
                onClick={() => switchView("gantt")}
                className="inline-flex items-center gap-1"
              >
                <V5Icon name="view_timeline" className="text-[16px]" />
                Gantt
              </FilterChip>
            </div>

            {/* Filter Controls Bar */}
            <div className="flex flex-wrap items-center gap-space-sm">
              {/* Scope Switcher: All vs Personal Plan */}
              <div className="inline-flex gap-1 rounded-lg border border-v5-line bg-v5-bg p-1">
                <FilterChip
                  active={selectedScope === "all"}
                  onClick={() => setSelectedScope("all")}
                >
                  Toàn đơn vị
                </FilterChip>
                <FilterChip
                  active={selectedScope === "personal"}
                  onClick={() => setSelectedScope("personal")}
                  title="Chỉ hiển thị các đầu việc/nhiệm vụ do bạn phụ trách trong kế hoạch đang chọn"
                  className="inline-flex items-center gap-1"
                >
                  <V5Icon name="person" className="text-[15px]" />
                  Việc của tôi
                </FilterChip>
              </div>

              {filteredPlans.length > 0 && (
                <div
                  className="flex min-w-0 items-center gap-1.5 bg-v5-bg px-3 py-1.5 rounded text-v5-ink border border-v5-line"
                  title={activePlan?.title}
                >
                  <span className="font-label-sm text-label-sm text-v5-muted">Chọn kế hoạch:</span>
                  <select
                    data-testid="plan-select"
                    value={activePlan?.id || ""}
                    onChange={(e) => setSelectedPlanId(e.target.value)}
                    className="min-w-0 bg-transparent font-label-md text-label-md font-semibold text-primary focus:outline-none cursor-pointer max-w-[320px] truncate"
                  >
                    {filteredPlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.unit?.code ? `[${p.unit.code}] ` : ""}
                        {p.title} ({p.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-1.5 bg-v5-bg px-3 py-1.5 rounded text-v5-ink border border-v5-line">
                <span className="font-label-sm text-label-sm text-v5-muted">Phụ trách:</span>
                <select
                  value={selectedOfficerFilter}
                  onChange={(e) => setSelectedOfficerFilter(e.target.value)}
                  className="bg-transparent font-label-md text-label-md text-primary focus:outline-none cursor-pointer"
                >
                  <option value="all">
                    {planOfficers.length > 0 ? `Tất cả cán bộ (${planOfficers.length})` : "Chưa có cán bộ"}
                  </option>
                  {planOfficers.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5 bg-v5-bg px-3 py-1.5 rounded text-v5-ink border border-v5-line">
                <span className="font-label-sm text-label-sm text-v5-muted">Ưu tiên:</span>
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
              {(selectedOfficerFilter !== "all" || selectedPriorityFilter !== "all") && (
                <button
                  type="button"
                  onClick={clearWorkItemFilters}
                  className="inline-flex items-center gap-1 rounded border border-v5-line bg-surface px-2.5 py-1.5 text-label-sm font-semibold text-v5-muted hover:bg-v5-bg"
                >
                  <V5Icon name="filter_alt_off" className="text-[15px]" />
                  Xóa lọc
                </button>
              )}
            </div>
          </div>
        </div>

        {!activePlan && (
          <div className="bg-v5-surface rounded-xl border border-dashed border-v5-line p-8 text-center">
            <V5Icon name="event_note" className="text-v5-muted text-[40px]" />
            <h2 className="font-headline-sm text-headline-sm text-primary mt-2">
              Chưa có kế hoạch cho kỳ này
            </h2>
            <p className="text-sm text-v5-muted mt-1">
              Dữ liệu bên dưới chỉ hiển thị kế hoạch có thật trong phạm vi bạn được xem.
              {planOptions?.canCreatePlan
                ? " Bạn có thể tạo kế hoạch mới cho đơn vị trong phạm vi được cấp quyền."
                : " Bạn chưa có quyền lập kế hoạch — vui lòng liên hệ người có thẩm quyền."}
            </p>
            {planOptions?.canCreatePlan && (
              <button
                type="button"
                onClick={openPlanCreateModal}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded bg-secondary text-on-secondary text-sm font-semibold"
              >
                <V5Icon name="note_add" className="text-[18px]" />
                Tạo kế hoạch
              </button>
            )}
          </div>
        )}

        {/* Góc nhìn Gantt — timeline nhiệm vụ liên kết của kế hoạch đang chọn (dữ liệu thật) */}
        {viewMode === "gantt" && (
          <div className="bg-v5-surface rounded-xl shadow-sm overflow-hidden flex flex-col border border-v5-line/50">
            <div className="px-space-lg py-2.5 bg-primary-container text-on-primary text-label-sm font-label-sm flex items-center gap-2">
              <V5Icon name="view_timeline" className="text-secondary-fixed text-[18px]" />
              <span>
                <strong className="text-white uppercase tracking-wider font-semibold">Gantt:</strong>{" "}
                {activePlan ? `${activePlan.title} — ${ganttData?.tasks.length || 0} nhiệm vụ liên kết` : "Chưa có kế hoạch"}
              </span>
            </div>
            {!ganttData || ganttData.tasks.length === 0 ? (
              <div className="p-8 text-center text-sm text-v5-muted">
                Kế hoạch này chưa liên kết nhiệm vụ nào. Dùng thao tác liên kết nhiệm vụ vào hạng mục để xem trên Gantt.
              </div>
            ) : (
              <div className="overflow-x-auto p-space-md">
                <div className="min-w-[720px]">
                  <div className="flex text-[11px] text-v5-muted font-mono mb-1">
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
                      <div key={t.id} className="flex items-center py-1.5 border-t border-v5-line/50">
                        <div className="w-64 shrink-0 pr-2 min-w-0">
                          <div className="text-xs font-semibold text-v5-ink truncate" title={t.title}>
                            [{t.code}] {t.title}
                          </div>
                          <div className="text-[11px] text-v5-muted truncate">
                            {t.owner?.fullName || "Chưa phân công"} • Hạn {new Date(t.currentDeadline).toLocaleDateString("vi-VN")}
                          </div>
                        </div>
                        <div className="flex-1 relative h-6 bg-v5-bg rounded">
                          <div
                            className={`absolute top-1 h-4 rounded ${color}`}
                            style={{ left: `${barStartPct}%`, width: `${widthPct}%` }}
                            title={`${t.title} — Hạn ${new Date(t.currentDeadline).toLocaleDateString("vi-VN")}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex gap-4 mt-2 text-[11px] text-v5-muted">
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
        <div className="bg-v5-surface rounded-xl shadow-sm overflow-hidden flex flex-col border border-v5-line/50">
          {/* Business rules: giữ chi tiết nhưng thu gọn để không chiếm chỗ bảng */}
          <details className="group border-b border-primary/20 bg-primary-container text-on-primary">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-space-lg py-2 text-label-sm font-label-sm [&::-webkit-details-marker]:hidden">
              <V5Icon name="rule_settings" className="text-secondary-fixed text-[18px]" />
              <span className="font-semibold uppercase tracking-wider">Quy tắc nghiệp vụ Cột C</span>
              <span className="hidden truncate text-on-primary-container/90 md:inline">
                — Danh mục đầu việc biến động theo cán bộ và kỳ công tác
              </span>
              <span className="ml-auto shrink-0 rounded border border-white/20 px-1.5 py-0.5 text-[10px]">
                V1.1
              </span>
            </summary>
            <div className="border-t border-white/15 px-space-lg py-2 text-[12px] leading-relaxed text-on-primary-container">
              “Danh mục đầu việc” biến động linh hoạt theo từng Cán bộ phụ trách và kỳ công tác, hỗ trợ liên kết mẫu
              nghiệp vụ chuẩn hóa [Mã Mẫu] hoặc đăng ký đầu việc đặc thù.
            </div>
          </details>

          {/* Cảnh báo phân công: thu gọn để không chiếm chỗ bảng */}
          {unassignedItemCount > 0 && (
            <details
              data-testid="plan-assignment-warning"
              className="border-b border-status-warning/30 bg-status-warning-bg/40 text-status-warning"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-space-lg py-2 text-label-sm font-label-sm [&::-webkit-details-marker]:hidden">
                <V5Icon name="warning" className="text-[18px]" />
                <strong>Cảnh báo phân công ({unassignedItemCount})</strong>
                <span className="text-v5-muted">— bấm để xem chi tiết</span>
                <span className="ml-auto rounded border border-status-warning/40 bg-status-warning-bg px-2 py-0.5 text-[10px] font-semibold uppercase">
                  Chưa phân nhóm
                </span>
              </summary>
              <div className="border-t border-status-warning/20 px-space-lg py-2 text-body-xs text-status-warning">
                Kế hoạch có nhiệm vụ trọng tâm chưa được phân vào 6 nhóm nghiệp vụ quy chuẩn của Hải quan.
                Vui lòng xác định nhóm nghiệp vụ trước khi phát hành báo cáo chính thức.
              </div>
            </details>
          )}

          <div className="overflow-x-auto w-full custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1240px]">
              <thead className="sticky top-0 z-10 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                <tr className="bg-v5-bg font-table-header text-table-header text-primary">
                  <th className="py-3 px-space-md w-[110px] uppercase tracking-wider text-center">Thứ / Ngày</th>
                  <th className="py-3 px-space-md w-[200px] uppercase tracking-wider">Nhóm nhiệm vụ</th>
                  <th className="py-3 px-space-lg min-w-[340px] uppercase tracking-wider bg-v5-bg-highest/40 text-primary">
                    <div className="flex items-center justify-between gap-2">
                      <span title="Cột C: Danh mục đầu việc biến động theo từng cá nhân">
                        Đầu việc / Danh mục
                      </span>
                      <span
                        className="shrink-0 rounded bg-secondary-fixed px-1.5 py-0.5 text-[10px] font-semibold uppercase text-secondary"
                        title="Hỗ trợ mẫu chuẩn và đầu việc tùy biến"
                      >
                        Mẫu
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
                        <td colSpan={9} className="py-16 text-center text-v5-muted">
                          <V5Icon
                            name={activePlan ? "account_tree" : "event_note"}
                            className="text-v5-muted text-[40px] block mb-2"
                          />
                          <p className="font-body-semibold text-body-semibold text-v5-ink">
                            {activePlan
                              ? "Kế hoạch chưa có hạng mục"
                              : "Chưa có kế hoạch công tác trong phạm vi được xem"}
                          </p>
                          <p className="font-table-data text-[12px] text-v5-muted mt-1">
                            {activePlan
                              ? "Tạo hạng mục trước, sau đó thêm đầu việc vào từng hạng mục."
                              : planOptions?.canCreatePlan
                                ? "Bạn có thể tạo kế hoạch mới cho đơn vị trong phạm vi được cấp quyền."
                                : "Vui lòng liên hệ người có thẩm quyền lập kế hoạch."}
                          </p>
                          {activePlan && canEditActivePlanContent && (
                            <button
                              type="button"
                              onClick={openPlanItemsManager}
                              className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded bg-secondary text-on-secondary text-xs font-semibold"
                            >
                              <V5Icon name="account_tree" className="text-[16px]" />
                              Quản lý hạng mục
                            </button>
                          )}
                          {!activePlan && planOptions?.canCreatePlan && (
                            <button
                              type="button"
                              onClick={openPlanCreateModal}
                              className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded bg-secondary text-on-secondary text-xs font-semibold"
                            >
                              <V5Icon name="note_add" className="text-[16px]" />
                              Tạo kế hoạch
                            </button>
                          )}
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
                    products?: PickedProduct[];
                    reviewState?: string | null;
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
                      const groupName =
                        wi.group?.name ||
                        wi.template?.group?.name ||
                        item.group?.name ||
                        "Chưa phân nhóm nghiệp vụ";

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
                        products: workItemProducts(wi),
                        reviewState: wi.reviewState,
                        ownerName: wi.person?.fullName || "Chưa phân công",
                        coordinationUnit: wi.coordinationUnit || "—",
                        priority: wi.priority || "Trung bình",
                        expectedResult: wi.expectedResult || "Chưa nhập",
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
                      let displayCoord = activePlan.unit?.name || "Chưa xác định đơn vị";

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
                        dayLabel: "Theo kế hoạch",
                        dateStr: "",
                        deadlineText: deadlineStr,
                        isUnassignedGroup: isUnassigned,
                        groupTitle: groupName,
                        title: displayTitle,
                        code: task.code,
                        ownerName: displayOwner,
                        coordinationUnit: displayCoord,
                        priority: task.priority === "HIGH" ? "Cao" : task.priority === "LOW" ? "Thấp" : "Trung bình",
                        expectedResult: task.expectedResultText || "Chưa nhập",
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
                    const hasWorkItemFilter =
                      selectedOfficerFilter !== "all" || selectedPriorityFilter !== "all";
                    const emptyTitle =
                      selectedScope === "personal"
                        ? "Bạn chưa được phân công đầu việc nào trong kế hoạch này"
                        : hasWorkItemFilter
                          ? "Không có đầu việc phù hợp với bộ lọc hiện tại"
                          : "Kế hoạch này chưa có đầu việc";
                    const emptyHint =
                      selectedScope === "personal"
                        ? "Chuyển sang “Toàn đơn vị” để xem toàn bộ đầu việc trong phạm vi được xem."
                        : hasWorkItemFilter
                          ? "Bấm “Xóa lọc” để bỏ bộ lọc cán bộ / mức ưu tiên."
                          : "Bấm “Thêm đầu việc mới” để bắt đầu nhập nội dung cho kế hoạch.";
                    return (
                      <tr>
                        <td colSpan={9} className="py-16 text-center text-v5-muted">
                          <V5Icon
                            name={hasWorkItemFilter ? "filter_alt_off" : "playlist_add"}
                            className="text-v5-muted text-[40px] block mb-2"
                          />
                          <p className="font-body-semibold text-body-semibold text-v5-ink">
                            {emptyTitle}
                          </p>
                          <p className="font-table-data text-[12px] text-v5-muted mt-1">
                            {emptyHint}
                          </p>
                        </td>
                      </tr>
                    );
                  }

                  return filteredRows.map((row) => (
                    <tr key={row.id} className="hover:bg-v5-bg/40 transition-colors">
                      <td className="py-4 px-space-md text-center align-top bg-v5-bg/30">
                        <div className="font-body-semibold text-primary">{row.dayLabel}</div>
                        {row.dateStr && <div className="font-label-sm text-label-sm text-v5-muted">{row.dateStr}</div>}
                      </td>
                      <td className="py-4 px-space-md align-top">
                        {row.isUnassignedGroup ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-status-warning-bg text-status-warning border border-status-warning/40">
                            <V5Icon name="help_outline" className="text-[13px]" />
                            Chưa phân nhóm nghiệp vụ
                          </span>
                        ) : (
                          <span className="font-body-semibold text-primary block">{row.groupTitle}</span>
                        )}
                      </td>
                      <td className="py-4 px-space-lg align-top bg-v5-surface">
                        <div className="flex flex-col gap-1.5">
                          <div className="font-body-semibold text-primary text-[14px]">
                            {row.title}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {row.code && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-v5-bg text-primary font-semibold">
                                {row.code}
                              </span>
                            )}
                            {row.templateCode && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-secondary-fixed text-on-secondary-fixed-variant font-semibold">
                                MÃ MẪU: {row.templateCode}
                              </span>
                            )}
                            {row.deptWorkItemTitle && (
                              <span className="px-2 py-0.5 rounded text-[11px] bg-v5-bg-high text-primary font-semibold border border-v5-line">
                                BỘ PHẬN: {row.deptWorkItemTitle}
                              </span>
                            )}
                            {row.products?.map((p) => (
                              <span
                                key={p.id}
                                className="px-2 py-0.5 rounded text-[11px] font-mono bg-secondary/15 text-secondary font-semibold"
                                title={`${p.taskName}${p.groupName ? ` · ${p.groupName}` : ""}${
                                  p.convertFactor !== null && p.convertFactor !== undefined
                                    ? ` · Hệ số: ${p.convertFactor}`
                                    : " · Chưa có hệ số"
                                }${p.reviewState ? ` · ${reviewStateText(p.reviewState)}` : ""}`}
                              >
                                SP: {p.code}
                              </span>
                            ))}
                            {row.deadlineText && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-v5-bg-high text-primary font-semibold border border-v5-line">
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
                            <span className="font-body-semibold text-v5-ink block text-sm">{row.ownerName}</span>
                            <span className="text-xs text-v5-muted">{activePlan?.unit?.name || "Bộ phận"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-space-md align-top">
                        <span className="text-xs text-v5-muted font-medium">{row.coordinationUnit}</span>
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
                        <span className="text-xs text-v5-muted">{row.expectedResult}</span>
                      </td>
                      <td className="py-4 px-space-md align-top text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold ${
                              row.status === "COMPLETED"
                                ? "bg-status-success-bg text-status-success"
                                : row.status === "NOT_STARTED"
                                ? "bg-v5-bg text-v5-muted"
                                : row.hasIssue
                                ? "bg-status-danger-bg text-status-danger"
                                : "bg-status-warning-bg text-status-warning"
                            }`}
                          >
                            <V5Icon
                              name={
                                row.status === "COMPLETED"
                                  ? "check_circle"
                                  : row.status === "NOT_STARTED"
                                    ? "schedule"
                                    : row.hasIssue
                                      ? "warning"
                                      : "hourglass_top"
                              }
                              className="text-[14px]"
                            />
                            <span>
                              {row.status === "COMPLETED"
                                ? "Đã hoàn thành"
                                : row.status === "NOT_STARTED"
                                ? "Chưa thực hiện"
                                : row.status === "DISCONTINUED"
                                ? "Ngừng áp dụng"
                                : row.hasIssue
                                ? "Vướng mắc"
                                : "Đang thực hiện"}
                            </span>
                          </span>
                          {row.rawWorkItem && (
                            <span
                              className={`text-[10px] leading-tight ${
                                row.reviewState === "CONFIRMED"
                                  ? "text-status-success font-semibold"
                                  : row.reviewState === "SUBMITTED"
                                  ? "text-status-warning font-semibold"
                                  : "text-v5-muted"
                              }`}
                            >
                              {reviewStateText(row.reviewState)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-space-md align-top text-center">
                        <div className="flex items-center justify-center gap-1">
                          {row.rawWorkItem && (() => {
                            const canModify = canModifyWorkItem(row.rawWorkItem);
                            const reason = !planContentEditable
                              ? "Kế hoạch đang khóa nội dung"
                              : row.rawWorkItem.status === "COMPLETED"
                                ? "Đầu việc đã hoàn thành — chỉ xem"
                                : isWorkItemLocked(row.rawWorkItem)
                                  ? "Đầu việc đã gửi/đã được xác nhận — nội dung đã khóa"
                                  : "Chỉnh sửa đầu việc";
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(row.rawWorkItem!)}
                                  disabled={!canModify}
                                  className="p-1 rounded hover:bg-v5-bg text-v5-muted hover:text-primary transition-colors inline-block disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={reason}
                                >
                                  <V5Icon name="edit" className="text-[18px]" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteWorkItem(row.rawWorkItem!.id)}
                                  disabled={!canModify}
                                  className="p-1 rounded hover:bg-status-danger-bg text-v5-muted hover:text-status-danger transition-colors inline-block disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={canModify ? "Xóa đầu việc" : reason}
                                >
                                  <V5Icon name="delete" className="text-[18px]" />
                                </button>
                              </>
                            );
                          })()}
                          {row.rawTask && (
                            <Link
                              href={`/tasks/${row.rawTask.id}`}
                              className="p-1 rounded hover:bg-v5-bg text-v5-muted hover:text-primary transition-colors inline-block"
                              title="Xem chi tiết nhiệm vụ"
                            >
                              <V5Icon name="visibility" className="text-[18px]" />
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
          {/* Period Segmented Control — dùng chung viewMode với Desktop */}
          <div className="bg-v5-bg-high p-1 rounded-xl flex items-center justify-between">
            <button
              onClick={() => switchView("day")}
              className={`flex-1 py-1.5 rounded-lg font-label-md text-label-md text-center transition-fast ${
                viewMode === "day"
                  ? "bg-v5-surface text-primary shadow-sm font-semibold"
                  : "text-v5-muted"
              }`}
            >
              Ngày
            </button>
            <button
              onClick={() => switchView("week")}
              className={`flex-1 py-1.5 rounded-lg font-label-md text-label-md text-center transition-fast ${
                viewMode === "week"
                  ? "bg-v5-surface text-primary shadow-sm font-semibold"
                  : "text-v5-muted"
              }`}
            >
              {mobileLabels.weekShort}
            </button>
            <button
              onClick={() => switchView("month")}
              className={`flex-1 py-1.5 rounded-lg font-label-md text-label-md text-center transition-fast ${
                viewMode === "month"
                  ? "bg-v5-surface text-primary shadow-sm font-semibold"
                  : "text-v5-muted"
              }`}
            >
              {mobileLabels.monthShort}
            </button>
          </div>

          {/* Kỳ của kế hoạch đang chọn — không suy đoán kỳ hiện tại nếu chưa có kế hoạch */}
          <div className="flex items-center justify-between bg-v5-surface px-space-md py-space-sm rounded-xl shadow-sm border border-v5-line/40">
            <button
              type="button"
              aria-label="Kỳ trước"
              disabled
              title="Chưa hỗ trợ chuyển kỳ trên màn hình này"
              className="w-9 h-9 rounded-lg bg-v5-bg flex items-center justify-center text-v5-ink opacity-40 cursor-not-allowed"
            >
              <V5Icon name="chevron_left" className="text-[20px]" />
            </button>
            <div className="flex flex-col items-center text-center px-2">
              <div className="flex items-center gap-1 text-primary">
                <V5Icon name="calendar_month" className="text-[18px]" />
                <span className="font-headline-sm text-headline-sm">
                  {activePlan?.period
                    ? `${activePlan.period.title || activePlan.period.name || "Kỳ kế hoạch"}${
                        activePlan.period.startAt && activePlan.period.endAt
                          ? ` (${formatPeriodRangeFromDates(new Date(activePlan.period.startAt), new Date(activePlan.period.endAt))})`
                          : ""
                      }`
                    : "Chưa có kỳ kế hoạch"}
                </span>
              </div>
              <span className="font-label-sm text-label-sm text-v5-muted">
                {activePlan ? "Kỳ công tác theo kế hoạch" : "Chọn hoặc tạo kế hoạch để xem kỳ"}
              </span>
            </div>
            <button
              type="button"
              aria-label="Kỳ sau"
              disabled
              title="Chưa hỗ trợ chuyển kỳ trên màn hình này"
              className="w-9 h-9 rounded-lg bg-v5-bg flex items-center justify-center text-v5-ink opacity-40 cursor-not-allowed"
            >
              <V5Icon name="chevron_right" className="text-[20px]" />
            </button>
          </div>

          {/* Plan selector thật — chỉ liệt kê kế hoạch trong phạm vi được xem */}
          <label className="flex flex-col gap-1 text-xs font-semibold text-v5-muted">
            Kế hoạch đang xem
            <select
              data-testid="plan-select-mobile"
              value={activePlan?.id || ""}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              disabled={filteredPlans.length === 0}
              className="h-11 px-3 rounded-lg bg-v5-surface text-primary border border-v5-line/50 disabled:opacity-60"
            >
              {filteredPlans.length === 0 ? (
                <option value="">Chưa có kế hoạch</option>
              ) : (
                filteredPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.unit?.name || "Chưa xác định đơn vị"} — {p.title} ({p.status})
                  </option>
                ))
              )}
            </select>
          </label>

          {/* Scope Filter Switch — bộ lọc đầu việc, không phải loại kế hoạch */}
          <div className="flex gap-space-sm">
            <button
              onClick={() => setSelectedScope("personal")}
              title="Chỉ hiển thị đầu việc/nhiệm vụ do bạn phụ trách"
              className={`flex-1 py-2 px-space-sm rounded-lg font-body-semibold text-center shadow-sm flex items-center justify-center gap-1.5 transition-fast ${
                selectedScope === "personal"
                  ? "bg-primary text-on-primary"
                  : "bg-v5-bg-high text-v5-muted"
              }`}
            >
              <V5Icon name="person" className="text-[16px]" />
              <span>Việc của tôi</span>
            </button>
            <button
              onClick={() => setSelectedScope("all")}
              title="Hiển thị đầu việc/nhiệm vụ của tất cả nhân sự trong phạm vi được xem"
              className={`flex-1 py-2 px-space-sm rounded-lg font-body-semibold text-center flex items-center justify-center gap-1.5 transition-fast ${
                selectedScope === "all"
                  ? "bg-primary text-on-primary"
                  : "bg-v5-bg-high text-v5-muted"
              }`}
            >
              <V5Icon name="group" className="text-[16px]" />
              <span>Toàn đơn vị</span>
            </button>
          </div>
        </section>

        {/* Plan Metadata & Approval State Card */}
        <section className="px-margin mt-space-md">
          <div className="bg-v5-surface p-space-md rounded-xl shadow-sm flex flex-col gap-space-sm border border-v5-line/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <div className="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-headline-sm text-headline-sm font-bold">
                  {activePlan?.unit?.name?.slice(0, 2).toUpperCase() || "—"}
                </div>
                <div className="flex flex-col">
                  <span className="font-body-semibold text-primary">
                    {activePlan?.unit?.name || "Chưa xác định đơn vị"}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-v5-muted">
                      {activePlan?.title || "Chưa có kế hoạch công tác"}
                    </span>
                    {canEditActivePlanTitle && (
                      <button
                        type="button"
                        data-testid="edit-plan-title-btn-mobile"
                        onClick={openPlanTitleModal}
                        title="Sửa tiêu đề kế hoạch"
                        aria-label="Sửa tiêu đề kế hoạch"
                        className="p-1 rounded text-secondary hover:bg-v5-bg transition-colors"
                      >
                        <V5Icon name="edit" className="text-[15px]" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                activePlan?.status === "APPROVED" || activePlan?.status === "IN_EFFECT"
                  ? "bg-status-success-bg text-status-success"
                  : activePlan?.status === "SUBMITTED"
                  ? "bg-status-warning-bg text-status-warning"
                  : activePlan?.status === "RETURNED"
                  ? "bg-status-danger-bg text-status-danger"
                  : "bg-v5-bg text-v5-muted"
              }`}>
                {activePlan?.status === "IN_EFFECT"
                  ? "CÓ HIỆU LỰC"
                  : activePlan?.status === "APPROVED"
                  ? "ĐÃ DUYỆT"
                  : activePlan?.status === "SUBMITTED"
                  ? "CHỜ DUYỆT"
                  : activePlan?.status === "RETURNED"
                  ? "YÊU CẦU CHỈNH SỬA"
                  : activePlan
                  ? "BẢN NHÁP"
                  : "CHƯA CÓ KẾ HOẠCH"}
              </span>
            </div>
          </div>
        </section>

        {/* Quick Action Toolbar */}
        <section className="px-margin mt-space-md">
          <div className="flex flex-col gap-2">
            {/* Primary Action CTA */}
            <button
              data-testid="add-work-item-btn-mobile"
              onClick={() => openAddModal()}
              disabled={!canAddWorkItemToActivePlan}
              title={
                !activePlan
                  ? "Chưa có kế hoạch công tác"
                  : !planContentEditable
                    ? "Kế hoạch đang khóa nội dung"
                    : !activePlan.items?.length
                      ? "Kế hoạch chưa có hạng mục — hãy tạo hạng mục trước"
                      : "Thêm đầu việc vào kế hoạch"
              }
              className="w-full h-11 bg-secondary text-on-secondary rounded-lg font-body-semibold text-body-semibold flex items-center justify-center gap-2 shadow-sm hover:opacity-95 active:scale-[0.99] transition-all active-press disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <V5Icon name="add_task" className="text-[20px]" />
              <span>+ Thêm đầu việc công tác</span>
            </button>
            {/* Secondary Quick Triggers */}
            <div className="grid grid-cols-2 gap-space-sm">
              {canEditActivePlanContent ? (
                <button
                  type="button"
                  data-testid="manage-plan-items-btn-mobile"
                  onClick={openPlanItemsManager}
                  className="h-10 px-space-sm bg-v5-surface text-primary rounded-lg font-label-md text-label-md flex items-center justify-center gap-1.5 shadow-sm hover:bg-v5-bg transition-colors active-press"
                >
                  <V5Icon name="account_tree" className="text-[18px] text-secondary" />
                  <span className="truncate">Quản lý hạng mục</span>
                </button>
              ) : planOptions?.canCreatePlan ? (
                <button
                  type="button"
                  onClick={openPlanCreateModal}
                  className="h-10 px-space-sm bg-v5-surface text-primary rounded-lg font-label-md text-label-md flex items-center justify-center gap-1.5 shadow-sm hover:bg-v5-bg transition-colors active-press"
                >
                  <V5Icon name="note_add" className="text-[18px] text-secondary" />
                  <span className="truncate">Tạo kế hoạch</span>
                </button>
              ) : (
                <span className="h-10 px-space-sm bg-v5-surface text-v5-muted rounded-lg font-label-md text-label-md flex items-center justify-center gap-1.5 opacity-60">
                  <V5Icon name="lock" className="text-[18px]" />
                  <span className="truncate">Nội dung đang khóa</span>
                </span>
              )}
              <Link
                href="/reports"
                className="h-10 px-space-sm bg-v5-surface text-primary rounded-lg font-label-md text-label-md flex items-center justify-center gap-1.5 shadow-sm hover:bg-v5-bg transition-colors active-press"
              >
                <V5Icon name="description" className="text-[18px] text-primary" />
                <span className="truncate">Xem báo cáo</span>
              </Link>
            </div>
            {canCancelActivePlan && (
              <button
                type="button"
                data-testid="cancel-plan-btn-mobile"
                onClick={openPlanCancelModal}
                className="w-full h-10 px-space-sm bg-status-danger-bg text-status-danger border border-status-danger/40 rounded-lg font-label-md text-label-md flex items-center justify-center gap-1.5 hover:brightness-95 transition-colors active-press"
              >
                <V5Icon name="cancel" className="text-[18px]" />
                <span className="truncate">Hủy kế hoạch trùng</span>
              </button>
            )}
            {deptCatalogCanManage && (
              <button
                type="button"
                data-testid="open-dept-catalog-manager-toolbar-mobile"
                onClick={openDeptCatalogManager}
                className="w-full h-10 px-space-sm bg-v5-surface text-primary rounded-lg font-label-md text-label-md flex items-center justify-center gap-1.5 shadow-sm hover:bg-v5-bg transition-colors active-press"
              >
                <V5Icon name="settings_applications" className="text-[18px] text-status-warning" />
                <span className="truncate">Danh mục đầu việc bộ phận</span>
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
                <div key={item.id} className="bg-v5-surface rounded-xl overflow-hidden shadow-sm border border-v5-line/50">
                  <button
                    onClick={() => toggleAccordion(secKey)}
                    className="w-full p-space-md bg-v5-bg flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-secondary" />
                      <span className="font-headline-sm text-[13px] uppercase font-bold text-primary">
                        {item.title} ({totalItems})
                      </span>
                    </div>
                    <V5Icon
                      name="expand_more"
                      className={`text-[20px] transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="p-3 flex flex-col gap-3">
                      {totalItems === 0 ? (
                        <p className="text-xs text-v5-muted py-2 text-center">Chưa có đầu việc nào trong mục này</p>
                      ) : (
                        <>
                          {item.workItems?.map((wi) => {
                            const products = workItemProducts(wi);
                            const canModify = canModifyWorkItem(wi);
                            return (
                              <div key={wi.id} className="p-3 rounded-lg bg-v5-bg border border-v5-line flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-label-sm font-bold text-primary truncate">
                                    {wi.template ? `[${wi.template.code}]` : wi.deptWorkItem ? "[BỘ PHẬN]" : "ĐẦU VIỆC"}
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-secondary/15 text-secondary text-xs font-bold shrink-0">
                                    {wi.person?.fullName || "Chưa giao"}
                                  </span>
                                </div>
                                <h4 className="font-body-semibold text-sm text-primary">{wi.title}</h4>
                                {(wi.deptWorkItem || products.length > 0) && (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {wi.deptWorkItem && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-v5-bg-high text-primary border border-v5-line">
                                        {wi.deptWorkItem.title}
                                      </span>
                                    )}
                                    {products.map((p) => (
                                      <span
                                        key={p.id}
                                        className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-secondary/15 text-secondary font-mono"
                                        title={`${p.taskName}${p.groupName ? ` · ${p.groupName}` : ""}`}
                                      >
                                        SP: {p.code}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <div className="flex items-center justify-between gap-2 text-xs text-v5-muted pt-1 border-t border-v5-line">
                                  <div className="flex flex-col gap-0.5">
                                    <span>Thực hiện: {wi.status === "COMPLETED" ? "Đã hoàn thành" : wi.status === "IN_PROGRESS" || wi.status === "ACTIVE" ? "Đang thực hiện" : wi.status === "DISCONTINUED" ? "Ngừng áp dụng" : "Chưa bắt đầu"}</span>
                                    <span className={wi.reviewState === "CONFIRMED" ? "text-status-success font-semibold" : wi.reviewState === "SUBMITTED" ? "text-status-warning font-semibold" : ""}>
                                      Xác nhận: {reviewStateText(wi.reviewState)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => openEditModal(wi)}
                                      disabled={!canModify}
                                      title={canModify ? "Sửa đầu việc" : "Đầu việc đã khóa hoặc đã hoàn thành — chỉ xem"}
                                      className="text-secondary font-bold flex items-center gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                                    >
                                      <V5Icon name="edit" className="text-[15px]" />
                                      <span>Sửa</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteWorkItem(wi.id)}
                                      disabled={!canModify}
                                      title={canModify ? "Xóa đầu việc" : "Không thể xóa đầu việc đã khóa/đã hoàn thành"}
                                      className="text-status-danger font-bold flex items-center gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                                    >
                                      <V5Icon name="delete" className="text-[15px]" />
                                      <span>Xóa</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {item.taskLinks?.map((tl) => (
                            <div key={tl.task.id} className="p-3 rounded-lg bg-v5-bg border border-v5-line flex flex-col gap-2">
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
                              <div className="flex items-center justify-between text-xs text-v5-muted pt-1 border-t border-v5-line">
                                <span>Ưu tiên: {tl.task.priority}</span>
                                <Link href={`/tasks/${tl.task.id}`} className="text-secondary font-bold flex items-center gap-0.5">
                                  <span>Xử lý</span>
                                  <V5Icon name="arrow_forward" className="text-[14px]" />
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
            <div className="p-6 bg-v5-surface rounded-xl text-center text-sm">
              {activePlan ? (
                <>
                  <V5Icon name="account_tree" className="text-v5-muted text-[32px]" />
                  <p className="font-semibold text-primary mt-1">Kế hoạch chưa có hạng mục</p>
                  <p className="text-v5-muted text-xs mt-1">
                    Tạo hạng mục trước, sau đó thêm đầu việc vào từng hạng mục.
                  </p>
                  {canEditActivePlanContent && (
                    <button
                      type="button"
                      onClick={openPlanItemsManager}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded bg-secondary text-on-secondary text-xs font-semibold"
                    >
                      <V5Icon name="account_tree" className="text-[16px]" />
                      Quản lý hạng mục
                    </button>
                  )}
                </>
              ) : (
                <>
                  <V5Icon name="event_note" className="text-v5-muted text-[32px]" />
                  <p className="font-semibold text-primary mt-1">Chưa có kế hoạch công tác</p>
                  <p className="text-v5-muted text-xs mt-1">
                    {planOptions?.canCreatePlan
                      ? "Tạo kế hoạch mới cho đơn vị trong phạm vi được cấp quyền."
                      : "Bạn chưa có quyền lập kế hoạch — vui lòng liên hệ người có thẩm quyền."}
                  </p>
                  {planOptions?.canCreatePlan && (
                    <button
                      type="button"
                      onClick={openPlanCreateModal}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded bg-secondary text-on-secondary text-xs font-semibold"
                    >
                      <V5Icon name="note_add" className="text-[16px]" />
                      Tạo kế hoạch
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {/* =========================================================================
          MODAL: THÊM / CHỈNH SỬA ĐẦU VIỆC KẾ HOẠCH (Chuẩn hóa 8 Cột Excel A-H)
          ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-4xl bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line transition-panel">
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <div className="flex items-center gap-2">
                <V5Icon
                  name={editingItem ? "edit_note" : "post_add"}
                  className="text-[22px] text-secondary-fixed"
                />
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
                <V5Icon name="close" className="text-[20px]" />
              </button>
            </div>

            <form onSubmit={handleSaveWorkItem}>
              <div className="p-space-md flex flex-col gap-space-md max-h-[75vh] overflow-y-auto">
                {modalError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-status-danger/40 bg-status-danger-bg px-3 py-2 text-sm text-status-danger flex items-start gap-1.5"
                  >
                    <V5Icon name="error" className="text-[18px]" />
                    <span>{modalError}</span>
                  </div>
                )}
                {/* 1. YC-23 + YC-25: Khu vực chọn đầu việc từ danh mục — mỗi nguồn một cột riêng */}
                <div
                  data-testid="catalog-picker"
                  className="rounded-xl border border-v5-line bg-v5-bg/50 p-3 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-label-md text-label-md text-primary font-semibold flex items-center gap-1.5">
                      <V5Icon name="library_books" className="text-[18px] text-secondary" />
                      Chọn từ danh mục — tối đa một nguồn đầu việc, không bắt buộc
                    </span>
                    <span className="text-[11px] text-v5-muted">Nguồn: Danh mục TX · bộ phận · 48 mẫu cũ · sản phẩm QĐ1277 gắn kèm</span>
                  </div>

                  {/* YC-31 — TX và QĐ1277 được chọn tại một bộ chọn thống nhất bên dưới. */}
                  <div
                    data-testid="modal-tx-picker"
                    className="text-[11px] text-v5-muted rounded border border-dashed border-v5-line p-2.5 flex items-start gap-1.5"
                  >
                    <V5Icon name="info" className="text-[14px] shrink-0" />
                    <span>
                      {txEntries.filter((e) => e.status === "ACTIVE").length > 0
                        ? `${txEntries.filter((e) => e.status === "ACTIVE").length} công việc TX đang áp dụng. Chọn TX và sản phẩm QĐ1277 tại bộ chọn nguồn công việc bên dưới; hai nguồn này độc lập với 48 mẫu cũ và nhóm Excel.`
                        : catalogActivationStatus === "NO_VERSION"
                          ? "Chưa có Danh mục TX đang áp dụng — có thể dùng danh mục bộ phận, 48 mẫu cũ hoặc tự nhập."
                          : "Bộ phận của bạn chưa được kích hoạt Danh mục TX — có thể dùng danh mục bộ phận, 48 mẫu cũ hoặc tự nhập."}
                    </span>
                  </div>

                  {!legacyTemplatesSelectable && !modalTemplateId && (
                    <div className="text-[11px] text-status-warning flex items-start gap-1">
                      <V5Icon name="info" className="text-[14px]" />
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
                          <V5Icon name="settings" className="text-[14px]" />
                          Quản lý danh mục bộ phận
                        </button>
                      )}
                    </label>
                    <select
                      data-testid="modal-dept-item-select"
                      value={modalDeptWorkItemId}
                      onChange={(e) => handleSelectDeptWorkItem(e.target.value)}
                      className="h-10 px-3 rounded bg-v5-surface text-body-md font-body-md text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
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
                      <span className="text-[11px] text-v5-muted">
                        Bộ phận chưa có danh mục riêng — có thể chọn từ Cột A hoặc Cột B bên dưới, hoặc tự nhập tên đầu việc.
                      </span>
                    )}
                  </div>

                  {/* 48 mẫu cũ là nguồn độc lập; TX + QĐ1277 đã gộp tại bộ chọn nguồn bên dưới. */}
                  <div className="grid grid-cols-1 gap-3">
                    {/* Cột A — công việc thường xuyên (48 mẫu) */}
                    <div
                      data-testid="picker-col-routine"
                      className={`${!legacyTemplatesSelectable && !modalTemplateId ? "hidden" : "flex"} rounded-lg border border-v5-line bg-v5-surface flex-col min-w-0`}
                    >
                      <div className="px-3 py-2 border-b border-v5-line flex items-center justify-between gap-2">
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
                      <div className="p-2 border-b border-v5-line">
                        <input
                          data-testid="picker-col-routine-search"
                          value={templateSearch}
                          onChange={(e) => setTemplateSearch(e.target.value)}
                          placeholder="Tìm nhanh theo mã hoặc tên mẫu..."
                          className="w-full h-8 px-2 rounded bg-v5-bg text-xs border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
                        />
                      </div>
                      <div className="max-h-52 overflow-y-auto flex flex-col">
                        {filteredTemplates.length === 0 ? (
                          <span className="p-3 text-xs text-v5-muted">Không có mẫu phù hợp.</span>
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
                                className={`text-left px-3 py-2 border-b border-v5-line/60 flex flex-col gap-0.5 transition-colors ${
                                  active
                                    ? "bg-secondary/10 border-l-2 border-l-secondary"
                                    : "hover:bg-v5-bg"
                                }`}
                              >
                                <span className="text-xs font-semibold text-primary">
                                  [{tpl.code}] {tpl.title}
                                </span>
                                <span className="text-[10px] text-v5-muted">
                                  {groups.find((g) => g.id === tpl.groupId)?.name || ""}
                                  {tpl.defaultPriority ? ` · Ưu tiên: ${tpl.defaultPriority}` : ""}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                  </div>

                  {deptCatalogMsg && (
                    <div className="text-[11px] text-status-warning flex items-center gap-1">
                      <V5Icon name="info" className="text-[14px]" />
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
                    onChange={(e) => {
                      setModalTitle(e.target.value);
                      if (modalFieldErrors.title) {
                        setModalFieldErrors((prev) => ({ ...prev, title: "" }));
                      }
                    }}
                    placeholder="Nhập tên nhiệm vụ trong kỳ kế hoạch..."
                    className={`p-2.5 rounded bg-v5-bg text-body-md font-body-md text-v5-ink border focus:outline-none focus:ring-1 focus:ring-secondary resize-none ${
                      modalFieldErrors.title ? "border-status-danger" : "border-v5-line"
                    }`}
                  />
                  {modalFieldErrors.title && (
                    <span className="text-[11px] text-status-danger">{modalFieldErrors.title}</span>
                  )}
                </div>

                {/* YC-38C: hạng mục kế hoạch — liên kết ĐÚNG đầu việc với đúng hạng mục */}
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Hạng mục kế hoạch *
                  </label>
                  <select
                    data-testid="modal-plan-item-select"
                    required
                    value={modalPlanItemId}
                    onChange={(e) => {
                      setModalPlanItemId(e.target.value);
                      if (modalFieldErrors.planItemId) {
                        setModalFieldErrors((prev) => ({ ...prev, planItemId: "" }));
                      }
                    }}
                    className={`h-10 px-3 rounded bg-v5-bg text-body-md font-body-md text-v5-ink border focus:outline-none focus:ring-1 focus:ring-secondary ${
                      modalFieldErrors.planItemId ? "border-status-danger" : "border-v5-line"
                    }`}
                  >
                    {!(activePlan?.items || []).length && (
                      <option value="">Chưa có hạng mục — hãy tạo hạng mục trước</option>
                    )}
                    {(activePlan?.items || []).map((it, idx) => (
                      <option key={it.id} value={it.id}>
                        {idx + 1}. {it.title}
                        {(it.workItems || []).length > 0
                          ? ` — đã có ${it.workItems.length} đầu việc`
                          : ""}
                      </option>
                    ))}
                  </select>
                  {modalFieldErrors.planItemId && (
                    <span className="text-[11px] text-status-danger">{modalFieldErrors.planItemId}</span>
                  )}
                  {!(activePlan?.items || []).length && canEditActivePlanContent && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddModal(false);
                        openPlanItemsManager();
                      }}
                      className="text-[11px] text-secondary font-semibold text-left hover:underline"
                    >
                      Mở quản lý hạng mục
                    </button>
                  )}
                </div>

                {/* A2/D6: cán bộ phụ trách — chọn tường minh, đúng đơn vị kế hoạch */}
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Cán bộ phụ trách {!editingItem && "*"}
                  </label>
                  {editingItem ? (
                    <div
                      data-testid="modal-person-readonly"
                      className="h-10 px-3 rounded bg-v5-bg text-body-md font-body-md text-v5-ink border border-v5-line flex items-center justify-between gap-2"
                    >
                      <span className="truncate">
                        {editingItem.person?.fullName || "Không xác định"}
                      </span>
                      <span className="text-[10px] text-v5-muted shrink-0">
                        Không đổi khi sửa
                      </span>
                    </div>
                  ) : (
                    <>
                      <select
                        data-testid="modal-person-select"
                        required
                        value={modalPersonId}
                        disabled={modalPeopleLoading || !!modalPeopleError || !isLeaderRole}
                        onChange={(e) => {
                          const nextPersonId = e.target.value;
                          setModalPersonId(nextPersonId);
                          // Đổi sang người khác thì bỏ lựa chọn SP QĐ1277 đang có:
                          // người đó phải tự đề xuất sản phẩm sau khi nhận việc.
                          if (nextPersonId !== currentUser?.personId) {
                            setModalProducts([]);
                          }
                          if (modalFieldErrors.personId) {
                            setModalFieldErrors((prev) => ({ ...prev, personId: "" }));
                          }
                        }}
                        className={`h-10 px-3 rounded bg-v5-bg text-body-md font-body-md text-v5-ink border focus:outline-none focus:ring-1 focus:ring-secondary disabled:opacity-70 ${
                          modalFieldErrors.personId ? "border-status-danger" : "border-v5-line"
                        }`}
                      >
                        <option value="">
                          {modalPeopleLoading
                            ? "Đang tải danh sách cán bộ..."
                            : modalPeople.length === 0
                              ? "Không có cán bộ phù hợp"
                              : "Chọn cán bộ phụ trách"}
                        </option>
                        {modalPeople.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.code ? `[${person.code}] ` : ""}
                            {person.fullName}
                            {person.position ? ` — ${person.position}` : ""}
                          </option>
                        ))}
                      </select>
                      <span className="text-[10px] text-v5-muted">
                        {isLeaderRole
                          ? "Chỉ cán bộ đang hoạt động thuộc đơn vị của kế hoạch."
                          : "Cán bộ chỉ được thêm đầu việc cho chính mình."}
                      </span>
                      {modalPeopleError && (
                        <span className="text-[11px] text-status-danger">
                          {modalPeopleError}. Không thể lưu khi chưa xác định được cán bộ phụ trách.
                        </span>
                      )}
                      {!modalPeopleLoading && !modalPeopleError && modalPeople.length === 0 && (
                        <span className="text-[11px] text-status-danger">
                          {isLeaderRole
                            ? "Đơn vị của kế hoạch chưa có cán bộ đang hoạt động để giao việc."
                            : "Tài khoản của bạn không thuộc đơn vị của kế hoạch này."}
                        </span>
                      )}
                      {modalFieldErrors.personId && (
                        <span className="text-[11px] text-status-danger">
                          {modalFieldErrors.personId}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* YC-38B: bộ chọn nguồn thông minh — nhập tên trước, gợi ý TX, chọn từ danh mục */}
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Nguồn công việc (tuỳ chọn)
                  </label>
                  <WorkSourcePicker
                    title={modalTitle}
                    catalogEntry={pickedCatalogEntry}
                    products={modalProducts}
                    onCatalogChange={(entry) => {
                      if (!entry) {
                        setModalCatalogEntryId("");
                        setPickedCatalogLocal(null);
                        return;
                      }
                      setModalCatalogEntryId(entry.id);
                      setPickedCatalogLocal(entry);
                      setModalTemplateId("");
                      setModalDeptWorkItemId("");
                      if (!modalTitle.trim()) setModalTitle(entry.title);
                    }}
                    onProductsChange={(next) => {
                      if (!canEditModalProducts) return;
                      setModalProducts(next);
                    }}
                    allowProduct={canEditModalProducts}
                    lockProducts={!canEditModalProducts}
                    storageKey="yc38b:plans"
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
                    onChange={(e) => {
                      setModalGroupId(e.target.value);
                      if (modalFieldErrors.groupId) {
                        setModalFieldErrors((prev) => ({ ...prev, groupId: "" }));
                      }
                    }}
                    className={`h-10 px-3 rounded bg-v5-bg text-body-md font-body-md text-v5-ink border focus:outline-none focus:ring-1 focus:ring-secondary ${
                      modalFieldErrors.groupId ? "border-status-danger" : "border-v5-line"
                    }`}
                  >
                    {groups.length === 0 && <option value="">Chưa có nhóm nhiệm vụ</option>}
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        [{g.code}] {g.name}
                      </option>
                    ))}
                  </select>
                  {modalFieldErrors.groupId && (
                    <span className="text-[11px] text-status-danger">{modalFieldErrors.groupId}</span>
                  )}
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
                      className="h-10 px-3 rounded bg-v5-bg text-body-md font-body-md text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
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
                      className="h-10 px-3 rounded bg-v5-bg text-body-md font-body-md text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
                    >
                      <option value="Cao">Cao (Khẩn cấp / Trọng điểm)</option>
                      <option value="Trung bình">Trung bình (Thường quy)</option>
                      <option value="Thấp">Thấp</option>
                    </select>
                  </div>
                </div>

                {/* YC-32: Hạn xử lý tách biệt hoàn thành thực tế và xác nhận của lãnh đạo. */}
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Hạn xử lý
                  </label>
                  <input
                    data-testid="modal-due-date"
                    type="date"
                    value={modalDueDate}
                    onChange={(e) => setModalDueDate(e.target.value)}
                    className="h-10 px-3 rounded bg-v5-bg text-body-md font-body-md text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                  <span className="text-[10px] text-v5-muted">
                    Mốc cam kết xử lý. Ngày hoàn thành thực tế và xác nhận của lãnh đạo được ghi nhận tại
                    “Nhật ký công việc” — không chỉnh trực tiếp tại đây.
                  </span>
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
                      className="h-10 px-3 rounded bg-v5-bg text-body-md font-body-md text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
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
                      className="h-10 px-3 rounded bg-v5-bg text-body-md font-body-md text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
                    >
                      <option value="NOT_STARTED">Chưa thực hiện</option>
                      <option value="IN_PROGRESS">Đang thực hiện</option>
                      <option value="DISCONTINUED">Ngừng áp dụng</option>
                    </select>
                    <span className="text-[10px] text-v5-muted">
                      Không đặt “Đã hoàn thành” trực tiếp tại đây. Hoàn thành thực tế và xác nhận của
                      lãnh đạo là hai bước riêng.
                    </span>
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
                    className="h-10 px-3 rounded bg-v5-bg text-body-md font-body-md text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>
              </div>

              <div className="p-space-md bg-v5-bg flex items-center justify-end gap-space-sm border-t border-v5-line">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded bg-v5-surface text-v5-ink font-label-md text-label-md hover:bg-v5-bg border border-v5-line transition-fast active-press"
                >
                  Hủy
                </button>
                <button
                  data-testid="modal-submit-btn"
                  type="submit"
                  disabled={savingWorkItem}
                  className="px-4 py-2 rounded bg-secondary text-on-secondary font-label-md text-label-md font-semibold hover:opacity-90 shadow-sm transition-fast active-press flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <V5Icon name="save" className="text-[18px]" />
                  <span>
                    {savingWorkItem
                      ? "Đang lưu..."
                      : editingItem
                        ? "Lưu thay đổi"
                        : "Lưu vào kế hoạch"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: TẠO KẾ HOẠCH CÔNG TÁC (Phase A — chỉ mở khi có quyền plans.create)
          ========================================================================= */}
      {showPlanCreateModal && planOptions?.canCreatePlan && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-xl bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line">
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-white">Tạo kế hoạch công tác</h3>
                <p className="text-xs text-on-primary-container">
                  Kế hoạch cấp đơn vị — nội dung chỉnh sửa được khi còn Dự thảo
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPlanCreateModal(false)}
                className="text-on-primary-container hover:text-white transition-fast"
                aria-label="Đóng"
              >
                <V5Icon name="close" className="text-[20px]" />
              </button>
            </div>

            <form onSubmit={handleCreatePlan}>
              <div className="p-space-md flex flex-col gap-space-md max-h-[72vh] overflow-y-auto">
                {planFormError && (
                  <div
                    role="alert"
                    data-testid="plan-form-error"
                    className="rounded-lg border border-status-danger/40 bg-status-danger-bg px-3 py-2 text-sm text-status-danger flex items-start gap-1.5"
                  >
                    <V5Icon name="error" className="text-[18px]" />
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <span>{planFormError}</span>
                      {duplicatePlanId && (
                        <button
                          type="button"
                          onClick={openDuplicatePlan}
                          data-testid="open-duplicate-plan-btn"
                          className="w-fit rounded border border-status-danger/40 bg-v5-surface px-2.5 py-1 text-[11px] font-semibold text-status-danger hover:bg-status-danger-bg"
                        >
                          Mở kế hoạch trùng để sửa/xóa
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <label className="flex flex-col gap-1 text-xs font-semibold text-primary">
                  Đơn vị lập kế hoạch *
                  <select
                    data-testid="plan-form-unit"
                    value={planFormUnitId}
                    onChange={(e) => {
                      setPlanFormUnitId(e.target.value);
                      setPlanFormFieldErrors((prev) => ({ ...prev, unitId: "" }));
                    }}
                    className={`h-10 px-3 rounded bg-v5-bg text-body-md border focus:outline-none focus:ring-1 focus:ring-secondary ${
                      planFormFieldErrors.unitId ? "border-status-danger" : "border-v5-line"
                    }`}
                  >
                    {planOptions.units.length === 0 && <option value="">Chưa có đơn vị trong phạm vi</option>}
                    {planOptions.units.map((u) => (
                      <option key={u.id} value={u.id}>
                        [{u.code}] {u.name}
                      </option>
                    ))}
                  </select>
                  {planFormFieldErrors.unitId && (
                    <span className="text-[11px] text-status-danger">{planFormFieldErrors.unitId}</span>
                  )}
                </label>

                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-primary">Loại kỳ *</span>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ["DAY", "Ngày"],
                      ["WEEK", "Tuần"],
                      ["MONTH", "Tháng"],
                    ] as const).map(([type, label]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setPlanFormType(type)}
                        className={`h-10 rounded-lg text-sm font-semibold border transition-fast ${
                          planFormType === type
                            ? "bg-primary text-on-primary border-primary"
                            : "bg-v5-bg text-v5-muted border-v5-line"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex flex-col gap-1 text-xs font-semibold text-primary">
                  Chọn một ngày trong kỳ *
                  <input
                    data-testid="plan-form-date"
                    type="date"
                    value={planFormDate}
                    onChange={(e) => {
                      setPlanFormDate(e.target.value);
                      setPlanFormFieldErrors((prev) => ({ ...prev, date: "" }));
                    }}
                    className={`h-10 px-3 rounded bg-v5-bg text-body-md border focus:outline-none focus:ring-1 focus:ring-secondary ${
                      planFormFieldErrors.date ? "border-status-danger" : "border-v5-line"
                    }`}
                  />
                  <span className="text-[10px] text-v5-muted font-normal">
                    Hệ thống xác định đúng Ngày/Tuần/Tháng theo lịch, không tự cộng 7 ngày.
                  </span>
                  {planFormFieldErrors.date && (
                    <span className="text-[11px] text-status-danger">{planFormFieldErrors.date}</span>
                  )}
                </label>

                <label className="flex flex-col gap-1 text-xs font-semibold text-primary">
                  Tiêu đề kế hoạch *
                  <input
                    data-testid="plan-form-title"
                    type="text"
                    value={planFormTitle}
                    onChange={(e) => {
                      setPlanFormTitle(e.target.value);
                      setPlanFormFieldErrors((prev) => ({ ...prev, title: "" }));
                    }}
                    placeholder="VD: Kế hoạch công tác tuần 43"
                    className={`h-10 px-3 rounded bg-v5-bg text-body-md border focus:outline-none focus:ring-1 focus:ring-secondary ${
                      planFormFieldErrors.title ? "border-status-danger" : "border-v5-line"
                    }`}
                  />
                  {planFormFieldErrors.title && (
                    <span className="text-[11px] text-status-danger">{planFormFieldErrors.title}</span>
                  )}
                </label>

                <label className="flex flex-col gap-1 text-xs font-semibold text-primary">
                  Hạng mục đầu tiên *
                  <input
                    data-testid="plan-form-first-item"
                    type="text"
                    value={planFormFirstItem}
                    onChange={(e) => {
                      setPlanFormFirstItem(e.target.value);
                      setPlanFormFieldErrors((prev) => ({ ...prev, firstItem: "" }));
                    }}
                    placeholder="VD: I. Công tác trọng tâm"
                    className={`h-10 px-3 rounded bg-v5-bg text-body-md border focus:outline-none focus:ring-1 focus:ring-secondary ${
                      planFormFieldErrors.firstItem ? "border-status-danger" : "border-v5-line"
                    }`}
                  />
                  {planFormFieldErrors.firstItem && (
                    <span className="text-[11px] text-status-danger">{planFormFieldErrors.firstItem}</span>
                  )}
                </label>
              </div>

              <div className="p-space-md bg-v5-bg flex items-center justify-end gap-space-sm border-t border-v5-line">
                <button
                  type="button"
                  onClick={() => setShowPlanCreateModal(false)}
                  className="px-4 py-2 rounded bg-v5-surface text-v5-ink font-label-md text-label-md hover:bg-v5-bg border border-v5-line transition-fast active-press"
                >
                  Hủy
                </button>
                <button
                  data-testid="plan-form-submit"
                  type="submit"
                  disabled={planSubmitting}
                  className="px-4 py-2 rounded bg-secondary text-on-secondary font-label-md text-label-md font-semibold hover:opacity-90 shadow-sm transition-fast active-press flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <V5Icon name="save" className="text-[18px]" />
                  <span>{planSubmitting ? "Đang tạo..." : "Tạo kế hoạch"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: SỬA TIÊU ĐỀ KẾ HOẠCH (Phase 2A/2A2 — chỉ field title)
          ========================================================================= */}
      {showPlanTitleModal && activePlan && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-lg bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line">
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-white">Sửa kế hoạch công tác</h3>
                <p className="text-xs text-on-primary-container">
                  {activePlan.unit?.name || "Chưa xác định đơn vị"}
                  {activePlan.period?.name ? ` • ${activePlan.period.name}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPlanTitleModal(false)}
                className="text-on-primary-container hover:text-white transition-fast"
                aria-label="Đóng"
              >
                <V5Icon name="close" className="text-[20px]" />
              </button>
            </div>

            <form onSubmit={handleUpdatePlanTitle}>
              <div className="p-space-md flex flex-col gap-space-md">
                {planTitleError && (
                  <div
                    role="alert"
                    data-testid="plan-title-error"
                    className="rounded-lg border border-status-danger/40 bg-status-danger-bg px-3 py-2 text-sm text-status-danger flex items-start gap-1.5"
                  >
                    <V5Icon name="error" className="text-[18px]" />
                    <span>{planTitleError}</span>
                  </div>
                )}

                <label className="flex flex-col gap-1 text-xs font-semibold text-primary">
                  Tiêu đề kế hoạch *
                  <input
                    data-testid="plan-title-input"
                    type="text"
                    maxLength={300}
                    autoFocus
                    value={planTitleDraft}
                    onChange={(e) => {
                      setPlanTitleDraft(e.target.value);
                      setPlanTitleError(null);
                    }}
                    placeholder="VD: Kế hoạch công tác tuần 43"
                    className="h-10 px-3 rounded bg-v5-bg text-body-md border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                  <span className="text-[10px] text-v5-muted font-normal">
                    {planTitleDraft.trim().length}/300 ký tự
                  </span>
                </label>

                <p className="text-xs text-v5-muted">
                  Chỉ tiêu đề được sửa. Đơn vị, kỳ công tác và trạng thái kế hoạch giữ nguyên.
                </p>
              </div>

              <div className="p-space-md bg-v5-bg flex items-center justify-end gap-space-sm border-t border-v5-line">
                <button
                  type="button"
                  onClick={() => setShowPlanTitleModal(false)}
                  className="px-4 py-2 rounded bg-v5-surface text-v5-ink font-label-md text-label-md hover:bg-v5-bg border border-v5-line transition-fast active-press"
                >
                  Hủy
                </button>
                <button
                  data-testid="plan-title-submit"
                  type="submit"
                  disabled={planTitleBusy}
                  className="px-4 py-2 rounded bg-secondary text-on-secondary font-label-md text-label-md font-semibold hover:opacity-90 shadow-sm transition-fast active-press flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <V5Icon name="save" className="text-[18px]" />
                  <span>{planTitleBusy ? "Đang lưu..." : "Lưu thay đổi"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: HỦY MỀM KẾ HOẠCH TRÙNG (Task 3C — bắt buộc lý do)
          ========================================================================= */}
      {showPlanCancelModal && activePlan && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-lg bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line">
            <div className="p-space-md bg-status-danger text-white flex items-center justify-between">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-white">Hủy kế hoạch trùng</h3>
                <p className="text-xs text-white/80">
                  {activePlan.unit?.name || "Chưa xác định đơn vị"}
                  {activePlan.period?.name ? ` • ${activePlan.period.name}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPlanCancelModal(false)}
                className="text-white/80 hover:text-white transition-fast"
                aria-label="Đóng"
              >
                <V5Icon name="close" className="text-[20px]" />
              </button>
            </div>

            <form onSubmit={handleCancelPlan}>
              <div className="p-space-md flex flex-col gap-space-md">
                {planCancelError && (
                  <div
                    role="alert"
                    data-testid="plan-cancel-error"
                    className="rounded-lg border border-status-danger/40 bg-status-danger-bg px-3 py-2 text-sm text-status-danger flex items-start gap-1.5"
                  >
                    <V5Icon name="error" className="text-[18px]" />
                    <span>{planCancelError}</span>
                  </div>
                )}

                <div className="rounded-lg bg-v5-bg border border-v5-line px-3 py-2 text-xs text-v5-muted">
                  Kế hoạch: <strong className="text-primary">{activePlan.title}</strong>
                  <br />
                  Hủy mềm chỉ chuyển trạng thái sang <strong>CANCELED</strong>; dữ liệu vẫn được
                  lưu để đối soát và không xóa cứng hạng mục/liên kết.
                </div>

                <label className="flex flex-col gap-1 text-xs font-semibold text-primary">
                  Lý do hủy kế hoạch trùng *
                  <textarea
                    data-testid="plan-cancel-reason"
                    autoFocus
                    aria-required="true"
                    maxLength={500}
                    rows={3}
                    value={planCancelReason}
                    onChange={(e) => {
                      setPlanCancelReason(e.target.value);
                      setPlanCancelError(null);
                    }}
                    placeholder="VD: Trùng với kế hoạch tuần 43 đã lập cho cùng đơn vị"
                    className="px-3 py-2 rounded bg-v5-bg text-body-md border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary resize-y"
                  />
                  <span className="text-[10px] text-v5-muted font-normal">
                    {planCancelReason.trim().length}/500 ký tự
                  </span>
                </label>
              </div>

              <div className="p-space-md bg-v5-bg flex items-center justify-end gap-space-sm border-t border-v5-line">
                <button
                  type="button"
                  onClick={() => setShowPlanCancelModal(false)}
                  className="px-4 py-2 rounded bg-v5-surface text-v5-ink font-label-md text-label-md hover:bg-v5-bg border border-v5-line transition-fast active-press"
                >
                  Giữ lại
                </button>
                <button
                  data-testid="plan-cancel-submit"
                  type="submit"
                  disabled={planCancelBusy}
                  className="px-4 py-2 rounded bg-status-danger text-white font-label-md text-label-md font-semibold hover:brightness-95 shadow-sm transition-fast active-press flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <V5Icon name="cancel" className="text-[18px]" />
                  <span>{planCancelBusy ? "Đang hủy..." : "Hủy kế hoạch"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: QUẢN LÝ HẠNG MỤC KẾ HOẠCH (Phase A)
          ========================================================================= */}
      {showPlanItemsModal && activePlan && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-2xl bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line">
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-white">Quản lý hạng mục kế hoạch</h3>
                <p className="text-xs text-on-primary-container">{activePlan.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPlanItemsModal(false)}
                className="text-on-primary-container hover:text-white transition-fast"
                aria-label="Đóng"
              >
                <V5Icon name="close" className="text-[20px]" />
              </button>
            </div>

            <div className="p-space-md flex flex-col gap-space-md max-h-[72vh] overflow-y-auto">
              {planItemError && (
                <div
                  role="alert"
                  className="rounded-lg border border-status-danger/40 bg-status-danger-bg px-3 py-2 text-sm text-status-danger flex items-start gap-1.5"
                >
                  <V5Icon name="error" className="text-[18px]" />
                  <span>{planItemError}</span>
                </div>
              )}

              {!canEditActivePlanContent && (
                <div className="rounded-lg border border-v5-line bg-v5-bg px-3 py-2 text-xs text-v5-muted flex items-start gap-1.5">
                  <V5Icon name="lock" className="text-[16px]" />
                  <span>
                    Kế hoạch đang {activePlan.status === "SUBMITTED" ? "chờ duyệt" : "khóa nội dung"} — chỉ xem
                    hạng mục, không thể thêm/sửa/xóa.
                  </span>
                </div>
              )}

              <div className="rounded-lg border border-v5-line p-3 bg-v5-bg/50 flex flex-col gap-2">
                <span className="text-xs font-bold text-primary">
                  {planItemEditingId ? "Sửa hạng mục" : "Thêm hạng mục mới"}
                </span>
                <input
                  data-testid="plan-item-title"
                  value={planItemTitle}
                  onChange={(e) => {
                    setPlanItemTitle(e.target.value);
                    setPlanItemError(null);
                  }}
                  disabled={!canEditActivePlanContent || planItemBusy}
                  placeholder="Tên hạng mục *"
                  className="h-10 px-3 rounded bg-v5-surface text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary disabled:opacity-60"
                />
                <select
                  data-testid="plan-item-group"
                  value={planItemGroupId}
                  onChange={(e) => setPlanItemGroupId(e.target.value)}
                  disabled={!canEditActivePlanContent || planItemBusy}
                  className="h-10 px-3 rounded bg-v5-surface text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary disabled:opacity-60"
                >
                  <option value="">Không gán nhóm nghiệp vụ</option>
                  {(groups.length ? groups : planOptions?.groups || []).map((g) => (
                    <option key={g.id} value={g.id}>
                      [{g.code}] {g.name}
                    </option>
                  ))}
                </select>
                <div className="flex justify-end gap-2">
                  {planItemEditingId && (
                    <button
                      type="button"
                      onClick={() => {
                        setPlanItemEditingId(null);
                        setPlanItemTitle("");
                        setPlanItemError(null);
                      }}
                      className="px-3 py-1.5 rounded text-xs border border-v5-line hover:bg-v5-bg"
                    >
                      Hủy sửa
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="plan-item-save"
                    disabled={!canEditActivePlanContent || planItemBusy}
                    onClick={savePlanItem}
                    className="px-3 py-1.5 rounded bg-secondary text-on-secondary text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed active-press"
                  >
                    {planItemBusy ? "Đang lưu..." : planItemEditingId ? "Lưu thay đổi" : "Thêm hạng mục"}
                  </button>
                </div>
              </div>

              {activePlan.items.length === 0 ? (
                <div className="text-center text-xs text-v5-muted rounded-lg border border-dashed border-v5-line p-6">
                  Kế hoạch chưa có hạng mục. Thêm hạng mục đầu tiên ở biểu mẫu phía trên.
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border-subtle border border-v5-line rounded-lg overflow-hidden">
                  {activePlan.items.map((it, idx) => {
                    const linked =
                      (it.workItems?.length || 0) + (it.taskLinks?.length || 0);
                    return (
                      <div
                        key={it.id}
                        data-testid={`plan-item-row-${it.id}`}
                        className="p-3 flex items-center justify-between gap-2"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-semibold text-primary truncate">
                            {idx + 1}. {it.title}
                          </span>
                          <span className="text-[11px] text-v5-muted">
                            {it.group?.name || "Chưa gán nhóm"} · {linked} đầu việc/nhiệm vụ
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            title={
                              linked > 0
                                ? "Hạng mục đã có đầu việc — không thể xóa, chỉ có thể đổi tên/nhóm"
                                : canEditActivePlanContent
                                  ? "Sửa hạng mục"
                                  : "Kế hoạch đang khóa nội dung"
                            }
                            disabled={!canEditActivePlanContent || planItemBusy}
                            onClick={() => {
                              setPlanItemEditingId(it.id);
                              setPlanItemTitle(it.title);
                              setPlanItemGroupId(it.groupId || "");
                              setPlanItemError(null);
                            }}
                            className="w-8 h-8 rounded hover:bg-v5-bg flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <V5Icon name="edit" className="text-[16px] text-secondary" />
                          </button>
                          <button
                            type="button"
                            title={
                              linked > 0
                                ? "Hạng mục đã có đầu việc — không thể xóa"
                                : canEditActivePlanContent
                                  ? "Xóa hạng mục"
                                  : "Kế hoạch đang khóa nội dung"
                            }
                            disabled={!canEditActivePlanContent || planItemBusy || linked > 0}
                            onClick={() => deletePlanItem(it.id, it.title)}
                            className="w-8 h-8 rounded hover:bg-v5-bg flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <V5Icon name="delete" className="text-[16px] text-status-danger" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-space-md bg-v5-bg flex items-center justify-end border-t border-v5-line">
              <button
                type="button"
                onClick={() => setShowPlanItemsModal(false)}
                className="px-4 py-2 rounded bg-v5-surface text-v5-ink font-label-md text-label-md hover:bg-v5-bg border border-v5-line transition-fast active-press"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: QUẢN LÝ DANH MỤC ĐẦU VIỆC RIÊNG CỦA BỘ PHẬN (YC-25)
          ========================================================================= */}
      {showDeptCatalogModal && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md">
          <div className="w-full max-w-2xl bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line transition-panel">
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
                <V5Icon name="close" className="text-[20px]" />
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
                    className="h-10 px-3 rounded bg-v5-bg text-body-md border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
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
              <div className="rounded-lg border border-v5-line p-3 flex flex-col gap-2 bg-v5-bg/50">
                <span className="text-xs font-bold text-primary">
                  {deptEditingId ? "Sửa đầu việc đang chọn" : "Thêm đầu việc mới vào danh mục bộ phận"}
                </span>
                <input
                  data-testid="dept-form-title"
                  value={deptFormTitle}
                  onChange={(e) => setDeptFormTitle(e.target.value)}
                  placeholder="Tên đầu việc * (VD: Kiểm tra niêm phong GPS ca đêm)"
                  className="h-9 px-3 rounded bg-v5-surface text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
                />
                <input
                  data-testid="dept-form-desc"
                  value={deptFormDesc}
                  onChange={(e) => setDeptFormDesc(e.target.value)}
                  placeholder="Mô tả ngắn (tuỳ chọn)"
                  className="h-9 px-3 rounded bg-v5-surface text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary"
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
                      className="px-3 py-1.5 rounded text-xs border border-v5-line hover:bg-v5-bg"
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
                <span className="text-xs text-v5-muted py-2">Đang tải danh mục...</span>
              ) : deptManageItems.length === 0 ? (
                <span className="text-xs text-v5-muted py-2">
                  Bộ phận này chưa có đầu việc nào trong danh mục riêng.
                </span>
              ) : (
                <div className="flex flex-col divide-y divide-border-subtle border border-v5-line rounded-lg overflow-hidden">
                  {deptManageItems.map((it) => (
                    <div key={it.id} className="p-3 flex items-center justify-between gap-2" data-testid={`dept-manage-row-${it.id}`}>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-primary truncate">{it.title}</span>
                        <span className="text-[11px] text-v5-muted truncate">
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
                          className="w-8 h-8 rounded hover:bg-v5-bg flex items-center justify-center active-press"
                        >
                          <V5Icon name="edit" className="text-[16px] text-secondary" />
                        </button>
                        <button
                          type="button"
                          title={it.status === "ACTIVE" ? "Ngừng sử dụng" : "Kích hoạt lại"}
                          onClick={() => toggleDeptItemStatus(it)}
                          className="w-8 h-8 rounded hover:bg-v5-bg flex items-center justify-center active-press"
                        >
                          <V5Icon
                            name={it.status === "ACTIVE" ? "block" : "restart_alt"}
                            className="text-[16px] text-status-warning"
                          />
                        </button>
                        <button
                          type="button"
                          title="Xoá / ngừng sử dụng"
                          onClick={() => removeDeptItem(it)}
                          className="w-8 h-8 rounded hover:bg-v5-bg flex items-center justify-center active-press"
                        >
                          <V5Icon name="delete" className="text-[16px] text-status-danger" />
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
          <div className="w-full max-w-md bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line transition-panel">
            <div className="p-space-md bg-status-danger text-on-error flex items-center justify-between">
              <span className="font-headline-sm font-semibold">Yêu Cầu Chỉnh Sửa Kế Hoạch</span>
              <button onClick={() => setShowReturnModal(false)}>
                <V5Icon name="close" className="text-[20px]" />
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
                className="w-full p-2.5 rounded bg-v5-bg text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
              />
            </div>
            <div className="p-space-md bg-v5-bg flex items-center justify-end gap-2 border-t border-v5-line">
              <button
                onClick={() => setShowReturnModal(false)}
                className="px-4 py-2 rounded bg-v5-surface text-xs font-semibold"
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
          <div className="w-full max-w-md bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-v5-line transition-panel">
            <div className="p-space-md bg-secondary text-on-secondary flex items-center justify-between">
              <span className="font-headline-sm font-semibold flex items-center gap-2">
                <V5Icon name="approval_delegation" className="text-[20px]" />
                Trình Duyệt Bổ Sung / Điều Chỉnh
              </span>
              <button onClick={() => setShowAmendmentModal(false)} className="hover:opacity-80">
                <V5Icon name="close" className="text-[20px]" />
              </button>
            </div>
            <div className="p-space-md flex flex-col gap-space-sm">
              <p className="font-label-sm text-xs text-v5-muted">
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
                  className="w-full p-2.5 rounded bg-v5-bg text-sm border border-v5-line focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
                />
              </div>
            </div>
            <div className="p-space-md bg-v5-bg flex items-center justify-end gap-2 border-t border-v5-line">
              <button
                onClick={() => setShowAmendmentModal(false)}
                className="px-4 py-2 rounded bg-v5-surface text-xs font-semibold"
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
