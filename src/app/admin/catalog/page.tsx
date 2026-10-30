"use client";

import React, { useState, useEffect } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import WorkCatalogTab from "./WorkCatalogTab";
import ProductCatalogTab from "./ProductCatalogTab";
import Link from "next/link";
import {
  Layers,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Tag,
  BookOpen,
  ArrowRight,
  ShieldAlert,
  Plus,
  Edit2,
  Trash2,
  EyeOff,
  Eye,
  X,
  AlertCircle,
  FileText,
  Clock,
  Briefcase,
  ChevronRight,
} from "lucide-react";

interface ActivityGroup {
  id: string;
  code: string;
  name: string;
  description?: string;
  sortOrder?: number;
  totalCount?: number;
  activeCount?: number;
  retiredCount?: number;
  needsReviewCount?: number;
  _count?: { templates: number };
}

interface ActivityTemplate {
  id: string;
  code: string;
  title: string;
  description?: string;
  sourceRawText?: string;
  defaultPriority?: string;
  reportingMode?: string;
  frequencyType?: string;
  outputDescription?: string;
  reviewStatus: "VERIFIED" | "NEEDS_REVIEW" | "RETIRED";
  usageCount?: number;
  groupId: string;
  group?: {
    id: string;
    code: string;
    name: string;
  };
  activityGroup?: {
    id: string;
    code: string;
    name: string;
  };
}

