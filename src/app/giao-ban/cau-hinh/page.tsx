"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import { fmtMetric, fmtDate } from "@/lib/metric-format";
import { MetricTargetManager } from "@/components/metrics/MetricTargetManager";
import BackButton from "@/components/ui/BackButton";

type TabKey = "STRUCT" | "TARGET" | "BASELINE" | "ASSIGN" | "SECTION" | "REPORT";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "STRUCT", label: "Nhóm & chỉ tiêu", icon: "list_alt" },
  { key: "TARGET", label: "Chỉ tiêu giao", icon: "flag" },
  { key: "BASELINE", label: "Mốc lũy kế", icon: "bookmark" },
  { key: "ASSIGN", label: "Phân công nhập", icon: "person_add" },
  { key: "SECTION", label: "Mục nhận xét", icon: "notes" },
  { key: "REPORT", label: "Cấu trúc báo cáo", icon: "article" },
];

const SCALE_OPTIONS = [
  { value: 1, label: "Đơn vị gốc (đồng / USD / số lượng)" },
  { value: 1000, label: "Nghìn" },
  { value: 1000000, label: "Triệu" },
  { value: 1000000000, label: "Tỷ" },
];

const KIND_LABELS: Record<string, string> = {
  FLOW: "Phát sinh trong kỳ (cộng dồn)",
  BALANCE: "Số dư thời điểm (lấy giá trị mới nhất)",
  DERIVED: "Tự tính theo công thức",
};
const CUM_LABELS: Record<string, string> = {
  MONTH: "Lũy kế Tháng",
  QUARTER: "Lũy kế Quý",
  YEAR: "Lũy kế Năm",
  LEDGER: "Số dư liên tục (từ ngày mốc trở đi)",
};
const BLOCK_KIND_LABELS: Record<string, string> = {
  HEADING: "Tiêu đề mục",
  METRIC_GROUP: "Bảng số liệu (theo nhóm chỉ tiêu)",
  NARRATIVE: "Nội dung nhận xét",
};

