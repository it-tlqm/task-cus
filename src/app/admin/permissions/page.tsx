"use client";

/**
 * /admin/permissions — Trung tâm cấu hình phân quyền (V3, Giai đoạn 1)
 * A. Tài khoản · B. Vai trò & quyền · C. Phạm vi quản lý · D. Cấp & thu hồi · E. Nhật ký
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";

type Tab = "accounts" | "roles" | "scope" | "grant" | "audit";

interface Grant {
  id: string;
  roleCode: string;
  roleName: string;
  scopeType: string;
  scopeUnit: { id: string; code: string; name: string } | null;
  validFrom: string;
  validTo: string | null;
  active: boolean;
}
interface AccountRow {
  id: string;
  username: string;
  status: string;
  personId: string;
  personCode: string;
  fullName: string;
  personStatus: string;
  unit: { id: string; code: string; name: string } | null;
  grants: Grant[];
}
interface RoleRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  accountCount: number;
}
interface PermRow {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string | null;
}
interface Payload {
  roles: RoleRow[];
  permissions: PermRow[];
  accounts: AccountRow[];
  units: { id: string; code: string; name: string; parentId: string | null; staffCount: number }[];
  supervision: {
    id: string;
    manager: string;
    managerName: string;
    subordinate: string;
    subordinateName: string;
    status: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    active: boolean;
  }[];
  audit: {
    id: string;
    action: string;
    actorId: string | null;
    timestamp: string;
    resourceId: string | null;
    newData: any;
    oldData: any;
  }[];
  sensitiveRolesLocked: string[];
  canGrantSystemAdmin: boolean;
  myRole: string;
}

/** Ma trận thao tác — dựng từ đúng mã quyền đang có trong hệ thống. */
const OP_MATRIX: { op: string; codes: string[] }[] = [
  { op: "Xem", codes: ["plans.view", "reports.view"] },
  { op: "Tạo", codes: ["plans.create", "catalog.manage"] },
  { op: "Sửa", codes: ["tasks.update_own"] },
  { op: "Xoá", codes: [] },
  { op: "Gửi", codes: ["tasks.assign"] },
  { op: "Xác nhận", codes: ["plans.approve"] },
  { op: "Xuất báo cáo", codes: ["reports.export"] },
  { op: "Quản trị", codes: ["org.manage", "audit.view", "system.config"] },
];

const SCOPE_LABEL: Record<string, string> = {
  OWN: "Cá nhân",
  ASSIGNED: "Được phân công",
  DEPARTMENT: "Bộ phận",
  SUBTREE: "Toàn bộ đơn vị con",
  ORGANIZATION: "Toàn tổ chức",
};

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}

