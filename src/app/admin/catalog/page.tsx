"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";

interface ActivityGroup {
  id: string;
  code: string;
  name: string;
  description?: string;
  sortOrder?: number;
}

interface ActivityTemplate {
  id: string;
  code: string;
  title: string;
  description?: string;
  sourceRawText?: string;
  reportingMode?: string;
  frequencyType?: string;
  outputDescription?: string;
  reviewStatus?: string;
  status?: string;
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
  const [templates, setTemplates] = useState<ActivityTemplate[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

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

  const filteredTemplates = (templates || []).filter((tpl) => {
    const tplGroup = tpl.group || tpl.activityGroup;
    const matchesGroup = selectedGroupId === "ALL" || tplGroup?.id === selectedGroupId;
    const descText = tpl.description || tpl.sourceRawText || tpl.outputDescription || "";
    const matchesSearch =
      tpl.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tpl.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      descText.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesGroup && matchesSearch;
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

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 text-purple-800">
              Quản trị danh mục
            </span>
            <span className="text-xs text-slate-500">Màn hình S07 Tab 2 • 5 Nhóm & 48 Mẫu hoạt động</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Danh mục hoạt động mẫu tham khảo</h1>
          <p className="text-sm text-slate-600">
            Hệ thống 5 nhóm nghiệp vụ và 48 hoạt động mẫu nguyên văn phục vụ gợi ý khi tạo danh mục đầu việc cá nhân
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchCatalog}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
          <Link
            href="/admin/organization"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 shadow-sm"
          >
            Quản trị cơ cấu tổ chức & Nhân sự
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Mandatory Warning Banner according to PROJECT_CONTEXT.md */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-amber-900">
          <p className="font-bold">
            Trạng thái dữ liệu danh mục: CHƯA XÁC NHẬN CHÍNH THỨC (NEEDS_REVIEW)
          </p>
          <p className="leading-relaxed">
            Danh mục 48 hoạt động mẫu dưới đây được lưu trữ dưới dạng gợi ý tham khảo, <strong>không phải là checklist bắt buộc</strong>.
            Cột C trong kế hoạch công tác là <strong>"Danh mục đầu việc"</strong> được cá nhân hóa linh hoạt theo từng cán bộ, không bị cưỡng ép vào 48 mục này.
          </p>
        </div>
      </div>

      {/* 5 Group Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
        <div
          onClick={() => setSelectedGroupId("ALL")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            selectedGroupId === "ALL"
              ? "bg-blue-900 text-white shadow-sm ring-2 ring-blue-500/20 border-blue-900"
              : "bg-white text-slate-800 border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="text-xs font-semibold uppercase opacity-80">Tất cả nhóm</div>
          <div className="text-xl font-bold mt-1">{templates.length}</div>
          <div className="text-[11px] opacity-75 mt-0.5">Mẫu hoạt động</div>
        </div>

        {groups.map((grp) => {
          const isSelected = selectedGroupId === grp.id;
          const count = templates.filter((t) => (t.group?.id || t.activityGroup?.id) === grp.id).length;
          return (
            <div
              key={grp.id}
              onClick={() => setSelectedGroupId(grp.id)}
              className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
                isSelected
                  ? "bg-blue-900 text-white shadow-sm ring-2 ring-blue-500/20 border-blue-900"
                  : "bg-white text-slate-800 border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="text-[11px] font-mono font-bold uppercase opacity-80">{grp.code}</div>
              <div className="text-xl font-bold mt-1">{count}</div>
              <div className="text-[11px] truncate opacity-90 mt-0.5" title={grp.name}>
                {grp.name}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-900" />
          <span className="text-xs font-bold text-slate-800">
            Hiển thị {filteredTemplates.length} / {templates.length} hoạt động mẫu
          </span>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo mã, tên hoặc sản phẩm đầu ra..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Catalog Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                <th className="py-3 px-3 w-28">Mã mẫu</th>
                <th className="py-3 px-3 w-48">Nhóm nghiệp vụ</th>
                <th className="py-3 px-4">Tên hoạt động mẫu nguyên văn</th>
                <th className="py-3 px-3 w-40">Chế độ báo cáo</th>
                <th className="py-3 px-4">Trích đoạn nguồn nguyên văn</th>
                <th className="py-3 px-3 w-36 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
                    Đang nạp 48 hoạt động mẫu...
                  </td>
                </tr>
              ) : filteredTemplates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Không tìm thấy hoạt động mẫu nào phù hợp với bộ lọc
                  </td>
                </tr>
              ) : (
                filteredTemplates.map((tpl) => {
                  const tplGroup = tpl.group || tpl.activityGroup;
                  return (
                    <tr key={tpl.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-blue-900">
                        {tpl.code}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-medium">
                          {tplGroup?.name || "Chưa phân nhóm"}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 leading-snug">
                        {tpl.title}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        <span className="font-medium">{getReportingModeLabel(tpl.reportingMode, tpl.frequencyType)}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 leading-relaxed font-mono text-[11px]">
                        {tpl.sourceRawText || tpl.outputDescription || "—"}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                          <AlertTriangle className="w-3 h-3 text-amber-700" />
                          Chưa xác nhận
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