export default function CauHinhSoLieuPage() {
  const { loading: permLoading, can } = usePermissions();
  const canConfigMetrics = can("metrics.config");
  const [tab, setTab] = useState<TabKey>("STRUCT");
  const [initialMetricCode, setInitialMetricCode] = useState("");
  const [cfg, setCfg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = (params.get("tab") || "").toUpperCase();
    if (TABS.some((item) => item.key === requestedTab)) {
      setTab(requestedTab as TabKey);
    }
    setInitialMetricCode(params.get("metric") || "");
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/metrics/admin")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success) setCfg(json);
        else toast.error("Không tải được cấu hình");
      })
      .catch(() => toast.error("Lỗi kết nối"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (permLoading || !canConfigMetrics) return;
    load();
  }, [permLoading, canConfigMetrics, load]);

  const post = useCallback(
    async (entity: string, action: string, data: any, successMsg: string) => {
      setBusy(`${entity}.${action}`);
      try {
        const res = await fetch("/api/metrics/admin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ entity, action, data }),
        });
        const json = await res.json();
        if (res.ok && json.success) {
          if (successMsg) toast.success(successMsg);
          load();
          return json;
        }
        toast.error(json.error || "Không thực hiện được");
        return null;
      } catch {
        toast.error("Lỗi kết nối");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [load]
  );

  // ------------------- LỊCH SỬ (YC-02) -------------------
  const [historyView, setHistoryView] = useState<{ type: "target" | "baseline"; id: string; title: string; revisions: any[] } | null>(null);
  const showHistory = useCallback(async (type: "target" | "baseline", id: string, title: string) => {
    try {
      const res = await fetch(`/api/metrics/admin?historyType=${type}&historyId=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (res.ok && json.success) setHistoryView({ type, id, title, revisions: json.revisions || [] });
      else toast.error(json.error || "Không tải được lịch sử");
    } catch {
      toast.error("Lỗi kết nối khi tải lịch sử");
    }
  }, []);

  // ------------------- STRUCT -------------------
  const [selGroupId, setSelGroupId] = useState<string>("");
  const [groupDraft, setGroupDraft] = useState<any>({});
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroup, setNewGroup] = useState<any>({ code: "", name: "", sortOrder: 0 });
  const [editMetricId, setEditMetricId] = useState<string>("");
  const [metricDraft, setMetricDraft] = useState<any>({});
  const [newMetricOpen, setNewMetricOpen] = useState(false);
  const [newMetric, setNewMetric] = useState<any>({
    code: "",
    name: "",
    unitType: "COUNT",
    unitLabel: "",
    displayScale: 1,
    decimals: 0,
    valueKind: "FLOW",
    requireConfirm: false,
    showOnDashboard: false,
    expectDaily: true,
    allowBackdateDays: 0,
    sortOrder: 0,
  });
  const [newClass, setNewClass] = useState<any>({ code: "", label: "" });

  const groups: any[] = cfg?.groups || [];
  const selGroup = groups.find((g) => g.id === selGroupId) || groups[0] || null;

  useEffect(() => {
    if (!selGroupId && groups.length > 0) setSelGroupId(groups[0].id);
  }, [groups, selGroupId]);

  useEffect(() => {
    if (selGroup) {
      setGroupDraft({
        name: selGroup.name,
        sortOrder: selGroup.sortOrder,
        active: selGroup.active,
        note: selGroup.note || "",
      });
      setEditMetricId("");
      setNewMetricOpen(false);
    }
  }, [selGroupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openMetric = (m: any) => {
    setEditMetricId(m.id);
    setMetricDraft({
      name: m.name,
      unitType: m.unitType,
      unitLabel: m.unitLabel || "",
      displayScale: m.displayScale,
      decimals: m.decimals,
      valueKind: m.valueKind,
      requireConfirm: m.requireConfirm,
      showOnDashboard: m.showOnDashboard,
      dashboardOrder: m.dashboardOrder,
      expectDaily: m.expectDaily,
      allowBackdateDays: m.allowBackdateDays,
      note: m.note || "",
      sortOrder: m.sortOrder,
      active: m.active,
      derivation: m.derivation ? { terms: [...m.derivation.terms], includeBaseline: m.derivation.includeBaseline } : { terms: [], includeBaseline: false },
    });
  };

  const allMetricsFlat: any[] = cfg?.metricsFlat || [];

  // ------------------- BASELINE -------------------
  const [selBaseMetricId, setSelBaseMetricId] = useState("");
  const [baseDraft, setBaseDraft] = useState<any>({ cumKind: "YEAR", asOfDate: "", value: "", dataSource: "REAL", sourceNote: "", reason: "", classificationId: "" });
  const [editBaseId, setEditBaseId] = useState("");

  // ------------------- ASSIGN -------------------
  const [assignDraft, setAssignDraft] = useState<any>({
    personId: "",
    scopeType: "group",
    groupId: "",
    metricId: "",
    metricIds: [], // YC-28: nhiều chỉ tiêu
    canEnter: true,
    canConfirm: false, // không tự bật "yêu cầu xác nhận" cho hàng loạt
    allowBackdateDays: "",
    validFrom: "",
    validTo: "",
  });
  const [assignConfirmOpen, setAssignConfirmOpen] = useState(false);

  // ------------------- SECTION -------------------
  const [newSection, setNewSection] = useState<any>({ code: "", title: "", groupId: "", sortOrder: 0 });
  const [editSectionId, setEditSectionId] = useState("");
  const [sectionDraft, setSectionDraft] = useState<any>({});

  // ------------------- REPORT BLOCKS -------------------
  const [newBlock, setNewBlock] = useState<any>({ code: "", kind: "HEADING", title: "", groupId: "", sectionId: "", sortOrder: 0 });
  const [editBlockId, setEditBlockId] = useState("");
  const [blockDraft, setBlockDraft] = useState<any>({});

  const metricById = useMemo(() => {
    const m = new Map<string, any>();
    for (const g of groups) for (const x of g.metrics) m.set(x.id, { ...x, groupName: g.name });
    return m;
  }, [groups]);
  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.id, g.name);
    return m;
  }, [groups]);
  const sectionTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of cfg?.sections || []) m.set(s.id, s.title);
    return m;
  }, [cfg]);

  // ------------------- ASSIGN (YC-27/YC-28) -------------------
  const assignPerson = useMemo(
    () => (cfg?.people || []).find((p: any) => p.id === assignDraft.personId) || null,
    [cfg, assignDraft.personId]
  );
  const assignedMetricIdsForPerson = useMemo(() => {
    const s = new Set<string>();
    for (const a of cfg?.assignments || []) {
      if (a.personId === assignDraft.personId && a.active && a.metricId) s.add(a.metricId);
    }
    return s;
  }, [cfg, assignDraft.personId]);

  const toggleAssignMetric = (id: string) =>
    setAssignDraft((d: any) => ({
      ...d,
      metricIds: d.metricIds.includes(id) ? d.metricIds.filter((x: string) => x !== id) : [...d.metricIds, id],
    }));
  const selectAllAssignMetrics = (ids: string[]) =>
    setAssignDraft((d: any) => ({ ...d, metricIds: Array.from(new Set([...d.metricIds, ...ids])) }));
  const clearAssignMetricsInScope = (ids: string[]) =>
    setAssignDraft((d: any) => ({ ...d, metricIds: d.metricIds.filter((x: string) => !ids.includes(x)) }));

  const submitAssignment = async () => {
    if (!assignDraft.personId) {
      toast.error("Chưa chọn người được phân công");
      return;
    }
    const common = {
      personId: assignDraft.personId,
      canEnter: assignDraft.canEnter,
      canConfirm: assignDraft.canConfirm,
      allowBackdateDays: assignDraft.allowBackdateDays === "" ? null : Number(assignDraft.allowBackdateDays),
      validFrom: assignDraft.validFrom || null,
      validTo: assignDraft.validTo || null,
    };
    if (assignDraft.scopeType === "group") {
      const r = await post("assignment", "create", { ...common, groupId: assignDraft.groupId, metricId: null }, "Đã phân công theo nhóm");
      if (r) setAssignDraft((d: any) => ({ ...d, groupId: "" }));
      return;
    }
    if (assignDraft.metricIds.length === 0) {
      toast.error("Chưa chọn chỉ tiêu nào — dùng ô tìm kiếm hoặc bộ lọc nhóm để chọn");
      return;
    }
    if (!assignConfirmOpen) {
      setAssignConfirmOpen(true);
      return;
    }
    const r = await post("assignment", "create_bulk", { ...common, metricIds: assignDraft.metricIds }, "");
    if (r) {
      const parts = [`tạo mới ${r.created}`];
      if (r.updated) parts.push(`cập nhật ${r.updated}`);
      if (r.skipped) parts.push(`bỏ qua ${r.skipped} (đã có phân công trùng)`);
      toast.success(`Đã lưu phân công ${r.total} chỉ tiêu: ${parts.join(", ")}`);
      setAssignConfirmOpen(false);
      setAssignDraft((d: any) => ({ ...d, metricIds: [] }));
    }
  };

  const selBaseMetric = metricById.get(selBaseMetricId);

  if (permLoading) {
    return (
      <div className="p-8 flex flex-col items-start gap-3">
        <BackButton href="/giao-ban" label="Tổng hợp giao ban" />
        <div className="text-body-sm text-on-surface-variant">Đang tải cấu hình…</div>
      </div>
    );
  }
  if (!canConfigMetrics) {
    return (
      <div className="p-8 flex flex-col items-center gap-3 text-center">
        <BackButton href="/giao-ban" label="Tổng hợp giao ban" />
        <span className="material-symbols-outlined text-[40px] text-on-surface-variant">lock</span>
        <p className="text-body-md text-on-surface">Chỉ người được cấp quyền cấu hình số liệu giao ban mới được truy cập.</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="p-8 flex flex-col items-start gap-3">
        <BackButton href="/giao-ban" label="Tổng hợp giao ban" />
        <div className="text-body-sm text-on-surface-variant">Đang tải cấu hình…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-surface-container-low">
      <div className="px-margin pt-space-md pb-space-sm flex flex-col gap-3">
        <BackButton href="/giao-ban" label="Tổng hợp giao ban" />
        <div>
          <h1 className="font-headline-sm text-headline-sm text-primary font-bold">Cấu hình số liệu giao ban</h1>
          <p className="text-body-sm text-on-surface-variant">
            Mọi thay đổi (chỉ tiêu, đơn vị, quy trình kiểm tra, chỉ tiêu giao, mốc lũy kế, phân công) thực hiện tại đây — không cần sửa code.
          </p>
        </div>
      </div>

      <div className="px-margin pb-3 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-label-md font-semibold whitespace-nowrap border ${
              tab === t.key ? "bg-primary text-on-primary border-primary" : "bg-surface-container-lowest text-on-surface-variant border-border-default hover:bg-surface-container"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-margin pb-space-lg flex flex-col gap-4">
        {/* ============ NHÓM & CHỈ TIÊU ============ */}
        {tab === "STRUCT" && (
          <>
            <div className="flex gap-2 flex-wrap items-center">
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelGroupId(g.id)}
                  className={`px-3 py-1.5 rounded-full text-label-sm font-semibold border ${
                    selGroup?.id === g.id ? "bg-secondary text-on-secondary border-secondary" : "bg-surface-container-lowest text-on-surface-variant border-border-default"
                  } ${!g.active ? "opacity-50" : ""}`}
                >
                  {g.name} <span className="opacity-70">({g.metrics.length})</span>
                </button>
              ))}
              <button
                onClick={() => setNewGroupOpen((v) => !v)}
                className="px-3 py-1.5 rounded-full text-label-sm font-semibold border border-dashed border-primary text-primary hover:bg-primary/5"
              >
                + Thêm nhóm
              </button>
            </div>

            {newGroupOpen && (
              <div className="bg-surface-container-lowest rounded-xl border border-border-default/50 p-4 flex flex-col gap-3">
                <span className="font-label-md text-label-md text-primary font-bold">Nhóm chỉ tiêu mới</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input placeholder="Mã nhóm (VD: THUE)" value={newGroup.code} onChange={(e) => setNewGroup({ ...newGroup, code: e.target.value.toUpperCase() })} className="px-3 py-2 rounded-lg border border-border-default text-body-sm" />
                  <input placeholder="Tên nhóm" value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} className="px-3 py-2 rounded-lg border border-border-default text-body-sm" />
                  <input type="number" placeholder="Thứ tự" value={newGroup.sortOrder} onChange={(e) => setNewGroup({ ...newGroup, sortOrder: Number(e.target.value) })} className="px-3 py-2 rounded-lg border border-border-default text-body-sm" />
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busy === "group.create"}
                    onClick={async () => {
                      const r = await post("group", "create", newGroup, "Đã tạo nhóm");
                      if (r) {
                        setNewGroupOpen(false);
                        setNewGroup({ code: "", name: "", sortOrder: 0 });
                        if (r.id) setSelGroupId(r.id);
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-primary text-on-primary text-label-sm font-semibold disabled:opacity-40"
                  >
                    Tạo nhóm
                  </button>
                  <button onClick={() => setNewGroupOpen(false)} className="px-4 py-2 rounded-lg border border-border-default text-label-sm">
                    Hủy
                  </button>
                </div>
              </div>
            )}

            {selGroup && (
              <div className="bg-surface-container-lowest rounded-xl border border-border-default/50 p-4 flex flex-col gap-3">
                <span className="font-label-md text-label-md text-primary font-bold">Thông tin nhóm: {selGroup.name}</span>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <input value={groupDraft.name || ""} onChange={(e) => setGroupDraft({ ...groupDraft, name: e.target.value })} className="px-3 py-2 rounded-lg border border-border-default text-body-sm" placeholder="Tên nhóm" />
                  <input type="number" value={groupDraft.sortOrder ?? 0} onChange={(e) => setGroupDraft({ ...groupDraft, sortOrder: Number(e.target.value) })} className="px-3 py-2 rounded-lg border border-border-default text-body-sm" placeholder="Thứ tự" />
                  <label className="flex items-center gap-2 text-body-sm px-1">
                    <input type="checkbox" checked={!!groupDraft.active} onChange={(e) => setGroupDraft({ ...groupDraft, active: e.target.checked })} />
                    Đang hoạt động
                  </label>
                  <input value={groupDraft.note || ""} onChange={(e) => setGroupDraft({ ...groupDraft, note: e.target.value })} className="px-3 py-2 rounded-lg border border-border-default text-body-sm" placeholder="Ghi chú" />
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busy === "group.update"}
                    onClick={() => post("group", "update", { id: selGroup.id, ...groupDraft }, "Đã lưu nhóm")}
                    className="px-4 py-2 rounded-lg bg-primary text-on-primary text-label-sm font-semibold disabled:opacity-40"
                  >
                    Lưu nhóm
                  </button>
                  <button
                    disabled={busy === "group.delete"}
                    onClick={() => {
                      if (window.confirm(`Xóa nhóm "${selGroup.name}"? Chỉ xóa được khi nhóm không còn chỉ tiêu.`)) {
                        post("group", "delete", { id: selGroup.id }, "Đã xóa nhóm");
                        setSelGroupId("");
                      }
                    }}
                    className="px-4 py-2 rounded-lg border border-rose-300 text-rose-700 text-label-sm font-semibold hover:bg-rose-50 disabled:opacity-40"
                  >
                    Xóa nhóm
                  </button>
                  <button onClick={() => setNewMetricOpen((v) => !v)} className="px-4 py-2 rounded-lg border border-dashed border-primary text-primary text-label-sm font-semibold hover:bg-primary/5 ml-auto">
                    + Thêm chỉ tiêu
                  </button>
                </div>

                {newMetricOpen && (
                  <div className="border border-dashed border-border-default rounded-lg p-3 flex flex-col gap-3 bg-surface-container-low/50">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <input placeholder="Mã (VD: THU_NSNN)" value={newMetric.code} onChange={(e) => setNewMetric({ ...newMetric, code: e.target.value.toUpperCase().replace(/\s+/g, "_") })} className="px-2 py-1.5 rounded border border-border-default text-body-sm" />
                      <input placeholder="Tên chỉ tiêu" value={newMetric.name} onChange={(e) => setNewMetric({ ...newMetric, name: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm col-span-2" />
                      <select value={newMetric.valueKind} onChange={(e) => setNewMetric({ ...newMetric, valueKind: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm">
                        {Object.entries(KIND_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                      <select value={newMetric.unitType} onChange={(e) => setNewMetric({ ...newMetric, unitType: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm">
                        <option value="COUNT">Số lượng</option>
                        <option value="VND">Tiền VNĐ</option>
                        <option value="USD">USD</option>
                      </select>
                      <input placeholder="Đơn vị hiển thị (VD: tờ khai)" value={newMetric.unitLabel} onChange={(e) => setNewMetric({ ...newMetric, unitLabel: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm" />
                      <select value={newMetric.displayScale} onChange={(e) => setNewMetric({ ...newMetric, displayScale: Number(e.target.value) })} className="px-2 py-1.5 rounded border border-border-default text-body-sm">
                        {SCALE_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-body-xs px-1">
                        <input type="checkbox" checked={newMetric.expectDaily} onChange={(e) => setNewMetric({ ...newMetric, expectDaily: e.target.checked })} />
                        Nhập hằng ngày
                      </label>
                      <label className="flex items-center gap-1 text-body-xs px-1">
                        <input type="checkbox" checked={newMetric.requireConfirm} onChange={(e) => setNewMetric({ ...newMetric, requireConfirm: e.target.checked })} />
                        Cần kiểm tra
                      </label>
                      <label className="flex items-center gap-1 text-body-xs px-1">
                        <input type="checkbox" checked={newMetric.showOnDashboard} onChange={(e) => setNewMetric({ ...newMetric, showOnDashboard: e.target.checked })} />
                        Hiện trên Trang chủ
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={busy === "metric.create"}
                        onClick={async () => {
                          const r = await post("metric", "create", { ...newMetric, groupId: selGroup.id }, "Đã tạo chỉ tiêu");
                          if (r) {
                            setNewMetricOpen(false);
                            setNewMetric({ ...newMetric, code: "", name: "" });
                          }
                        }}
                        className="px-4 py-2 rounded-lg bg-primary text-on-primary text-label-sm font-semibold disabled:opacity-40"
                      >
                        Tạo chỉ tiêu
                      </button>
                      <span className="text-body-xs text-on-surface-variant self-center">
                        Tạo xong có thể thêm phân loại, đổi đơn vị, công thức ở nút Sửa bên dưới.
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {selGroup.metrics.map((m: any) => (
                    <div key={m.id} className={`border rounded-lg ${m.active ? "border-border-default/50" : "border-border-default/30 opacity-60"} bg-surface-container-lowest`}>
                      <div className="px-3 py-2 flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-body-sm text-on-surface">{m.name}</span>
                        <span className="text-body-xs text-on-surface-variant">{m.code}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-default text-on-surface-variant">{m.unitLabelEffective}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-default text-on-surface-variant">{KIND_LABELS[m.valueKind]?.split(" (")[0]}</span>
                        {m.classifications.length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-700">{m.classifications.length} phân loại</span>
                        )}
                        {!m.active && <span className="text-[10px] px-1.5 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-700">Đã ẩn</span>}
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            onClick={() => post("metric", "update", { id: m.id, active: !m.active, ...keepMetricFields(m) }, m.active ? "Đã ẩn chỉ tiêu" : "Đã bật chỉ tiêu")}
                            className="px-2 py-1 rounded border border-border-default text-body-xs hover:bg-surface-container"
                            title={m.active ? "Ẩn (giữ lịch sử)" : "Bật lại"}
                          >
                            {m.active ? "Ẩn" : "Bật"}
                          </button>
                          <button onClick={() => (editMetricId === m.id ? setEditMetricId("") : openMetric(m))} className="px-2 py-1 rounded border border-primary text-primary text-body-xs font-semibold hover:bg-primary/5">
                            {editMetricId === m.id ? "Đóng" : "Sửa"}
                          </button>
                        </div>
                      </div>

                      {editMetricId === m.id && (
                        <div className="border-t border-border-default/40 p-3 flex flex-col gap-3 bg-surface-container-low/40">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <input value={metricDraft.name || ""} onChange={(e) => setMetricDraft({ ...metricDraft, name: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm col-span-2" placeholder="Tên" />
                            <select value={metricDraft.valueKind} onChange={(e) => setMetricDraft({ ...metricDraft, valueKind: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm col-span-2">
                              {Object.entries(KIND_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                            <select value={metricDraft.unitType} onChange={(e) => setMetricDraft({ ...metricDraft, unitType: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm">
                              <option value="COUNT">Số lượng</option>
                              <option value="VND">Tiền VNĐ</option>
                              <option value="USD">USD</option>
                            </select>
                            <input value={metricDraft.unitLabel || ""} onChange={(e) => setMetricDraft({ ...metricDraft, unitLabel: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm" placeholder="Đơn vị (VD: đồng, tỷ đồng, tờ khai)" />
                            <select value={metricDraft.displayScale} onChange={(e) => setMetricDraft({ ...metricDraft, displayScale: Number(e.target.value) })} className="px-2 py-1.5 rounded border border-border-default text-body-sm">
                              {SCALE_OPTIONS.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                            <input type="number" min={0} max={4} value={metricDraft.decimals ?? 0} onChange={(e) => setMetricDraft({ ...metricDraft, decimals: Number(e.target.value) })} className="px-2 py-1.5 rounded border border-border-default text-body-sm" placeholder="Số thập phân hiển thị" />
                            <input type="number" value={metricDraft.allowBackdateDays ?? 0} onChange={(e) => setMetricDraft({ ...metricDraft, allowBackdateDays: Number(e.target.value) })} className="px-2 py-1.5 rounded border border-border-default text-body-sm" placeholder="Số ngày được nhập bù (-1 = không giới hạn)" title="Số ngày được nhập bù (-1 = không giới hạn)" />
                            <input type="number" value={metricDraft.sortOrder ?? 0} onChange={(e) => setMetricDraft({ ...metricDraft, sortOrder: Number(e.target.value) })} className="px-2 py-1.5 rounded border border-border-default text-body-sm" placeholder="Thứ tự" />
                            <label className="flex items-center gap-1 text-body-xs">
                              <input type="checkbox" checked={!!metricDraft.expectDaily} onChange={(e) => setMetricDraft({ ...metricDraft, expectDaily: e.target.checked })} />
                              Nhập hằng ngày (cảnh báo thiếu)
                            </label>
                            <label className="flex items-center gap-1 text-body-xs">
                              <input type="checkbox" checked={!!metricDraft.requireConfirm} onChange={(e) => setMetricDraft({ ...metricDraft, requireConfirm: e.target.checked })} />
                              Cần kiểm tra (Nháp → Gửi → Xác nhận)
                            </label>
                            <label className="flex items-center gap-1 text-body-xs">
                              <input type="checkbox" checked={!!metricDraft.showOnDashboard} onChange={(e) => setMetricDraft({ ...metricDraft, showOnDashboard: e.target.checked })} />
                              Hiện trên Trang chủ
                            </label>
                            <input value={metricDraft.note || ""} onChange={(e) => setMetricDraft({ ...metricDraft, note: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm col-span-2" placeholder="Ghi chú / hướng dẫn nhập" />
                          </div>

                          {/* Công thức tự tính */}
                          {metricDraft.valueKind === "DERIVED" && (
                            <div className="border border-violet-200 bg-violet-50/50 rounded-lg p-2 flex flex-col gap-2">
                              <span className="text-label-sm font-semibold text-violet-800">Công thức = tổng các số hạng (+/−)</span>
                              {(metricDraft.derivation?.terms || []).map((t: any, i: number) => (
                                <div key={i} className="flex items-center gap-2">
                                  <select
                                    value={t.sign}
                                    onChange={(e) => {
                                      const terms = [...metricDraft.derivation.terms];
                                      terms[i] = { ...t, sign: Number(e.target.value) };
                                      setMetricDraft({ ...metricDraft, derivation: { ...metricDraft.derivation, terms } });
                                    }}
                                    className="px-2 py-1 rounded border border-border-default text-body-sm"
                                  >
                                    <option value={1}>+</option>
                                    <option value={-1}>−</option>
                                  </select>
                                  <select
                                    value={t.metricId}
                                    onChange={(e) => {
                                      const terms = [...metricDraft.derivation.terms];
                                      terms[i] = { ...t, metricId: e.target.value };
                                      setMetricDraft({ ...metricDraft, derivation: { ...metricDraft.derivation, terms } });
                                    }}
                                    className="flex-1 px-2 py-1 rounded border border-border-default text-body-sm"
                                  >
                                    <option value="">— chọn chỉ tiêu —</option>
                                    {allMetricsFlat
                                      .filter((x) => x.id !== m.id)
                                      .map((x) => (
                                        <option key={x.id} value={x.id}>
                                          {x.name} ({x.unitLabelEffective})
                                        </option>
                                      ))}
                                  </select>
                                  <button
                                    onClick={() => {
                                      const terms = metricDraft.derivation.terms.filter((_: any, j: number) => j !== i);
                                      setMetricDraft({ ...metricDraft, derivation: { ...metricDraft.derivation, terms } });
                                    }}
                                    className="p-1 rounded text-rose-600 hover:bg-rose-50"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                  </button>
                                </div>
                              ))}
                              <div className="flex items-center gap-3 flex-wrap">
                                <button
                                  onClick={() =>
                                    setMetricDraft({
                                      ...metricDraft,
                                      derivation: { ...metricDraft.derivation, terms: [...(metricDraft.derivation?.terms || []), { metricId: "", sign: 1 }] },
                                    })
                                  }
                                  className="px-2 py-1 rounded border border-violet-300 text-violet-800 text-body-xs font-semibold hover:bg-violet-100"
                                >
                                  + Thêm số hạng
                                </button>
                                <label className="flex items-center gap-1 text-body-xs text-violet-900">
                                  <input
                                    type="checkbox"
                                    checked={!!metricDraft.derivation?.includeBaseline}
                                    onChange={(e) => setMetricDraft({ ...metricDraft, derivation: { ...metricDraft.derivation, includeBaseline: e.target.checked } })}
                                  />
                                  Cộng thêm mốc "số dư liên tục" (nếu có) — dùng cho công nợ/còn phải thu
                                </label>
                              </div>
                            </div>
                          )}

                          {/* Phân loại */}
                          {metricDraft.valueKind !== "DERIVED" && (
                            <div className="border border-sky-200 bg-sky-50/50 rounded-lg p-2 flex flex-col gap-2">
                              <span className="text-label-sm font-semibold text-sky-800">Phân loại (VD: Ô tô, Than cốc, Hàng khác…)</span>
                              {m.classifications.map((c: any) => (
                                <div key={c.id} className="flex items-center gap-2">
                                  <input
                                    defaultValue={c.label}
                                    onBlur={(e) => {
                                      if (e.target.value !== c.label) post("classification", "update", { id: c.id, label: e.target.value }, "Đã đổi tên phân loại");
                                    }}
                                    className="flex-1 px-2 py-1 rounded border border-border-default text-body-sm"
                                  />
                                  <label className="flex items-center gap-1 text-body-xs">
                                    <input type="checkbox" defaultChecked={c.active} onChange={(e) => post("classification", "update", { id: c.id, active: e.target.checked }, e.target.checked ? "Đã bật" : "Đã ẩn")} />
                                    Hiện
                                  </label>
                                  <button onClick={() => post("classification", "delete", { id: c.id }, "Đã xóa phân loại")} className="p-1 rounded text-rose-600 hover:bg-rose-50" title="Xóa (chỉ khi chưa có số liệu)">
                                    <span className="material-symbols-outlined text-[16px]">delete</span>
                                  </button>
                                </div>
                              ))}
                              <div className="flex items-center gap-2">
                                <input value={newClass.code} onChange={(e) => setNewClass({ ...newClass, code: e.target.value.toUpperCase().replace(/\s+/g, "_") })} placeholder="Mã (VD: O_TO)" className="w-32 px-2 py-1 rounded border border-border-default text-body-sm" />
                                <input value={newClass.label} onChange={(e) => setNewClass({ ...newClass, label: e.target.value })} placeholder="Tên phân loại" className="flex-1 px-2 py-1 rounded border border-border-default text-body-sm" />
                                <button
                                  onClick={async () => {
                                    const r = await post("classification", "create", { metricId: m.id, ...newClass }, "Đã thêm phân loại");
                                    if (r) setNewClass({ code: "", label: "" });
                                  }}
                                  className="px-2 py-1 rounded border border-sky-300 text-sky-800 text-body-xs font-semibold hover:bg-sky-100"
                                >
                                  + Thêm
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              disabled={busy === "metric.update"}
                              onClick={() => post("metric", "update", { id: m.id, ...metricDraft }, "Đã lưu chỉ tiêu")}
                              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-label-sm font-semibold disabled:opacity-40"
                            >
                              Lưu chỉ tiêu
                            </button>
                            <button
                              disabled={busy === "metric.delete"}
                              onClick={() => {
                                if (window.confirm(`Xóa chỉ tiêu "${m.name}"? Chỉ xóa được khi chưa có số liệu — nếu đã có số liệu hãy dùng nút Ẩn.`)) {
                                  post("metric", "delete", { id: m.id }, "Đã xóa chỉ tiêu");
                                }
                              }}
                              className="px-4 py-2 rounded-lg border border-rose-300 text-rose-700 text-label-sm font-semibold hover:bg-rose-50 disabled:opacity-40"
                            >
                              Xóa chỉ tiêu
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ============ CHỈ TIÊU GIAO ============ */}
        {tab === "TARGET" && <MetricTargetManager groups={groups} initialMetricCode={initialMetricCode} />}


        {/* ============ MỐC LŨY KẾ ============ */}
        {tab === "BASELINE" && (
          <div className="bg-surface-container-lowest rounded-xl border border-border-default/50 p-4 flex flex-col gap-3">
            <span className="font-label-md text-label-md text-primary font-bold">Mốc lũy kế (chống cộng trùng)</span>
            <div className="bg-surface-container-low rounded-lg p-3 text-body-xs text-on-surface-variant flex flex-col gap-1">
              <span>• “Lũy kế Tháng/Quý/Năm”: giá trị đã có tính đến ngày mốc — hệ thống chỉ cộng phần phát sinh SAU ngày mốc.</span>
              <span>• Mốc chỉ áp dụng khi ngày mốc nằm trong đúng kỳ đang xem (mốc tháng chỉ dùng cho tháng đó…).</span>
              <span>• “Số dư liên tục”: dùng cho công nợ/còn phải thu — áp dụng từ ngày mốc trở đi không hết hạn.</span>
              <span>• Chỉ tiêu có phân loại thì tạo mốc cho TỪNG phân loại (ô tô, than cốc…).</span>
            </div>
            <select value={selBaseMetricId} onChange={(e) => setSelBaseMetricId(e.target.value)} className="px-3 py-2 rounded-lg border border-border-default text-body-sm">
              <option value="">— chọn chỉ tiêu —</option>
              {groups.map((g) => (
                <optgroup key={g.id} label={g.name}>
                  {g.metrics.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.unitLabelEffective})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {selBaseMetric && (
              <>
                {selBaseMetric.classifications.length > 0 && (
                  <select value={baseDraft.classificationId} onChange={(e) => setBaseDraft({ ...baseDraft, classificationId: e.target.value })} className="px-3 py-2 rounded-lg border border-border-default text-body-sm">
                    <option value="">Phân loại: (chọn phân loại bên dưới khi thêm mốc)</option>
                    {selBaseMetric.classifications.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        Đang xem: {c.label}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex flex-col gap-1">
                  {selBaseMetric.baselines.filter((b: any) => b.classificationId === (baseDraft.classificationId || "")).length === 0 && (
                    <span className="text-body-sm text-on-surface-variant italic">Chưa có mốc nào</span>
                  )}
                  {selBaseMetric.baselines
                    .filter((b: any) => b.classificationId === (baseDraft.classificationId || ""))
                    .map((b: any) => {
                      const st = b.status || "PROPOSED";
                      const stCls =
                        st === "LOCKED"
                          ? "border-violet-300 bg-violet-50 text-violet-800"
                          : st === "CONFIRMED"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-amber-300 bg-amber-50 text-amber-800";
                      return (
                        <div key={b.id} className="border border-border-default/40 rounded px-3 py-2 flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-default text-on-surface-variant font-semibold">{CUM_LABELS[b.cumKind] || b.cumKind}</span>
                            <span className="text-body-xs text-on-surface-variant">đến hết {fmtDate(b.asOfDate)}</span>
                            <span className="text-body-sm tabular-nums font-semibold text-primary">{fmtMetric(b.valueBase, selBaseMetric)}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${stCls}`}>
                              {st === "LOCKED" ? "Đã chốt" : st === "CONFIRMED" ? `Đã xác nhận${b.confirmedByName ? " · " + b.confirmedByName : ""}` : "Đề xuất"}
                            </span>
                            {b.dataSource === "DEMO" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 text-slate-600 font-semibold">DEMO</span>
                            )}
                          </div>
                          {b.sourceNote && <div className="text-body-xs text-on-surface-variant">Căn cứ: {b.sourceNote}</div>}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {st !== "LOCKED" && (
                              <button
                                onClick={() => {
                                  setEditBaseId(b.id);
                                  setBaseDraft({
                                    cumKind: b.cumKind,
                                    asOfDate: b.asOfDate,
                                    value: String(b.valueBase / (selBaseMetric.displayScale || 1)),
                                    dataSource: b.dataSource || "REAL",
                                    sourceNote: b.sourceNote || "",
                                    reason: "",
                                    classificationId: b.classificationId || "",
                                  });
                                }}
                                className="px-2 py-1 rounded border border-border-default text-body-xs font-semibold hover:bg-surface-container"
                              >
                                Sửa
                              </button>
                            )}
                            {st === "PROPOSED" && (
                              <button onClick={() => {
                                const reason = window.prompt("Lý do xác nhận mốc lũy kế (bắt buộc):");
                                if (!reason?.trim()) return;
                                post("baseline", "confirm", { id: b.id, reason }, "Đã xác nhận mốc");
                              }} className="px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-body-xs font-semibold hover:bg-emerald-100">
                                Xác nhận mốc
                              </button>
                            )}
                            {st === "CONFIRMED" && (
                              <button onClick={() => post("baseline", "lock", { id: b.id }, "Đã chốt mốc")} className="px-2 py-1 rounded border border-violet-300 bg-violet-50 text-violet-800 text-body-xs font-semibold hover:bg-violet-100">
                                Chốt mốc
                              </button>
                            )}
                            <button onClick={() => showHistory("baseline", b.id, `${CUM_LABELS[b.cumKind] || b.cumKind} đến ${fmtDate(b.asOfDate)}`)} className="px-2 py-1 rounded border border-border-default text-body-xs font-semibold hover:bg-surface-container">
                              Lịch sử
                            </button>
                            {st === "PROPOSED" && (
                              <button onClick={() => post("baseline", "delete", { id: b.id }, "Đã xóa mốc")} className="ml-auto p-1 rounded text-rose-600 hover:bg-rose-50">
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 border-t border-border-default/40 pt-3">
                  <select value={baseDraft.cumKind} onChange={(e) => setBaseDraft({ ...baseDraft, cumKind: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm">
                    {Object.entries(CUM_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <input type="date" value={baseDraft.asOfDate} onChange={(e) => setBaseDraft({ ...baseDraft, asOfDate: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm" />
                  <input value={baseDraft.value} onChange={(e) => setBaseDraft({ ...baseDraft, value: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm" placeholder={`Giá trị đến ngày mốc (${selBaseMetric.unitLabelEffective || "số"})`} />
                  <select
                    value={baseDraft.dataSource || "REAL"}
                    onChange={(e) => setBaseDraft({ ...baseDraft, dataSource: e.target.value })}
                    className="px-2 py-1.5 rounded border border-border-default text-body-sm"
                    title="Nguồn dữ liệu: REAL dùng chính thức; DEMO chỉ mô phỏng"
                  >
                    <option value="REAL">Số liệu thật</option>
                    <option value="DEMO">DEMO (mô phỏng)</option>
                  </select>
                  <input value={baseDraft.sourceNote} onChange={(e) => setBaseDraft({ ...baseDraft, sourceNote: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm" placeholder="Nguồn (VD: báo cáo tuần 41)" />
                  <input value={baseDraft.reason || ""} onChange={(e) => setBaseDraft({ ...baseDraft, reason: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm sm:col-span-2" placeholder="Lý do nhập bổ sung/điều chỉnh (bắt buộc)" />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={busy === "baseline.create" || busy === "baseline.update"}
                    onClick={async () => {
                      const ok = await post(
                        "baseline",
                        editBaseId ? "update" : "create",
                        { metricId: selBaseMetric.id, ...baseDraft, ...(editBaseId ? { id: editBaseId } : {}) },
                        editBaseId ? "Đã cập nhật mốc (cần xác nhận lại)" : "Đã tạo mốc (trạng thái Đề xuất)"
                      );
                      if (ok) {
                        setEditBaseId("");
                        setBaseDraft({ cumKind: "YEAR", asOfDate: "", value: "", dataSource: "REAL", sourceNote: "", reason: "", classificationId: baseDraft.classificationId || "" });
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-primary text-on-primary text-label-sm font-semibold disabled:opacity-40"
                  >
                    {editBaseId ? "Lưu thay đổi mốc" : "+ Tạo mốc lũy kế"}
                  </button>
                  {editBaseId && (
                    <button
                      onClick={() => {
                        setEditBaseId("");
                        setBaseDraft({ cumKind: "YEAR", asOfDate: "", value: "", dataSource: "REAL", sourceNote: "", reason: "", classificationId: baseDraft.classificationId || "" });
                      }}
                      className="px-3 py-2 rounded-lg border border-border-default text-label-sm font-semibold"
                    >
                      Hủy sửa
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ============ PHÂN CÔNG ============ */}
        {tab === "ASSIGN" && (
          <div className="bg-surface-container-lowest rounded-xl border border-border-default/50 p-4 flex flex-col gap-3">
            <span className="font-label-md text-label-md text-primary font-bold">Phân công nhập liệu / kiểm tra</span>
            <p className="text-body-xs text-on-surface-variant">
              Lãnh đạo luôn nhập và xác nhận được mọi chỉ tiêu. Cán bộ chỉ nhập/xác nhận theo phân công tại đây (theo nhóm hoặc theo từng chỉ
              tiêu, có giới hạn số ngày được nhập bù).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-body-xs text-on-surface-variant border-b border-border-default/40">
                    <th className="px-2 py-1.5">Người</th>
                    <th className="px-2 py-1.5">Phạm vi</th>
                    <th className="px-2 py-1.5 text-center">Nhập</th>
                    <th className="px-2 py-1.5 text-center">Xác nhận</th>
                    <th className="px-2 py-1.5">Nhập bù tối đa</th>
                    <th className="px-2 py-1.5">Hiệu lực</th>
                    <th className="px-2 py-1.5">Trạng thái</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {(cfg?.assignments || []).map((a: any) => (
                    <tr key={a.id} className="border-b border-border-default/20">
                      <td className="px-2 py-1.5 font-medium">{a.personName || a.personId}</td>
                      <td className="px-2 py-1.5">
                        {a.groupId ? `Nhóm: ${groupNameById.get(a.groupId) || "?"}` : `Chỉ tiêu: ${metricById.get(a.metricId)?.name || "?"}`}
                      </td>
                      <td className="px-2 py-1.5 text-center">{a.canEnter ? "✓" : ""}</td>
                      <td className="px-2 py-1.5 text-center">{a.canConfirm ? "✓" : ""}</td>
                      <td className="px-2 py-1.5">{a.allowBackdateDays === null ? "Theo chỉ tiêu" : a.allowBackdateDays === -1 ? "Không giới hạn" : `${a.allowBackdateDays} ngày`}</td>
                      <td className="px-2 py-1.5 text-body-xs">{(a.validFrom ? fmtDate(a.validFrom) : "…") + " → " + (a.validTo ? fmtDate(a.validTo) : "…")}</td>
                      <td className="px-2 py-1.5">
                        <label className="flex items-center gap-1 text-body-xs">
                          <input type="checkbox" defaultChecked={a.active} onChange={(e) => post("assignment", "update", { ...assignmentPayload(a), id: a.id, active: e.target.checked }, e.target.checked ? "Đã bật" : "Đã tạm dừng")} />
                          {a.active ? "Đang áp dụng" : "Tạm dừng"}
                        </label>
                      </td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => post("assignment", "delete", { id: a.id }, "Đã xóa phân công")} className="p-1 rounded text-rose-600 hover:bg-rose-50">
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(cfg?.assignments || []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-2 py-3 text-center text-on-surface-variant italic">
                        Chưa có phân công nào
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-border-default/40 pt-3 flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <PersonPicker
                  people={cfg?.people || []}
                  value={assignDraft.personId}
                  onChange={(personId) => {
                    setAssignDraft((d: any) => ({ ...d, personId }));
                    setAssignConfirmOpen(false);
                  }}
                />
                <select
                  value={assignDraft.scopeType}
                  onChange={(e) => {
                    setAssignDraft((d: any) => ({ ...d, scopeType: e.target.value }));
                    setAssignConfirmOpen(false);
                  }}
                  className="px-2 py-1.5 rounded border border-border-default text-body-sm"
                  data-testid="assign-scope-select"
                >
                  <option value="group">Phân công theo nhóm (1 nhóm)</option>
                  <option value="metric">Phân công theo chỉ tiêu (chọn nhiều)</option>
                </select>
              </div>

              {assignDraft.scopeType === "group" ? (
                <select
                  value={assignDraft.groupId}
                  onChange={(e) => setAssignDraft((d: any) => ({ ...d, groupId: e.target.value }))}
                  className="px-2 py-1.5 rounded border border-border-default text-body-sm"
                >
                  <option value="">— chọn nhóm —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              ) : (
                <MetricMultiPicker
                  groups={groups}
                  selected={assignDraft.metricIds}
                  onToggle={toggleAssignMetric}
                  onSelectAll={selectAllAssignMetrics}
                  onClearInScope={clearAssignMetricsInScope}
                  alreadyAssigned={assignedMetricIdsForPerson}
                />
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="flex items-center gap-3 text-body-xs col-span-2">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={assignDraft.canEnter} onChange={(e) => setAssignDraft((d: any) => ({ ...d, canEnter: e.target.checked }))} />
                    Được nhập
                  </label>
                  <label className="flex items-center gap-1" title="Không tự bật cho hàng loạt — chỉ tích khi thật sự cần quyền xác nhận">
                    <input type="checkbox" checked={assignDraft.canConfirm} onChange={(e) => setAssignDraft((d: any) => ({ ...d, canConfirm: e.target.checked }))} />
                    Được xác nhận
                  </label>
                </div>
                <input value={assignDraft.allowBackdateDays} onChange={(e) => setAssignDraft((d: any) => ({ ...d, allowBackdateDays: e.target.value }))} className="px-2 py-1.5 rounded border border-border-default text-body-sm" placeholder="Nhập bù tối đa (ngày, để trống = theo chỉ tiêu)" />
                <input type="date" value={assignDraft.validFrom} onChange={(e) => setAssignDraft((d: any) => ({ ...d, validFrom: e.target.value }))} className="px-2 py-1.5 rounded border border-border-default text-body-sm" title="Hiệu lực từ ngày" />
                <input type="date" value={assignDraft.validTo} onChange={(e) => setAssignDraft((d: any) => ({ ...d, validTo: e.target.value }))} className="px-2 py-1.5 rounded border border-border-default text-body-sm" title="Hiệu lực đến ngày" />
                <button
                  disabled={busy === "assignment.create" || busy === "assignment.create_bulk"}
                  onClick={submitAssignment}
                  className="px-4 py-2 rounded-lg bg-primary text-on-primary text-label-sm font-semibold disabled:opacity-40"
                  data-testid="assign-submit"
                >
                  + Phân công
                </button>
              </div>

              {assignConfirmOpen && assignDraft.scopeType === "metric" && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-body-sm" data-testid="assign-confirm-bar">
                  <span>
                    Xác nhận lưu phân công <b>{assignDraft.metricIds.length}</b> chỉ tiêu cho{" "}
                    <b>{assignPerson ? `${assignPerson.code} — ${assignPerson.fullName}` : "?"}</b>?
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={submitAssignment}
                      disabled={busy === "assignment.create_bulk"}
                      className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold disabled:opacity-40"
                      data-testid="assign-confirm-save"
                    >
                      {busy === "assignment.create_bulk" ? "Đang lưu…" : "Lưu phân công"}
                    </button>
                    <button onClick={() => setAssignConfirmOpen(false)} className="px-3 py-1.5 rounded-lg border border-border-default text-label-sm">
                      Hủy
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ MỤC NHẬN XÉT ============ */}
        {tab === "SECTION" && (
          <div className="bg-surface-container-lowest rounded-xl border border-border-default/50 p-4 flex flex-col gap-3">
            <span className="font-label-md text-label-md text-primary font-bold">Mục nhận xét theo kỳ (II, III.1–4, IV…)</span>
            <p className="text-body-xs text-on-surface-variant">
              Mục có gắn nhóm chỉ tiêu: người được phân công nhập của nhóm đó cũng sửa được nội dung. Mục không gắn nhóm: chỉ lãnh đạo sửa.
            </p>
            <div className="flex flex-col gap-1">
              {(cfg?.sections || []).map((s: any) => (
                <div key={s.id} className="border border-border-default/40 rounded px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {editSectionId === s.id ? (
                      <>
                        <input value={sectionDraft.title || ""} onChange={(e) => setSectionDraft({ ...sectionDraft, title: e.target.value })} className="flex-1 px-2 py-1 rounded border border-border-default text-body-sm" />
                        <select value={sectionDraft.groupId || ""} onChange={(e) => setSectionDraft({ ...sectionDraft, groupId: e.target.value })} className="px-2 py-1 rounded border border-border-default text-body-sm">
                          <option value="">Không gắn nhóm</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                        <input type="number" value={sectionDraft.sortOrder ?? 0} onChange={(e) => setSectionDraft({ ...sectionDraft, sortOrder: Number(e.target.value) })} className="w-20 px-2 py-1 rounded border border-border-default text-body-sm" />
                        <button
                          onClick={async () => {
                            const r = await post("section", "update", { id: s.id, ...sectionDraft }, "Đã lưu mục");
                            if (r) setEditSectionId("");
                          }}
                          className="px-2 py-1 rounded bg-primary text-on-primary text-body-xs font-semibold"
                        >
                          Lưu
                        </button>
                        <button onClick={() => setEditSectionId("")} className="px-2 py-1 rounded border border-border-default text-body-xs">
                          Hủy
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-body-sm">{s.title}</span>
                        <span className="text-body-xs text-on-surface-variant">{s.code}</span>
                        {s.groupId && <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-700">Nhóm: {groupNameById.get(s.groupId)}</span>}
                        {!s.active && <span className="text-[10px] px-1.5 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-700">Đã ẩn</span>}
                        <div className="ml-auto flex gap-1">
                          <button
                            onClick={() => {
                              setEditSectionId(s.id);
                              setSectionDraft({ title: s.title, groupId: s.groupId || "", sortOrder: s.sortOrder });
                            }}
                            className="px-2 py-1 rounded border border-primary text-primary text-body-xs font-semibold"
                          >
                            Sửa
                          </button>
                          <button onClick={() => post("section", "update", { id: s.id, active: !s.active }, s.active ? "Đã ẩn" : "Đã bật")} className="px-2 py-1 rounded border border-border-default text-body-xs">
                            {s.active ? "Ẩn" : "Bật"}
                          </button>
                          <button onClick={() => post("section", "delete", { id: s.id }, "Đã xóa mục")} className="p-1 rounded text-rose-600 hover:bg-rose-50">
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border-default/40 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input placeholder="Mã (VD: KSBL_II)" value={newSection.code} onChange={(e) => setNewSection({ ...newSection, code: e.target.value.toUpperCase().replace(/\s+/g, "_") })} className="px-2 py-1.5 rounded border border-border-default text-body-sm" />
              <input placeholder="Tiêu đề mục" value={newSection.title} onChange={(e) => setNewSection({ ...newSection, title: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm col-span-2" />
              <select value={newSection.groupId} onChange={(e) => setNewSection({ ...newSection, groupId: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm">
                <option value="">Không gắn nhóm</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button
                disabled={busy === "section.create"}
                onClick={async () => {
                  const r = await post("section", "create", newSection, "Đã thêm mục nhận xét");
                  if (r) setNewSection({ code: "", title: "", groupId: "", sortOrder: 0 });
                }}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary text-label-sm font-semibold disabled:opacity-40"
              >
                + Thêm mục
              </button>
            </div>
          </div>
        )}

        {tab === "REPORT" && (
          <div className="bg-surface-container-lowest rounded-xl border border-border-default/50 p-4 flex flex-col gap-3">
            <span className="font-label-md text-label-md text-primary font-bold">Cấu trúc báo cáo giao ban (bản xem trước & file Word)</span>
            <p className="text-body-xs text-on-surface-variant">
              Các khối hiển thị theo thứ tự tăng dần. “Bảng số liệu” tự tổng hợp theo nhóm chỉ tiêu; “Nội dung nhận xét” lấy văn bản theo kỳ đã nhập;
              “Tiêu đề mục” chỉ là dòng tiêu đề (VD: I. CÔNG TÁC NGHIỆP VỤ HẢI QUAN). Sửa tại đây — không cần sửa code.
            </p>
            <div className="flex flex-col gap-1">
              {(cfg?.reportBlocks || []).map((b: any) => (
                <div key={b.id} className="border border-border-default/40 rounded px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {editBlockId === b.id ? (
                      <>
                        <select value={blockDraft.kind} onChange={(e) => setBlockDraft({ ...blockDraft, kind: e.target.value })} className="px-2 py-1 rounded border border-border-default text-body-sm">
                          {Object.entries(BLOCK_KIND_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <input
                          value={blockDraft.title || ""}
                          onChange={(e) => setBlockDraft({ ...blockDraft, title: e.target.value })}
                          placeholder="Tiêu đề (để trống nếu không cần dòng tiêu đề)"
                          className="flex-1 min-w-[200px] px-2 py-1 rounded border border-border-default text-body-sm"
                        />
                        {blockDraft.kind === "METRIC_GROUP" && (
                          <select value={blockDraft.groupId || ""} onChange={(e) => setBlockDraft({ ...blockDraft, groupId: e.target.value })} className="px-2 py-1 rounded border border-border-default text-body-sm">
                            <option value="">— Chọn nhóm chỉ tiêu —</option>
                            {groups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {blockDraft.kind === "NARRATIVE" && (
                          <select value={blockDraft.sectionId || ""} onChange={(e) => setBlockDraft({ ...blockDraft, sectionId: e.target.value })} className="px-2 py-1 rounded border border-border-default text-body-sm">
                            <option value="">— Chọn mục nội dung —</option>
                            {(cfg?.sections || []).map((s: any) => (
                              <option key={s.id} value={s.id}>
                                {s.title}
                              </option>
                            ))}
                          </select>
                        )}
                        <input
                          type="number"
                          value={blockDraft.sortOrder ?? 0}
                          onChange={(e) => setBlockDraft({ ...blockDraft, sortOrder: Number(e.target.value) })}
                          className="w-20 px-2 py-1 rounded border border-border-default text-body-sm"
                          title="Thứ tự hiển thị"
                        />
                        <button
                          onClick={async () => {
                            const r = await post("report_block", "update", { id: b.id, ...blockDraft }, "Đã lưu khối");
                            if (r) setEditBlockId("");
                          }}
                          className="px-2 py-1 rounded bg-primary text-on-primary text-body-xs font-semibold"
                        >
                          Lưu
                        </button>
                        <button onClick={() => setEditBlockId("")} className="px-2 py-1 rounded border border-border-default text-body-xs">
                          Hủy
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-default bg-surface-container-low text-on-surface-variant">
                          {BLOCK_KIND_LABELS[b.kind] || b.kind}
                        </span>
                        <span className="font-medium text-body-sm">{b.title || "(không có dòng tiêu đề)"}</span>
                        {b.groupId && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-700">Nhóm: {groupNameById.get(b.groupId) || "?"}</span>
                        )}
                        {b.sectionId && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700">
                            Mục: {sectionTitleById.get(b.sectionId) || "?"}
                          </span>
                        )}
                        {!b.active && <span className="text-[10px] px-1.5 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-700">Đã ẩn</span>}
                        <span className="text-body-xs text-on-surface-variant">Thứ tự: {b.sortOrder}</span>
                        <span className="text-body-xs text-on-surface-variant">· {b.code}</span>
                        <div className="ml-auto flex gap-1">
                          <button
                            onClick={() => {
                              setEditBlockId(b.id);
                              setBlockDraft({
                                title: b.title,
                                kind: b.kind,
                                groupId: b.groupId || "",
                                sectionId: b.sectionId || "",
                                sortOrder: b.sortOrder,
                              });
                            }}
                            className="px-2 py-1 rounded border border-primary text-primary text-body-xs font-semibold"
                          >
                            Sửa
                          </button>
                          <button onClick={() => post("report_block", "update", { id: b.id, active: !b.active }, b.active ? "Đã ẩn khối" : "Đã bật khối")} className="px-2 py-1 rounded border border-border-default text-body-xs">
                            {b.active ? "Ẩn" : "Bật"}
                          </button>
                          <button onClick={() => post("report_block", "delete", { id: b.id }, "Đã xóa khối")} className="p-1 rounded text-rose-600 hover:bg-rose-50">
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border-default/40 pt-3 grid grid-cols-2 sm:grid-cols-6 gap-2">
              <input
                placeholder="Mã (VD: KB_MOI)"
                value={newBlock.code}
                onChange={(e) => setNewBlock({ ...newBlock, code: e.target.value.toUpperCase().replace(/\s+/g, "_") })}
                className="px-2 py-1.5 rounded border border-border-default text-body-sm"
              />
              <select value={newBlock.kind} onChange={(e) => setNewBlock({ ...newBlock, kind: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm">
                {Object.entries(BLOCK_KIND_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input
                placeholder="Tiêu đề hiển thị trong báo cáo"
                value={newBlock.title}
                onChange={(e) => setNewBlock({ ...newBlock, title: e.target.value })}
                className="px-2 py-1.5 rounded border border-border-default text-body-sm col-span-2"
              />
              {newBlock.kind === "METRIC_GROUP" && (
                <select value={newBlock.groupId} onChange={(e) => setNewBlock({ ...newBlock, groupId: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm">
                  <option value="">— Chọn nhóm —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              )}
              {newBlock.kind === "NARRATIVE" && (
                <select value={newBlock.sectionId} onChange={(e) => setNewBlock({ ...newBlock, sectionId: e.target.value })} className="px-2 py-1.5 rounded border border-border-default text-body-sm">
                  <option value="">— Chọn mục —</option>
                  {(cfg?.sections || []).map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              )}
              {newBlock.kind === "HEADING" && <div className="hidden sm:block" />}
              <input
                type="number"
                placeholder="Thứ tự"
                value={newBlock.sortOrder}
                onChange={(e) => setNewBlock({ ...newBlock, sortOrder: Number(e.target.value) })}
                className="w-full px-2 py-1.5 rounded border border-border-default text-body-sm"
                title="Thứ tự hiển thị"
              />
              <button
                disabled={busy === "report_block.create"}
                onClick={async () => {
                  const r = await post("report_block", "create", newBlock, "Đã thêm khối báo cáo");
                  if (r) setNewBlock({ code: "", kind: "HEADING", title: "", groupId: "", sectionId: "", sortOrder: 0 });
                }}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary text-label-sm font-semibold disabled:opacity-40 col-span-2 sm:col-span-1"
              >
                + Thêm khối
              </button>
            </div>
          </div>
        )}
      </div>

      {/* YC-02 — lịch sử thay đổi chỉ tiêu giao / mốc lũy kế */}
      {historyView && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setHistoryView(null)}>
          <div
            className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
            data-testid="metric-history-modal"
          >
            <div className="px-4 py-3 border-b border-border-default/40 flex items-center gap-2 sticky top-0 bg-surface-container-lowest">
              <span className="material-symbols-outlined text-[18px] text-primary">history</span>
              <span className="font-semibold text-on-surface">Lịch sử: {historyView.title}</span>
              <button onClick={() => setHistoryView(null)} className="ml-auto p-1 rounded hover:bg-surface-container" aria-label="Đóng">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="p-4 overflow-x-auto">
              {historyView.revisions.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant italic">Chưa có lịch sử thay đổi.</p>
              ) : (
                <table className="w-full text-body-sm min-w-[640px] border-collapse">
                  <thead>
                    <tr className="text-body-xs text-on-surface-variant border-b border-border-default/40 text-left">
                      <th className="px-2 py-1.5">Thao tác</th>
                      <th className="px-2 py-1.5">Giá trị cũ → mới</th>
                      <th className="px-2 py-1.5">Trạng thái</th>
                      <th className="px-2 py-1.5">Căn cứ cũ → mới</th>
                      <th className="px-2 py-1.5">Người/thời điểm</th>
                      <th className="px-2 py-1.5">Lý do</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyView.revisions.map((r: any) => (
                      <tr key={r.id} className="border-b border-border-default/20 align-top">
                        <td className="px-2 py-1.5 font-semibold">{r.action}</td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {r.oldValue === null ? "—" : r.oldValue.toLocaleString("vi-VN")} →{" "}
                          {r.newValue === null ? "—" : r.newValue.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-2 py-1.5 text-body-xs">
                          {r.oldStatus || "—"} → {r.newStatus || "—"}
                        </td>
                        <td className="px-2 py-1.5 text-body-xs">
                          {r.oldSourceNote || "—"} → {r.newSourceNote || "—"}
                        </td>
                        <td className="px-2 py-1.5 text-body-xs">
                          {r.editedByName || "—"}
                          <span className="block text-on-surface-variant">{new Date(r.editedAt).toLocaleString("vi-VN")}</span>
                        </td>
                        <td className="px-2 py-1.5 text-body-xs">{r.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Giữ nguyên các trường bắt buộc khi chỉ thay đổi trạng thái ẩn/bật của chỉ tiêu. */
function keepMetricFields(m: any) {
  return {
    name: m.name,
    unitType: m.unitType,
    unitLabel: m.unitLabel,
    displayScale: m.displayScale,
    decimals: m.decimals,
    valueKind: m.valueKind,
    derivation: m.derivation,
    requireConfirm: m.requireConfirm,
    showOnDashboard: m.showOnDashboard,
    dashboardOrder: m.dashboardOrder,
    allowBackdateDays: m.allowBackdateDays,
    expectDaily: m.expectDaily,
    note: m.note,
    sortOrder: m.sortOrder,
  };
}

/** Payload đầy đủ để cập nhật một phân công đang có. */
function assignmentPayload(a: any) {
  return {
    personId: a.personId,
    groupId: a.groupId,
    metricId: a.metricId,
    canEnter: a.canEnter,
    canConfirm: a.canConfirm,
    allowBackdateDays: a.allowBackdateDays,
    validFrom: a.validFrom,
    validTo: a.validTo,
  };
}

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu. */
function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

/**
 * YC-27 — Ô chọn người có TÌM KIẾM theo mã hoặc tên (trước đây là <select> thường
 * nên gõ "CB-014" không ra vì nhãn bắt đầu bằng họ tên). Hiển thị kèm bộ phận và
 * cảnh báo "chưa có tài khoản".
 */
function PersonPicker({ people, value, onChange }: { people: any[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = people.find((p) => p.id === value) || null;

  const filtered = useMemo(() => {
    const nq = normalizeSearch(q.trim());
    const list = !nq ? people : people.filter((p) => normalizeSearch(`${p.code} ${p.fullName} ${p.unitName || ""}`).includes(nq));
    return list.slice(0, 80);
  }, [people, q]);

  return (
    <div className="relative" data-testid="assign-person-picker">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-2 py-1.5 rounded border border-border-default text-body-sm text-left flex items-center justify-between gap-2 bg-surface-container-lowest"
        data-testid="assign-person-button"
      >
        <span className={selected ? "" : "text-on-surface-variant"}>
          {selected ? `${selected.code} — ${selected.fullName}${selected.unitName ? ` (${selected.unitName})` : ""}` : "— chọn người —"}
        </span>
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">expand_more</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-surface-container-lowest border border-border-default rounded-lg shadow-lg p-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo mã hoặc tên (VD: CB-014)"
            className="w-full px-2 py-1.5 rounded border border-border-default text-body-sm mb-1"
            data-testid="assign-person-search"
          />
          <div className="max-h-56 overflow-y-auto flex flex-col">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                  setQ("");
                }}
                className={`text-left px-2 py-1.5 rounded text-body-sm hover:bg-surface-container flex items-center gap-1.5 ${
                  p.id === value ? "bg-secondary/10" : ""
                }`}
                data-testid={`assign-person-option-${p.code}`}
              >
                <span className="font-medium">{p.code}</span>
                <span>— {p.fullName}</span>
                {p.unitName ? <span className="text-body-xs text-on-surface-variant">· {p.unitName}</span> : null}
                {p.accountStatus !== "ACTIVE" ? (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 font-semibold">
                    chưa có tài khoản
                  </span>
                ) : null}
              </button>
            ))}
            {filtered.length === 0 && (
              <span className="text-body-xs text-on-surface-variant px-2 py-1.5 italic">
                Không tìm thấy — thử tìm theo mã cán bộ (VD: CB-014)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * YC-28 — Bộ chọn NHIỀU chỉ tiêu bằng checkbox: tìm theo tên/mã, lọc theo nhóm,
 * chọn tất cả trong phạm vi đang lọc, bỏ chọn trong phạm vi đang lọc, đếm số đã chọn.
 * Không mặc định chọn sẵn bất kỳ chỉ tiêu nào.
 */
function MetricMultiPicker({
  groups,
  selected,
  onToggle,
  onSelectAll,
  onClearInScope,
  alreadyAssigned,
}: {
  groups: any[];
  selected: string[];
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearInScope: (ids: string[]) => void;
  alreadyAssigned: Set<string>;
}) {
  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState("__all");

  const visibleGroups = useMemo(() => {
    const nq = normalizeSearch(q.trim());
    return groups
      .filter((g) => groupId === "__all" || g.id === groupId)
      .map((g) => ({
        ...g,
        metrics: (g.metrics || []).filter((m: any) => !nq || normalizeSearch(`${m.code} ${m.name}`).includes(nq)),
      }))
      .filter((g) => g.metrics.length > 0);
  }, [groups, q, groupId]);

  const visibleIds = useMemo(() => visibleGroups.flatMap((g) => g.metrics.map((m: any) => m.id)), [visibleGroups]);
  const selSet = useMemo(() => new Set(selected), [selected]);

  return (
    <div className="border border-border-default rounded-lg p-2 flex flex-col gap-2" data-testid="assign-metric-picker">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm chỉ tiêu theo tên hoặc mã…"
          className="flex-1 min-w-[180px] px-2 py-1.5 rounded border border-border-default text-body-sm"
          data-testid="assign-metric-search"
        />
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="px-2 py-1.5 rounded border border-border-default text-body-sm">
          <option value="__all">Tất cả nhóm</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onSelectAll(visibleIds)}
          className="px-2 py-1.5 rounded border border-primary text-primary text-body-xs font-semibold hover:bg-primary/5"
          data-testid="assign-select-all"
        >
          Chọn tất cả đang lọc ({visibleIds.length})
        </button>
        <button
          type="button"
          onClick={() => onClearInScope(visibleIds)}
          className="px-2 py-1.5 rounded border border-border-default text-body-xs font-semibold hover:bg-surface-container"
          data-testid="assign-clear-scope"
        >
          Bỏ chọn trong phạm vi lọc
        </button>
      </div>
      <div className="text-body-xs text-on-surface-variant">
        Đã chọn <b className="text-primary" data-testid="assign-selected-count">{selected.length}</b> chỉ tiêu.
      </div>
      <div className="max-h-64 overflow-y-auto flex flex-col gap-0.5" data-testid="assign-metric-list">
        {visibleGroups.map((g) => (
          <div key={g.id}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-primary px-1 pt-1.5">{g.name}</div>
            {g.metrics.map((m: any) => (
              <label key={m.id} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-surface-container text-body-sm cursor-pointer">
                <input type="checkbox" checked={selSet.has(m.id)} onChange={() => onToggle(m.id)} data-testid={`assign-metric-${m.code}`} />
                <span className="text-on-surface-variant text-body-xs w-[110px] shrink-0">{m.code}</span>
                <span>{m.name}</span>
                {!m.active && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-700 font-semibold">đã ẩn</span>
                )}
                {alreadyAssigned.has(m.id) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-700 font-semibold">đã có phân công</span>
                )}
              </label>
            ))}
          </div>
        ))}
        {visibleIds.length === 0 && <span className="text-body-xs text-on-surface-variant italic px-1 py-1.5">Không có chỉ tiêu phù hợp bộ lọc.</span>}
      </div>
    </div>
  );
}
