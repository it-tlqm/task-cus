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
        <RefreshCw className="w-8 h-8 text-blue-900 animate-spin" />
        <p className="text-sm font-medium text-slate-600">Đang nạp dữ liệu trung tâm quản trị từ PostgreSQL...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 max-w-2xl mx-auto mt-12 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 space-y-3">
        <div className="flex items-center gap-2 font-bold text-base">
          <AlertCircle className="w-5 h-5 text-rose-600" />
          <span>Từ chối quyền truy cập hoặc lỗi kết nối</span>
        </div>
        <p className="text-sm leading-relaxed">{error}</p>
        <div className="pt-2">
          <button
            onClick={fetchOverview}
            className="px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700"
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
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-in fade-in slide-in-from-top-2 ${
            toastMessage.type === "success"
              ? "bg-emerald-50 text-emerald-900 border-emerald-200"
              : "bg-rose-50 text-rose-900 border-rose-200"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-900 text-white">
              Quản trị kỹ thuật
            </span>
            <span className="text-xs text-slate-500 font-mono">
              SYSTEM_ADMIN • PostgreSQL Live State
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Trung tâm Quản trị Kỹ thuật & Cấu hình Vận hành
          </h1>
          <p className="text-xs md:text-sm text-slate-600 mt-0.5">
            Giám sát toàn diện dữ liệu cơ cấu tổ chức, ma trận phân quyền RBAC, kiểm toán an ninh và quản trị tham số cấu hình hệ thống thực tế.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchOverview}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
          <Link
            href="/admin/organization"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 shadow-sm"
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
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 shadow-sm"
          >
            <History className="w-3.5 h-3.5" />
            Nhật ký kiểm toán
          </Link>
        </div>
      </div>

      {/* 5 Real Metric Overview Cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-semibold uppercase">Cơ cấu tổ chức</span>
              <Building2 className="w-4 h-4 text-blue-900" />
            </div>
            <div className="text-xl font-bold text-slate-900 mt-1">{data.organization.totalUnits} đơn vị</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {data.organization.activePersons} cán bộ đang công tác
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-semibold uppercase">Phân quyền RBAC</span>
              <Shield className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="text-xl font-bold text-slate-900 mt-1">{data.rbac.totalRoles} vai trò</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {data.rbac.totalPermissions} mã quyền hệ thống
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-semibold uppercase">Danh mục mẫu</span>
              <Layers className="w-4 h-4 text-purple-700" />
            </div>
            <div className="text-xl font-bold text-slate-900 mt-1">{data.catalog.totalTemplates} hoạt động</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {data.catalog.activeTemplates} áp dụng • {data.catalog.retiredTemplates} ngừng
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-semibold uppercase">Biểu mẫu động</span>
              <FileCode2 className="w-4 h-4 text-indigo-700" />
            </div>
            <div className="text-xl font-bold text-slate-900 mt-1">{data.forms.totalForms} biểu mẫu</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Versioned Form Engine
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-semibold uppercase">Kiểm toán an ninh</span>
              <History className="w-4 h-4 text-amber-700" />
            </div>
            <div className="text-xl font-bold text-slate-900 mt-1">{data.audit.totalEvents} sự kiện</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Chuỗi AuditEvent PostgreSQL
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab("configs")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "configs"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Tham số cấu hình vận hành ({data?.configs?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab("org")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "org"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          Tổng quan Cơ cấu tổ chức
        </button>

        <button
          onClick={() => setActiveTab("rbac")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "rbac"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          Ma trận Phân quyền (RBAC)
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "audit"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Nhật ký Kiểm toán gần đây
        </button>

        <button
          onClick={() => setActiveTab("backup")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "backup"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          Sao lưu & Phục hồi
        </button>
      </div>

      {/* TAB 1: THAM SỐ CẤU HÌNH VẬN HÀNH */}
      {activeTab === "configs" && data && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-900 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-950 space-y-1">
              <p className="font-bold text-sm">Cơ chế quản trị tham số có căn cứ nghiệp vụ:</p>
              <p className="leading-relaxed">
                Mọi tham số dưới đây được lưu trữ thực tế trong bảng <code>system_configs</code> của PostgreSQL và kiểm tra quyền <code>system.config</code> trước khi thay đổi. Các module cảnh báo hạn định và luồng nghiệp vụ đọc trực tiếp các tham số này thời gian thực.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                    <th className="py-3 px-4 w-48">Khóa cấu hình (Key)</th>
                    <th className="py-3 px-4">Tên nghiệp vụ & Mô tả</th>
                    <th className="py-3 px-3 w-28 text-center">Kiểu dữ liệu</th>
                    <th className="py-3 px-4 w-48 font-mono">Giá trị hiện hành</th>
                    <th className="py-3 px-3 w-36">Cập nhật bởi</th>
                    <th className="py-3 px-3 w-24 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.configs.map((cfg) => (
                    <tr key={cfg.key} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-blue-900">
                        {cfg.key}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{cfg.description}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 font-mono">Phân nhóm: {cfg.category}</div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-mono font-semibold">
                          {cfg.dataType}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {cfg.dataType === "BOOLEAN" ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                              cfg.value === "true"
                                ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {cfg.value === "true" ? "BẬT (true)" : "TẮT (false)"}
                          </span>
                        ) : (
                          <span className="font-mono font-semibold text-slate-900 bg-slate-100 px-2 py-1 rounded">
                            {cfg.value}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600 text-[11px]">
                        <div>{cfg.updatedBy || "Mặc định hệ thống"}</div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(cfg.updatedAt).toLocaleDateString("vi-VN")}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleOpenEditConfig(cfg)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200"
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
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="font-bold text-sm text-slate-900">
                Toàn bộ dữ liệu cơ cấu tổ chức và nhân sự đã được chuyển giao sang phân hệ chuyên trách
              </h3>
              <p className="text-xs text-slate-600">
                Để thêm cán bộ, điều chuyển công tác, cấp tài khoản hoặc quản lý các phòng ban, vui lòng chuyển sang trang Cơ cấu tổ chức.
              </p>
            </div>
            <Link
              href="/admin/organization"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg shrink-0 shadow-sm"
            >
              Mở Quản trị Cơ cấu & Nhân sự
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-900" />
                Thông số Cơ cấu Đơn vị
              </h4>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="py-2 flex justify-between">
                  <span className="text-slate-600">Tổng số đơn vị / bộ phận:</span>
                  <span className="font-bold text-slate-900">{data.organization.totalUnits} đơn vị</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-600">Số chức danh công tác:</span>
                  <span className="font-bold text-slate-900">{data.organization.totalPositions} chức danh</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-600">Phạm vi chỉ huy cao nhất:</span>
                  <span className="font-bold text-slate-900">Chi cục Hải quan khu vực XVI - Hải quan cửa khẩu Quốc tế Tà Lùng</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-700" />
                Hồ sơ Nhân sự & Tài khoản
              </h4>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="py-2 flex justify-between">
                  <span className="text-slate-600">Tổng số hồ sơ cán bộ:</span>
                  <span className="font-bold text-slate-900">{data.organization.totalPersons} cán bộ</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-600">Cán bộ đang hoạt động:</span>
                  <span className="font-bold text-emerald-700">{data.organization.activePersons} cán bộ</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-600">Tài khoản hệ thống đã cấp:</span>
                  <span className="font-bold text-slate-900">{data.organization.totalAccounts} ({data.organization.activeAccounts} hoạt động)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MA TRẬN PHÂN QUYỀN RBAC */}
      {activeTab === "rbac" && data && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-950 space-y-1">
              <p className="font-bold text-sm">Chế độ xem an toàn (Read-Only Security View):</p>
              <p className="leading-relaxed">
                Ma trận phân quyền dưới đây phản ánh nguyên trạng từ các bảng <code>roles</code>, <code>permissions</code>, và <code>role_permissions</code> trong PostgreSQL. Quản trị viên kỹ thuật <strong>không được phép tự ý cấp cho mình các quyền phê duyệt hoặc can thiệp nghiệp vụ nhạy cảm</strong>. Gán vai trò cho cán bộ được thực hiện tại trang Quản trị cán bộ theo đúng thẩm quyền.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.rbac.roles.map((role) => (
              <div key={role.id} className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div>
                    <span className="font-bold text-sm text-slate-900">{role.name}</span>
                    <span className="ml-2 font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-semibold">
                      {role.code}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    {role.grantsCount} cán bộ được gán
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {role.description || "Vai trò thẩm quyền trong hệ thống điều hành công việc Chi cục."}
                </p>

                <div>
                  <div className="text-[11px] font-semibold text-slate-500 mb-1.5 uppercase">
                    Quyền hạn được cấp ({role.permissions.length} quyền):
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.map((perm) => (
                      <span
                        key={perm}
                        className="px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded text-[10px] font-mono font-medium"
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
            <div className="text-xs text-slate-600">
              Hiển thị 10 sự kiện an ninh và thay đổi quản trị gần nhất được ghi vào cơ sở dữ liệu.
            </div>
            <Link
              href="/admin/audit"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-900 hover:underline"
            >
              Mở trang Nhật ký kiểm toán đầy đủ
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                    <th className="py-3 px-4 w-40">Thời điểm</th>
                    <th className="py-3 px-3 w-48">Hành động (Action)</th>
                    <th className="py-3 px-3 w-36">Đối tượng</th>
                    <th className="py-3 px-4">Người thực hiện (Actor)</th>
                    <th className="py-3 px-3 w-32 font-mono">Địa chỉ IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentAudits.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Chưa có sự kiện kiểm toán nào được ghi nhận
                      </td>
                    </tr>
                  ) : (
                    recentAudits.map((evt) => (
                      <tr key={evt.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                          {new Date(evt.timestamp).toLocaleString("vi-VN")}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-mono font-semibold text-blue-900 bg-blue-50 px-2 py-0.5 rounded text-[11px]">
                            {evt.action}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-700 font-medium">
                          {evt.resourceType}
                        </td>
                        <td className="py-3 px-4 text-slate-900 font-medium">
                          {evt.actorFullName} ({evt.actorUsername})
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-500 text-[11px]">
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
          <div className="p-5 bg-slate-50 border border-slate-300 rounded-xl space-y-3">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-slate-700" />
              <h3 className="font-bold text-base text-slate-900">
                {data.backupStatus.message}
              </h3>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {data.backupStatus.note}
            </p>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-900" />
                <h3 className="font-bold text-sm text-slate-900">
                  Cập nhật tham số cấu hình
                </h3>
              </div>
              <button
                onClick={() => setEditingConfig(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-3.5">
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{editError}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Mã tham số (Key)
                </label>
                <input
                  type="text"
                  disabled
                  value={editingConfig.key}
                  className="w-full text-xs p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Nghiệp vụ áp dụng
                </label>
                <div className="text-xs text-slate-800 bg-slate-50 p-2 rounded-lg border border-slate-200">
                  {editingConfig.description}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Giá trị mới *
                </label>
                {editingConfig.dataType === "BOOLEAN" ? (
                  <select
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                ) : (
                  <input
                    type="text"
                    required
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingConfig(null)}
                  disabled={savingConfig}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg shadow-sm"
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
