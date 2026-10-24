"use client";

import React, { useState, useEffect } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import Link from "next/link";
import { toast } from "@/components/ui/Toast";
import RoutineCatalogPicker, { type ProposedProduct } from "./RoutineCatalogPicker";

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
  // --- F18 ---
  catalogEntry?: { id: string; code: string; title: string } | null;
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
  const [logDate, setLogDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [entries, setEntries] = useState<WorkLogEntry[]>([]);
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
  // --- F18: danh muc TX + san pham QD1277 + loc du lieu mau ---
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [proposedProducts, setProposedProducts] = useState<ProposedProduct[]>([]);
  const [hideDemo, setHideDemo] = useState(true);
  const [newCompany, setNewCompany] = useState("");
  // YC-07: để trống — không điền sẵn số lượng giả định
  const [newConts, setNewConts] = useState<number | string>("");
  const [newNotes, setNewNotes] = useState("");
  const [newProgress, setNewProgress] = useState<number>(100);
  const [dynamicFormValues, setDynamicFormValues] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [catalogTemplates, setCatalogTemplates] = useState<Array<{ id: string; code: string; title: string }>>([]);

  // Inspection modal
  const [inspectEntry, setInspectEntry] = useState<WorkLogEntry | null>(null);

  // Tab 2: Admin Form Builder State
  // Chỉ người có quyền quản trị biểu mẫu / xem audit mới thấy tab 2-3
  const { can: canPerm, canAudit } = usePermissions();
  const canManageForms = canPerm("form.manage");
  const [builderFields, setBuilderFields] = useState<FormFieldDef[]>([]);
  // F19: chi hien truong DN / container khi bieu mau (Form Builder) that su yeu cau.
  // Khong co bieu mau chuyen biet => dung bieu mau ghi nhan co ban, khong ep chi tieu thong quan.
  const formKeys = (builderFields || []).map((f: any) => f.key);
  const showCompanyField = formKeys.length === 0 || formKeys.includes("company_name");
  const showContainerField = formKeys.length === 0 || formKeys.includes("container_count");
  const [builderTemplateId, setBuilderTemplateId] = useState<string>("");
  const [isPublishingVersion, setIsPublishingVersion] = useState(false);

  // Tab 3: Audit Trail State
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // 1. Fetch Routine entries and Active Form Version from PostgreSQL
  const fetchRoutineData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/routine?hideDemo=" + (hideDemo ? "1" : "0"));
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

  useEffect(() => {
    fetchRoutineData();

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

  // Fetch Audit Trail when Tab 3 is clicked
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
          // F18: danh muc TX + danh sach SP QD1277 de xuat
          catalogEntryId: selectedTx?.id || null,
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
        // Reload data from PostgreSQL
        await fetchRoutineData();
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
    const isNoActivity = kind === "NO_ACTIVITY";
    const defaultTitle = isNoActivity
      ? "Xác nhận: ca trực không có hoạt động tác nghiệp"
      : "Xác nhận: ca trực không phát sinh vụ việc vi phạm hoặc tồn đọng";
    const finalTitle = (kind === "NO_ACTIVITY" ? "" : newTitle.trim()) || defaultTitle;
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
          notes: newNotes.trim() || defaultNotes,
          occurrenceStatus: "NOT_OCCURRED",
          notOccurredKind: kind,
          templateId: null,
          catalogEntryId: null,
          productItemId: null,
          proposedProducts: [],
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`Đã ghi nhận: ${isNoActivity ? "Ca không có hoạt động tác nghiệp" : "Ca không phát sinh vụ việc vi phạm/tồn đọng"}!`);
        await fetchRoutineData();
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

  return (
    <div className="w-full min-h-screen bg-app-bg pb-12">
      <div className="flex flex-col w-full p-space-lg gap-space-lg">
        {/* Top Operational Banner & View Switching Tabs */}
        <div className="flex flex-col gap-space-md bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-border-default/50">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-primary text-on-primary font-label-sm text-label-sm uppercase tracking-wider shadow-sm font-bold">
                  <span className="material-symbols-outlined text-[14px]">fact_check</span>
                  Nghiệp Vụ Hải Quan
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-status-success">verified</span>
                  Phiên bản biểu mẫu động:{" "}
                  <strong className="text-on-surface font-body-semibold">
                    {activeFormVersion?.templateCode || "FORM"} v{activeFormVersion?.version || 1}
                  </strong>
                </span>
              </div>
              <h1 className="font-headline-xl text-headline-xl text-primary tracking-tight">
                Nhật Ký Tác Nghiệp Nghiệp Vụ &amp; Biểu Mẫu Động
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-4xl">
                Ghi nhận khối lượng công việc thực tế theo từng công chức biên giới, lưu trữ nguyên vẹn dữ liệu
                doanh nghiệp, container và các trường đặc thù vào cơ sở dữ liệu PostgreSQL.
              </p>
            </div>

            {/* Quick Metrics Summary */}
            <div className="flex items-center gap-space-sm shrink-0">
              <div className="px-space-md py-2.5 rounded bg-surface-container-lowest shadow-sm flex items-center gap-3 border border-border-default">
                <div className="w-9 h-9 rounded bg-status-success-bg flex items-center justify-center text-status-success">
                  <span className="material-symbols-outlined text-[20px]">task_alt</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Đầu việc đã nạp DB</span>
                  <span className="font-headline-sm text-headline-sm text-primary font-bold">
                    {entries.length} <span className="font-body-md text-label-sm text-on-surface-variant font-normal">Bản ghi</span>
                  </span>
                </div>
              </div>
              <div className="px-space-md py-2.5 rounded bg-surface-container-lowest shadow-sm flex items-center gap-3 border border-border-default">
                <div className="w-9 h-9 rounded bg-status-unassigned-bg flex items-center justify-center text-status-unassigned">
                  <span className="material-symbols-outlined text-[20px]">assignment_turned_in</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Không phát sinh</span>
                  <span className="font-headline-sm text-headline-sm text-status-warning flex items-center gap-1 font-bold">
                    {entries.filter((e) => e.occurrenceStatus === "NOT_OCCURRED").length} việc
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Segmented Navigation Tabs */}
          <div className="bg-surface-subtle p-1 rounded-xl flex flex-wrap items-center justify-between gap-2 shadow-sm border border-border-default">
            <div className="flex items-center gap-1" role="tablist">
              <button
                onClick={() => setActiveTab("tab1")}
                className={`flex items-center gap-2 px-space-md py-2.5 rounded-lg transition-fast ${
                  activeTab === "tab1"
                    ? "bg-secondary text-on-secondary shadow-sm font-body-semibold"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">edit_calendar</span>
                <span>1. Ghi nhận nhật ký hàng ngày (Cán bộ)</span>
                <span className="px-2 py-0.2 rounded-full bg-secondary-fixed text-on-secondary-fixed text-label-sm font-label-sm font-bold">
                  {entries.length} việc
                </span>
              </button>
              {canManageForms && (
              <button
                onClick={() => setActiveTab("tab2")}
                className={`flex items-center gap-2 px-space-md py-2.5 rounded-lg transition-fast ${
                  activeTab === "tab2"
                    ? "bg-secondary text-on-secondary shadow-sm font-body-semibold"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">build_circle</span>
                <span>2. Form Builder — Quản trị thiết kế biểu mẫu động</span>
                <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed text-label-sm font-label-sm font-bold">
                  No-Code v{activeFormVersion?.version || 1}
                </span>
              </button>
              )}
              {(canManageForms || canAudit) && (
              <button
                onClick={() => setActiveTab("tab3")}
                className={`flex items-center gap-2 px-space-md py-2.5 rounded-lg transition-fast ${
                  activeTab === "tab3"
                    ? "bg-secondary text-on-secondary shadow-sm font-body-semibold"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">history_toggle_off</span>
                <span>3. Lịch sử kiểm toán Audit Trail</span>
              </button>
              )}
            </div>
            <div className="flex items-center gap-2 px-2 text-on-surface-variant font-label-sm text-label-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-status-success" />
              <span>Hệ thống trực tuyến: Hải quan CKQT Tà Lùng</span>
            </div>
          </div>
        </div>

        {/* TAB 1: WORK LOG INTERFACE (OFFICER OPERATIONAL VIEW) */}
        {activeTab === "tab1" && (
          <section className="flex flex-col gap-space-lg">
            {/* Officer Context & Date Header Bar */}
            <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md border border-border-default/50">
              <div className="flex flex-wrap items-center gap-space-md">
                <div className="flex items-center gap-2 bg-surface-subtle px-3 py-1.5 rounded-lg border border-border-default">
                  <span className="material-symbols-outlined text-secondary text-[20px]">calendar_today</span>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-[11px] text-on-surface-variant uppercase font-bold">
                      Ngày ghi nhận
                    </span>
                    <input
                      type="date"
                      value={logDate}
                      onChange={(e) => setLogDate(e.target.value)}
                      className="bg-transparent font-body-semibold text-body-semibold text-primary focus:outline-none cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pl-2">
                  <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-headline-sm font-bold">
                    {currentUser.fullName.split(" ").slice(-1)[0]?.slice(0, 2).toUpperCase() || "CB"}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-body-semibold text-body-semibold text-on-surface font-bold">
                        {currentUser.fullName}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-status-success-bg text-status-success text-label-sm font-label-sm font-bold">
                        Đang trực ca
                      </span>
                    </div>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      {currentUser.unitName} {currentUser.username ? `— Tài khoản: ${currentUser.username}` : ""}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Form Thêm Đầu Việc Tác Nghiệp Hàng Ngày */}
            <div data-tour="log-form" className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-border-default/50 flex flex-col gap-space-md">
              <div className="flex items-center justify-between border-b border-surface-container pb-space-sm">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-[22px]">add_task</span>
                  <h3 className="font-headline-sm text-headline-sm text-primary">
                    Khai Báo Đầu Việc Thực Hiện Trong Ca
                  </h3>
                </div>
                <span className="font-label-sm text-label-sm text-outline">
                  Dữ liệu được lưu trữ trực tiếp vào cơ sở dữ liệu PostgreSQL
                </span>
              </div>

              <form onSubmit={handleAddLog} className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Nội dung công việc thực tế đã xử lý *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Nhập nội dung công việc đã xử lý trong ca..."
                    className="h-10 px-3 rounded bg-surface-container-low text-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>

                {/* F18: danh muc TX (348 muc) + san pham QD1277.
                    Ban goc "Danh muc nghiep vu lien quan" (48 mau TTHQ/GSHQ) duoc giu o
                    phan "mau cu" de khong pha vong mau cua cac ban ghi lich su. */}
                <RoutineCatalogPicker
                  selectedTxId={selectedTx?.id || ""}
                  onTxChange={(tx: any) => {
                    setSelectedTx(tx);
                    if (tx && !newTitle) setNewTitle(tx.title);
                  }}
                  products={proposedProducts}
                  onProductsChange={setProposedProducts}
                />


                {showCompanyField && (
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Doanh nghiệp / Chủ hàng liên quan (nếu có)
                  </label>
                  <input
                    type="text"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    placeholder="Nhập doanh nghiệp liên quan (nếu có)..."
                    className="h-10 px-3 rounded bg-surface-container-low text-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>
                )}

                {showContainerField && (
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Số lượng container / Phương tiện
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newConts}
                    placeholder="Nhập số lượng thực tế..."
                    onChange={(e) => setNewConts(e.target.value === "" ? "" : Number(e.target.value))}
                    className="h-10 px-3 rounded bg-surface-container-low text-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Tỷ lệ hoàn tất (%)
                  </label>
                  <select
                    value={newProgress}
                    onChange={(e) => setNewProgress(Number(e.target.value))}
                    className="h-10 px-3 rounded bg-surface-container-low text-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary cursor-pointer"
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
                    <div className="md:col-span-2 p-3.5 rounded-lg bg-surface-subtle border border-border-default flex flex-col gap-3">
                      <div className="flex items-center justify-between border-b border-border-default/60 pb-2">
                        <span className="font-label-md text-primary font-bold flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-secondary">dynamic_form</span>
                          Trường dữ liệu biểu mẫu động: {activeFormVersion.templateName || "Biểu mẫu nghiệp vụ"} (v
                          {activeFormVersion.version})
                        </span>
                        <span className="text-xs text-outline font-mono">
                          Mã: {activeFormVersion.templateCode || "FORM"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {activeFormVersion.schemaJson.fields.map((field) => (
                          <div key={field.key} className="flex flex-col gap-1">
                            <label className="font-label-sm text-[12px] text-primary font-semibold flex items-center justify-between">
                              <span>
                                {field.label} {field.required && <span className="text-status-danger">*</span>}
                              </span>
                              <span className="text-[10px] text-outline uppercase font-mono">{field.type}</span>
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
                                className="h-9 px-2.5 rounded bg-surface-container-lowest text-body-sm text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
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
                                className="h-9 px-2.5 rounded bg-surface-container-lowest text-body-sm text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="font-label-md text-label-md text-primary font-semibold">
                    Ghi chú chi tiết kết quả xử lý
                  </label>
                  <textarea
                    rows={2}
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Ghi nhận số tờ khai đã thông quan, vướng mắc phát sinh cần lưu ý ca sau..."
                    className="w-full p-2.5 rounded bg-surface-container-low text-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
                  />
                </div>

                <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-space-sm pt-2">
                  <button
                    type="button"
                    data-testid="routine-no-violation"
                    disabled={isSubmitting}
                    onClick={() => handleConfirmNotOccurred("NO_VIOLATION")}
                    className="px-4 py-2 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-label-md font-semibold transition-fast active-press flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px] text-status-warning">check_circle</span>
                    <span>Ca không phát sinh vụ việc vi phạm/tồn đọng</span>
                  </button>
                  <button
                    type="button"
                    data-testid="routine-no-activity"
                    disabled={isSubmitting}
                    onClick={() => handleConfirmNotOccurred("NO_ACTIVITY")}
                    className="px-4 py-2 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-label-md font-semibold transition-fast active-press flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px] text-outline">bedtime</span>
                    <span>Ca không có hoạt động tác nghiệp</span>
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 rounded-lg bg-secondary text-on-secondary font-label-md font-semibold hover:opacity-90 shadow-sm transition-fast active-press flex items-center gap-2 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    <span>{isSubmitting ? "Đang lưu..." : "Lưu vào sổ nhật ký tác nghiệp"}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Bảng Danh Sách Nhật Ký Đã Ghi Nhận */}
            <div data-tour="log-list" className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col border border-border-default/50">
              <div className="p-space-md bg-surface-subtle border-b border-border-default flex items-center justify-between">
                <span className="font-headline-sm text-primary font-bold">
                  Nhật Ký Đã Khai Báo Trong Ca Ngày {logDate}
                </span>
                <span className="text-xs text-outline">{entries.length} bản ghi thực tế</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left border-collapse table-dense">
                  <thead>
                    <tr className="bg-surface-subtle text-primary font-table-header border-b border-border-default">
                      <th className="py-3 px-space-md w-[80px]">MÃ</th>
                      <th className="py-3 px-space-md w-[320px]">NỘI DUNG TÁC NGHIỆP</th>
                      <th className="py-3 px-space-sm w-[180px]">NGƯỜI THỰC HIỆN</th>
                      <th className="py-3 px-space-sm w-[220px]">DOANH NGHIỆP / CONT</th>
                      <th className="py-3 px-space-sm w-[150px]">TIẾN ĐỘ</th>
                      <th className="py-3 px-space-md text-right w-[150px]">THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container font-table-data text-on-surface">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-outline animate-pulse">
                          Đang nạp dữ liệu nhật ký ca trực từ cơ sở dữ liệu PostgreSQL...
                        </td>
                      </tr>
                    ) : entries.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-on-surface-variant">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <span className="material-symbols-outlined text-[36px] text-outline">history_edu</span>
                            <p className="font-semibold text-primary">Chưa có nhật ký nào được ghi nhận cho ca hôm nay</p>
                            <p className="text-xs text-outline">
                              Đồng chí có thể nhập nội dung thực tế ở form trên hoặc bấm "Xác nhận 1-chạm không phát sinh".
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      entries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-surface-container-low transition-fast">
                          <td className="py-3 px-space-md font-bold text-primary">{entry.code}</td>
                          <td className="py-3 px-space-md">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold text-primary">{entry.title}</span>
                              <span className="text-xs text-outline">
                                {entry.notes || (entry.occurrenceStatus === "NOT_OCCURRED" ? "Xác nhận không phát sinh" : "Đã hoàn thành")}
                              </span>
                              {/* F18: danh muc TX + san pham QD1277 da de xuat */}
                              {entry.catalogEntry && (
                                <span className="text-[11px] text-outline">
                                  Công việc thường xuyên: <span className="font-mono">{entry.catalogEntry.code}</span> — {entry.catalogEntry.title}
                                </span>
                              )}
                              {(entry.proposedProducts || []).length > 0 && (
                                <span className="text-[11px] text-outline">
                                  Sản phẩm QĐ1277 đề xuất:{" "}
                                  {(entry.proposedProducts || []).map((p) => p.code).join(", ")}
                                  {" "}(chờ lãnh đạo xác nhận)
                                </span>
                              )}
                              {/* F18: trang thai V3 — KHONG coi la da nghiem thu */}
                              {entry.workItemId && (
                                <span className="text-[11px] text-outline">
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
                              <span className="text-xs text-outline italic">Không phát sinh</span>
                            ) : (
                              <div className="flex flex-col text-xs">
                                <span className="font-semibold">
                                  {entry.companyName || "Chưa nhập DN"}
                                </span>
                                <span className="text-outline">
                                  {entry.containerCount !== null && entry.containerCount !== undefined
                                    ? `${entry.containerCount} phương tiện`
                                    : "Theo ca trực"}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-space-sm">
                            {entry.occurrenceStatus === "NOT_OCCURRED" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-status-warning-bg text-status-warning">
                                <span className="material-symbols-outlined text-[13px]">block</span>
                                KHÔNG PHÁT SINH
                              </span>
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${
                                  entry.status === "COMPLETED"
                                    ? "bg-status-success-bg text-status-success"
                                    : "bg-secondary/15 text-secondary"
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
                              className="px-2.5 py-1 rounded bg-surface-subtle text-primary hover:bg-surface-container text-xs font-semibold inline-flex items-center gap-1 active-press"
                            >
                              <span className="material-symbols-outlined text-[14px]">visibility</span>
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

        {/* TAB 2: FORM BUILDER (ADMIN NO-CODE VIEW WITH REAL BACKEND) */}
        {activeTab === "tab2" && (
          <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-border-default/50 flex flex-col gap-space-md">
            <div className="flex items-center justify-between border-b border-surface-container pb-space-sm">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-headline-sm text-headline-sm text-primary">
                    Dynamic Form Builder — Tùy Biến Trường Biểu Mẫu Tác Nghiệp
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                    PHIÊN BẢN v{activeFormVersion?.version || 1}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant">
                  Cấu hình các trường động được lưu trữ trực tiếp vào bảng FormTemplateVersion trong PostgreSQL.
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
                  className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-semibold text-xs shadow-sm active-press flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  <span>+ Thêm trường</span>
                </button>
                <button
                  type="button"
                  disabled={isPublishingVersion}
                  onClick={handlePublishNewVersion}
                  className="px-4 py-2 rounded-lg bg-secondary text-on-secondary font-semibold text-xs shadow-sm active-press flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">publish</span>
                  <span>{isPublishingVersion ? "Đang lưu..." : "Phát hành phiên bản mới"}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {builderFields.map((field, idx) => (
                <div
                  key={field.key || idx}
                  className="p-3.5 rounded-lg bg-surface-subtle border border-border-default flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-outline text-[20px]">drag_indicator</span>
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm text-primary">{field.label}</span>
                      <span className="text-xs text-outline font-mono">
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
                          ? "bg-status-danger-bg text-status-danger"
                          : "bg-surface-container text-outline"
                      }`}
                    >
                      {field.required ? "Bắt buộc" : "Tùy chọn"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBuilderFields(builderFields.filter((_, i) => i !== idx));
                      }}
                      className="p-1 text-outline hover:text-status-danger"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 3: AUDIT TRAIL FROM POSTGRESQL */}
        {activeTab === "tab3" && (
          <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-border-default/50 flex flex-col gap-space-md">
            <div className="flex items-center justify-between border-b border-surface-container pb-space-sm">
              <h3 className="font-headline-sm text-headline-sm text-primary">
                Nhật Ký Kiểm Toán Hệ Thống (Audit Trail)
              </h3>
              <span className="text-xs text-outline">Nguồn: /api/admin/audit (PostgreSQL)</span>
            </div>

            {auditLoading ? (
              <p className="text-sm text-outline animate-pulse py-4">Đang tải nhật ký kiểm toán...</p>
            ) : auditEvents.length === 0 ? (
              <p className="text-sm text-on-surface-variant py-4">Chưa có nhật ký kiểm toán nào được ghi nhận.</p>
            ) : (
              <div className="relative pl-6 flex flex-col gap-4 border-l-2 border-surface-container ml-2">
                {auditEvents.map((evt) => (
                  <div key={evt.id} className="relative">
                    <div
                      className={`absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full ${
                        evt.status === "BLOCKED"
                          ? "bg-status-danger"
                          : evt.status === "WARNING"
                          ? "bg-status-warning"
                          : "bg-secondary"
                      }`}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-primary">
                        {new Date(evt.timestamp).toLocaleString("vi-VN")}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-surface-container text-outline">
                        {evt.action}
                      </span>
                    </div>
                    <p className="text-sm text-on-surface">
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
          <div className="bg-surface-container-lowest rounded-xl max-w-2xl w-full p-6 shadow-xl border border-border-default flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border-default pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[24px]">description</span>
                <h3 className="font-headline-sm text-primary font-bold">
                  Chi Tiết Nhật Ký Tác Nghiệp: {inspectEntry.code}
                </h3>
              </div>
              <button
                onClick={() => setInspectEntry(null)}
                className="p-1 text-outline hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex flex-col">
                <span className="text-outline text-xs">Cán bộ thực hiện</span>
                <span className="font-semibold text-primary">{inspectEntry.person?.fullName || "—"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-outline text-xs">Bộ phận công tác</span>
                <span className="font-semibold text-primary">{inspectEntry.unit?.name || "—"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-outline text-xs">Thời gian ghi nhận</span>
                <span className="font-semibold text-primary">
                  {new Date(inspectEntry.createdAt).toLocaleString("vi-VN")}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-outline text-xs">Trạng thái phát sinh</span>
                <span
                  className={`font-semibold ${
                    inspectEntry.occurrenceStatus === "NOT_OCCURRED"
                      ? "text-status-warning"
                      : "text-status-success"
                  }`}
                >
                  {inspectEntry.occurrenceStatus === "NOT_OCCURRED" ? "KHÔNG PHÁT SINH" : "CÓ PHÁT SINH"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-outline text-xs">Doanh nghiệp khai báo</span>
                <span className="font-semibold text-primary">{inspectEntry.companyName || "—"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-outline text-xs">Số container / phương tiện</span>
                <span className="font-semibold text-primary">
                  {inspectEntry.containerCount !== null && inspectEntry.containerCount !== undefined
                    ? `${inspectEntry.containerCount} phương tiện`
                    : "—"}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1 border-t border-border-default/60 pt-3">
              <span className="text-outline text-xs">Nội dung tác nghiệp</span>
              <p className="text-sm text-on-surface bg-surface-subtle p-2.5 rounded border border-border-default">
                {inspectEntry.title}
              </p>
            </div>

            {inspectEntry.notes && (
              <div className="flex flex-col gap-1">
                <span className="text-outline text-xs">Ghi chú chi tiết</span>
                <p className="text-sm text-on-surface bg-surface-subtle p-2.5 rounded border border-border-default">
                  {inspectEntry.notes}
                </p>
              </div>
            )}

            {/* Dynamic Submission Values Table */}
            {inspectEntry.formValues && Object.keys(inspectEntry.formValues).length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border-default/60 pt-3">
                <span className="text-outline text-xs font-bold uppercase">
                  Dữ liệu số hóa chi tiết (SubmissionValues từ PostgreSQL)
                </span>
                <div className="rounded border border-border-default overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-subtle text-primary border-b border-border-default">
                      <tr>
                        <th className="p-2">Khóa trường (FieldKey)</th>
                        <th className="p-2">Giá trị đã lưu (Value)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container">
                      {Object.entries(inspectEntry.formValues).map(([key, val]) => (
                        <tr key={key} className="hover:bg-surface-container-low">
                          <td className="p-2 font-mono text-outline">{key}</td>
                          <td className="p-2 font-semibold text-primary">
                            {typeof val === "object" ? JSON.stringify(val) : String(val)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-border-default pt-3">
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high text-xs font-semibold flex items-center gap-1 active-press"
              >
                <span className="material-symbols-outlined text-[16px]">print</span>
                <span>In phiếu tác nghiệp</span>
              </button>
              <button
                onClick={() => setInspectEntry(null)}
                className="px-4 py-1.5 rounded-lg bg-secondary text-on-secondary text-xs font-semibold active-press"
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