export default function AdminPermissionsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("accounts");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  // form cấp quyền
  const [gAccount, setGAccount] = useState("");
  const [gRole, setGRole] = useState("STAFF");
  const [gScope, setGScope] = useState("DEPARTMENT");
  const [gUnit, setGUnit] = useState("");
  const [gFrom, setGFrom] = useState("");
  const [gTo, setGTo] = useState("");
  const [gReason, setGReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/permissions");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "Không tải được cấu hình phân quyền.");
        return;
      }
      setData(json.data);
    } catch {
      toast.error("Không tải được cấu hình phân quyền.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    if (!s) return data.accounts;
    return data.accounts.filter((a) =>
      [a.username, a.fullName, a.personCode, a.unit?.name, a.unit?.code]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s))
    );
  }, [data, q]);

  const grant = async () => {
    if (!gAccount) {
      toast.error("Vui lòng chọn tài khoản cần cấp vai trò.");
      return;
    }
    const sensitive = gRole === "SYSTEM_ADMIN";
    if (sensitive && !data?.canGrantSystemAdmin) {
      toast.error("Chỉ Quản trị hệ thống hiện hữu mới được cấp vai trò này.");
      return;
    }
    if (sensitive && gReason.trim().length < 10) {
      toast.error("Cấp Quản trị hệ thống phải có lý do tối thiểu 10 ký tự.");
      return;
    }
    if (
      sensitive &&
      !window.confirm(
        "Cấp vai trò Quản trị hệ thống? Thao tác này được ghi nhật ký và không thể tự thu hồi."
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: gAccount,
          roleCode: gRole,
          scopeType: gScope,
          scopeUnitId: gUnit || null,
          validFrom: gFrom || undefined,
          validTo: gTo || undefined,
          reason: gReason,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "Không cấp được vai trò.");
        return;
      }
      toast.success("Đã cấp vai trò và ghi nhật ký.");
      setGReason("");
      await load();
    } catch {
      toast.error("Không cấp được vai trò.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (grant: Grant) => {
    let reason = "";
    if (grant.roleCode === "SYSTEM_ADMIN") {
      if (!data?.canGrantSystemAdmin) {
        toast.error("Chỉ Quản trị hệ thống hiện hữu mới được thu hồi vai trò này.");
        return;
      }
      const input = window.prompt("Lý do thu hồi Quản trị hệ thống (bắt buộc):");
      if (!input?.trim()) {
        toast.error("Thu hồi Quản trị hệ thống phải có lý do.");
        return;
      }
      reason = input.trim();
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/permissions?grantId=${grant.id}&reason=${encodeURIComponent(reason)}`,
        { method: "DELETE" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "Không thu hồi được vai trò.");
        return;
      }
      toast.success("Đã thu hồi vai trò.");
      await load();
    } catch {
      toast.error("Không thu hồi được vai trò.");
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "accounts", label: "Tài khoản" },
    { id: "roles", label: "Vai trò & quyền" },
    { id: "scope", label: "Phạm vi quản lý" },
    { id: "grant", label: "Cấp & thu hồi" },
    { id: "audit", label: "Nhật ký phân quyền" },
  ];

  return (
    <main className="p-4 md:p-6 space-y-4">
      <header>
        <h1 className="text-xl font-bold text-on-surface">Trung tâm cấu hình phân quyền</h1>
        <p className="text-xs text-on-surface-variant mt-1">
          Vai trò, quyền theo chức năng, phạm vi quản lý và nhật ký thay đổi. Mọi thao tác cấp/thu hồi
          đều được kiểm tra phía máy chủ và ghi lại người thực hiện.
        </p>
      </header>

      <div className="flex flex-wrap gap-1 border-b border-border-subtle">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={`perm-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg ${
              tab === t.id
                ? "bg-surface-container text-on-surface border border-b-0 border-border-subtle"
                : "text-on-surface-variant hover:bg-surface-container-low"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border border-border-subtle bg-surface-container-lowest p-6 text-sm text-on-surface-variant">
          Đang tải cấu hình phân quyền…
        </div>
      ) : !data ? (
        <div className="rounded-xl border border-status-danger/30 bg-status-danger-bg p-6 text-sm text-status-danger">
          Không tải được dữ liệu phân quyền. Bạn có thể không có quyền xem mục này.
        </div>
      ) : (
        <>
          {/* ---------------- A. Tài khoản ---------------- */}
          {tab === "accounts" && (
            <section className="space-y-3">
              <input
                data-testid="perm-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm theo tên đăng nhập, họ tên, mã cán bộ hoặc bộ phận…"
                className="w-full max-w-md rounded-lg border border-border-default bg-surface-container-lowest px-3 py-2 text-sm"
              />
              <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface-container-lowest">
                <table className="w-full text-xs">
                  <thead className="bg-surface-container text-on-surface-variant">
                    <tr>
                      {["Tài khoản", "Cán bộ", "Bộ phận", "Vai trò & phạm vi", "Hiệu lực", "Trạng thái"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => (
                      <tr key={a.id} data-testid={`perm-account-${a.username}`} className="border-t border-border-subtle">
                        <td className="px-3 py-2 font-semibold text-on-surface">{a.username}</td>
                        <td className="px-3 py-2 text-on-surface">
                          {a.fullName} <span className="text-on-surface-variant">({a.personCode})</span>
                        </td>
                        <td className="px-3 py-2 text-on-surface-variant">{a.unit?.name || "—"}</td>
                        <td className="px-3 py-2">
                          {a.grants.length === 0 && <span className="text-on-surface-variant">Chưa có vai trò</span>}
                          {a.grants.map((g) => (
                            <div key={g.id} className="flex flex-wrap items-center gap-1 mb-0.5">
                              <span
                                className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${
                                  g.active
                                    ? "bg-status-success-bg text-status-success border-status-success/30"
                                    : "bg-surface-container text-on-surface-variant border-border-subtle"
                                }`}
                              >
                                {g.roleName}
                              </span>
                              <span className="text-on-surface-variant">
                                {SCOPE_LABEL[g.scopeType] || g.scopeType}
                                {g.scopeUnit ? ` · ${g.scopeUnit.name}` : ""}
                              </span>
                            </div>
                          ))}
                        </td>
                        <td className="px-3 py-2 text-on-surface-variant">
                          {a.grants.map((g) => (
                            <div key={g.id}>
                              {fmtDate(g.validFrom)} → {g.validTo ? fmtDate(g.validTo) : "không hạn"}
                            </div>
                          ))}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                              a.status === "ACTIVE"
                                ? "bg-status-success-bg text-status-success border-status-success/30"
                                : "bg-status-danger-bg text-status-danger border-status-danger/30"
                            }`}
                          >
                            {a.status === "ACTIVE" ? "Đang hoạt động" : "Đã khoá"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ---------------- B. Vai trò & quyền ---------------- */}
          {tab === "roles" && (
            <section className="space-y-4">
              <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
                {data.roles.map((r) => (
                  <div key={r.id} className="rounded-xl border border-border-subtle bg-surface-container-lowest p-3">
                    <p className="text-sm font-bold text-on-surface">{r.name}</p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">
                      {r.code} · {r.accountCount} tài khoản
                    </p>
                    <p className="text-[11px] text-on-surface-variant mt-1">{r.description}</p>
                  </div>
                ))}
              </div>

              <h2 className="text-sm font-bold text-on-surface">Quyền theo chức năng</h2>
              <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface-container-lowest">
                <table className="w-full text-xs">
                  <thead className="bg-surface-container text-on-surface-variant">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Chức năng / quyền</th>
                      {data.roles.map((r) => (
                        <th key={r.id} className="px-3 py-2 text-center font-semibold">
                          {r.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.permissions.map((p) => (
                      <tr key={p.id} className="border-t border-border-subtle">
                        <td className="px-3 py-2">
                          <span className="text-on-surface font-medium">{p.name}</span>
                          <span className="text-on-surface-variant"> · {p.module}</span>
                          <div className="text-[10px] text-on-surface-variant">{p.code}</div>
                        </td>
                        {data.roles.map((r) => (
                          <td key={r.id} className="px-3 py-2 text-center">
                            {r.permissions.includes(p.code) ? (
                              <span className="material-symbols-outlined text-[16px] text-status-success">
                                check_circle
                              </span>
                            ) : (
                              <span className="material-symbols-outlined text-[16px] text-border-default">
                                remove
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h2 className="text-sm font-bold text-on-surface">Ma trận thao tác</h2>
              <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface-container-lowest">
                <table className="w-full text-xs">
                  <thead className="bg-surface-container text-on-surface-variant">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Thao tác</th>
                      {data.roles.map((r) => (
                        <th key={r.id} className="px-3 py-2 text-center font-semibold">
                          {r.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {OP_MATRIX.map((row) => (
                      <tr key={row.op} className="border-t border-border-subtle">
                        <td className="px-3 py-2 font-medium text-on-surface">{row.op}</td>
                        {data.roles.map((r) => {
                          const ok = row.codes.some((c) => r.permissions.includes(c));
                          return (
                            <td key={r.id} className="px-3 py-2 text-center">
                              {ok ? (
                                <span className="material-symbols-outlined text-[16px] text-status-success">check</span>
                              ) : (
                                <span className="text-on-surface-variant">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Ô trống nghĩa là vai trò đó không có quyền tương ứng. Hệ thống không có quyền “xoá”
                riêng — thao tác xoá luôn đi kèm quyền quản lý của chức năng đó.
              </p>
            </section>
          )}

          {/* ---------------- C. Phạm vi quản lý ---------------- */}
          {tab === "scope" && (
            <section className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-on-surface mb-2">Đơn vị & bộ phận</h2>
                <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface-container-lowest">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-container text-on-surface-variant">
                      <tr>
                        {["Mã", "Tên đơn vị", "Cấp trên", "Số cán bộ"].map((h) => (
                          <th key={h} className="text-left px-3 py-2 font-semibold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.units.map((u) => (
                        <tr key={u.id} className="border-t border-border-subtle">
                          <td className="px-3 py-2 font-semibold">{u.code}</td>
                          <td className="px-3 py-2 text-on-surface">{u.name}</td>
                          <td className="px-3 py-2 text-on-surface-variant">
                            {data.units.find((x) => x.id === u.parentId)?.name || "—"}
                          </td>
                          <td className="px-3 py-2">{u.staffCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h2 className="text-sm font-bold text-on-surface mb-2">
                  Quan hệ quản lý trực tiếp (cơ sở xác nhận công việc)
                </h2>
                <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface-container-lowest">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-container text-on-surface-variant">
                      <tr>
                        {["Lãnh đạo trực tiếp", "Cán bộ", "Trạng thái", "Hiệu lực"].map((h) => (
                          <th key={h} className="text-left px-3 py-2 font-semibold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.supervision.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-3 text-on-surface-variant">
                            Chưa khai báo quan hệ quản lý trực tiếp.
                          </td>
                        </tr>
                      )}
                      {data.supervision.map((s) => (
                        <tr key={s.id} className="border-t border-border-subtle">
                          <td className="px-3 py-2 font-semibold">
                            {s.managerName} <span className="text-on-surface-variant">({s.manager})</span>
                          </td>
                          <td className="px-3 py-2">
                            {s.subordinateName} <span className="text-on-surface-variant">({s.subordinate})</span>
                          </td>
                          <td className="px-3 py-2">{s.status === "CONFIRMED" ? "Đang hiệu lực" : s.status}</td>
                          <td className="px-3 py-2 text-on-surface-variant">
                            {fmtDate(s.effectiveFrom)} → {s.effectiveTo ? fmtDate(s.effectiveTo) : "không hạn"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-on-surface-variant mt-1">
                  Quyền xác nhận công việc chỉ dành cho lãnh đạo trực tiếp có quan hệ còn hiệu lực tại
                  đây — khác với quyền theo đơn vị.
                </p>
              </div>
            </section>
          )}

          {/* ---------------- D. Cấp & thu hồi ---------------- */}
          {tab === "grant" && (
            <section className="grid lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border-subtle bg-surface-container-lowest p-4 space-y-3">
                <h2 className="text-sm font-bold text-on-surface">Cấp vai trò</h2>
                <label className="block text-xs font-semibold text-on-surface">Tài khoản</label>
                <select
                  data-testid="grant-account"
                  value={gAccount}
                  onChange={(e) => setGAccount(e.target.value)}
                  className="w-full rounded-lg border border-border-default bg-surface-container-lowest px-3 py-2 text-sm"
                >
                  <option value="">— Chọn tài khoản —</option>
                  {data.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.username} — {a.fullName}
                    </option>
                  ))}
                </select>

                <label className="block text-xs font-semibold text-on-surface">Vai trò</label>
                <select
                  data-testid="grant-role"
                  value={gRole}
                  onChange={(e) => {
                    const next = e.target.value;
                    setGRole(next);
                    if (next === "SYSTEM_ADMIN") {
                      setGScope("ORGANIZATION");
                      setGUnit("");
                    }
                  }}
                  className="w-full rounded-lg border border-border-default bg-surface-container-lowest px-3 py-2 text-sm"
                >
                  {data.roles.map((r) => (
                    <option key={r.id} value={r.code}>
                      {r.name}
                      {r.code === "SYSTEM_ADMIN"
                        ? data.canGrantSystemAdmin
                          ? " (quản trị cao nhất)"
                          : " (đang khóa)"
                        : ""}
                    </option>
                  ))}
                </select>
                {gRole === "SYSTEM_ADMIN" && (
                  <div className="rounded-lg border border-status-warning/40 bg-status-warning-bg/50 p-3 text-[11px] text-status-warning">
                    Chỉ Quản trị hệ thống hiện hữu được cấp; phạm vi bắt buộc toàn tổ chức; không thể tự cấp hoặc thu hồi admin cuối cùng.
                  </div>
                )}

                <label className="block text-xs font-semibold text-on-surface">Phạm vi</label>
                <select
                  data-testid="grant-scope"
                  value={gScope}
                  onChange={(e) => setGScope(e.target.value)}
                  disabled={gRole === "SYSTEM_ADMIN"}
                  className="w-full rounded-lg border border-border-default bg-surface-container-lowest px-3 py-2 text-sm disabled:opacity-60"
                >
                  {Object.entries(SCOPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>

                {gRole !== "SYSTEM_ADMIN" && (gScope === "DEPARTMENT" || gScope === "SUBTREE") && (
                  <>
                    <label className="block text-xs font-semibold text-on-surface">Đơn vị</label>
                    <select
                      data-testid="grant-unit"
                      value={gUnit}
                      onChange={(e) => setGUnit(e.target.value)}
                      className="w-full rounded-lg border border-border-default bg-surface-container-lowest px-3 py-2 text-sm"
                    >
                      <option value="">— Chọn đơn vị —</option>
                      {data.units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-on-surface">Hiệu lực từ</label>
                    <input
                      data-testid="grant-from"
                      type="date"
                      value={gFrom}
                      onChange={(e) => setGFrom(e.target.value)}
                      className="w-full rounded-lg border border-border-default bg-surface-container-lowest px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-on-surface">Đến (không hạn nếu để trống)</label>
                    <input
                      data-testid="grant-to"
                      type="date"
                      value={gTo}
                      onChange={(e) => setGTo(e.target.value)}
                      className="w-full rounded-lg border border-border-default bg-surface-container-lowest px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <label className="block text-xs font-semibold text-on-surface">Lý do (ghi vào nhật ký)</label>
                <input
                  data-testid="grant-reason"
                  value={gReason}
                  onChange={(e) => setGReason(e.target.value)}
                  placeholder="Ví dụ: bàn giao công tác khi đi công tác"
                  className="w-full rounded-lg border border-border-default bg-surface-container-lowest px-3 py-2 text-sm"
                />

                <button
                  type="button"
                  data-testid="grant-submit"
                  disabled={busy}
                  onClick={grant}
                  className="w-full px-4 py-2 rounded-lg text-xs font-semibold border border-status-primary bg-status-primary text-on-primary hover:bg-status-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-surface/40 focus-visible:ring-offset-1 active-press disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cấp vai trò
                </button>
                <p className="text-[11px] text-on-surface-variant">
                  Không thể cấp vai trò cao hơn vai trò của bạn, không thể tự cấp quyền cho mình, và
                  không thể cấp quyền ngoài đơn vị bạn phụ trách. Quản trị hệ thống chỉ do Quản trị
                  hệ thống hiện hữu cấp, có lý do và ghi nhật ký; không thể thu hồi admin cuối cùng.
                </p>
              </div>

              <div className="rounded-xl border border-border-subtle bg-surface-container-lowest p-4">
                <h2 className="text-sm font-bold text-on-surface mb-2">Lượt cấp quyền đang có</h2>
                <div className="space-y-2 max-h-[520px] overflow-y-auto">
                  {data.accounts.flatMap((a) =>
                    a.grants.map((g) => (
                      <div
                        key={g.id}
                        data-testid={`grant-row-${g.id}`}
                        className="flex items-start justify-between gap-2 border border-border-subtle rounded-lg p-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-on-surface">
                            {a.username} — {g.roleName}
                          </p>
                          <p className="text-[11px] text-on-surface-variant">
                            {SCOPE_LABEL[g.scopeType] || g.scopeType}
                            {g.scopeUnit ? ` · ${g.scopeUnit.name}` : ""} · {fmtDate(g.validFrom)} →{" "}
                            {g.validTo ? fmtDate(g.validTo) : "không hạn"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                              g.active
                                ? "bg-status-success-bg text-status-success border-status-success/30"
                                : "bg-surface-container text-on-surface-variant border-border-subtle"
                            }`}
                          >
                            {g.active ? "Còn hiệu lực" : "Đã hết hạn"}
                          </span>
                          {g.active && (g.roleCode !== "SYSTEM_ADMIN" || data.canGrantSystemAdmin) && (
                            <button
                              type="button"
                              data-testid={`grant-revoke-${g.id}`}
                              disabled={busy}
                              onClick={() => revoke(g)}
                              className="px-2 py-1 rounded text-[11px] font-semibold border border-status-danger/40 text-status-danger hover:bg-status-danger-bg disabled:opacity-50"
                            >
                              Thu hồi
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ---------------- E. Nhật ký ---------------- */}
          {tab === "audit" && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-on-surface">Nhật ký phân quyền</h2>
              {data.audit.length === 0 && (
                <div className="rounded-xl border border-border-subtle bg-surface-container-lowest p-4 text-xs text-on-surface-variant">
                  Chưa có thay đổi phân quyền nào được ghi nhận.
                </div>
              )}
              {data.audit.map((a) => (
                <div key={a.id} className="rounded-xl border border-border-subtle bg-surface-container-lowest p-3 text-xs">
                  <p className="font-semibold text-on-surface">
                    {a.action === "ROLE_GRANT_CREATE" ? "Cấp vai trò" : "Thu hồi vai trò"} ·{" "}
                    {fmtDate(a.timestamp)}
                  </p>
                  <p className="text-on-surface-variant mt-1">
                    Tài khoản: {(a.newData as any)?.account || "—"} · Vai trò:{" "}
                    {(a.newData as any)?.roleCode || "—"} · Phạm vi:{" "}
                    {(a.newData as any)?.scopeType || "—"}
                    {(a.newData as any)?.reason ? ` · Lý do: ${(a.newData as any).reason}` : ""}
                  </p>
                  <p className="text-on-surface-variant">Người thực hiện: {a.actorId || "—"}</p>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
