"use client";

import {
  BadgeCheck,
  Ban,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronUp,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Eye,
  FileText,
  GripVertical,
  HelpCircle,
  History,
  Hourglass,
  ListPlus,
  LockKeyhole,
  Moon,
  Plus,
  Printer,
  Save,
  ScrollText,
  Send,
  Trash2,
  Wrench,
  X,
} from "lucide-react";

const ROUTINE_ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>> = {
  lock_person: LockKeyhole,
  fact_check: ClipboardCheck,
  assignment_turned_in: ClipboardCheck,
  verified: BadgeCheck,
  task_alt: CheckCircle2,
  check_circle: CheckCircle2,
  edit_calendar: CalendarClock,
  build_circle: Wrench,
  history_toggle_off: History,
  history_edu: ScrollText,
  calendar_today: CalendarDays,
  schedule: Clock,
  hourglass_top: Hourglass,
  help: HelpCircle,
  add_task: ListPlus,
  expand_less: ChevronUp,
  dynamic_form: ClipboardList,
  save: Save,
  bedtime: Moon,
  visibility: Eye,
  block: Ban,
  add: Plus,
  publish: Send,
  drag_indicator: GripVertical,
  delete: Trash2,
  description: FileText,
  close: X,
  print: Printer,
};

function RoutineIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ROUTINE_ICON_MAP[name] ?? HelpCircle;
  const match = className?.match(/text-\[(\d+)px\]/);
  const size = match ? Number(match[1]) : 18;
  return <Icon size={size} strokeWidth={1.8} className={className} aria-hidden="true" />;
}

import React, { useState, useEffect } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import Link from "next/link";
import { toast } from "@/components/ui/Toast";
import { formatVnDate, vnDateOnly } from "@/lib/datetime";
import { resolveRoutineDeclarationState } from "@/lib/routine-declaration";
import RoutineCatalogPicker, { type ProposedProduct, type TxTag } from "./RoutineCatalogPicker";

const SHIFT_LABELS: Record<string, string> = { SANG: "Sáng", CHIEU: "Chiều", CA_NGAY: "Cả ngày" };

interface WorkLogEntry {
  id: string;
  code: string;
  title: string;
  category: string;
  companyName: string | null;
  containerCount: number | null;
  timeSpent: string;
  progressPercent: number;
  occurrenceStatus: "OCCURRED" | "NOT_OCCURRED";
  status: "COMPLETED" | "IN_PROGRESS" | "NOT_OCCURRED";
  notes: string;
  createdAt: string;
  person?: {
    fullName: string;
    code?: string;
  };
  unit?: {
    name: string;
  };
  formValues?: Record<string, any>;
  // --- F18 / UX 2B1 ---
  catalogEntry?: { id: string; code: string; title: string } | null;
  catalogTags?: Array<{ id: string; catalogEntryId: string; code: string; title: string; department?: string; sortOrder?: number }>;
  workDate?: string | null;
  shift?: string | null;
  productItem?: { id: string; code: string; taskName: string } | null;
  proposedProducts?: Array<{ productItemId: string; code: string; taskName: string; factor: number | null; quantity: number | null; unit: string | null; reviewState: string }>;
  sourceKind?: string | null;
  reviewState?: string;
  dataOrigin?: string | null;
  workItemId?: string | null;
  formVersion?: {
    id: string;
    version: number;
    schemaJson?: any;
    formTemplate?: {
      code: string;
      name: string;
    };
    templateName?: string;
    templateCode?: string;
  } | null;
}

interface FormFieldDef {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  min?: number;
  max?: number;
  /** F18: danh muc tuy chon do Form Builder dinh nghia */
  options?: string[];
}

interface ActiveFormVersion {
  id: string;
  formTemplateId: string;
  templateCode?: string;
  templateName?: string;
  version: number;
  status: string;
  schemaJson: {
    fields?: FormFieldDef[];
    allowNotOccurred?: boolean;
  };
}

