"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  History,
  Link2,
  Loader2,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

interface CatalogEntry {
  id: string;
  code: string;
  department: string;
  departmentOrder: number;
  groupCode: string;
  title: string;
  convertFactor: number | null;
  sortOrder: number;
  sourceRow: number;
  status: string;
}

interface CatalogVersion {
  id: string;
  code: string;
  title: string;
  status: string;
  entryCount: number;
  sourceFileName: string | null;
  sourceSheet: string | null;
  note: string | null;
  selectionMode?: "MAPPED" | "ALL";
  importedAt: string;
  importedBy: { id: string; fullName: string; code: string } | null;
  activeEntries?: number;
  inactiveEntries?: number;
}

interface DepartmentSummary {
  name: string;
  order: number;
  count: number;
}

interface DepartmentMappingRow {
  department: string;
  departmentOrder: number;
  entryCount: number;
  activeEntryCount: number;
  unitId: string | null;
  unitCode: string | null;
  unitName: string | null;
  isActive: boolean;
}

interface OrgUnitOption {
  id: string;
  code: string;
  name: string;
  level: number;
}

interface ImportReport {
  sheetName: string;
  totalRowsScanned: number;
  totalEntries: number;
  departments: DepartmentSummary[];
  errors: Array<{ row: number; message: string }>;
  duplicates: Array<{ department: string; title: string; rows: number[] }>;
  crossDepartmentDuplicates: Array<{ title: string; departments: string[] }>;
  newEntries: Array<{ department: string; title: string }>;
  removedEntries: Array<{ department: string; title: string; status: string }>;
  unchangedCount: number;
  unchangedHash: boolean;
  activeVersion: { id: string; code: string; entryCount: number; importedAt: string } | null;
  importHash: string;
}

interface Props {
  canManage: boolean;
  showToast: (type: "success" | "error", text: string) => void;
}

