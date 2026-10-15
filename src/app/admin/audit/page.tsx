"use client";

import React, { useState } from "react";
import Link from "next/link";

interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  action: string;
  target: string;
  ip: string;
  status: "SUCCESS" | "WARNING" | "BLOCKED";
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState("ALL");
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    setLoading(true);
    fetch("/api/admin/audit?limit=100")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.events)) {
          const mapped: AuditEntry[] = data.events.map((e: any) => ({
            id: e.id.slice(0, 8),
            timestamp: new Date(e.timestamp).toLocaleString("vi-VN"),
            user: e.actorFullName || e.actorUsername || "Hệ thống",
            role: e.actorUsername === "admin" || e.actorUsername === "lanhdao" || e.actorUsername === "hqtl001"
              ? "Trưởng hải quan cửa khẩu"
              : e.actorUsername?.includes("truongnhom")
              ? "Trưởng bộ phận"
              : "Công chức",
            action: e.action,
            target: e.resourceType ? `${e.resourceType}: ${e.resourceId || "N/A"}` : "Hệ thống chung",
            ip: e.ipAddress || "127.0.0.1",
            status: e.status || "SUCCESS",
          }));
          setLogs(mapped);
        } else {
          setLogs([]);
        }
      })
      .catch((err) => {
        console.error("Audit fetch error:", err);
        setLogs([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      !searchTerm ||
      log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.target.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = filterAction === "ALL" || log.action === filterAction;
    return matchesSearch && matchesAction;
  });

  return (
    <div className="flex flex-col w-full p-space-md lg:p-space-lg gap-space-lg pb-16">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md bg-surface-container-lowest p-space-md rounded-lg shadow-sm">
        <div className="flex items-center gap-space-md">
          <div className="w-12 h-12 rounded bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm">
            <span className="material-symbols-outlined text-[28px]">manage_history</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-headline-md text-headline-md text-primary tracking-tight">
                NHẬT KÝ HỆ THỐNG VÀ DẤU VẾT KIỂM TOÁN (AUDIT TRAIL)
              </span>
              <span className="px-2 py-0.5 rounded text-label-sm font-label-sm bg-status-success-bg text-status-success uppercase font-semibold">
                BẢO VỆ CHỐNG SỬA ĐỔI
              </span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Theo dõi 100% thao tác thay đổi dữ liệu, cấp phát quyền, trích xuất tệp XLSX và cảnh báo truy cập trái phép.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/admin/system"
            className="flex items-center gap-1.5 px-3 py-2 rounded bg-surface-subtle hover:bg-surface-container text-primary font-label-md text-label-md transition-colors active-press"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span>Về Cấu hình Hệ thống</span>
          </Link>
        </div>
      </div>

      {/* Filter Strip */}
      <div className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-space-md">
        <div className="relative flex-1 w-full sm:max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-outline text-[18px]">
            search
          </span>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded bg-surface border border-border-subtle font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:border-secondary transition-all"
            placeholder="Tìm theo người dùng, hành động, mục tiêu..."
            type="text"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="h-9 px-3 rounded bg-surface border border-border-subtle font-body-md text-body-md text-on-surface focus:outline-none cursor-pointer"
          >
            <option value="ALL">Tất cả hành động</option>
            <option value="EXPORT_XLSX">Xuất tệp XLSX</option>
            <option value="UPDATE_STATUS">Cập nhật tiến độ</option>
            <option value="SUBMIT_ROUTINE_LOG">Nhật ký tác nghiệp</option>
            <option value="ACCESS_ADMIN_AREA">Truy cập khu vực Quản trị</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left font-table-data text-table-data">
            <thead>
              <tr className="bg-surface-subtle text-on-surface text-[12px] font-table-header uppercase tracking-wider">
                <th className="py-3 px-3 w-36">Mã bản ghi</th>
                <th className="py-3 px-3 w-40">Thời gian</th>
                <th className="py-3 px-3 w-48">Người thực hiện</th>
                <th className="py-3 px-3 w-36">Hành động</th>
                <th className="py-3 px-4 min-w-[240px]">Đối tượng tác động</th>
                <th className="py-3 px-3 w-32">Địa chỉ IP</th>
                <th className="py-3 px-3 w-28 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default/40 text-on-surface">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-on-surface-variant">
                    <span className="material-symbols-outlined text-outline text-[32px] block mb-2 animate-spin">
                      progress_activity
                    </span>
                    Đang nạp dữ liệu kiểm toán từ hệ thống...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-on-surface-variant">
                    <span className="material-symbols-outlined text-outline text-[32px] block mb-2">
                      manage_history
                    </span>
                    Không tìm thấy bản ghi kiểm toán nào phù hợp với bộ lọc tìm kiếm.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="py-3 px-3 font-mono text-[12px] text-secondary font-semibold">
                      {log.id}
                    </td>
                    <td className="py-3 px-3 font-mono text-[12px] text-outline">
                      {log.timestamp}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col">
                        <span className="font-body-semibold text-[13px] text-on-surface">
                          {log.user}
                        </span>
                        <span className="font-label-sm text-[11px] text-outline">
                          {log.role}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-primary-fixed text-on-primary-fixed">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-on-surface-variant font-medium">
                      {log.target}
                    </td>
                    <td className="py-3 px-3 font-mono text-[12px] text-outline">
                      {log.ip}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                          log.status === "SUCCESS"
                            ? "bg-status-success-bg text-status-success"
                            : log.status === "WARNING"
                            ? "bg-status-warning-bg text-status-warning"
                            : "bg-status-danger-bg text-status-danger"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