export default function RoutinePage() {
  const [activeTab, setActiveTab] = useState<"tab1" | "tab2" | "tab3">("tab1");
  // Ngày ghi nhận của bản ghi mới (mặc định theo lịch Việt Nam) — tách khỏi bộ lọc xem danh sách.
  const [entryWorkDate, setEntryWorkDate] = useState(() => vnDateOnly());
  const [logShift, setLogShift] = useState<"SANG" | "CHIEU" | "CA_NGAY">("CA_NGAY");
  // Bộ lọc danh sách: mặc định hôm nay, có thể chuyển "Tất cả ngày" để xem lịch sử.
  const [filterDate, setFilterDate] = useState(() => vnDateOnly());
  const [filterAllDates, setFilterAllDates] = useState(false);
  const [onlyNotOccurred, setOnlyNotOccurred] = useState(false);
  const [entries, setEntries] = useState<WorkLogEntry[]>([]);
  const visibleEntries = onlyNotOccurred
    ? entries.filter((entry) => entry.occurrenceStatus === "NOT_OCCURRED")
    : entries;
  const [hasMoreEntries, setHasMoreEntries] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<{
    fullName: string;
    unitName?: string;
    username?: string;
    role?: string;
  }>({
    fullName: "Cán bộ trực ban",
    unitName: "Hải quan cửa khẩu Quốc tế Tà Lùng",
    username: "",
  });

  // Dynamic Form Template Version from PostgreSQL
  const [activeFormVersion, setActiveFormVersion] = useState<ActiveFormVersion | null>(null);

  // New entry form state
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  // --- F18 / UX 2B1: N tag danh muc TX + nhieu san pham QD1277 + loc du lieu mau ---
  const [selectedTxs, setSelectedTxs] = useState<TxTag[]>([]);
  const [proposedProducts, setProposedProducts] = useState<ProposedProduct[]>([]);
  const [hideDemo, setHideDemo] = useState(true);
  const [newCompany, setNewCompany] = useState("");
  // YC-07: để trống — không điền sẵn số lượng giả định
  const [newConts, setNewConts] = useState<number | string>("");
  const [newNotes, setNewNotes] = useState("");
  const [newProgress, setNewProgress] = useState<number>(100);
  const [dynamicFormValues, setDynamicFormValues] = useState<Record<string, any>>({});
  // UX 3B: form khai báo mặc định thu gọn với vai trò được phép khai báo.
  const [isDeclarationOpen, setIsDeclarationOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [catalogTemplates, setCatalogTemplates] = useState<Array<{ id: string; code: string; title: string }>>([]);

  // Inspection modal
  const [inspectEntry, setInspectEntry] = useState<WorkLogEntry | null>(null);

  // Tab 2: Admin Form Builder State
  // Chỉ người có quyền quản trị biểu mẫu / xem audit mới thấy tab 2-3
  const { can: canPerm, canAudit, user: permissionUser, loading: permissionsLoading } = usePermissions();
  const canManageForms = canPerm("form.manage");
  // UX 3B (UI-only): lãnh đạo đơn vị / quản trị hệ thống không khai báo đầu việc.
  // Khi quyền còn tải, trạng thái là LOADING → chỉ placeholder, không lộ form/nút 1-chạm.
  const declarationState = resolveRoutineDeclarationState(
    permissionsLoading,
    permissionUser?.role
  );
  const canDeclare = declarationState === "COLLAPSED";
  const [builderFields, setBuilderFields] = useState<FormFieldDef[]>([]);
  // F19: chi hien truong DN / container khi bieu mau (Form Builder) that su yeu cau.
  // Khong co bieu mau chuyen biet => dung bieu mau ghi nhan co ban, khong ep chi tieu thong quan.
  const formKeys = (builderFields || []).map((f: any) => f.key);
  const showCompanyField = formKeys.length === 0 || formKeys.includes("company_name");
  const showContainerField = formKeys.length === 0 || formKeys.includes("container_count");
  const [builderTemplateId, setBuilderTemplateId] = useState<string>("");
  const [isPublishingVersion, setIsPublishingVersion] = useState(false);

  // Tab 3: Lịch sử thay đổi
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // 1. Fetch Routine entries and Active Form Version from PostgreSQL
  const fetchRoutineData = async (view?: { date?: string; allDates?: boolean }) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ hideDemo: hideDemo ? "1" : "0" });
      // UX 2B1: bộ lọc xem danh sách độc lập với ngày ghi nhận của bản ghi mới.
      const viewAll = view?.allDates ?? filterAllDates;
      const viewDate = view?.date ?? filterDate;
      if (!viewAll && viewDate) params.set("workDate", viewDate);
      const res = await fetch(`/api/routine?${params.toString()}`);
      if (!res.ok) throw new Error("Không thể tải danh sách nhật ký tác nghiệp");
      const data = await res.json();

      if (data.success && Array.isArray(data.entries)) {
        const loaded: WorkLogEntry[] = data.entries.map((item: any) => ({
          id: item.id,
          // F18: khong hien ma nghiep vu gia (KPS-01/TTHQ-01) khi khong co ma that
          code:
            item.catalogEntry?.code ||
            item.template?.code ||
            item.sourceCodeSnapshot ||
            "—",
          catalogEntry: item.catalogEntry || null,
          catalogTags: item.catalogTags || [],
          workDate: item.workDate || null,
          shift: item.shift || null,
          productItem: item.productItem || null,
          proposedProducts: item.proposedProducts || [],
          sourceKind: item.sourceKind || null,
          reviewState: item.reviewState || "DRAFT",
          dataOrigin: item.dataOrigin || null,
          workItemId: item.workItemId || null,
          title: item.workItem?.title || item.template?.title || item.notes || "Nhật ký tác nghiệp",
          category:
            item.template?.group?.name ||
            (item.occurrenceStatus === "NOT_OCCURRED"
              ? "Xác nhận không phát sinh"
              : "Thủ tục hải quan điện tử (VNACCS)"),
          companyName: item.companyName,
          containerCount: item.containerCount,
          timeSpent: item.timeSpent || (item.occurrenceStatus === "NOT_OCCURRED" ? "0 giờ" : "Theo ca trực"),
          progressPercent: item.progressPercent ?? 100,
          occurrenceStatus: item.occurrenceStatus,
          status:
            item.occurrenceStatus === "NOT_OCCURRED"
              ? "NOT_OCCURRED"
              : item.progressPercent === 100
              ? "COMPLETED"
              : "IN_PROGRESS",
          notes: item.notes || (item.occurrenceStatus === "NOT_OCCURRED" ? "Xác nhận không phát sinh trong ca" : ""),
          createdAt: item.createdAt,
          person: item.person,
          unit: item.unit,
          formValues: item.formValues || {},
          formVersion: item.formVersion,
        }));
        setEntries(loaded);
        setHasMoreEntries(Boolean(data.hasMore));
      }

      if (data.activeFormVersion) {
        setActiveFormVersion(data.activeFormVersion);
        setBuilderTemplateId(data.activeFormVersion.formTemplateId);
        if (Array.isArray(data.activeFormVersion.schemaJson?.fields)) {
          setBuilderFields(data.activeFormVersion.schemaJson.fields);
        }
      }
    } catch (err: any) {
      console.error("Fetch routine error:", err);
      toast.error(err.message || "Lỗi tải dữ liệu nhật ký");
    } finally {
      setLoading(false);
    }
  };

  // Tải lại danh sách khi đổi bộ lọc xem (ngày hoặc tất cả ngày).
  useEffect(() => {
    fetchRoutineData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDate, filterAllDates]);

  useEffect(() => {
    // Fetch Catalog Templates (chỉ lấy các mẫu đang áp dụng)
    fetch("/api/catalog/templates?activeOnly=true")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        setCatalogTemplates(list);
      })
      .catch(() => {});

    // Fetch Current User
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setCurrentUser({
            fullName: data.user.fullName || "Cán bộ trực ban",
            unitName: data.user.unit?.name || "Hải quan cửa khẩu Quốc tế Tà Lùng",
            username: data.user.username || "",
            role: data.user.role,
          });
        }
      })
      .catch(() => {});
  }, []);

  // Tải lịch sử thay đổi khi mở tab 3
  useEffect(() => {
    if (activeTab === "tab3") {
      setAuditLoading(true);
      fetch("/api/admin/audit?limit=25")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.success && Array.isArray(data.events)) {
            setAuditEvents(data.events);
          }
        })
        .catch(() => {})
        .finally(() => setAuditLoading(false));
    }
  }, [activeTab]);

  // Handle Submit New Routine Log
  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryWorkDate) {
      toast.error("Vui lòng chọn ngày ghi nhận — không để trống");
      return;
    }
    if (!newTitle.trim()) {
      toast.error("Vui lòng nhập nội dung công việc tác nghiệp thực tế");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/routine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          notes: newNotes.trim(),
          occurrenceStatus: "OCCURRED",
          companyName: newCompany.trim() || null,
          containerCount: newConts === "" ? null : Number(newConts),
          progressPercent: Number(newProgress),
          timeSpent: "Theo ca trực",
          templateId: null, // F19: danh muc cong viec chinh thuc chi dung TX moi
          formVersionId: activeFormVersion?.id,
          formValues: dynamicFormValues,
          // F18 / UX 2B1: N tag TX + ngay/ca + danh sach SP QD1277 de xuat
          catalogEntryIds: selectedTxs.map((tag) => tag.id),
          catalogEntryId: selectedTxs[0]?.id || null, // backward compatibility
          workDate: entryWorkDate,
          shift: logShift,
          productItemId: proposedProducts[0]?.productItemId || null,
          proposedProducts,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("Đã ghi nhận thành công vào cơ sở dữ liệu sổ nhật ký ca trực!");
        // Reset form inputs only on confirmed backend success
        setNewTitle("");
        setNewCompany("");
        setNewConts("");
        setNewNotes("");
        setDynamicFormValues({});
        // UX 2B1: xóa lựa chọn sau khi lưu để bản ghi kế tiếp không bị dính tag/SP cũ.
        setSelectedTxs([]);
        setProposedProducts([]);
        // Chuyển bộ lọc về đúng ngày vừa lưu để thấy bản ghi mới (không đổi ngày ghi nhận).
        const viewChanged = filterAllDates || filterDate !== entryWorkDate;
        setFilterAllDates(false);
        setFilterDate(entryWorkDate);
        if (!viewChanged) await fetchRoutineData({ date: entryWorkDate, allDates: false });
      } else {
        // KEEP USER INPUT on error so user can correct and retry
        toast.error(data.error || "Không thể lưu nhật ký vào cơ sở dữ liệu");
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi mạng khi lưu nhật ký");
    } finally {
      setIsSubmitting(false);
    }
  };

  // F18 (E): phan biet 2 truong hop "khong phat sinh" — KHONG tu gan ma nghiep vu gia
  //  1) Ca khong phat sinh VU VIE vi pham / ton dong
  //  2) Ca khong co hoat dong tac nghiep nao
  const handleConfirmNotOccurred = async (kind: "NO_VIOLATION" | "NO_ACTIVITY") => {
    if (!entryWorkDate) {
      toast.error("Vui lòng chọn ngày ghi nhận — không để trống");
      return;
    }
    const isNoActivity = kind === "NO_ACTIVITY";
    const defaultTitle = isNoActivity
      ? "Xác nhận: ca trực không có hoạt động tác nghiệp"
      : "Xác nhận: ca trực không phát sinh vụ việc vi phạm hoặc tồn đọng";
    // UX 3B: một chạm khi panel đang đóng KHÔNG được âm thầm dùng bản nháp ẩn
    // (title/notes người dùng có thể đã gõ trước đó). Chỉ dùng bản nháp khi form mở.
    const draftTitle = isDeclarationOpen && !isNoActivity ? newTitle.trim() : "";
    const draftNotes = isDeclarationOpen ? newNotes.trim() : "";
    const finalTitle = draftTitle || defaultTitle;
    const defaultNotes = isNoActivity
      ? "Xác nhận 1-chạm: ca trực không có hoạt động tác nghiệp nào để ghi nhận."
      : "Xác nhận 1-chạm: ca trực không phát sinh vụ việc vi phạm hoặc tồn đọng.";
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/routine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: finalTitle,
          notes: draftNotes || defaultNotes,
          occurrenceStatus: "NOT_OCCURRED",
          notOccurredKind: kind,
          templateId: null,
          catalogEntryId: null,
          catalogEntryIds: [],
          workDate: entryWorkDate,
          shift: logShift,
          productItemId: null,
          proposedProducts: [],
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`Đã ghi nhận: ${isNoActivity ? "Ca không có hoạt động tác nghiệp" : "Ca không phát sinh vụ việc vi phạm/tồn đọng"}!`);
        const viewChanged = filterAllDates || filterDate !== entryWorkDate;
        setFilterAllDates(false);
        setFilterDate(entryWorkDate);
        if (!viewChanged) await fetchRoutineData({ date: entryWorkDate, allDates: false });
      } else {
        toast.error(data.error || "Không thể ghi nhận xác nhận không phát sinh");
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi kết nối khi gửi xác nhận");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Admin Form Builder: Publish New Schema Version
  const handlePublishNewVersion = async () => {
    if (builderFields.length === 0) {
      toast.error("Biểu mẫu cần có ít nhất một trường dữ liệu");
      return;
    }

    setIsPublishingVersion(true);
    try {
      const res = await fetch("/api/admin/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: builderTemplateId || undefined,
          schemaJson: {
            fields: builderFields,
            allowNotOccurred: true,
          },
          versionNote: `Phát hành cấu hình biểu mẫu với ${builderFields.length} trường`,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Đã phát hành phiên bản mới thành công!");
        await fetchRoutineData();
      } else {
        toast.error(data.error || "Không thể phát hành phiên bản biểu mẫu mới");
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi lưu biểu mẫu");
    } finally {
      setIsPublishingVersion(false);
    }
  };

  if (!permissionsLoading && permissionUser?.role === "UNIT_LEADER") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div className="max-w-md rounded-xl border border-v5-line bg-v5-surface p-6 text-center shadow-sm">
          <RoutineIcon name="lock_person" className="mx-auto text-[36px] text-v5-muted" />
          <h1 className="mt-3 text-lg font-semibold text-v5-ink">Nhật ký ca trực</h1>
          <p className="mt-1 text-sm text-v5-muted">
            Màn hình này dành cho công chức và trưởng/phó nhóm ghi nhận công việc trong ca.
            Lãnh đạo đơn vị không cần sử dụng màn hình này.
          </p>
          <Link
            href="/v5"
            className="mt-4 inline-flex rounded-lg bg-v5-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Về Tổng quan điều hành
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-transparent pb-12">
      <div className="flex w-full flex-col gap-3 p-3 sm:p-4 lg:gap-space-lg lg:p-space-lg">
        {/* Top Operational Banner & View Switching Tabs */}
        <div className="flex flex-col gap-3 rounded-xl border border-v5-line/50 bg-v5-surface p-3 shadow-sm sm:p-4 lg:gap-space-md lg:p-space-lg">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-space-md">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded bg-v5-accent px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm">
                  <RoutineIcon name="fact_check" className="text-[14px]" />
                  Nghiệp vụ hải quan
                </span>
                <span className="flex items-center gap-1 text-[11px] text-v5-muted">
                  <RoutineIcon name="verified" className="text-[14px] text-v5-success" />
                  Biểu mẫu:{" "}
                  <strong className="font-semibold text-v5-ink">
                    {activeFormVersion?.templateCode || "FORM"} v{activeFormVersion?.version || 1}
                  </strong>
                </span>
              </div>
              <h1 className="text-2xl text-v5-ink tracking-tight">
                Nhật ký tác nghiệp &amp; biểu mẫu
              </h1>
              <p className="max-w-4xl text-[12px] text-v5-muted">
                Ghi nhận khối lượng công việc thực tế theo từng công chức; lưu trữ dữ liệu doanh nghiệp, container và các trường đặc thù.
              </p>
            </div>

            {/* Quick Metrics Summary */}
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:w-auto">
              <button
                type="button"
                onClick={() => {
                  setOnlyNotOccurred(false);
                  setFilterAllDates(false);
                  setFilterDate(vnDateOnly());
                }}
                title="Xem bản ghi của ngày hôm nay"
                className="flex items-center gap-3 rounded-lg border border-v5-line bg-v5-surface px-3 py-2 text-left shadow-sm transition-fast hover:border-v5-accent/40 hover:bg-v5-bg"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-v5-success-soft text-v5-success">
                  <RoutineIcon name="task_alt" className="text-[18px]" />
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[11px] text-v5-muted">
                    {filterAllDates ? "Tổng bản ghi đã nạp" : "Bản ghi trong ngày"}
                  </span>
                  <span className="text-sm font-bold text-v5-ink">
                    {entries.length}{" "}
                    <span className="text-[11px] font-normal text-v5-muted">bản ghi</span>
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setOnlyNotOccurred((value) => !value)}
                title="Lọc các bản ghi không phát sinh"
                aria-pressed={onlyNotOccurred}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left shadow-sm transition-fast hover:bg-v5-bg ${
                  onlyNotOccurred ? "border-v5-gold bg-v5-gold-soft" : "border-v5-line bg-v5-surface hover:border-v5-gold/50"
                }`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-v5-bg text-v5-muted">
                  <RoutineIcon name="assignment_turned_in" className="text-[18px]" />
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[11px] text-v5-muted">
                    Không phát sinh {filterAllDates ? "(tất cả)" : "(trong ngày)"}
                  </span>
                  <span className="flex items-center gap-1 text-sm font-bold text-v5-gold-ink">
                    {entries.filter((e) => e.occurrenceStatus === "NOT_OCCURRED").length} việc
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Segmented Navigation Tabs */}
          <div className="flex flex-col gap-2 rounded-xl border border-v5-line bg-v5-bg p-1.5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="flex w-full flex-col gap-1 sm:flex-row sm:flex-wrap lg:w-auto" role="tablist">
              <button
                onClick={() => setActiveTab("tab1")}
                className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-fast sm:w-auto ${
                  activeTab === "tab1"
                    ? "bg-v5-accent font-semibold text-white shadow-sm"
                    : "text-v5-muted hover:bg-v5-bg hover:text-v5-ink"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <RoutineIcon name="edit_calendar" className="text-[18px]" />
                  <span className="truncate">Ghi nhận nhật ký</span>
                </span>
                <span className="shrink-0 rounded-full bg-v5-accent px-2 py-0.5 text-[11px] font-bold text-white">
                  {entries.length} việc
                </span>
              </button>
              {canManageForms && (
              <button
                onClick={() => setActiveTab("tab2")}
                className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-fast sm:w-auto ${
                  activeTab === "tab2"
                    ? "bg-v5-accent font-semibold text-white shadow-sm"
                    : "text-v5-muted hover:bg-v5-bg hover:text-v5-ink"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <RoutineIcon name="build_circle" className="text-[18px]" />
                  <span className="truncate">Thiết kế biểu mẫu</span>
                </span>
                <span className="shrink-0 rounded bg-v5-accent px-2 py-0.5 text-[11px] font-bold text-white">
                  v{activeFormVersion?.version || 1}
                </span>
              </button>
              )}
              {(canManageForms || canAudit) && (
              <button
                onClick={() => setActiveTab("tab3")}
                className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-fast sm:w-auto ${
                  activeTab === "tab3"
                    ? "bg-v5-accent font-semibold text-white shadow-sm"
                    : "text-v5-muted hover:bg-v5-bg hover:text-v5-ink"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <RoutineIcon name="history_toggle_off" className="text-[18px]" />
                  <span className="truncate">Lịch sử thay đổi</span>
                </span>
              </button>
              )}
            </div>
            <div className="hidden items-center gap-2 px-2 text-[11px] text-v5-muted lg:flex">
              <span className="inline-block h-2 w-2 rounded-full bg-v5-success" />
              <span>Đang hoạt động</span>
            </div>
          </div>
        </div>

        {/* TAB 1: WORK LOG INTERFACE (OFFICER OPERATIONAL VIEW) */}
        {activeTab === "tab1" && (
          <section className="flex flex-col gap-space-lg">
            {/* Officer Context & Date Header Bar */}
            <div className="bg-v5-surface rounded-xl p-space-md shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md border border-v5-line/50">
              <div className="flex flex-wrap items-center gap-space-md">
                {/* UX 3B: ngày/ca chỉ dùng cho bản ghi mới — ẩn cùng form với vai trò không khai báo. */}
                {canDeclare && (
                <>
                <div className="flex items-center gap-2 bg-v5-bg px-3 py-1.5 rounded-lg border border-v5-line">
                  <RoutineIcon name="calendar_today" className="text-v5-accent text-[20px]" />
                  <div className="flex flex-col">
                    <span className="text-[11px] text-v5-muted uppercase font-bold">
                      Ngày ghi nhận (quyết định kỳ)
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        required
                        data-testid="routine-entry-date"
                        value={entryWorkDate}
                        onChange={(e) => setEntryWorkDate(e.target.value)}
                        className="bg-transparent text-[13px] font-semibold text-v5-ink focus:outline-none cursor-pointer"
                      />
                      {(!entryWorkDate || entryWorkDate !== vnDateOnly()) && (
                        <button
                          type="button"
                          data-testid="routine-entry-date-today"
                          onClick={() => setEntryWorkDate(vnDateOnly())}
                          className="text-[10px] font-semibold text-v5-accent hover:underline"
                        >
                          Hôm nay
                        </button>
                      )}
                    </div>
                    {!entryWorkDate && (
                      <span
                        data-testid="routine-entry-date-required"
                        className="text-[10px] text-v5-danger font-semibold"
                      >
                        Ngày ghi nhận là bắt buộc.
                      </span>
                    )}
                    {entryWorkDate && entryWorkDate !== vnDateOnly() && (
                      <span
                        data-testid="routine-entry-date-warning"
                        className="text-[10px] text-v5-gold-ink"
                      >
                        Đang ghi cho ngày khác hôm nay — bản ghi vào kỳ của ngày đã chọn.
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-v5-bg px-3 py-1.5 rounded-lg border border-v5-line">
                  <RoutineIcon name="schedule" className="text-v5-accent text-[20px]" />
                  <div className="flex flex-col">
                    <span className="text-[11px] text-v5-muted uppercase font-bold">
                      Ca làm việc
                    </span>
                    <select
                      data-testid="routine-work-shift"
                      value={logShift}
                      onChange={(e) => setLogShift(e.target.value as "SANG" | "CHIEU" | "CA_NGAY")}
                      className="bg-transparent text-[13px] font-semibold text-v5-ink focus:outline-none cursor-pointer"
                    >
                      <option value="SANG">Sáng</option>
                      <option value="CHIEU">Chiều</option>
                      <option value="CA_NGAY">Cả ngày</option>
                    </select>
                  </div>
                </div>
                </>
                )}

                <div className="flex items-center gap-3 pl-2">
                  <div className="w-10 h-10 rounded-full bg-v5-accent text-white flex items-center justify-center text-sm font-bold">
                    {currentUser.fullName.split(" ").slice(-1)[0]?.slice(0, 2).toUpperCase() || "CB"}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-v5-ink font-bold">
                        {currentUser.fullName}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-v5-success-soft text-v5-success text-[11px] font-bold">
                        Đang trực ca
                      </span>
                    </div>
                    <span className="text-[11px] text-v5-muted">
                      {currentUser.unitName} {currentUser.username ? `— Tài khoản: ${currentUser.username}` : ""}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Form Thêm Đầu Việc Tác Nghiệp Hàng Ngày — UX 3B: ẩn với lãnh đạo, thu gọn với vai trò khai báo */}
            {declarationState === "LOADING" ? (
              <div
                role="status"
                aria-busy="true"
                data-testid="routine-declaration-loading"
                className="flex flex-col gap-3 rounded-xl border border-v5-line/50 bg-v5-surface p-space-lg shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <RoutineIcon name="hourglass_top" className="shrink-0 text-[22px] text-v5-muted" />
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[13px] font-semibold text-v5-ink">
                      Đang xác định quyền khai báo đầu việc…
                    </span>
                    <span className="text-[11px] text-v5-muted">
                      Vui lòng chờ trong giây lát.
                    </span>
                  </div>
                </div>
                <div className="h-2.5 w-2/3 rounded bg-v5-bg animate-pulse" aria-hidden="true" />
                <div className="h-2.5 w-1/2 rounded bg-v5-bg animate-pulse" aria-hidden="true" />
              </div>
            ) : declarationState === "UNKNOWN" ? (
              <div
                role="note"
                data-testid="routine-declaration-unavailable"
                className="flex items-start gap-3 rounded-xl border border-v5-line/50 bg-v5-surface p-space-md shadow-sm"
              >
                <RoutineIcon name="help" className="shrink-0 text-[22px] text-v5-muted" />
                <div className="flex flex-col gap-0.5">
                  <p className="text-[13px] font-semibold text-v5-ink">
                    Chưa xác định được quyền khai báo đầu việc.
                  </p>
                  <p className="text-[11px] text-v5-muted">
                    Vui lòng tải lại trang để thử lại. Danh sách nhật ký bên dưới vẫn hiển thị đầy đủ.
                  </p>
                </div>
              </div>
            ) : canDeclare ? (
            <div data-tour="log-form" className="bg-v5-surface rounded-xl p-space-lg shadow-sm border border-v5-line/50 flex flex-col gap-space-md">
              <div className="flex flex-col gap-2 border-b border-v5-line pb-space-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <RoutineIcon name="add_task" className="shrink-0 text-v5-accent text-[22px]" />
                  <div className="flex min-w-0 flex-col">
                    <h3 className="text-sm text-v5-ink">
                      Khai Báo Đầu Việc Thực Hiện Trong Ca
                    </h3>
                    <span className="text-[11px] text-v5-muted">
                      Mặc định thu gọn — danh sách nhật ký bên dưới luôn hiển thị.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="routine-declaration-toggle"
                  aria-expanded={isDeclarationOpen}
                  aria-controls="routine-declaration-panel"
                  onClick={() => setIsDeclarationOpen((open) => !open)}
                  className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-v5-accent/40 bg-v5-accent/5 px-4 py-2 text-[12px] font-semibold text-v5-accent transition-fast hover:bg-v5-accent/10 active-press sm:w-auto"
                >
                  <RoutineIcon
                    name={isDeclarationOpen ? "expand_less" : "add_task"}
                    className="text-[18px]"
                  />
                  <span>{isDeclarationOpen ? "Thu gọn khai báo" : "Khai báo đầu việc"}</span>
                </button>
              </div>

              <div id="routine-declaration-panel" data-testid="routine-declaration-panel" hidden={!isDeclarationOpen}>
              <form onSubmit={handleAddLog} className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-[12px] text-v5-ink font-semibold">
                    Nội dung công việc thực tế đã xử lý *
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="routine-title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Nhập nội dung công việc đã xử lý trong ca..."
                    className="h-10 px-3 rounded bg-v5-bg text-[12px] text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-v5-accent"
                  />
                </div>

                {/* F18: danh muc TX (348 muc) + san pham QD1277.
                    Ban goc "Danh muc nghiep vu lien quan" (48 mau TTHQ/GSHQ) duoc giu o
                    phan "mau cu" de khong pha vong mau cua cac ban ghi lich su. */}
                <RoutineCatalogPicker
                  selectedTags={selectedTxs}
                  onTagsChange={(tags: TxTag[]) => {
                    setSelectedTxs(tags);
                    if (tags.length > 0 && !newTitle) setNewTitle(tags[tags.length - 1].title);
                  }}
                  products={proposedProducts}
                  onProductsChange={setProposedProducts}
                />


                {showCompanyField && (
                <div className="flex flex-col gap-1">
                  <label className="text-[12px] text-v5-ink font-semibold">
                    Doanh nghiệp / Chủ hàng liên quan (nếu có)
                  </label>
                  <input
                    type="text"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    placeholder="Nhập doanh nghiệp liên quan (nếu có)..."
                    className="h-10 px-3 rounded bg-v5-bg text-[12px] text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-v5-accent"
                  />
                </div>
                )}

                {showContainerField && (
                <div className="flex flex-col gap-1">
                  <label className="text-[12px] text-v5-ink font-semibold">
                    Số lượng container / Phương tiện
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newConts}
                    placeholder="Nhập số lượng thực tế..."
                    onChange={(e) => setNewConts(e.target.value === "" ? "" : Number(e.target.value))}
                    className="h-10 px-3 rounded bg-v5-bg text-[12px] text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-v5-accent"
                  />
                </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-[12px] text-v5-ink font-semibold">
                    Tỷ lệ hoàn tất (%)
                  </label>
                  <select
                    value={newProgress}
                    onChange={(e) => setNewProgress(Number(e.target.value))}
                    className="h-10 px-3 rounded bg-v5-bg text-[12px] text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-v5-accent cursor-pointer"
                  >
                    <option value={50}>50% — Đang tiếp tục xử lý</option>
                    <option value={85}>85% — Chờ đối chiếu chứng từ</option>
                    <option value={100}>100% — Đã hoàn thành trong ca</option>
                  </select>
                </div>

                {/* Dynamic Form Schema Fields (Rendered directly from PostgreSQL Active Version) */}
                {activeFormVersion &&
                  activeFormVersion.schemaJson?.fields &&
                  activeFormVersion.schemaJson.fields.length > 0 && (
                    <div className="md:col-span-2 p-3.5 rounded-lg bg-v5-bg border border-v5-line flex flex-col gap-3">
                      <div className="flex items-center justify-between border-b border-v5-line/60 pb-2">
                        <span className="text-[12px] text-v5-ink font-bold flex items-center gap-1.5">
                          <RoutineIcon name="dynamic_form" className="text-[16px] text-v5-accent" />
                          Trường dữ liệu biểu mẫu động: {activeFormVersion.templateName || "Biểu mẫu nghiệp vụ"} (v
                          {activeFormVersion.version})
                        </span>
                        <span className="text-xs text-v5-muted font-mono">
                          Mã: {activeFormVersion.templateCode || "FORM"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {activeFormVersion.schemaJson.fields.map((field) => (
                          <div key={field.key} className="flex flex-col gap-1">
                            <label className="text-[11px] text-[12px] text-v5-ink font-semibold flex items-center justify-between">
                              <span>
                                {field.label} {field.required && <span className="text-v5-danger">*</span>}
                              </span>
                              <span className="text-[10px] text-v5-muted uppercase font-mono">{field.type}</span>
                            </label>
                            {field.type === "select" ? (
                              <select
                                value={dynamicFormValues[field.key] || ""}
                                onChange={(e) =>
                                  setDynamicFormValues({
                                    ...dynamicFormValues,
                                    [field.key]: e.target.value,
                                  })
                                }
                                className="h-9 px-2.5 rounded bg-v5-surface text-[12px] text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-v5-accent"
                              >
                                <option value="">-- Chọn trạng thái --</option>
                                {/* F18 (D): dung dung danh muc tuy chon tu Form Builder; giu
                                    cac lua chon mac dinh cua he thong neu builder khong dinh nghia */}
                                {(field.options && field.options.length
                                  ? field.options
                                  : ["Nguyên seal chì", "Sai khác niêm phong", "Đã kiểm tra thực tế"]
                                ).map((opt: string) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={
                                  field.type === "number" ||
                                  field.type === "INTEGER" ||
                                  field.type === "FLOAT"
                                    ? "number"
                                    : "text"
                                }
                                min={field.min}
                                max={field.max}
                                value={dynamicFormValues[field.key] ?? ""}
                                onChange={(e) =>
                                  setDynamicFormValues({
                                    ...dynamicFormValues,
                                    [field.key]:
                                      field.type === "number" ||
                                      field.type === "INTEGER" ||
                                      field.type === "FLOAT"
                                        ? e.target.value === ""
                                          ? ""
                                          : Number(e.target.value)
                                        : e.target.value,
                                  })
                                }
                                placeholder={`Nhập ${field.label.toLowerCase()}...`}
                                className="h-9 px-2.5 rounded bg-v5-surface text-[12px] text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-v5-accent"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-[12px] text-v5-ink font-semibold">
                    Ghi chú chi tiết kết quả xử lý
                  </label>
                  <textarea
                    rows={2}
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Ghi nhận số tờ khai đã thông quan, vướng mắc phát sinh cần lưu ý ca sau..."
                    className="w-full p-2.5 rounded bg-v5-bg text-[12px] text-v5-ink border border-v5-line focus:outline-none focus:ring-1 focus:ring-v5-accent resize-none"
                  />
                </div>

                <div className="md:col-span-2 flex flex-wrap items-center justify-end gap-space-sm pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || !entryWorkDate}
                    className="px-6 py-2.5 rounded-lg bg-v5-accent text-white text-[12px] font-semibold hover:opacity-90 shadow-sm transition-fast active-press flex items-center justify-center gap-2 disabled:opacity-50 w-full sm:w-auto"
                  >
                    <RoutineIcon name="save" className="text-[18px]" />
                    <span>{isSubmitting ? "Đang lưu..." : "Lưu vào sổ nhật ký tác nghiệp"}</span>
                  </button>
                </div>
              </form>
              </div>

              {/* Xác nhận 1-chạm giữ NGOÀI panel thu gọn để vẫn dùng được khi form đang đóng. */}
              <div className="flex flex-wrap items-center gap-space-sm border-t border-v5-line pt-space-sm">
                <span className="w-full text-[11px] text-v5-muted sm:mr-auto sm:w-auto">
                  Không có đầu việc trong ca?
                </span>
                <button
                  type="button"
                  data-testid="routine-no-violation"
                  disabled={isSubmitting || !entryWorkDate}
                  onClick={() => handleConfirmNotOccurred("NO_VIOLATION")}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-v5-bg text-v5-ink hover:bg-v5-bg text-[12px] font-semibold transition-fast active-press flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RoutineIcon name="check_circle" className="shrink-0 text-[18px] text-v5-gold-ink" />
                  <span>Ca không phát sinh vụ việc vi phạm/tồn đọng</span>
                </button>
                <button
                  type="button"
                  data-testid="routine-no-activity"
                  disabled={isSubmitting || !entryWorkDate}
                  onClick={() => handleConfirmNotOccurred("NO_ACTIVITY")}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-v5-bg text-v5-ink hover:bg-v5-bg text-[12px] font-semibold transition-fast active-press flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RoutineIcon name="bedtime" className="shrink-0 text-[18px] text-v5-muted" />
                  <span>Ca không có hoạt động tác nghiệp</span>
                </button>
              </div>
            </div>
            ) : (
              <div
                role="note"
                data-testid="routine-declaration-hidden"
                className="flex items-start gap-3 rounded-xl border border-v5-line/50 bg-v5-surface p-space-md shadow-sm"
              >
                <RoutineIcon name="visibility" className="shrink-0 text-[22px] text-v5-muted" />
                <div className="flex flex-col gap-0.5">
                  <p className="text-[13px] font-semibold text-v5-ink">
                    Tài khoản này không khai báo đầu việc trong ca.
                  </p>
                  <p className="text-[11px] text-v5-muted">
                    Danh sách nhật ký bên dưới vẫn hiển thị đầy đủ để theo dõi.
                  </p>
                </div>
              </div>
            )}

            {/* Bảng Danh Sách Nhật Ký Đã Ghi Nhận */}
            <div data-tour="log-list" className="bg-v5-surface rounded-xl shadow-sm overflow-hidden flex flex-col border border-v5-line/50">
              <div className="p-space-md bg-v5-bg border-b border-v5-line flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                <span data-testid="routine-list-title" className="text-sm text-v5-ink font-bold">
                  Nhật Ký Đã Khai Báo —{" "}
                  {filterAllDates ? "Tất cả ngày" : `Ngày ${formatVnDate(filterDate)}`}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-v5-muted font-semibold">Lọc danh sách</span>
                  <input
                    type="date"
                    data-testid="routine-filter-date"
                    value={filterDate}
                    disabled={filterAllDates}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (!value) {
                        setFilterAllDates(true);
                      } else {
                        setFilterAllDates(false);
                        setFilterDate(value);
                      }
                    }}
                    className="h-8 px-2 rounded bg-v5-surface text-xs border border-v5-line disabled:opacity-50"
                  />
                  <label className="inline-flex items-center gap-1.5 text-xs text-v5-muted cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid="routine-filter-all"
                      checked={filterAllDates}
                      onChange={(e) => {
                        const all = e.target.checked;
                        setFilterAllDates(all);
                        if (!all && !filterDate) setFilterDate(entryWorkDate || vnDateOnly());
                      }}
                      className="w-3.5 h-3.5 rounded accent-v5-accent"
                    />
                    Tất cả ngày
                  </label>
                  <span className="text-xs text-v5-muted">
                    {visibleEntries.length} bản ghi {filterAllDates ? "đã nạp" : "trong ngày"}
                  </span>
                  {onlyNotOccurred && (
                    <button
                      type="button"
                      onClick={() => setOnlyNotOccurred(false)}
                      className="inline-flex items-center gap-1 rounded-full border border-v5-gold bg-v5-gold-soft px-2 py-0.5 text-[11px] font-semibold text-v5-gold-ink"
                    >
                      Đang lọc: Không phát sinh
                      <RoutineIcon name="close" className="text-[12px]" />
                    </button>
                  )}
                  {filterAllDates && hasMoreEntries && (
                    <span
                      data-testid="routine-list-truncated"
                      className="text-[11px] text-v5-gold-ink"
                    >
                      Chỉ hiển thị {entries.length} bản ghi gần nhất — thu hẹp ngày để xem thêm.
                    </span>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left border-collapse table-dense">
                  <thead>
                    <tr className="border-b border-v5-line bg-v5-bg text-[11px] font-semibold uppercase tracking-wide text-v5-muted">
                      <th className="py-3 px-space-md w-[80px]">MÃ</th>
                      <th className="py-3 px-space-md w-[320px]">NỘI DUNG TÁC NGHIỆP</th>
                      <th className="py-3 px-space-sm w-[180px]">NGƯỜI THỰC HIỆN</th>
                      <th className="py-3 px-space-sm w-[220px]">DOANH NGHIỆP / CONT</th>
                      <th className="py-3 px-space-sm w-[150px]">TIẾN ĐỘ</th>
                      <th className="py-3 px-space-md text-right w-[150px]">THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-v5-line text-[12px] text-v5-ink">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-v5-muted animate-pulse">
                          Đang nạp dữ liệu nhật ký ca trực...
                        </td>
                      </tr>
                    ) : visibleEntries.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-v5-muted">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <RoutineIcon name="history_edu" className="text-[36px] text-v5-muted" />
                            <p className="font-semibold text-v5-ink">
                              Chưa có nhật ký nào được ghi nhận cho{" "}
                              {filterAllDates ? "bất kỳ ngày nào" : "ngày đang lọc"}
                            </p>
                            {canDeclare && (
                              <p className="text-xs text-v5-muted">
                                Đồng chí có thể nhập nội dung thực tế ở form trên hoặc bấm "Xác nhận 1-chạm không phát sinh".
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      visibleEntries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-v5-bg transition-fast">
                          <td className="py-3 px-space-md font-bold text-v5-ink">{entry.code}</td>
                          <td className="py-3 px-space-md">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold text-v5-ink">{entry.title}</span>
                              <span className="text-xs text-v5-muted">
                                {entry.notes || (entry.occurrenceStatus === "NOT_OCCURRED" ? "Xác nhận không phát sinh" : "Đã hoàn thành")}
                              </span>
                              {/* UX 2B1: ngày/ca thực tế */}
                              {(entry.workDate || entry.shift) && (
                                <span className="text-[11px] text-v5-muted">
                                  Ngày {entry.workDate ? formatVnDate(entry.workDate) : "—"} · Ca{" "}
                                  {SHIFT_LABELS[entry.shift || "CA_NGAY"] || entry.shift}
                                </span>
                              )}
                              {/* F18 / UX 2B1: đủ N tag TX (fallback tag chính của dữ liệu cũ) */}
                              <div className="flex flex-wrap gap-1">
                                {(entry.catalogTags && entry.catalogTags.length > 0
                                  ? entry.catalogTags
                                  : entry.catalogEntry
                                    ? [
                                        {
                                          id: entry.catalogEntry.id,
                                          catalogEntryId: entry.catalogEntry.id,
                                          code: entry.catalogEntry.code,
                                          title: entry.catalogEntry.title,
                                        },
                                      ]
                                    : []
                                ).map((tag) => (
                                  <span
                                    key={tag.id}
                                    className="inline-flex items-center gap-1 rounded-full border border-v5-accent/30 bg-v5-accent/10 px-2 py-0.5 text-[10px] text-v5-ink"
                                  >
                                    <span className="font-mono font-bold text-v5-ink">{tag.code}</span>
                                    <span className="max-w-[220px] truncate">{tag.title}</span>
                                  </span>
                                ))}
                              </div>
                              {(entry.proposedProducts || []).length > 0 && (
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="text-[11px] text-v5-muted">SP QĐ1277:</span>
                                  {(entry.proposedProducts || []).map((p) => (
                                    <span
                                      key={p.productItemId}
                                      className="inline-flex items-center gap-1 rounded-full border border-v5-gold/40 bg-v5-gold-soft px-2 py-0.5 text-[10px] text-v5-gold-ink"
                                      title={`${p.taskName} — chờ lãnh đạo xác nhận`}
                                    >
                                      <span className="font-mono font-bold">{p.code}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* F18: trang thai V3 — KHONG coi la da nghiem thu */}
                              {entry.workItemId && (
                                <span className="text-[11px] text-v5-muted">
                                  Trạng thái hồ sơ công việc:{" "}
                                  {entry.reviewState === "CONFIRMED"
                                    ? "đã được lãnh đạo xác nhận"
                                    : entry.reviewState === "SUBMITTED"
                                      ? "đang chờ lãnh đạo xác nhận"
                                      : entry.reviewState === "RETURNED"
                                        ? "lãnh đạo trả lại — cần chỉnh sửa"
                                        : "chưa gửi lãnh đạo"}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-space-sm">
                            <span
                              className="block max-w-[180px] truncate"
                              title={entry.person?.fullName || "—"}
                            >
                              {entry.person?.fullName || "—"}
                            </span>
                          </td>
                          <td className="py-3 px-space-sm">
                            {entry.occurrenceStatus === "NOT_OCCURRED" ? (
                              <span className="text-xs text-v5-muted italic">Không phát sinh</span>
                            ) : (
                              <div className="flex flex-col text-xs">
                                <span className="font-semibold">
                                  {entry.companyName || "Chưa nhập DN"}
                                </span>
                                <span className="text-v5-muted">
                                  {entry.containerCount !== null && entry.containerCount !== undefined
                                    ? `${entry.containerCount} phương tiện`
                                    : "Theo ca trực"}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-space-sm">
                            {entry.occurrenceStatus === "NOT_OCCURRED" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-v5-gold-soft text-v5-gold-ink">
                                <RoutineIcon name="block" className="text-[13px]" />
                                KHÔNG PHÁT SINH
                              </span>
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${
                                  entry.status === "COMPLETED"
                                    ? "bg-v5-success-soft text-v5-success"
                                    : "bg-v5-accent/15 text-v5-accent"
                                }`}
                              >
                                {entry.status === "COMPLETED"
                                  ? "Đã xong (100%)"
                                  : `Đang làm (${entry.progressPercent}%)`}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-space-md text-right">
                            <button
                              onClick={() => setInspectEntry(entry)}
                              className="px-2.5 py-1 rounded bg-v5-bg text-v5-ink hover:bg-v5-bg text-xs font-semibold inline-flex items-center gap-1 active-press"
                            >
                              <RoutineIcon name="visibility" className="text-[14px]" />
                              <span>Chi tiết</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* TAB 2: THIẾT KẾ BIỂU MẪU */}
        {activeTab === "tab2" && (
          <section className="bg-v5-surface rounded-xl p-space-lg shadow-sm border border-v5-line/50 flex flex-col gap-space-md">
            <div className="flex items-center justify-between border-b border-v5-line pb-space-sm">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm text-v5-ink">
                    Thiết kế biểu mẫu tác nghiệp
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-v5-accent/10 text-v5-ink border border-primary/20">
                    PHIÊN BẢN v{activeFormVersion?.version || 1}
                  </span>
                </div>
                <p className="text-xs text-v5-muted">
                  Cấu hình các trường thông tin dùng trong biểu mẫu tác nghiệp.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const label = prompt("Nhập tên trường dữ liệu mới (ví dụ: Số niêm chì hải quan):");
                    if (!label || !label.trim()) return;
                    const key = `f_${Date.now().toString().slice(-4)}`;
                    setBuilderFields([
                      ...builderFields,
                      { key, label: label.trim(), type: "text", required: false },
                    ]);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-v5-bg text-v5-ink hover:bg-v5-bg font-semibold text-xs shadow-sm active-press flex items-center gap-1"
                >
                  <RoutineIcon name="add" className="text-[16px]" />
                  <span>+ Thêm trường</span>
                </button>
                <button
                  type="button"
                  disabled={isPublishingVersion}
                  onClick={handlePublishNewVersion}
                  className="px-4 py-2 rounded-lg bg-v5-accent text-white font-semibold text-xs shadow-sm active-press flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RoutineIcon name="publish" className="text-[16px]" />
                  <span>{isPublishingVersion ? "Đang lưu..." : "Phát hành phiên bản mới"}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {builderFields.map((field, idx) => (
                <div
                  key={field.key || idx}
                  className="p-3.5 rounded-lg bg-v5-bg border border-v5-line flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <RoutineIcon name="drag_indicator" className="text-v5-muted text-[20px]" />
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm text-v5-ink">{field.label}</span>
                      <span className="text-xs text-v5-muted font-mono">
                        Key: {field.key} | Kiểu: {field.type}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...builderFields];
                        updated[idx].required = !updated[idx].required;
                        setBuilderFields(updated);
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        field.required
                          ? "bg-v5-danger-soft text-v5-danger"
                          : "bg-v5-bg text-v5-muted"
                      }`}
                    >
                      {field.required ? "Bắt buộc" : "Tùy chọn"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBuilderFields(builderFields.filter((_, i) => i !== idx));
                      }}
                      className="p-1 text-v5-muted hover:text-v5-danger"
                    >
                      <RoutineIcon name="delete" className="text-[16px]" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 3: LỊCH SỬ THAY ĐỔI */}
        {activeTab === "tab3" && (
          <section className="bg-v5-surface rounded-xl p-space-lg shadow-sm border border-v5-line/50 flex flex-col gap-space-md">
            <div className="flex items-center justify-between border-b border-v5-line pb-space-sm">
              <h3 className="text-sm text-v5-ink">
                Lịch sử thay đổi hệ thống
              </h3>
              <span className="text-xs text-v5-muted">Nguồn: hệ thống</span>
            </div>

            {auditLoading ? (
              <p className="text-sm text-v5-muted animate-pulse py-4">Đang tải nhật ký kiểm toán...</p>
            ) : auditEvents.length === 0 ? (
              <p className="text-sm text-v5-muted py-4">Chưa có nhật ký kiểm toán nào được ghi nhận.</p>
            ) : (
              <div className="relative pl-6 flex flex-col gap-4 border-l-2 border-v5-line ml-2">
                {auditEvents.map((evt) => (
                  <div key={evt.id} className="relative">
                    <div
                      className={`absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full ${
                        evt.status === "BLOCKED"
                          ? "bg-v5-danger"
                          : evt.status === "WARNING"
                          ? "bg-v5-gold"
                          : "bg-v5-accent"
                      }`}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-v5-ink">
                        {new Date(evt.timestamp).toLocaleString("vi-VN")}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-v5-bg text-v5-muted">
                        {evt.action}
                      </span>
                    </div>
                    <p className="text-sm text-v5-ink">
                      <strong>{evt.actorFullName}</strong> ({evt.actorUsername}) thao tác trên {evt.resourceType}{" "}
                      [{evt.resourceId?.slice(0, 8)}]
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* DETAIL INSPECTION MODAL */}
      {inspectEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-v5-surface rounded-xl max-w-2xl w-full p-6 shadow-xl border border-v5-line flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3 border-b border-v5-line pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-v5-accent-soft text-v5-accent">
                  <RoutineIcon name="description" className="text-[18px]" />
                </span>
                <h3 className="text-sm font-semibold text-v5-ink">
                  Chi Tiết Nhật Ký Tác Nghiệp: {inspectEntry.code}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectEntry(null)}
                className="rounded-md p-1 text-v5-muted hover:bg-v5-bg hover:text-v5-ink"
                aria-label="Đóng"
              >
                <RoutineIcon name="close" className="text-[18px]" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex flex-col">
                <span className="text-v5-muted text-xs">Cán bộ thực hiện</span>
                <span className="font-semibold text-v5-ink">{inspectEntry.person?.fullName || "—"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-v5-muted text-xs">Bộ phận công tác</span>
                <span className="font-semibold text-v5-ink">{inspectEntry.unit?.name || "—"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-v5-muted text-xs">Thời gian ghi nhận</span>
                <span className="font-semibold text-v5-ink">
                  {new Date(inspectEntry.createdAt).toLocaleString("vi-VN")}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-v5-muted text-xs">Ngày / ca làm việc</span>
                <span className="font-semibold text-v5-ink">
                  {inspectEntry.workDate ? formatVnDate(inspectEntry.workDate) : "—"} ·{" "}
                  {SHIFT_LABELS[inspectEntry.shift || "CA_NGAY"] || inspectEntry.shift || "—"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-v5-muted text-xs">Trạng thái phát sinh</span>
                <span
                  className={`font-semibold ${
                    inspectEntry.occurrenceStatus === "NOT_OCCURRED"
                      ? "text-v5-gold-ink"
                      : "text-v5-success"
                  }`}
                >
                  {inspectEntry.occurrenceStatus === "NOT_OCCURRED" ? "KHÔNG PHÁT SINH" : "CÓ PHÁT SINH"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-v5-muted text-xs">Doanh nghiệp khai báo</span>
                <span className="font-semibold text-v5-ink">{inspectEntry.companyName || "—"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-v5-muted text-xs">Số container / phương tiện</span>
                <span className="font-semibold text-v5-ink">
                  {inspectEntry.containerCount !== null && inspectEntry.containerCount !== undefined
                    ? `${inspectEntry.containerCount} phương tiện`
                    : "—"}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1 border-t border-v5-line/60 pt-3">
              <span className="text-v5-muted text-xs">Nội dung tác nghiệp</span>
              <p className="text-sm text-v5-ink bg-v5-bg p-2.5 rounded border border-v5-line">
                {inspectEntry.title}
              </p>
            </div>

            {inspectEntry.notes && (
              <div className="flex flex-col gap-1">
                <span className="text-v5-muted text-xs">Ghi chú chi tiết</span>
                <p className="text-sm text-v5-ink bg-v5-bg p-2.5 rounded border border-v5-line">
                  {inspectEntry.notes}
                </p>
              </div>
            )}

            {/* UX 2B1: đủ N tag TX + N sản phẩm QĐ1277 */}
            <div className="flex flex-col gap-1 border-t border-v5-line/60 pt-3">
              <span className="text-v5-muted text-xs font-bold uppercase">Công việc thường xuyên (tag TX)</span>
              <div className="flex flex-wrap gap-1.5">
                {(inspectEntry.catalogTags && inspectEntry.catalogTags.length > 0
                  ? inspectEntry.catalogTags
                  : inspectEntry.catalogEntry
                    ? [
                        {
                          id: inspectEntry.catalogEntry.id,
                          catalogEntryId: inspectEntry.catalogEntry.id,
                          code: inspectEntry.catalogEntry.code,
                          title: inspectEntry.catalogEntry.title,
                        },
                      ]
                    : []
                ).map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-v5-accent/30 bg-v5-accent/10 px-2.5 py-1 text-[11px]"
                  >
                    <span className="font-mono font-bold text-v5-ink">{tag.code}</span>
                    <span className="max-w-[360px] truncate">{tag.title}</span>
                  </span>
                ))}
                {(!inspectEntry.catalogTags || inspectEntry.catalogTags.length === 0) &&
                  !inspectEntry.catalogEntry && (
                    <span className="text-xs text-v5-muted italic">Không gắn danh mục TX</span>
                  )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-v5-muted text-xs font-bold uppercase">Sản phẩm QĐ1277 đề xuất</span>
              <div className="flex flex-wrap gap-1.5">
                {(inspectEntry.proposedProducts || []).length > 0 ? (
                  (inspectEntry.proposedProducts || []).map((p) => (
                    <span
                      key={p.productItemId}
                      className="inline-flex flex-col rounded-lg border border-v5-gold/40 bg-v5-gold-soft px-2.5 py-1 text-[11px] text-v5-gold-ink"
                      title={p.taskName}
                    >
                      <span className="font-mono font-bold">{p.code}</span>
                      <span className="text-[10px] opacity-80">
                        {p.quantity !== null && p.quantity !== undefined ? `${p.quantity}${p.unit ? " " + p.unit : ""} · ` : ""}
                        chờ lãnh đạo xác nhận
                      </span>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-v5-muted italic">Không đề xuất sản phẩm</span>
                )}
              </div>
            </div>

            {/* Dynamic Submission Values Table */}
            {inspectEntry.formValues && Object.keys(inspectEntry.formValues).length > 0 && (
              <div className="flex flex-col gap-2 border-t border-v5-line/60 pt-3">
                <span className="text-v5-muted text-xs font-bold uppercase">
                  Dữ liệu chi tiết đã ghi nhận
                </span>
                <div className="rounded border border-v5-line overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-v5-bg text-v5-ink border-b border-v5-line">
                      <tr>
                        <th className="p-2">Khóa trường (FieldKey)</th>
                        <th className="p-2">Giá trị đã lưu (Value)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-v5-line">
                      {Object.entries(inspectEntry.formValues).map(([key, val]) => (
                        <tr key={key} className="hover:bg-v5-bg">
                          <td className="p-2 font-mono text-v5-muted">{key}</td>
                          <td className="p-2 font-semibold text-v5-ink">
                            {typeof val === "object" ? JSON.stringify(val) : String(val)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-v5-line pt-3">
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded-lg bg-v5-bg text-v5-ink hover:bg-v5-bg text-xs font-semibold flex items-center gap-1 active-press"
              >
                <RoutineIcon name="print" className="text-[16px]" />
                <span>In phiếu tác nghiệp</span>
              </button>
              <button
                onClick={() => setInspectEntry(null)}
                className="px-4 py-1.5 rounded-lg bg-v5-accent text-white text-xs font-semibold active-press"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
