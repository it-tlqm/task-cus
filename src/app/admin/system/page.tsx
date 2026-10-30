"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Settings,
  Shield,
  Building2,
  Users,
  Layers,
  FileCode2,
  History,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sliders,
  Database,
  Lock,
  Edit3,
  X,
  FileText,
  AlertTriangle,
  Info,
  Server,
  KeyRound,
} from "lucide-react";

interface SystemOverviewData {
  organization: {
    totalUnits: number;
    totalPositions: number;
    totalPersons: number;
    activePersons: number;
    totalAccounts: number;
    activeAccounts: number;
  };
  rbac: {
    totalRoles: number;
    totalPermissions: number;
    roles: Array<{
      id: string;
      code: string;
      name: string;
      description?: string;
      permissionsCount: number;
      grantsCount: number;
      permissions: string[];
    }>;
  };
  catalog: {
    totalGroups: number;
    totalTemplates: number;
    activeTemplates: number;
    retiredTemplates: number;
  };
  forms: {
    totalForms: number;
  };
  audit: {
    totalEvents: number;
  };
  configs: Array<{
    id: string;
    key: string;
    value: string;
    dataType: "NUMBER" | "BOOLEAN" | "STRING";
    category: string;
    description: string;
    updatedBy?: string | null;
    updatedAt: string;
  }>;
  backupStatus: {
    isConfigured: boolean;
    status: string;
    message: string;
    note: string;
  };
}