export default function CatalogAdminPage() {
  const [groups, setGroups] = useState<ActivityGroup[]>([]);
  const { canManageCatalog, loading: permLoading } = usePermissions();
  const [templates, setTemplates] = useState<ActivityTemplate[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"legacy" | "tx" | "products">("tx");
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "products" || tab === "tx") setActiveTab(tab);
  }, []);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ActivityTemplate | null>(null);
  const [statusConfirmTarget, setStatusConfirmTarget] = useState<{
    template: ActivityTemplate;
    nextStatus: "VERIFIED" | "RETIRED" | "NEEDS_REVIEW";
  } | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    code: "",
    title: "",
    groupId: "",
    description: "",
    sourceRawText: "",
    defaultPriority: "Trung bình",
    reportingMode: "UNCONFIGURED",
    reviewStatus: "VERIFIED" as "VERIFIED" | "NEEDS_REVIEW" | "RETIRED",
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchCatalog = async () => {
    setLoading(true);
    try {
      const [resGroups, resTemplates] = await Promise.all([
        fetch("/api/catalog/groups"),
        fetch("/api/catalog/templates"),
      ]);

      if (resGroups.ok) {
        const groupsJson = await resGroups.json();
        const list = Array.isArray(groupsJson) ? groupsJson : (groupsJson.data || []);
        setGroups(list);
      }
      if (resTemplates.ok) {
        const templatesJson = await resTemplates.json();
        const list = Array.isArray(templatesJson) ? templatesJson : (templatesJson.data || []);
        setTemplates(list);
      }
    } catch (err) {
      console.error("Fetch catalog error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  const showToast = (type: "success" | "error", text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const isAllVerified =
    templates.length > 0 && templates.every((t) => t.reviewStatus === "VERIFIED");

  const handleApproveAll = async () => {
    setApproving(true);
    try {
      const res = await fetch("/api/catalog/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: isAllVerified ? "RESET_REVIEW" : "APPROVE_ALL" }),
      });
      if (res.ok) {
        showToast(
          "success",
          isAllVerified
            ? "Đã chuyển toàn bộ hoạt động về trạng thái Xem xét (NEEDS_REVIEW)"
            : "Đã phê duyệt chính thức (VERIFIED) toàn bộ danh mục hoạt động mẫu"
        );
        await fetchCatalog();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast("error", err.error || "Lỗi khi cập nhật trạng thái");
      }
    } catch (err: any) {
      showToast("error", err.message || "Lỗi mạng khi cập nhật");
    } finally {
      setApproving(false);
    }
  };

  const handleOpenAddModal = () => {
    setFormError(null);
    const defaultGroup = groups[0]?.id || "";
    setFormData({
      code: "",
      title: "",
      groupId: defaultGroup,
      description: "",
      sourceRawText: "",
      defaultPriority: "Trung bình",
      reportingMode: "UNCONFIGURED",
      reviewStatus: "VERIFIED",
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (tpl: ActivityTemplate) => {
    setFormError(null);
    const tplGroup = tpl.group || tpl.activityGroup;
    setEditingTemplate(tpl);
    setFormData({
      code: tpl.code,
      title: tpl.title,
      groupId: tplGroup?.id || tpl.groupId,
      description: tpl.description || "",
      sourceRawText: tpl.sourceRawText || "",
      defaultPriority: tpl.defaultPriority || "Trung bình",
      reportingMode: tpl.reportingMode || "UNCONFIGURED",
      reviewStatus: tpl.reviewStatus,
    });
  };

  // Quản lý nhóm nghiệp vụ: thêm / đổi tên / xóa (nhóm trống)
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any | null>(null);
  const [groupForm, setGroupForm] = useState({ code: "", name: "", description: "" });
  const [deletingGroup, setDeletingGroup] = useState<any | null>(null);

  const handleOpenAddGroup = () => {
    setFormError(null);
    setEditingGroup(null);
    setGroupForm({ code: "", name: "", description: "" });
    setIsGroupModalOpen(true);
  };

  const handleOpenRenameGroup = (grp: any) => {
    setFormError(null);
    setEditingGroup(grp);
    setGroupForm({ code: grp.code, name: grp.name, description: grp.description || "" });
    setIsGroupModalOpen(true);
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      const isEdit = !!editingGroup;
      const res = await fetch(
        isEdit ? `/api/catalog/groups/${editingGroup.id}` : "/api/catalog/groups",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isEdit
              ? { name: groupForm.name, description: groupForm.description }
              : groupForm
          ),
        }
      );
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(resData.error || "Không thể lưu nhóm nghiệp vụ");
        return;
      }
      showToast("success", isEdit ? "Đã đổi tên nhóm nghiệp vụ" : "Đã thêm nhóm nghiệp vụ mới");
      setIsGroupModalOpen(false);
      await fetchCatalog();
    } catch (err: any) {
      setFormError(err.message || "Lỗi kết nối khi gửi yêu cầu");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!deletingGroup) return;
    setFormError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/catalog/groups/${deletingGroup.id}`, { method: "DELETE" });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(resData.error || "Không thể xóa nhóm");
        return;
      }
      showToast("success", resData.message || "Đã xóa nhóm");
      setDeletingGroup(null);
      if (selectedGroupId === deletingGroup.id) setSelectedGroupId("ALL");
      await fetchCatalog();
    } catch (err: any) {
      setFormError(err.message || "Lỗi kết nối khi gửi yêu cầu");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/catalog/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(resData.error || resData.message || "Không thể tạo hoạt động mẫu");
        return;
      }

      showToast("success", resData.message || "Thêm mới hoạt động mẫu thành công");
      setIsAddModalOpen(false);
      await fetchCatalog();
    } catch (err: any) {
      setFormError(err.message || "Lỗi kết nối khi gửi yêu cầu");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/catalog/templates/${editingTemplate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(resData.error || resData.message || "Không thể cập nhật hoạt động mẫu");
        return;
      }

      showToast("success", resData.message || "Cập nhật hoạt động mẫu thành công");
      setEditingTemplate(null);
      await fetchCatalog();
    } catch (err: any) {
      setFormError(err.message || "Lỗi kết nối khi cập nhật");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecuteStatusChange = async () => {
    if (!statusConfirmTarget) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/catalog/templates/${statusConfirmTarget.template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus: statusConfirmTarget.nextStatus }),
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", resData.error || "Không thể thay đổi trạng thái");
        return;
      }

      showToast("success", resData.message || "Đã cập nhật trạng thái");
      setStatusConfirmTarget(null);
      await fetchCatalog();
    } catch (err: any) {
      showToast("error", err.message || "Lỗi kết nối");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredTemplates = (templates || []).filter((tpl) => {
    const tplGroup = tpl.group || tpl.activityGroup;
    const matchesGroup = selectedGroupId === "ALL" || tplGroup?.id === selectedGroupId || tpl.groupId === selectedGroupId;
    const matchesStatus = statusFilter === "ALL" || tpl.reviewStatus === statusFilter;
    const descText = tpl.description || tpl.sourceRawText || tpl.outputDescription || "";
    const matchesSearch =
      tpl.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tpl.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      descText.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesGroup && matchesStatus && matchesSearch;
  });

  const getReportingModeLabel = (mode?: string, freq?: string) => {
    const val = mode || freq;
    switch (val) {
      case "EVERY_PERIOD":
      case "WEEKLY":
        return "Định kỳ hằng tuần";
      case "DAILY":
        return "Hằng ngày";
      case "MONTHLY":
        return "Hằng tháng";
      case "ON_OCCURRENCE":
      case "IRREGULAR":
        return "Theo phát sinh thực tế";
      case "ON_ASSIGNMENT":
        return "Theo vụ việc được giao";
      case "NO_REPORT":
        return "Không yêu cầu báo cáo";
      case "UNCONFIGURED":
      default:
        return "Chưa cấu hình chế độ";
    }
  };

  const activeCount = templates.filter((t) => t.reviewStatus === "VERIFIED").length;
  const retiredCount = templates.filter((t) => t.reviewStatus === "RETIRED").length;
  const needsReviewCount = templates.filter((t) => t.reviewStatus === "NEEDS_REVIEW").length;

  return (
    <div className="flex flex-col w-full p-4 lg:p-6 space-y-6 pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-sm border text-sm font-medium animate-in fade-in slide-in-from-top-2 ${
            toastMessage.type === "success"
              ? "bg-v5-success-soft text-v5-success border-v5-success/30"
              : "bg-v5-danger-soft text-v5-danger border-v5-danger/30"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-v5-success shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-v5-danger shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Chọn nhóm danh mục */}
      <div className="flex items-center gap-1 border-b border-v5-line overflow-x-auto">
        <button
          onClick={() => setActiveTab("tx")}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === "tx"
              ? "border-v5-line text-v5-accent"
              : "border-transparent text-v5-muted hover:text-v5-ink"
          }`}
        >
          Danh mục công việc thường xuyên
        </button>
        <button
          onClick={() => setActiveTab("products")}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === "products"
              ? "border-v5-line text-v5-accent"
              : "border-transparent text-v5-muted hover:text-v5-ink"
          }`}
        >
          Sản phẩm QĐ1277
        </button>
      </div>

      {activeTab === "tx" ? (
        <WorkCatalogTab canManage={canManageCatalog} showToast={showToast} />
      ) : activeTab === "products" ? (
        <ProductCatalogTab />
      ) : (
      <div className="space-y-6">
      {!permLoading && !canManageCatalog && (
        <div className="p-8 bg-v5-surface border border-v5-gold/50 rounded-xl text-center space-y-2 shadow-sm">
          <p className="text-lg font-bold text-v5-ink">Khu vực quản trị danh mục</p>
          <p className="text-sm text-v5-muted">
            Tài khoản của đồng chí chỉ được xem danh mục đầu việc mẫu. Thao tác thêm/sửa/phê duyệt do backend chặn 403 và ghi audit.
          </p>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 text-purple-800">
              Quản trị danh mục
            </span>
            <span className="text-xs text-v5-muted font-mono">
              ActivityGroup • ActivityTemplate • PersonalWorkItem
            </span>
          </div>
          <h1 className="text-2xl font-bold text-v5-ink mt-1">Danh mục hoạt động mẫu tham khảo</h1>
          <p className="text-xs md:text-sm text-v5-muted mt-0.5">
            {groups.length} nhóm nghiệp vụ và {templates.length} hoạt động mẫu nguyên văn làm cơ sở gợi ý cho cán bộ; cán bộ được linh hoạt tạo đầu việc tự do mà không bắt buộc theo danh mục cố định.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchCatalog}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-v5-ink bg-v5-surface border border-v5-line rounded-lg hover:bg-v5-bg shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
          {canManageCatalog && (
            <button
              onClick={handleOpenAddGroup}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-v5-accent bg-v5-accent-soft border border-v5-line hover:bg-v5-accent-soft rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm nhóm nghiệp vụ
            </button>
          )}
          {canManageCatalog && (
            <button
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-v5-accent hover:bg-v5-accent rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm đầu việc mẫu
            </button>
          )}
          <Link
            href="/admin/organization"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-v5-accent bg-v5-accent-soft border border-v5-line rounded-lg hover:bg-v5-accent-soft shadow-sm"
          >
            Quản trị nhân sự
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Status & Warning Banner */}
      {isAllVerified ? (
        <div className="p-4 bg-v5-success-soft border border-v5-success/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-v5-success shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-v5-success">
              <p className="font-bold text-sm">
                Trạng thái danh mục: ĐÃ PHÊ DUYỆT CHÍNH THỨC ({activeCount} Đang áp dụng • {retiredCount} Ngừng áp dụng)
              </p>
              <p className="leading-relaxed">
                Toàn bộ hoạt động mẫu đã được Lãnh đạo đơn vị phê duyệt và phân bổ đúng chế độ báo cáo. Khi ngừng áp dụng một mẫu, dữ liệu lịch sử trong các kế hoạch và nhật ký đã lưu trước đó hoàn toàn không bị ảnh hưởng.
              </p>
            </div>
          </div>
          {canManageCatalog && (
            <button
              onClick={handleApproveAll}
              disabled={approving}
              className="px-3.5 py-2 text-xs font-semibold bg-v5-surface border border-v5-success/30 text-v5-success rounded-lg hover:bg-v5-success-soft transition-colors shrink-0 shadow-sm"
            >
              {approving ? "Đang xử lý..." : "Chuyển về xem xét (Reset)"}
            </button>
          )}
        </div>
      ) : (
        <div className="p-4 bg-v5-gold-soft border border-v5-gold/50 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-v5-gold-ink shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-v5-gold-ink">
              <p className="font-bold text-sm">
                Trạng thái danh mục: CÓ {needsReviewCount} ĐẦU VIỆC CHƯA XÁC NHẬN CHÍNH THỨC (NEEDS_REVIEW)
              </p>
              <p className="leading-relaxed">
                Danh mục hoạt động mẫu được lưu trữ dưới dạng gợi ý tham khảo, <strong>không phải là checklist bắt buộc</strong>. Bấm nút bên cạnh để chính thức ban hành sử dụng trong Chi cục.
              </p>
            </div>
          </div>
          {canManageCatalog && (
            <button
              onClick={handleApproveAll}
              disabled={approving}
              className="px-3.5 py-2 text-xs font-semibold bg-v5-success text-white rounded-lg hover:bg-v5-success transition-colors shrink-0 shadow-sm"
            >
              {approving ? "Đang xử lý..." : "Phê duyệt chính thức toàn bộ"}
            </button>
          )}
        </div>
      )}

      {/* 5 Group Summary Cards + All Card */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        <div
          onClick={() => setSelectedGroupId("ALL")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            selectedGroupId === "ALL"
              ? "bg-v5-accent text-white shadow-sm ring-2 ring-v5-accent/20 border-v5-accent"
              : "bg-v5-surface text-v5-ink border-v5-line hover:border-v5-line"
          }`}
        >
          <div className="text-[11px] font-semibold uppercase opacity-80">Tất cả nhóm</div>
          <div className="text-xl font-bold mt-1">{templates.length}</div>
          <div className="text-[10px] opacity-75 mt-0.5 flex items-center justify-between">
            <span>{activeCount} Áp dụng</span>
            {retiredCount > 0 && <span className="opacity-90">• {retiredCount} Ngừng</span>}
          </div>
        </div>

        {groups.map((grp) => {
          const isSelected = selectedGroupId === grp.id;
          const groupTemplates = templates.filter(
            (t) => (t.group?.id || t.activityGroup?.id || t.groupId) === grp.id
          );
          const count = groupTemplates.length;
          const grpActive = groupTemplates.filter((t) => t.reviewStatus === "VERIFIED").length;
          const grpRetired = groupTemplates.filter((t) => t.reviewStatus === "RETIRED").length;

          return (
            <div
              key={grp.id}
              onClick={() => setSelectedGroupId(grp.id)}
              className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
                isSelected
                  ? "bg-v5-accent text-white shadow-sm ring-2 ring-v5-accent/20 border-v5-accent"
                  : "bg-v5-surface text-v5-ink border-v5-line hover:border-v5-line"
              }`}
            >
              <div className="text-[11px] font-mono font-bold uppercase opacity-80 flex items-center justify-between gap-1">
                <span className="truncate">{grp.code}</span>
                {canManageCatalog && (
                  <span className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      title="Đổi tên nhóm"
                      onClick={() => handleOpenRenameGroup(grp)}
                      className={`p-0.5 rounded ${isSelected ? "hover:bg-v5-surface/20" : "hover:bg-v5-bg text-v5-muted"}`}
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      title="Xóa nhóm (chỉ khi không còn đầu việc mẫu)"
                      onClick={() => {
                        setDeletingGroup(grp);
                        setFormError(null);
                      }}
                      className={`p-0.5 rounded ${isSelected ? "hover:bg-v5-surface/20" : "hover:bg-v5-bg text-v5-muted"}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
              <div className="text-xl font-bold mt-1">{count}</div>
              <div className="text-[10px] truncate opacity-90 mt-0.5" title={grp.name}>
                {grp.name}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-v5-surface p-3 rounded-xl border border-v5-line shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <span className="text-xs font-semibold text-v5-muted mr-1 shrink-0">Trạng thái:</span>
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors whitespace-nowrap ${
              statusFilter === "ALL"
                ? "bg-v5-accent text-white"
                : "bg-v5-bg text-v5-muted hover:bg-v5-bg"
            }`}
          >
            Tất cả ({templates.length})
          </button>
          <button
            onClick={() => setStatusFilter("VERIFIED")}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors whitespace-nowrap ${
              statusFilter === "VERIFIED"
                ? "bg-v5-success text-white"
                : "bg-v5-success-soft text-v5-success hover:bg-v5-success-soft"
            }`}
          >
            Đang áp dụng ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter("NEEDS_REVIEW")}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors whitespace-nowrap ${
              statusFilter === "NEEDS_REVIEW"
                ? "bg-v5-gold text-v5-gold-ink"
                : "bg-v5-gold-soft text-v5-gold-ink hover:bg-v5-gold-soft"
            }`}
          >
            Chưa xác nhận ({needsReviewCount})
          </button>
          <button
            onClick={() => setStatusFilter("RETIRED")}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors whitespace-nowrap ${
              statusFilter === "RETIRED"
                ? "bg-v5-accent text-white"
                : "bg-v5-bg text-v5-muted hover:bg-v5-bg"
            }`}
          >
            Ngừng áp dụng ({retiredCount})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-v5-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo mã, tên hoặc trích đoạn..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-v5-bg border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
          />
        </div>
      </div>

      {/* Catalog Table */}
      <div className="bg-v5-surface rounded-xl border border-v5-line shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-v5-line bg-v5-bg text-v5-ink font-semibold">
                <th className="py-3 px-3 w-24">Mã mẫu</th>
                <th className="py-3 px-3 w-40">Nhóm nghiệp vụ</th>
                <th className="py-3 px-4">Tên hoạt động mẫu</th>
                <th className="py-3 px-3 w-36">Chế độ báo cáo</th>
                <th className="py-3 px-3 w-28 text-center">Mức ưu tiên</th>
                <th className="py-3 px-3 w-24 text-center">Sử dụng</th>
                <th className="py-3 px-3 w-32 text-center">Trạng thái</th>
                <th className="py-3 px-3 w-28 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-v5-line/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-v5-muted">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-v5-muted" />
                    Đang nạp danh mục hoạt động mẫu từ cơ sở dữ liệu...
                  </td>
                </tr>
              ) : filteredTemplates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-v5-muted">
                    Không tìm thấy hoạt động mẫu nào phù hợp với bộ lọc
                  </td>
                </tr>
              ) : (
                filteredTemplates.map((tpl) => {
                  const tplGroup = tpl.group || tpl.activityGroup;
                  const isRetired = tpl.reviewStatus === "RETIRED";
                  const isVerified = tpl.reviewStatus === "VERIFIED";

                  return (
                    <tr
                      key={tpl.id}
                      className={`hover:bg-v5-bg/80 transition-colors ${
                        isRetired ? "bg-v5-bg/50 opacity-70" : ""
                      }`}
                    >
                      <td className="py-3 px-3 font-mono font-bold text-v5-accent">
                        {tpl.code}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-block px-2 py-0.5 bg-v5-bg text-v5-ink rounded text-[11px] font-medium truncate max-w-[150px]">
                          {tplGroup?.code || "Chưa phân nhóm"}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-v5-ink leading-snug">
                        <div>{tpl.title}</div>
                        {tpl.description && (
                          <div className="text-[11px] font-normal text-v5-muted mt-0.5 line-clamp-1">
                            {tpl.description}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-v5-muted">
                        <span className="font-medium">
                          {getReportingModeLabel(tpl.reportingMode, tpl.frequencyType)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                            tpl.defaultPriority === "Cao"
                              ? "bg-v5-danger-soft text-v5-danger border border-v5-danger/30"
                              : tpl.defaultPriority === "Thấp"
                              ? "bg-v5-bg text-v5-muted"
                              : "bg-v5-accent-soft text-v5-accent border border-v5-line"
                          }`}
                        >
                          {tpl.defaultPriority || "Trung bình"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className="font-mono text-v5-muted bg-v5-bg px-2 py-0.5 rounded"
                          title="Số lượt liên kết trong đầu việc và nhật ký"
                        >
                          {tpl.usageCount || 0}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {isVerified ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-v5-success-soft text-v5-success border border-v5-success/30">
                            <CheckCircle2 className="w-3 h-3 text-v5-success" />
                            Đang áp dụng
                          </span>
                        ) : isRetired ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-v5-bg text-v5-ink border border-v5-line">
                            <EyeOff className="w-3 h-3 text-v5-muted" />
                            Ngừng áp dụng
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-v5-gold-soft text-v5-gold-ink border border-v5-gold/50">
                            <AlertTriangle className="w-3 h-3 text-v5-gold-ink" />
                            Chưa xác nhận
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {canManageCatalog && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenEditModal(tpl)}
                              className="p-1.5 text-v5-muted hover:text-v5-accent hover:bg-v5-bg rounded-md transition-colors"
                              title="Chỉnh sửa thông tin"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {isRetired ? (
                              <button
                                onClick={() =>
                                  setStatusConfirmTarget({
                                    template: tpl,
                                    nextStatus: "VERIFIED",
                                  })
                                }
                                className="p-1.5 text-v5-success hover:text-v5-success hover:bg-v5-success-soft rounded-md transition-colors"
                                title="Kích hoạt lại áp dụng"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  setStatusConfirmTarget({
                                    template: tpl,
                                    nextStatus: "RETIRED",
                                  })
                                }
                                className="p-1.5 text-v5-muted hover:text-v5-danger hover:bg-v5-danger-soft rounded-md transition-colors"
                                title="Ngừng áp dụng mẫu này"
                              >
                                <EyeOff className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Thêm mới hoạt động mẫu */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-v5-surface rounded-xl shadow-sm border border-v5-line w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-v5-line/60 bg-v5-bg">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-v5-accent" />
                <h3 className="font-bold text-sm text-v5-ink">Thêm mới hoạt động mẫu</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-v5-muted hover:text-v5-muted rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdd} className="p-4 space-y-3.5 overflow-y-auto">
              {formError && (
                <div className="p-3 bg-v5-danger-soft border border-v5-danger/30 rounded-lg flex items-start gap-2 text-xs text-v5-danger">
                  <AlertCircle className="w-4 h-4 text-v5-danger shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-v5-ink block mb-1">
                    Mã hoạt động * (Ví dụ: TTHQ-23)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="TTHQ-23"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30 font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-v5-ink block mb-1">
                    Nhóm nghiệp vụ *
                  </label>
                  <select
                    required
                    value={formData.groupId}
                    onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                    className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.code} — {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-v5-ink block mb-1">
                  Tên hoạt động mẫu *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nhập tên hoạt động mẫu chuẩn hóa..."
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-v5-ink block mb-1">
                  Mô tả / Hướng dẫn thực hiện
                </label>
                <textarea
                  rows={2}
                  placeholder="Mô tả tóm tắt nội dung thực hiện, căn cứ quy trình..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-v5-ink block mb-1">
                    Chế độ báo cáo
                  </label>
                  <select
                    value={formData.reportingMode}
                    onChange={(e) => setFormData({ ...formData, reportingMode: e.target.value })}
                    className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
                  >
                    <option value="UNCONFIGURED">UNCONFIGURED — Chưa cấu hình</option>
                    <option value="EVERY_PERIOD">EVERY_PERIOD — Định kỳ hằng tuần</option>
                    <option value="DAILY">DAILY — Hằng ngày</option>
                    <option value="MONTHLY">MONTHLY — Hằng tháng</option>
                    <option value="ON_OCCURRENCE">ON_OCCURRENCE — Theo phát sinh</option>
                    <option value="ON_ASSIGNMENT">ON_ASSIGNMENT — Theo vụ việc</option>
                    <option value="NO_REPORT">NO_REPORT — Không yêu cầu báo cáo</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-v5-ink block mb-1">
                    Mức độ ưu tiên
                  </label>
                  <select
                    value={formData.defaultPriority}
                    onChange={(e) => setFormData({ ...formData, defaultPriority: e.target.value })}
                    className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
                  >
                    <option value="Cao">Cao</option>
                    <option value="Trung bình">Trung bình</option>
                    <option value="Thấp">Thấp</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-v5-line/60">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-3.5 py-2 text-xs font-medium text-v5-muted hover:bg-v5-bg rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-v5-accent hover:bg-v5-accent rounded-lg shadow-sm"
                >
                  {isSubmitting ? "Đang lưu..." : "Thêm mới vào cơ sở dữ liệu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Sửa thông tin hoạt động mẫu */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-v5-surface rounded-xl shadow-sm border border-v5-line w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-v5-line/60 bg-v5-bg">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-v5-accent" />
                <h3 className="font-bold text-sm text-v5-ink">
                  Chỉnh sửa hoạt động mẫu: <span className="font-mono text-v5-accent">{editingTemplate.code}</span>
                </h3>
              </div>
              <button
                onClick={() => setEditingTemplate(null)}
                className="p-1 text-v5-muted hover:text-v5-muted rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-4 space-y-3.5 overflow-y-auto">
              {formError && (
                <div className="p-3 bg-v5-danger-soft border border-v5-danger/30 rounded-lg flex items-start gap-2 text-xs text-v5-danger">
                  <AlertCircle className="w-4 h-4 text-v5-danger shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-v5-ink block mb-1">
                    Mã hoạt động (Cố định)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={formData.code}
                    className="w-full text-xs p-2 bg-v5-bg border border-v5-line rounded-lg text-v5-muted font-mono cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-v5-ink block mb-1">
                    Nhóm nghiệp vụ *
                  </label>
                  <select
                    required
                    value={formData.groupId}
                    onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                    className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.code} — {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-v5-ink block mb-1">
                  Tên hoạt động mẫu *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-v5-ink block mb-1">
                  Mô tả / Hướng dẫn
                </label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-v5-ink block mb-1">
                    Chế độ báo cáo
                  </label>
                  <select
                    value={formData.reportingMode}
                    onChange={(e) => setFormData({ ...formData, reportingMode: e.target.value })}
                    className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
                  >
                    <option value="UNCONFIGURED">UNCONFIGURED — Chưa cấu hình</option>
                    <option value="EVERY_PERIOD">EVERY_PERIOD — Định kỳ hằng tuần</option>
                    <option value="DAILY">DAILY — Hằng ngày</option>
                    <option value="MONTHLY">MONTHLY — Hằng tháng</option>
                    <option value="ON_OCCURRENCE">ON_OCCURRENCE — Theo phát sinh</option>
                    <option value="ON_ASSIGNMENT">ON_ASSIGNMENT — Theo vụ việc</option>
                    <option value="NO_REPORT">NO_REPORT — Không yêu cầu báo cáo</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-v5-ink block mb-1">
                    Trạng thái áp dụng
                  </label>
                  <select
                    value={formData.reviewStatus}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        reviewStatus: e.target.value as "VERIFIED" | "NEEDS_REVIEW" | "RETIRED",
                      })
                    }
                    className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
                  >
                    <option value="VERIFIED">VERIFIED — Đang áp dụng</option>
                    <option value="NEEDS_REVIEW">NEEDS_REVIEW — Chưa xác nhận</option>
                    <option value="RETIRED">RETIRED — Ngừng áp dụng</option>
                  </select>
                </div>
              </div>

              <div className="p-2.5 bg-v5-accent-soft rounded-lg border border-v5-line text-[11px] text-v5-accent leading-relaxed">
                <strong>Bảo toàn dữ liệu lịch sử:</strong> Các thay đổi tên hoặc nhóm của hoạt động mẫu sẽ áp dụng cho các lượt tạo mới, trong khi các nhiệm vụ và kế hoạch trong quá khứ vẫn giữ nguyên vẹn liên kết và nội dung lịch sử.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-v5-line/60">
                <button
                  type="button"
                  onClick={() => setEditingTemplate(null)}
                  disabled={isSubmitting}
                  className="px-3.5 py-2 text-xs font-medium text-v5-muted hover:bg-v5-bg rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-v5-accent hover:bg-v5-accent rounded-lg shadow-sm"
                >
                  {isSubmitting ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DIALOG: Chuyển đổi trạng thái Áp dụng / Ngừng áp dụng */}
      {statusConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-v5-surface rounded-xl shadow-sm border border-v5-line w-full max-w-md overflow-hidden p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  statusConfirmTarget.nextStatus === "RETIRED"
                    ? "bg-v5-gold-soft text-v5-gold-ink"
                    : "bg-v5-success-soft text-v5-success"
                }`}
              >
                {statusConfirmTarget.nextStatus === "RETIRED" ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-v5-ink">
                  {statusConfirmTarget.nextStatus === "RETIRED"
                    ? "Xác nhận ngừng áp dụng hoạt động mẫu?"
                    : "Kích hoạt lại áp dụng hoạt động mẫu?"}
                </h3>
                <p className="text-xs text-v5-muted leading-relaxed">
                  Hoạt động: <strong className="font-mono text-v5-accent">{statusConfirmTarget.template.code}</strong> — {statusConfirmTarget.template.title}
                </p>
              </div>
            </div>

            {statusConfirmTarget.nextStatus === "RETIRED" ? (
              <div className="p-3 bg-v5-gold-soft rounded-lg border border-v5-gold/50 text-xs text-v5-gold-ink space-y-1">
                <p className="font-semibold">Quy tắc bảo toàn dữ liệu:</p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  <li>Mẫu này sẽ bị ẩn khỏi danh sách lựa chọn khi tạo đầu việc cá nhân mới.</li>
                  <li>Tất cả kế hoạch, nhiệm vụ và nhật ký đã thực hiện trước đây vẫn được lưu giữ và hiển thị đầy đủ.</li>
                </ul>
              </div>
            ) : (
              <div className="p-3 bg-v5-success-soft rounded-lg border border-v5-success/30 text-xs text-v5-success">
                Mẫu sẽ xuất hiện trở lại trong danh mục gợi ý khi cán bộ lập kế hoạch và nhật ký tác nghiệp.
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-v5-line/60">
              <button
                type="button"
                onClick={() => setStatusConfirmTarget(null)}
                disabled={isSubmitting}
                className="px-3.5 py-2 text-xs font-medium text-v5-muted hover:bg-v5-bg rounded-lg"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleExecuteStatusChange}
                disabled={isSubmitting}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-lg shadow-sm ${
                  statusConfirmTarget.nextStatus === "RETIRED"
                    ? "bg-v5-gold hover:bg-v5-gold"
                    : "bg-v5-success hover:bg-v5-success"
                }`}
              >
                {isSubmitting ? "Đang xử lý..." : "Xác nhận thực hiện"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Thêm / Đổi tên nhóm nghiệp vụ */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-v5-surface rounded-xl shadow-sm border border-v5-line w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-v5-line/60">
              <h3 className="font-bold text-sm text-v5-ink">
                {editingGroup ? `Đổi tên nhóm: ${editingGroup.code}` : "Thêm nhóm nghiệp vụ mới"}
              </h3>
              <button
                type="button"
                onClick={() => setIsGroupModalOpen(false)}
                className="p-1 rounded hover:bg-v5-bg text-v5-muted"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveGroup} className="p-4 space-y-3.5">
              {formError && (
                <div className="p-3 bg-v5-danger-soft border border-v5-danger/30 text-v5-danger rounded-lg text-xs">
                  {formError}
                </div>
              )}
              {!editingGroup && (
                <div>
                  <label className="text-xs font-semibold text-v5-ink block mb-1">Mã nhóm * (viết hoa, không đổi sau khi tạo)</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: KHO_BAI"
                    value={groupForm.code}
                    onChange={(e) => setGroupForm({ ...groupForm, code: e.target.value.toUpperCase() })}
                    className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30 font-mono uppercase"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-v5-ink block mb-1">Tên nhóm nghiệp vụ *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Quản lý kho, bãi tập kết"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                  className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-v5-ink block mb-1">Mô tả</label>
                <textarea
                  rows={2}
                  value={groupForm.description}
                  onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                  className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-v5-line/60">
                <button
                  type="button"
                  onClick={() => setIsGroupModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-3.5 py-2 text-xs font-medium text-v5-muted hover:bg-v5-bg rounded-lg"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-v5-accent hover:bg-v5-accent rounded-lg shadow-sm"
                >
                  {isSubmitting ? "Đang lưu..." : editingGroup ? "Lưu tên mới" : "Thêm nhóm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM: Xóa nhóm nghiệp vụ trống */}
      {deletingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-v5-surface rounded-xl shadow-sm border border-v5-line w-full max-w-md overflow-hidden p-5 space-y-4">
            <h3 className="font-bold text-sm text-v5-danger">Xóa nhóm "{deletingGroup.name}"?</h3>
            <p className="text-xs text-v5-muted leading-relaxed">
              Chỉ xóa được nhóm <strong>không còn hoạt động mẫu nào</strong>. Hệ thống sẽ từ chối nếu còn mẫu liên quan.
            </p>
            {formError && (
              <div className="p-3 bg-v5-danger-soft border border-v5-danger/30 text-v5-danger rounded-lg text-xs">
                {formError}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-v5-line/60">
              <button
                type="button"
                onClick={() => setDeletingGroup(null)}
                disabled={isSubmitting}
                className="px-3.5 py-2 text-xs font-medium text-v5-muted hover:bg-v5-bg rounded-lg"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleDeleteGroup}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-v5-danger hover:bg-v5-danger rounded-lg shadow-sm"
              >
                {isSubmitting ? "Đang xóa..." : "Xóa nhóm"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  );
}
