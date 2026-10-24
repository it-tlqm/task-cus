"use client";

import React, { useState } from "react";
import BackButton from "@/components/ui/BackButton";

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

// Mã hành động quen thuộc → tên thân thiện; mã lạ giữ nguyên mã
const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Đăng nhập",
  LOGIN_FAILED: "Đăng nhập thất bại (sai mật khẩu)",
  LOGIN_REJECTED_INACTIVE: "Đăng nhập bị chặn (tài khoản khóa)",
  LOGIN_REJECTED_PERSON_INACTIVE: "Đăng nhập bị chặn (đã ngừng công tác)",
  AI_DRAFT: "AI soạn nháp chỉ đạo",
  AI_SUMMARY: "AI tóm tắt tình hình",
  AI_EXTRACT: "AI tách kết luận họp",
  TASK_PROGRESS_UPDATE: "Cập nhật tiến độ",
  TASK_ACCEPT: "Tiếp nhận đầu việc",
  REPORT_EXPORTED: "Xuất báo cáo XLSX",
  ROUTINE_ENTRY_CREATED: "Ghi nhật ký tác nghiệp",
  ROUTINE_ENTRY_NOT_OCCURRED: "Xác nhận không phát sinh",
};

const ROLE_LABELS: Record<string, string> = {
  UNIT_LEADER: "Trưởng hải quan cửa khẩu",
  DEPARTMENT_LEADER: "Trưởng bộ phận",
  SYSTEM_ADMIN: "Quản trị hệ thống",
  STAFF: "Công chức",
};

const PAGE_SIZE = 50;

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterAction, setFilterAction] = useState("ALL");
  const [actions, setActions] = useState<Array<{ action: string; count: number }>>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Gõ tới đâu chờ 400ms mới hỏi máy chủ (tránh gọi liên tục), đổi từ khóa thì về trang 1
  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Danh sách hành động thực tế có trong nhật ký → đổ vào dropdown lọc
  React.useEffect(() => {
    fetch("/api/admin/audit?meta=actions")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.actions)) setActions(data.actions);
      })
      .catch(() => {});
  }, []);

  // Tải dữ liệu theo trang + bộ lọc (lọc phía máy chủ)
  React.useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch) qs.set("search", debouncedSearch);
    if (filterAction !== "ALL") qs.set("action", filterAction);
    fetch(`/api/admin/audit?${qs.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.events)) {
          const mapped: AuditEntry[] = data.events.map((e: any) => ({
            id: e.id.slice(0, 8),
            timestamp: new Date(e.timestamp).toLocaleString("vi-VN"),
            user: e.actorFullName || e.actorUsername || "Hệ thống",
            role: ROLE_LABELS[e.actorRole] || e.actorRole || "Hệ thống",
            action: e.action,
            target: e.resourceType ? `${e.resourceType}: ${e.resourceId || "N/A"}` : "Hệ thống chung",
            ip: e.ipAddress || "—",
            status: e.status || "SUCCESS",
          }));
          setLogs(mapped);
          setTotal(data.pagination?.total ?? mapped.length);
          setTotalPages(data.pagination?.totalPages ?? 1);
        } else {
          setLogs([]);
          setTotal(0);
          setTotalPages(1);
        }
      })
      .catch((err) => {
        console.error("Audit fetch error:", err);
        setLogs([]);
        setTotal(0);
        setTotalPages(1);
      })
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, filterAction]);

  const pageBtn =
    "px-2.5 h-8 rounded bg-surface-subtle hover:bg-surface-container text-[12px] font-semibold text-on-surface transition-fast active-press disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="flex flex-col w-full p-space-md lg:p-space-lg gap-space-lg pb-16">
      <div>
        <BackButton href="/admin/system" label="Cấu hình hệ thống" />
      </div>

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
            placeholder="Tìm theo người dùng, hành động, mục tiêu... (không cần dấu)"
            type="text"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={filterAction}
            onChange={(e) => {
              setFilterAction(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded bg-surface border border-border-subtle font-body-md text-body-md text-on-surface focus:outline-none cursor-pointer max-w-[320px]"
          >
            <option value="ALL">Tất cả hành động</option>
            {actions.map((a) => (
              <option key={a.action} value={a.action}>
                {`${ACTION_LABELS[a.action] || a.action} (${a.count})`}
              </option>
            ))}
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
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-on-surface-variant">
                    <span className="material-symbols-outlined text-outline text-[32px] block mb-2">
                      manage_history
                    </span>
                    Không tìm thấy bản ghi kiểm toán nào phù hợp với bộ lọc tìm kiếm.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
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
                      <span
                        className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-primary-fixed text-on-primary-fixed"
                        title={ACTION_LABELS[log.action] || log.action}
                      >
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

        {/* Phân trang phía máy chủ */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border-default/40 flex-wrap">
          <span className="font-label-sm text-[12px] text-on-surface-variant">
            Tổng <b>{total.toLocaleString("vi-VN")}</b> bản ghi • Trang <b>{page}</b>/{totalPages} •{" "}
            {PAGE_SIZE} bản ghi/trang
          </span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage(1)}
              className={pageBtn}
              title="Trang đầu"
            >
              « Đầu
            </button>
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={pageBtn}
            >
              ‹ Trước
            </button>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className={pageBtn}
            >
              Sau ›
            </button>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => setPage(totalPages)}
              className={pageBtn}
              title="Trang cuối"
            >
              Cuối »
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