export default function SystemAdminPage() {
  const [data, setData] = useState<SystemOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"configs" | "org" | "rbac" | "audit" | "backup">("configs");

  // Edit config modal state
  const [editingConfig, setEditingConfig] = useState<{
    key: string;
    value: string;
    description: string;
    dataType: "NUMBER" | "BOOLEAN" | "STRING";
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Recent audit events state
  const [recentAudits, setRecentAudits] = useState<any[]>([]);

  const showToast = (type: "success" | "error", text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/system/overview");
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("Tài khoản của bạn không có quyền truy cập trung tâm quản trị hệ thống (403 Forbidden)");
        }
        throw new Error(`Lỗi nạp dữ liệu quản trị (${res.status})`);
      }
      const json = await res.json();
      setData(json.data);

      // Fetch recent audits
      const auditRes = await fetch("/api/admin/audit?limit=10");
      if (auditRes.ok) {
        const auditJson = await auditRes.json();
        setRecentAudits(Array.isArray(auditJson) ? auditJson : auditJson.events || []);
      }
    } catch (err: any) {
      setError(err.message || "Lỗi kết nối máy chủ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleOpenEditConfig = (cfg: any) => {
    setEditingConfig({
      key: cfg.key,
      value: cfg.value,
      description: cfg.description,
      dataType: cfg.dataType,
    });
    setEditValue(cfg.value);
    setEditError(null);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConfig) return;

    setEditError(null);
    setSavingConfig(true);

    try {
      const res = await fetch("/api/admin/system/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: editingConfig.key,
          value: editValue,
        }),
      });

      const resJson = await res.json().catch(() => ({}));

      if (!res.ok) {
        setEditError(resJson.error || resJson.message || "Không thể cập nhật tham số");
        return;
      }

      showToast("success", resJson.message || "Cập nhật tham số cấu hình thành công");
      setEditingConfig(null);
      await fetchOverview();
    } catch (err: any) {
      setEditError(err.message || "Lỗi kết nối khi gửi yêu cầu");
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <RefreshCw className="w-8 h-8 text-v5-accent animate-spin" />
        <p className="text-sm font-medium text-v5-muted">Đang nạp dữ liệu quản trị...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 max-w-2xl mx-auto mt-12 bg-v5-danger-soft border border-v5-danger/30 rounded-xl text-v5-danger space-y-3">
        <div className="flex items-center gap-2 font-bold text-base">
          <AlertCircle className="w-5 h-5 text-v5-danger" />
          <span>Từ chối quyền truy cập hoặc lỗi kết nối</span>
        </div>
        <p className="text-sm leading-relaxed">{error}</p>
        <div className="pt-2">
          <button
            onClick={fetchOverview}
            className="px-4 py-2 bg-v5-danger text-white rounded-lg text-xs font-semibold hover:bg-v5-danger"
          >
            Thử tải lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full p-4 lg:p-6 space-y-6 pb-20">
      {/* Toast notification */}
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

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-v5-accent text-white">
              Quản trị kỹ thuật
            </span>
            <span className="text-xs text-v5-muted font-mono">
              Quản trị hệ thống • Dữ liệu trực tiếp
            </span>
          </div>
          <h1 className="text-2xl font-bold text-v5-ink mt-1">
            Trung tâm Quản trị Kỹ thuật & Cấu hình Vận hành
          </h1>
          <p className="text-xs md:text-sm text-v5-muted mt-0.5">
            Giám sát toàn diện dữ liệu cơ cấu tổ chức, ma trận phân quyền, kiểm toán an ninh và quản trị tham số cấu hình hệ thống thực tế.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchOverview}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-v5-ink bg-v5-surface border border-v5-line rounded-lg hover:bg-v5-bg shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
          <Link
            href="/admin/organization"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-v5-accent bg-v5-accent-soft border border-v5-line rounded-lg hover:bg-v5-accent-soft shadow-sm"
          >
            <Building2 className="w-3.5 h-3.5" />
            Cơ cấu & Cán bộ
          </Link>
          <Link
            href="/admin/catalog"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-purple-900 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 shadow-sm"
          >
            <Layers className="w-3.5 h-3.5" />
            Danh mục đầu việc
          </Link>
          <Link
            href="/admin/audit"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-v5-gold-ink bg-v5-gold-soft border border-v5-gold/50 rounded-lg hover:bg-v5-gold-soft shadow-sm"
          >
            <History className="w-3.5 h-3.5" />
            Nhật ký kiểm toán
          </Link>
        </div>
      </div>

      {/* 5 Real Metric Overview Cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-v5-surface p-3.5 rounded-xl border border-v5-line shadow-sm">
            <div className="flex items-center justify-between text-v5-muted">
              <span className="text-[11px] font-semibold uppercase">Cơ cấu tổ chức</span>
              <Building2 className="w-4 h-4 text-v5-accent" />
            </div>
            <div className="text-xl font-bold text-v5-ink mt-1">{data.organization.totalUnits} đơn vị</div>
            <div className="text-[11px] text-v5-muted mt-0.5">
              {data.organization.activePersons} cán bộ đang công tác
            </div>
          </div>

          <div className="bg-v5-surface p-3.5 rounded-xl border border-v5-line shadow-sm">
            <div className="flex items-center justify-between text-v5-muted">
              <span className="text-[11px] font-semibold uppercase">Phân quyền</span>
              <Shield className="w-4 h-4 text-v5-success" />
            </div>
            <div className="text-xl font-bold text-v5-ink mt-1">{data.rbac.totalRoles} vai trò</div>
            <div className="text-[11px] text-v5-muted mt-0.5">
              {data.rbac.totalPermissions} mã quyền hệ thống
            </div>
          </div>

          <div className="bg-v5-surface p-3.5 rounded-xl border border-v5-line shadow-sm">
            <div className="flex items-center justify-between text-v5-muted">
              <span className="text-[11px] font-semibold uppercase">Danh mục mẫu</span>
              <Layers className="w-4 h-4 text-purple-700" />
            </div>
            <div className="text-xl font-bold text-v5-ink mt-1">{data.catalog.totalTemplates} hoạt động</div>
            <div className="text-[11px] text-v5-muted mt-0.5">
              {data.catalog.activeTemplates} áp dụng • {data.catalog.retiredTemplates} ngừng
            </div>
          </div>

          <div className="bg-v5-surface p-3.5 rounded-xl border border-v5-line shadow-sm">
            <div className="flex items-center justify-between text-v5-muted">
              <span className="text-[11px] font-semibold uppercase">Biểu mẫu động</span>
              <FileCode2 className="w-4 h-4 text-indigo-700" />
            </div>
            <div className="text-xl font-bold text-v5-ink mt-1">{data.forms.totalForms} biểu mẫu</div>
            <div className="text-[11px] text-v5-muted mt-0.5">
              Versioned Form Engine
            </div>
          </div>

          <div className="bg-v5-surface p-3.5 rounded-xl border border-v5-line shadow-sm col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-v5-muted">
              <span className="text-[11px] font-semibold uppercase">Kiểm toán an ninh</span>
              <History className="w-4 h-4 text-v5-gold-ink" />
            </div>
            <div className="text-xl font-bold text-v5-ink mt-1">{data.audit.totalEvents} sự kiện</div>
            <div className="text-[11px] text-v5-muted mt-0.5">
              Lịch sử thao tác hệ thống
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-v5-line pb-2">
        <button
          onClick={() => setActiveTab("configs")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "configs"
              ? "bg-v5-accent text-white"
              : "text-v5-muted hover:bg-v5-bg"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Tham số cấu hình vận hành ({data?.configs?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab("org")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "org"
              ? "bg-v5-accent text-white"
              : "text-v5-muted hover:bg-v5-bg"
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          Tổng quan Cơ cấu tổ chức
        </button>

        <button
          onClick={() => setActiveTab("rbac")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "rbac"
              ? "bg-v5-accent text-white"
              : "text-v5-muted hover:bg-v5-bg"
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          Ma trận phân quyền
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "audit"
              ? "bg-v5-accent text-white"
              : "text-v5-muted hover:bg-v5-bg"
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Nhật ký Kiểm toán gần đây
        </button>

        <button
          onClick={() => setActiveTab("backup")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "backup"
              ? "bg-v5-accent text-white"
              : "text-v5-muted hover:bg-v5-bg"
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          Sao lưu & Phục hồi
        </button>
      </div>

      {/* TAB 1: THAM SỐ CẤU HÌNH VẬN HÀNH */}
      {activeTab === "configs" && data && (
        <div className="space-y-4">
          <div className="p-4 bg-v5-accent-soft border border-v5-line rounded-xl flex items-start gap-3">
            <Info className="w-5 h-5 text-v5-accent shrink-0 mt-0.5" />
            <div className="text-xs text-v5-ink space-y-1">
              <p className="font-bold text-sm">Cơ chế quản trị tham số có căn cứ nghiệp vụ:</p>
              <p className="leading-relaxed">
                Các tham số dưới đây được lưu trữ và kiểm tra quyền trước khi thay đổi. Các module cảnh báo và luồng nghiệp vụ đọc trực tiếp các tham số này.
              </p>
            </div>
          </div>

          <div className="bg-v5-surface rounded-xl border border-v5-line shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-v5-line bg-v5-bg text-v5-ink font-semibold">
                    <th className="w-44 py-3 px-4">Khóa cấu hình (Key)</th>
                    <th className="py-3 px-4">Tên nghiệp vụ & Mô tả</th>
                    <th className="w-24 py-3 px-3 text-center">Kiểu dữ liệu</th>
                    <th className="w-44 py-3 px-4 font-mono">Giá trị hiện hành</th>
                    <th className="w-32 py-3 px-3">Cập nhật bởi</th>
                    <th className="w-20 whitespace-nowrap py-3 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-v5-line/60">
                  {data.configs.map((cfg) => (
                    <tr key={cfg.key} className="hover:bg-v5-bg/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-v5-accent">
                        {cfg.key}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-v5-ink">{cfg.description}</div>
                        <div className="text-[11px] text-v5-muted mt-0.5 font-mono">Phân nhóm: {cfg.category}</div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 bg-v5-bg text-v5-ink rounded text-[10px] font-mono font-semibold">
                          {cfg.dataType}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {cfg.dataType === "BOOLEAN" ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                              cfg.value === "true"
                                ? "bg-v5-success-soft text-v5-success border border-v5-success/30"
                                : "bg-v5-bg text-v5-ink border border-v5-line"
                            }`}
                          >
                            {cfg.value === "true" ? "BẬT (true)" : "TẮT (false)"}
                          </span>
                        ) : (
                          <span className="break-words rounded bg-v5-bg px-2 py-1 font-mono font-semibold text-v5-ink">
                            {cfg.value}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-v5-muted text-[11px]">
                        <div className="truncate" title={cfg.updatedBy || "Mặc định hệ thống"}>{cfg.updatedBy || "Mặc định hệ thống"}</div>
                        <div className="text-[10px] text-v5-muted">
                          {new Date(cfg.updatedAt).toLocaleDateString("vi-VN")}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleOpenEditConfig(cfg)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-v5-accent hover:bg-v5-accent-soft rounded-lg transition-colors border border-v5-line"
                        >
                          <Edit3 className="w-3 h-3" />
                          Sửa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TỔNG QUAN CƠ CẤU TỔ CHỨC */}
      {activeTab === "org" && data && (
        <div className="space-y-4">
          <div className="p-4 bg-v5-bg border border-v5-line rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="font-bold text-sm text-v5-ink">
                Toàn bộ dữ liệu cơ cấu tổ chức và nhân sự đã được chuyển giao sang phân hệ chuyên trách
              </h3>
              <p className="text-xs text-v5-muted">
                Để thêm cán bộ, điều chuyển công tác, cấp tài khoản hoặc quản lý các phòng ban, vui lòng chuyển sang trang Cơ cấu tổ chức.
              </p>
            </div>
            <Link
              href="/admin/organization"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-v5-accent hover:bg-v5-accent rounded-lg shrink-0 shadow-sm"
            >
              Mở Quản trị Cơ cấu & Nhân sự
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-v5-surface rounded-xl border border-v5-line shadow-sm space-y-3">
              <h4 className="font-bold text-sm text-v5-ink flex items-center gap-2">
                <Building2 className="w-4 h-4 text-v5-accent" />
                Thông số Cơ cấu Đơn vị
              </h4>
              <div className="divide-y divide-v5-line/60 text-xs">
                <div className="py-2 flex justify-between">
                  <span className="text-v5-muted">Tổng số đơn vị / bộ phận:</span>
                  <span className="font-bold text-v5-ink">{data.organization.totalUnits} đơn vị</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-v5-muted">Số chức danh công tác:</span>
                  <span className="font-bold text-v5-ink">{data.organization.totalPositions} chức danh</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-v5-muted">Phạm vi chỉ huy cao nhất:</span>
                  <span className="font-bold text-v5-ink">Hải quan cửa khẩu Quốc tế Tà Lùng</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-v5-surface rounded-xl border border-v5-line shadow-sm space-y-3">
              <h4 className="font-bold text-sm text-v5-ink flex items-center gap-2">
                <Users className="w-4 h-4 text-v5-success" />
                Hồ sơ Nhân sự & Tài khoản
              </h4>
              <div className="divide-y divide-v5-line/60 text-xs">
                <div className="py-2 flex justify-between">
                  <span className="text-v5-muted">Tổng số hồ sơ cán bộ:</span>
                  <span className="font-bold text-v5-ink">{data.organization.totalPersons} cán bộ</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-v5-muted">Cán bộ đang hoạt động:</span>
                  <span className="font-bold text-v5-success">{data.organization.activePersons} cán bộ</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-v5-muted">Tài khoản hệ thống đã cấp:</span>
                  <span className="font-bold text-v5-ink">{data.organization.totalAccounts} ({data.organization.activeAccounts} hoạt động)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MA TRẬN PHÂN QUYỀN */}
      {activeTab === "rbac" && data && (
        <div className="space-y-4">
          <div className="p-4 bg-v5-gold-soft border border-v5-gold/50 rounded-xl flex items-start gap-3">
            <Lock className="w-5 h-5 text-v5-gold-ink shrink-0 mt-0.5" />
            <div className="text-xs text-v5-gold-ink space-y-1">
              <p className="font-bold text-sm">Chế độ xem an toàn (Read-Only Security View):</p>
              <p className="leading-relaxed">
                Ma trận phân quyền dưới đây phản ánh quyền hiện tại. Quản trị viên kỹ thuật <strong>không được tự cấp cho mình các quyền phê duyệt hoặc can thiệp nghiệp vụ nhạy cảm</strong>. Gán vai trò cho cán bộ được thực hiện tại trang Quản trị cán bộ theo đúng thẩm quyền.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.rbac.roles.map((role) => (
              <div key={role.id} className="p-4 bg-v5-surface rounded-xl border border-v5-line shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-v5-line/60 pb-2">
                  <div>
                    <span className="font-bold text-sm text-v5-ink">{role.name}</span>
                    <span className="ml-2 font-mono text-xs px-2 py-0.5 bg-v5-bg text-v5-ink rounded font-semibold">
                      {role.code}
                    </span>
                  </div>
                  <span className="text-xs text-v5-muted font-medium">
                    {role.grantsCount} cán bộ được gán
                  </span>
                </div>

                <p className="text-xs text-v5-muted leading-relaxed">
                  {role.description || "Vai trò thẩm quyền trong hệ thống điều hành công việc Chi cục."}
                </p>

                <div>
                  <div className="text-[11px] font-semibold text-v5-muted mb-1.5 uppercase">
                    Quyền hạn được cấp ({role.permissions.length} quyền):
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.map((perm) => (
                      <span
                        key={perm}
                        className="px-2 py-0.5 bg-v5-accent-soft text-v5-accent border border-v5-line rounded text-[10px] font-mono font-medium"
                      >
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: NHẬT KÝ KIỂM TOÁN GẦN ĐÂY */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-v5-muted">
              Hiển thị 10 sự kiện an ninh và thay đổi quản trị gần nhất được ghi vào cơ sở dữ liệu.
            </div>
            <Link
              href="/admin/audit"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-v5-accent hover:underline"
            >
              Mở trang Nhật ký kiểm toán đầy đủ
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-v5-surface rounded-xl border border-v5-line shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-v5-line bg-v5-bg text-v5-ink font-semibold">
                    <th className="py-3 px-4 w-40">Thời điểm</th>
                    <th className="py-3 px-3 w-48">Hành động (Action)</th>
                    <th className="py-3 px-3 w-36">Đối tượng</th>
                    <th className="py-3 px-4">Người thực hiện (Actor)</th>
                    <th className="py-3 px-3 w-32 font-mono">Địa chỉ IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-v5-line/60">
                  {recentAudits.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-v5-muted">
                        Chưa có sự kiện kiểm toán nào được ghi nhận
                      </td>
                    </tr>
                  ) : (
                    recentAudits.map((evt) => (
                      <tr key={evt.id} className="hover:bg-v5-bg/80 transition-colors">
                        <td className="py-3 px-4 text-v5-muted font-mono text-[11px]">
                          {new Date(evt.timestamp).toLocaleString("vi-VN")}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-mono font-semibold text-v5-accent bg-v5-accent-soft px-2 py-0.5 rounded text-[11px]">
                            {evt.action}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-v5-ink font-medium">
                          {evt.resourceType}
                        </td>
                        <td className="py-3 px-4 text-v5-ink font-medium">
                          {evt.actorFullName} ({evt.actorUsername})
                        </td>
                        <td className="py-3 px-3 font-mono text-v5-muted text-[11px]">
                          {evt.ipAddress || "127.0.0.1"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: TRẠNG THÁI SAO LƯU & PHỤC HỒI */}
      {activeTab === "backup" && data && (
        <div className="space-y-4">
          <div className="p-5 bg-v5-bg border border-v5-line rounded-xl space-y-3">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-v5-ink" />
              <h3 className="font-bold text-base text-v5-ink">
                {data.backupStatus.message}
              </h3>
            </div>
            <p className="text-xs text-v5-ink leading-relaxed">
              {data.backupStatus.note}
            </p>

            <div className="p-3 bg-v5-gold-soft border border-v5-gold/50 rounded-lg text-xs text-v5-gold-ink space-y-1">
              <p className="font-bold">Nguyên tắc bảo vệ an ninh và toàn vẹn dữ liệu:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                <li>Hệ thống <strong>không hỗ trợ nạp đè dữ liệu trực tiếp trên giao diện WebApp</strong> nhằm ngăn chặn nguy cơ ghi đè dữ liệu nghiệp vụ và giả lập trạng thái backup.</li>
                <li>Công tác sao lưu định kỳ được thực hiện trên hạ tầng thông qua kịch bản độc lập (<code>scripts/backup-db.ps1</code>).</li>
                <li>Mọi phương án phục hồi sau sự cố phải tuân thủ quy trình phê duyệt an ninh thông tin riêng biệt.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Chỉnh sửa tham số cấu hình */}
      {editingConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-v5-surface rounded-xl shadow-sm border border-v5-line w-full max-w-md overflow-hidden p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-v5-line/60 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-v5-accent" />
                <h3 className="font-bold text-sm text-v5-ink">
                  Cập nhật tham số cấu hình
                </h3>
              </div>
              <button
                onClick={() => setEditingConfig(null)}
                className="p-1 text-v5-muted hover:text-v5-muted rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-3.5">
              {editError && (
                <div className="p-3 bg-v5-danger-soft border border-v5-danger/30 rounded-lg flex items-start gap-2 text-xs text-v5-danger">
                  <AlertCircle className="w-4 h-4 text-v5-danger shrink-0 mt-0.5" />
                  <span>{editError}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-v5-ink block mb-1">
                  Mã tham số (Key)
                </label>
                <input
                  type="text"
                  disabled
                  value={editingConfig.key}
                  className="w-full text-xs p-2 bg-v5-bg border border-v5-line rounded-lg text-v5-muted font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-v5-ink block mb-1">
                  Nghiệp vụ áp dụng
                </label>
                <div className="text-xs text-v5-ink bg-v5-bg p-2 rounded-lg border border-v5-line">
                  {editingConfig.description}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-v5-ink block mb-1">
                  Giá trị mới *
                </label>
                {editingConfig.dataType === "BOOLEAN" ? (
                  <select
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
                  >
                    <option value="true">BẬT (true)</option>
                    <option value="false">TẮT (false)</option>
                  </select>
                ) : editingConfig.dataType === "NUMBER" ? (
                  <input
                    type="number"
                    required
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30 font-mono"
                  />
                ) : (
                  <input
                    type="text"
                    required
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full text-xs p-2 border border-v5-line rounded-lg focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-v5-line/60">
                <button
                  type="button"
                  onClick={() => setEditingConfig(null)}
                  disabled={savingConfig}
                  className="px-3 py-1.5 text-xs font-medium text-v5-muted hover:bg-v5-bg rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-v5-accent hover:bg-v5-accent rounded-lg shadow-sm"
                >
                  {savingConfig ? "Đang lưu..." : "Lưu vào cơ sở dữ liệu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