export default function WorkCatalogTab({ canManage, showToast }: Props) {
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<CatalogVersion[]>([]);
  const [activeVersion, setActiveVersion] = useState<CatalogVersion | null>(null);
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [mappingRows, setMappingRows] = useState<DepartmentMappingRow[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitOption[]>([]);
  const [mappingDrafts, setMappingDrafts] = useState<
    Record<string, { unitId: string; isActive: boolean }>
  >({});
  const [savingDept, setSavingDept] = useState<string | null>(null);

  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [searchQuery, setSearchQuery] = useState("");

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [canImport, setCanImport] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [savingSelectionMode, setSavingSelectionMode] = useState(false);
  const [factorDrafts, setFactorDrafts] = useState<Record<string, string>>({});
  const [savingFactorId, setSavingFactorId] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [resCatalog, resVersions, resMappings] = await Promise.all([
        fetch("/api/work-catalog?includeInactive=1", { cache: "no-store" }),
        fetch("/api/work-catalog/versions", { cache: "no-store" }),
        fetch("/api/work-catalog/mappings", { cache: "no-store" }),
      ]);
      const catalogJson = await resCatalog.json();
      const versionsJson = await resVersions.json();
      const mappingJson = await resMappings.json();
      if (!resCatalog.ok) throw new Error(catalogJson.error || "Không tải được danh mục TX");
      if (!resVersions.ok) throw new Error(versionsJson.error || "Không tải được lịch sử phiên bản");
      if (!resMappings.ok) throw new Error(mappingJson.error || "Không tải được bảng ánh xạ bộ phận");

      const data = catalogJson.data || {};
      const versionFromApi = data.version || null;
      setActiveVersion(
        versionFromApi
          ? {
              ...versionFromApi,
              selectionMode:
                (versionsJson.data || []).find((v: any) => v.id === versionFromApi.id)
                  ?.selectionMode || "MAPPED",
            }
          : null
      );
      setEntries(data.entries || []);
      setDepartments(data.departments || []);
      setVersions(versionsJson.data || []);

      const mappingData = mappingJson.data || {};
      const rows: DepartmentMappingRow[] = mappingData.departments || [];
      setMappingRows(rows);
      setOrgUnits(mappingData.units || []);
      setMappingDrafts(
        Object.fromEntries(
          rows.map((r) => [r.department, { unitId: r.unitId || "", isActive: r.isActive }])
        )
      );
    } catch (err: any) {
      showToast("error", err.message || "Không tải được danh mục TX");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((e) => {
      if (departmentFilter !== "ALL" && e.department !== departmentFilter) return false;
      if (statusFilter !== "ALL" && e.status !== statusFilter) return false;
      if (!q) return true;
      return e.title.toLowerCase().includes(q) || e.code.toLowerCase().includes(q);
    });
  }, [entries, departmentFilter, statusFilter, searchQuery]);

  const resetImport = () => {
    setFile(null);
    setNote("");
    setReport(null);
    setCanImport(false);
    setImportError(null);
  };

  const runPreview = async () => {
    if (!file) {
      setImportError("Vui lòng chọn tệp Excel (.xlsx)");
      return;
    }
    setPreviewing(true);
    setImportError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("dryRun", "true");
      if (note.trim()) form.append("note", note.trim());
      const res = await fetch("/api/work-catalog/import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không đọc được tệp");
      setReport(json.report);
      setCanImport(!!json.canImport);
      if (json.canImport) {
        showToast("success", "Đọc tệp thành công — kiểm tra báo cáo rồi xác nhận nhập");
      } else {
        showToast("error", json.message || "Tệp chưa đủ điều kiện để nhập");
      }
    } catch (err: any) {
      setImportError(err.message || "Không đọc được tệp Excel");
    } finally {
      setPreviewing(false);
    }
  };

  const runCommit = async () => {
    if (!file || !report) return;
    setCommitting(true);
    setImportError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("dryRun", "false");
      form.append("importHash", report.importHash);
      if (note.trim()) form.append("note", note.trim());
      const res = await fetch("/api/work-catalog/import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không nhập được danh mục");
      showToast("success", json.message || "Đã nhập danh mục TX");
      setIsImportOpen(false);
      resetImport();
      await fetchAll();
    } catch (err: any) {
      setImportError(err.message || "Không nhập được danh mục");
    } finally {
      setCommitting(false);
    }
  };

  const toggleEntry = async (entry: CatalogEntry) => {
    if (!canManage) return;
    setTogglingId(entry.id);
    try {
      const next = entry.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      const res = await fetch(`/api/work-catalog/entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không cập nhật được đầu việc");
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status: next } : e))
      );
      showToast("success", next === "ACTIVE" ? "Đã bật lại đầu việc" : "Đã ngừng sử dụng đầu việc");
    } catch (err: any) {
      showToast("error", err.message || "Không cập nhật được đầu việc");
    } finally {
      setTogglingId(null);
    }
  };

  const saveFactor = async (entry: CatalogEntry) => {
    if (!canManage) return;
    const raw = (factorDrafts[entry.id] ?? (entry.convertFactor ?? "")).toString().trim();
    const current = entry.convertFactor === null || entry.convertFactor === undefined
      ? ""
      : String(entry.convertFactor);
    if (raw === current) return; // không đổi

    const payload = raw === "" ? { convertFactor: null } : { convertFactor: Number(raw) };
    if (raw !== "" && !Number.isFinite(Number(raw))) {
      showToast("error", "Hệ số quy đổi phải là số");
      return;
    }

    setSavingFactorId(entry.id);
    try {
      const res = await fetch(`/api/work-catalog/entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không lưu được hệ số quy đổi");
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? { ...e, convertFactor: json.data?.convertFactor ?? e.convertFactor }
            : e
        )
      );
      setFactorDrafts((prev) => {
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });
      showToast("success", `Đã cập nhật hệ số cho ${entry.code}`);
    } catch (err: any) {
      showToast("error", err.message || "Không lưu được hệ số quy đổi");
    } finally {
      setSavingFactorId(null);
    }
  };

  const toggleSelectionMode = async () => {
    if (!canManage || !activeVersion) return;
    const next = activeVersion.selectionMode === "ALL" ? "MAPPED" : "ALL";
    setSavingSelectionMode(true);
    try {
      const res = await fetch("/api/work-catalog/versions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: activeVersion.id, selectionMode: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không đổi được phạm vi chọn đầu việc");
      showToast("success", json.message || "Đã cập nhật phạm vi chọn đầu việc");
      await fetchAll();
    } catch (err: any) {
      showToast("error", err.message || "Không đổi được phạm vi chọn đầu việc");
    } finally {
      setSavingSelectionMode(false);
    }
  };

  const saveMapping = async (row: DepartmentMappingRow) => {
    if (!canManage) return;
    const draft = mappingDrafts[row.department];
    if (!draft) return;
    if (draft.isActive && !draft.unitId) {
      showToast("error", "Phải chọn bộ phận thật trong org_units trước khi kích hoạt nhóm TX");
      return;
    }
    setSavingDept(row.department);
    try {
      const res = await fetch("/api/work-catalog/mappings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department: row.department,
          unitId: draft.unitId || null,
          isActive: draft.isActive,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không lưu được ánh xạ bộ phận");
      showToast("success", json.message || "Đã lưu ánh xạ bộ phận");
      await fetchAll();
    } catch (err: any) {
      showToast("error", err.message || "Không lưu được ánh xạ bộ phận");
    } finally {
      setSavingDept(null);
    }
  };

  const formatDate = (value: string | Date) => {
    try {
      return new Date(value).toLocaleString("vi-VN");
    } catch {
      return String(value);
    }
  };

  return (
    <div className="space-y-5">
      {/* Trạng thái áp dụng */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-slate-900">Danh mục công việc thường xuyên</h2>
            {activeVersion ? (
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-semibold">
                Đang áp dụng: {activeVersion.code}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-semibold">
                Chưa nhập danh mục TX
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600">
            {activeVersion
              ? `${activeVersion.entryCount} đầu việc • ${departments.length} bộ phận • nhập ngày ${formatDate(
                  activeVersion.importedAt
                )}${activeVersion.importedBy ? ` bởi ${activeVersion.importedBy.fullName}` : ""}.`
              : "Khi chưa có danh mục TX, hệ thống vẫn cho chọn 48 mẫu cũ để không gián đoạn nghiệp vụ."}
          </p>
          <p className="text-[11px] text-slate-500">
            {mappingRows.some((r) => r.isActive && r.unitId && r.activeEntryCount > 0)
              ? `${mappingRows.filter((r) => r.isActive && r.unitId && r.activeEntryCount > 0).length}/${mappingRows.length} nhóm đã kích hoạt. Bộ phận chưa kích hoạt vẫn dùng 48 mẫu cũ bình thường.`
              : "Chưa kích hoạt nhóm TX nào — tất cả bộ phận vẫn chọn được 48 mẫu cũ; dữ liệu lịch sử luôn giữ nguyên."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchAll}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
          {canManage && (
            <button
              onClick={() => {
                resetImport();
                setIsImportOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              Nhập từ Excel
            </button>
          )}
        </div>
      </div>

      {/* Chế độ chọn đầu việc — khi Hải quan chưa xác nhận ánh xạ bộ phận */}
      {activeVersion && canManage && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-slate-800">Phạm vi cán bộ được chọn đầu việc</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {activeVersion.selectionMode === "ALL"
                  ? "Đang mở: mọi cán bộ chọn được đầu việc của cả 6 nhóm. Áp dụng khi Hải quan chưa xác nhận ánh xạ bộ phận."
                  : "Đang giới hạn: cán bộ chỉ chọn được nhóm đã ánh xạ và kích hoạt cho bộ phận của mình."}
              </p>
            </div>
          </div>
          <button
            onClick={() => toggleSelectionMode()}
            disabled={savingSelectionMode}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50"
          >
            {savingSelectionMode ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Power className="w-3.5 h-3.5" />
            )}
            {activeVersion.selectionMode === "ALL"
              ? "Giới hạn theo bộ phận"
              : "Cho phép chọn tất cả nhóm"}
          </button>
        </div>
      )}

      {/* Ánh xạ nhóm TX → bộ phận thật + kích hoạt theo bộ phận */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-teal-700" />
            <h3 className="text-sm font-bold text-slate-800">
              Ánh xạ &amp; kích hoạt danh mục theo bộ phận
            </h3>
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
              {mappingRows.filter((r) => r.isActive && r.unitId && r.activeEntryCount > 0).length}/
              {mappingRows.length} nhóm
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Tên nhóm giữ nguyên từ file nguồn. Chỉ nhóm đã xác nhận mới được phát cho cán bộ thuộc
            bộ phận tương ứng.
          </p>
        </div>

        {!activeVersion ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Cần nhập danh mục TX trước, sau đó ánh xạ từng nhóm với bộ phận thật trong org_units.
          </div>
        ) : mappingRows.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">Chưa có nhóm bộ phận để ánh xạ.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wide">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">Nhóm trong file nguồn</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Đầu việc</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Bộ phận thật (org_units)</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Kích hoạt</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Trạng thái phát</th>
                  {canManage && <th className="px-3 py-2.5 text-right font-semibold">Lưu</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mappingRows.map((row) => {
                  const draft =
                    mappingDrafts[row.department] || { unitId: row.unitId || "", isActive: row.isActive };
                  const effectiveActive = draft.isActive && !!draft.unitId && row.activeEntryCount > 0;
                  return (
                    <tr key={row.department} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2 text-slate-800 font-medium min-w-[220px]">
                        {row.department}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-600">
                        {row.activeEntryCount}/{row.entryCount}
                      </td>
                      <td className="px-3 py-2 min-w-[240px]">
                        <select
                          value={draft.unitId}
                          disabled={!canManage}
                          onChange={(e) =>
                            setMappingDrafts((prev) => ({
                              ...prev,
                              [row.department]: { ...draft, unitId: e.target.value },
                            }))
                          }
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 disabled:bg-slate-50"
                        >
                          <option value="">-- Chưa gán bộ phận --</option>
                          {orgUnits.map((u) => (
                            <option key={u.id} value={u.id}>
                              [{u.code}] {u.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={draft.isActive}
                          disabled={!canManage}
                          onChange={(e) =>
                            setMappingDrafts((prev) => ({
                              ...prev,
                              [row.department]: { ...draft, isActive: e.target.checked },
                            }))
                          }
                          className="h-4 w-4 rounded border-slate-300 text-teal-700"
                          title="Bật để phát danh mục TX cho đúng bộ phận đã chọn"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {effectiveActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                            <ShieldCheck className="w-3 h-3" /> Đang phát cho {row.unitName || "bộ phận"}
                          </span>
                        ) : draft.isActive && !draft.unitId ? (
                          <span className="text-[11px] text-rose-700">Thiếu bộ phận thật</span>
                        ) : (
                          <span className="text-[11px] text-amber-800">
                            Chưa kích hoạt — mẫu cũ vẫn dùng được
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => saveMapping(row)}
                            disabled={savingDept === row.department}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded disabled:opacity-50"
                          >
                            {savingDept === row.department ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : null}
                            Lưu
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-500">
          Quy tắc: chỉ áp dụng cho đúng bộ phận đã kích hoạt; bộ phận khác không bị ảnh hưởng.
          Không tự tạo org_units từ file Excel. Nhóm chưa xác nhận để trống/không kích hoạt.
        </p>
      </div>

      {/* Bộ lọc */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="ALL">Tất cả bộ phận ({departments.reduce((n, d) => n + d.count, 0)})</option>
            {departments.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} ({d.count})
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="ACTIVE">Đang sử dụng</option>
            <option value="INACTIVE">Đã ngừng</option>
            <option value="ALL">Tất cả trạng thái</option>
          </select>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên hoặc mã đầu việc..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          />
        </div>
      </div>

      {/* Bảng đầu việc */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải danh mục...
          </div>
        ) : !activeVersion ? (
          <div className="p-10 text-center space-y-2">
            <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">Chưa có danh mục TX đang áp dụng</p>
            <p className="text-xs text-slate-500">
              {canManage
                ? "Bấm “Nhập từ Excel” để đọc file danh mục, xem trước báo cáo rồi xác nhận nhập."
                : "Vui lòng liên hệ quản trị danh mục để nhập file Danh mục TX."}
            </p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Không có đầu việc phù hợp bộ lọc.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wide">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">Mã</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Bộ phận</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Tên đầu việc thường xuyên</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Hệ số quy đổi</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Dòng Excel</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Trạng thái</th>
                  {canManage && <th className="px-3 py-2.5 text-right font-semibold">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {e.code}
                    </td>
                    <td className="px-3 py-2 text-slate-700 min-w-[160px]">
                      <span className="block">{e.department}</span>
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-mono text-slate-600">
                        {e.groupCode}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-900 font-medium min-w-[280px]">{e.title}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      {canManage ? (
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={factorDrafts[e.id] ?? (e.convertFactor ?? "")}
                          placeholder="Chưa có"
                          onChange={(ev) =>
                            setFactorDrafts((prev) => ({ ...prev, [e.id]: ev.target.value }))
                          }
                          onBlur={() => saveFactor(e)}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
                          }}
                          className="w-24 px-2 py-1 text-center font-mono text-[11px] border border-slate-300 rounded bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                          title="Bổ sung / chỉnh sửa hệ số quy đổi (để trống = chưa có hệ số)"
                        />
                      ) : e.convertFactor === null || e.convertFactor === undefined ? (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-semibold">
                          Chưa có
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] font-semibold text-teal-800">
                          {e.convertFactor}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-500">{e.sourceRow || "—"}</td>
                    <td className="px-3 py-2 text-center">
                      {e.status === "ACTIVE" ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                          Đang sử dụng
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-semibold">
                          Đã ngừng
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => toggleEntry(e)}
                          disabled={togglingId === e.id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-50"
                          title={e.status === "ACTIVE" ? "Ngừng sử dụng" : "Bật lại"}
                        >
                          {togglingId === e.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Power className="w-3 h-3" />
                          )}
                          {e.status === "ACTIVE" ? "Ngừng" : "Bật"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {activeVersion && (
          <div className="px-3 py-2 border-t border-slate-100 text-[11px] text-slate-500">
            Hiển thị {filteredEntries.length}/{entries.length} đầu việc của phiên bản {activeVersion.code}.
          </div>
        )}
      </div>

      {/* Lịch sử phiên bản */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-800">Lịch sử phiên bản danh mục</h3>
        </div>
        {versions.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">Chưa có phiên bản nào.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wide">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">Mã phiên bản</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Thời điểm nhập</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Người nhập</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Số đầu việc</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Trạng thái</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {versions.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-700">{v.code}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDate(v.importedAt)}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {v.importedBy?.fullName || "—"}
                      {v.importedBy?.code ? (
                        <span className="text-slate-400 font-mono text-[10px]"> ({v.importedBy.code})</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-700">
                      {v.activeEntries ?? v.entryCount}
                      {v.inactiveEntries ? (
                        <span className="text-slate-400"> / ngừng {v.inactiveEntries}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {v.status === "ACTIVE" ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                          Đang áp dụng
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-semibold">
                          Đã thay thế
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500 max-w-[280px] truncate" title={v.note || ""}>
                      {v.note || v.sourceFileName || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal nhập danh mục */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-bold text-slate-900">Nhập Danh mục công việc thường xuyên</h3>
              </div>
              <button
                onClick={() => {
                  setIsImportOpen(false);
                  resetImport();
                }}
                className="p-1 text-slate-500 hover:bg-slate-200 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 space-y-1">
                <p className="font-semibold">Quy trình 2 bước (bắt buộc):</p>
                <p>
                  1) Chọn file <span className="font-mono">.xlsx</span> → hệ thống đọc và báo cáo số đầu
                  việc, bộ phận, dòng trùng/lỗi, khác biệt so với phiên bản đang áp dụng.
                </p>
                <p>2) Kiểm tra báo cáo rồi bấm “Xác nhận nhập” — mỗi lần nhập tạo một phiên bản mới, không xóa lịch sử.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tệp danh mục (.xlsx)
                  </label>
                  <input
                    type="file"
                    accept=".xlsx"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] || null);
                      setReport(null);
                      setCanImport(false);
                      setImportError(null);
                    }}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-800 hover:file:bg-teal-100"
                  />
                  {file && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {file.name} • {(file.size / 1024).toFixed(0)} KB
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi chú phiên bản</label>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ví dụ: Danh mục TX đợt 1 — Hải quan xác nhận"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                </div>
              </div>

              {importError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}

              {report && (
                <div className="space-y-3 border border-slate-200 rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-800">Báo cáo đọc tệp:</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      Sheet: {report.sheetName}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 font-semibold">
                      {report.totalEntries} đầu việc
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {report.departments.length} bộ phận
                    </span>
                    {report.activeVersion && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                        So với: {report.activeVersion.code} ({report.activeVersion.entryCount})
                      </span>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] border border-slate-200 rounded">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-semibold">Bộ phận</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Số đầu việc</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.departments.map((d) => (
                          <tr key={d.name}>
                            <td className="px-2 py-1.5 text-slate-700">{d.name}</td>
                            <td className="px-2 py-1.5 text-right text-slate-900 font-semibold">{d.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                    <div className="p-2 rounded bg-emerald-50 border border-emerald-200">
                      <span className="font-semibold text-emerald-800">Mới: {report.newEntries.length}</span>
                    </div>
                    <div className="p-2 rounded bg-slate-50 border border-slate-200">
                      <span className="font-semibold text-slate-700">Không đổi: {report.unchangedCount}</span>
                    </div>
                    <div className="p-2 rounded bg-amber-50 border border-amber-200">
                      <span className="font-semibold text-amber-800">
                        Không còn trong tệp: {report.removedEntries.length}
                      </span>
                    </div>
                  </div>

                  {report.unchangedHash && (
                    <p className="text-[11px] text-amber-800">
                      Nội dung không thay đổi so với phiên bản đang áp dụng — không cần nhập lại.
                    </p>
                  )}
                  {report.errors.length > 0 && (
                    <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-800 max-h-28 overflow-y-auto">
                      <p className="font-semibold">Lỗi ({report.errors.length}):</p>
                      <ul className="list-disc pl-4">
                        {report.errors.map((e, idx) => (
                          <li key={idx}>
                            {e.row > 0 ? `Dòng ${e.row}: ` : ""}
                            {e.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {report.duplicates.length > 0 && (
                    <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-800 max-h-28 overflow-y-auto">
                      <p className="font-semibold">Trùng trong cùng bộ phận ({report.duplicates.length}):</p>
                      <ul className="list-disc pl-4">
                        {report.duplicates.map((d, idx) => (
                          <li key={idx}>
                            {d.department}: “{d.title}” (dòng {d.rows.join(", ")})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {report.newEntries.length > 0 && (
                    <details className="text-[11px]">
                      <summary className="cursor-pointer font-semibold text-emerald-800">
                        Xem {report.newEntries.length} đầu việc mới
                      </summary>
                      <ul className="mt-1 max-h-32 overflow-y-auto list-disc pl-4 text-slate-700">
                        {report.newEntries.map((e, idx) => (
                          <li key={idx}>
                            [{e.department}] {e.title}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {report.removedEntries.length > 0 && (
                    <details className="text-[11px]">
                      <summary className="cursor-pointer font-semibold text-amber-800">
                        Xem {report.removedEntries.length} đầu việc không còn trong tệp (sẽ ngừng áp dụng,
                        không xóa lịch sử)
                      </summary>
                      <ul className="mt-1 max-h-32 overflow-y-auto list-disc pl-4 text-slate-700">
                        {report.removedEntries.map((e, idx) => (
                          <li key={idx}>
                            [{e.department}] {e.title}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-500">
                {report
                  ? canImport
                    ? "Báo cáo hợp lệ — có thể xác nhận nhập."
                    : "Chưa thể nhập: cần xử lý lỗi/trùng hoặc nội dung không thay đổi."
                  : "Bước 1: đọc tệp để xem trước báo cáo."}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsImportOpen(false);
                    resetImport();
                  }}
                  disabled={previewing || committing}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  onClick={runPreview}
                  disabled={!file || previewing || committing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-100 hover:bg-teal-200 rounded-lg disabled:opacity-50"
                >
                  {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Đọc & xem trước
                </button>
                <button
                  onClick={runCommit}
                  disabled={!report || !canImport || committing || previewing}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm disabled:opacity-40"
                >
                  {committing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Xác nhận nhập
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
