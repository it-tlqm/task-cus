"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "@/components/ui/Toast";
import { usePermissions } from "@/hooks/usePermissions";

interface MonthlyItem {
  id: string;
  title: string;
  outputText: string | null;
  assignedQty: number | null;
  completedQty: number | null;
  dueDate: string | null;
  completedDate: string | null;
  evidenceRef: string | null;
  factorSnapshot: number | null;
  lateCount: number;
  reworkCount: number;
  needsReview: boolean;
  notes: string | null;
  taskId: string | null;
  productItem: { id: string; code: string; sourceStt: string | null; taskName: string; outputProduct: string | null; convertFactor: number | null } | null;
  // YC-23: đầu việc thực tế trong kế hoạch cá nhân được liên kết (chống ghi trùng)
  workItem: {
    id: string;
    title: string;
    dueDate?: string | null;
    completedDate?: string | null;
    catalogEntryId?: string | null;
    catalogEntry?: { id: string; code: string; title: string; department: string } | null;
    _count?: { evidences: number };
  } | null;
  person: { id: string; fullName: string };
}

interface Summary {
  year: number; month: number; totalItems: number;
  assignedRaw: number; completedRaw: number;
  assignedConverted: number; completedConverted: number;
  unmappedCount: number; missingFieldsCount: number;
  lateTotal: number; reworkTotal: number;
}

interface ScorePreview {
  qtyRatio: number | null; progressRatio: number | null; qualityRatio: number | null;
  averageD: number | null; score70: number | null; official: false; note: string;
}

/**
 * YC-12/YC-13 — Ghi nhận + tổng hợp kết quả tháng (chưa chấm điểm — YC-14).
 * Đúng người, đúng tháng, không nhân đôi; thiếu mã SP → chờ đối chiếu.
 */
export default function MonthlyResultsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [personId, setPersonId] = useState("");
  const [people, setPeople] = useState<Array<{ id: string; fullName: string }>>([]);
  const [items, setItems] = useState<MonthlyItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [scorePreview, setScorePreview] = useState<ScorePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, canApprove, isUnitLeader } = usePermissions();
  const canPickPerson = canApprove || isUnitLeader;

  // Modal form
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MonthlyItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [fTitle, setFTitle] = useState("");
  const [fOutput, setFOutput] = useState("");
  const [fAssigned, setFAssigned] = useState("");
  const [fCompleted, setFCompleted] = useState("");
  const [fDue, setFDue] = useState("");
  const [fDoneDate, setFDoneDate] = useState("");
  const [fEvidence, setFEvidence] = useState("");
  const [fLate, setFLate] = useState("0");
  const [fRework, setFRework] = useState("0");
  const [fNotes, setFNotes] = useState("");
  const [fProductId, setFProductId] = useState("");
  const [fProductLabel, setFProductLabel] = useState("");
  // Product search
  const [pSearch, setPSearch] = useState("");
  const [pResults, setPResults] = useState<Array<{ id: string; code: string; taskName: string; outputProduct: string | null; convertFactor: number | null }>>([]);
  const [pSearching, setPSearching] = useState(false);
  // YC-23: liên kết đầu việc thực tế trong kế hoạch cá nhân (chặn ghi trùng theo đầu việc + sản phẩm)
  const [fWorkItemId, setFWorkItemId] = useState("");
  const [planWorkItems, setPlanWorkItems] = useState<Array<{
    id: string;
    title: string;
    dueDate?: string | null;
    completedDate?: string | null;
    productItemId?: string | null;
    catalogEntry?: { id: string; code: string; department: string } | null;
    product?: { id: string; code: string; taskName: string; convertFactor: number | null } | null;
  }>>([]);
  const [workItemsLoading, setWorkItemsLoading] = useState(false);

  const fetchData = useCallback(async (y: number, m: number, p: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(y), month: String(m) });
      if (p) params.set("personId", p);
      const res = await fetch(`/api/monthly-results?${params.toString()}`);
      const json = await res.json();
      if (res.ok) {
        setItems(json.data || []);
        setSummary(json.summary || null);
        setScorePreview(json.scorePreview || null);
      } else {
        toast.error(json.error || "Không thể tải kết quả tháng");
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(year, month, personId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  useEffect(() => {
    if (!canPickPerson) return;
    fetch("/api/people?pageSize=100")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const list = Array.isArray(json) ? json : json?.data || [];
        setPeople(list.map((x: any) => ({ id: x.id, fullName: x.fullName })));
      })
      .catch(() => {});
  }, [canPickPerson]);

  const searchProducts = async (q: string) => {
    setPSearch(q);
    if (q.trim().length < 2) { setPResults([]); return; }
    setPSearching(true);
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(q.trim())}&pageSize=10`);
      const json = await res.json();
      if (res.ok) setPResults(json.data || []);
    } catch {}
    finally { setPSearching(false); }
  };

  // YC-23: nạp danh sách đầu việc kế hoạch của cán bộ trong tháng để liên kết khi ghi nhận
  const loadPlanWorkItems = async () => {
    const targetPerson = personId || user?.personId;
    if (!targetPerson) return;
    setWorkItemsLoading(true);
    try {
      const res = await fetch(
        `/api/personal-work-items?personId=${encodeURIComponent(targetPerson)}&year=${year}&month=${month}`
      );
      const json = await res.json();
      if (res.ok) setPlanWorkItems(json.data || []);
    } catch {}
    finally { setWorkItemsLoading(false); }
  };

  const openAdd = () => {
    setEditing(null);
    setFTitle(""); setFOutput(""); setFAssigned(""); setFCompleted("");
    setFDue(""); setFDoneDate(""); setFEvidence("");
    setFLate("0"); setFRework("0"); setFNotes("");
    setFProductId(""); setFProductLabel(""); setPSearch(""); setPResults([]);
    setFWorkItemId(""); setPlanWorkItems([]); loadPlanWorkItems();
    setShowModal(true);
  };

  const openEdit = (it: MonthlyItem) => {
    setEditing(it);
    setFTitle(it.title); setFOutput(it.outputText || "");
    setFAssigned(it.assignedQty?.toString() || ""); setFCompleted(it.completedQty?.toString() || "");
    setFDue(it.dueDate ? it.dueDate.slice(0, 16) : ""); setFDoneDate(it.completedDate ? it.completedDate.slice(0, 10) : "");
    setFEvidence(it.evidenceRef || "");
    setFLate(String(it.lateCount || 0)); setFRework(String(it.reworkCount || 0));
    setFNotes(it.notes || "");
    setFProductId(it.productItem?.id || ""); setFProductLabel(it.productItem ? `${it.productItem.code} — ${it.productItem.taskName}` : "");
    setPSearch(""); setPResults([]);
    setFWorkItemId(it.workItem?.id || ""); setPlanWorkItems([]); loadPlanWorkItems();
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !fTitle.trim()) return;
    setSaving(true);
    try {
      const payload: any = {
        title: fTitle.trim(),
        outputText: fOutput, assignedQty: fAssigned, completedQty: fCompleted,
        dueDate: fDue ? new Date(fDue).toISOString() : null,
        completedDate: fDoneDate ? new Date(fDoneDate).toISOString() : null,
        evidenceRef: fEvidence, lateCount: fLate, reworkCount: fRework, notes: fNotes,
        productItemId: fProductId || null,
        workItemId: fWorkItemId || null,
      };
      let res: Response;
      if (editing) {
        res = await fetch("/api/monthly-results", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, id: editing.id }),
        });
      } else {
        res = await fetch("/api/monthly-results", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, personId: personId || user?.personId, periodYear: year, periodMonth: month }),
        });
      }
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(json.deduplicated ? "Đầu việc này đã được ghi nhận trong tháng — hiển thị bản ghi hiện có (chống ghi trùng)" : "Đã lưu kết quả tháng");
        setShowModal(false);
        fetchData(year, month, personId);
      } else {
        toast.error(json.error || "Không thể lưu");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Xóa bản ghi "${title}" khỏi kết quả tháng ${month}/${year}?`)) return;
    try {
      const res = await fetch(`/api/monthly-results?id=${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) { toast.success("Đã xóa bản ghi"); fetchData(year, month, personId); }
      else toast.error(json.error || "Không thể xóa");
    } catch (err: any) { toast.error("Lỗi: " + err.message); }
  };

  const missing = (it: MonthlyItem) => it.completedQty === null || it.completedQty === undefined || !it.completedDate;

  const [exporting, setExporting] = useState(false);
  const doDownload = async (template: "bang1" | "02c", defaultName: string) => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch("/api/monthly-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: personId || undefined, year, month, template }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Không thể xuất báo cáo");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      a.href = url;
      a.download = m ? m[1] : defaultName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(
        template === "02c"
          ? "Đã xuất Kế hoạch tháng 02C (cột KPI để trống — hệ thống chưa có nguồn số này)"
          : "Đã xuất Bảng 1 + Biểu 01A (giữ nguyên công thức mẫu — mở bằng Excel để xem số tính)"
      );
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi xuất báo cáo");
    } finally {
      setExporting(false);
    }
  };
  const handleExport = () => doDownload("bang1", `Bang1-01A-T${month}-${year}.xlsx`);
  const handleExport02C = () => doDownload("02c", `KeHoachThang02C-T${month}-${year}.xlsx`);

  return (
    <div className="flex flex-col w-full p-4 lg:p-6 space-y-4 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-teal-100 text-teal-900 border border-teal-200">
            Kết quả tháng (chưa chấm điểm)
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Kết quả công tác tháng</h1>
          <p className="text-sm text-slate-600">Ghi nhận sản phẩm thực tế · đúng người, đúng tháng · thiếu mã SP thì chờ đối chiếu</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button data-tour="add-btn" onClick={openAdd} className="px-4 py-2 rounded-lg bg-teal-800 text-white text-sm font-semibold hover:bg-teal-700">
            + Ghi nhận kết quả
          </button>
          <button data-tour="export-btns" onClick={handleExport} disabled={exporting}
            className="px-4 py-2 rounded-lg bg-white border border-teal-700 text-teal-900 text-sm font-semibold hover:bg-teal-50 disabled:opacity-50">
            {exporting ? "Đang xuất..." : "Xuất Bảng 1 + 01A (.xlsx)"}
          </button>
          <button onClick={handleExport02C} disabled={exporting}
            className="px-4 py-2 rounded-lg bg-white border border-teal-700 text-teal-900 text-sm font-semibold hover:bg-teal-50 disabled:opacity-50">
            {exporting ? "Đang xuất..." : "Xuất KH tháng 02C (.xlsx)"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <label className="text-sm text-slate-600">Tháng</label>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="h-10 px-2 rounded-lg bg-slate-50 border border-slate-300 text-sm">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>Tháng {m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-10 px-2 rounded-lg bg-slate-50 border border-slate-300 text-sm">
          {[2025, 2026, 2027].map((y) => <option key={y} value={y}>Năm {y}</option>)}
        </select>
        {canPickPerson && (
          <select value={personId} onChange={(e) => { setPersonId(e.target.value); fetchData(year, month, e.target.value); }}
            className="h-10 px-2 rounded-lg bg-slate-50 border border-slate-300 text-sm max-w-xs">
            <option value="">Cán bộ của tôi</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        )}
        <button onClick={() => fetchData(year, month, personId)} className="h-10 px-4 rounded-lg bg-slate-100 border border-slate-300 text-sm font-semibold">
          Tải lại
        </button>
      </div>

      {summary && (
        <div data-tour="summary" className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-[11px] text-slate-500 uppercase">Đầu việc ghi nhận</div>
            <div className="text-2xl font-bold text-slate-900">{summary.totalItems}</div>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-[11px] text-slate-500 uppercase">Hoàn thành (quy đổi)</div>
            <div className="text-2xl font-bold text-teal-900">{summary.completedConverted}</div>
            <div className="text-[11px] text-slate-400">thô: {summary.completedRaw} · giao quy đổi: {summary.assignedConverted}</div>
          </div>
          <div className={`p-3 rounded-xl border shadow-sm ${summary.unmappedCount > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
            <div className="text-[11px] text-slate-500 uppercase">Chờ đối chiếu mã SP</div>
            <div className="text-2xl font-bold text-amber-700">{summary.unmappedCount}</div>
          </div>
          <div className={`p-3 rounded-xl border shadow-sm ${summary.missingFieldsCount > 0 ? "bg-rose-50 border-rose-200" : "bg-white border-slate-200"}`}>
            <div className="text-[11px] text-slate-500 uppercase">Thiếu số liệu</div>
            <div className="text-2xl font-bold text-rose-700">{summary.missingFieldsCount}</div>
            <div className="text-[11px] text-slate-400">chậm: {summary.lateTotal} · làm lại: {summary.reworkTotal}</div>
          </div>
        </div>
      )}

      {scorePreview && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-900 text-[11px] font-bold uppercase">Điểm tính thử — chưa chính thức</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
            <div><div className="text-[11px] text-slate-500">Số lượng (a)</div><div className="text-xl font-bold">{scorePreview.qtyRatio ?? "—"}{scorePreview.qtyRatio !== null && "%"}</div></div>
            <div><div className="text-[11px] text-slate-500">Tiến độ (b)</div><div className="text-xl font-bold">{scorePreview.progressRatio ?? "—"}{scorePreview.progressRatio !== null && "%"}</div></div>
            <div><div className="text-[11px] text-slate-500">Chất lượng (c)</div><div className="text-xl font-bold">{scorePreview.qualityRatio ?? "—"}{scorePreview.qualityRatio !== null && "%"}</div></div>
            <div><div className="text-[11px] text-slate-500">d = (a+b+c)/3</div><div className="text-xl font-bold">{scorePreview.averageD ?? "—"}</div></div>
            <div><div className="text-[11px] text-slate-500">Điểm KQ ×70%</div><div className="text-xl font-bold text-amber-800">{scorePreview.score70 ?? "—"}</div></div>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Tính đúng công thức mẫu Bảng 1/01A từ số liệu đã ghi. {scorePreview.note}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="bg-slate-50 text-slate-700 text-xs uppercase">
              <th className="py-2.5 px-3 text-left">Nhiệm vụ / Sản phẩm</th>
              <th className="py-2.5 px-3 text-left">Mã SP · Hệ số</th>
              <th className="py-2.5 px-3 text-right">Giao</th>
              <th className="py-2.5 px-3 text-right">Hoàn thành</th>
              <th className="py-2.5 px-3 text-left">Minh chứng / Hạn</th>
              <th className="py-2.5 px-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((it) => (
              <tr key={it.id} className="hover:bg-slate-50">
                <td className="py-2.5 px-3">
                  <div className="font-semibold text-slate-900">{it.title}</div>
                  {it.outputText && <div className="text-slate-600 text-xs">{it.outputText}</div>}
                  {it.workItem && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 text-[11px] font-semibold">
                        Đầu việc: {it.workItem.title}
                      </span>
                      {it.workItem.catalogEntry && (
                        <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 font-mono text-[10px]">
                          {it.workItem.catalogEntry.code}
                        </span>
                      )}
                      {typeof it.workItem._count?.evidences === "number" && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                          {it.workItem._count.evidences} minh chứng
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-1 mt-1">
                    {it.needsReview && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-semibold">Chờ đối chiếu mã SP</span>}
                    {missing(it) && <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[11px] font-semibold">Thiếu số liệu</span>}
                  </div>
                </td>
                <td className="py-2.5 px-3 text-xs">
                  {it.productItem
                    ? <><span className="font-mono font-bold text-teal-900">{it.productItem.code}</span>
                      <span className="block text-slate-500">hệ số {it.factorSnapshot ?? it.productItem.convertFactor ?? "—"}</span></>
                    : <span className="text-slate-400">—</span>}
                </td>
                <td className="py-2.5 px-3 text-right">{it.assignedQty ?? "—"}</td>
                <td className="py-2.5 px-3 text-right font-bold">{it.completedQty ?? "—"}</td>
                <td className="py-2.5 px-3 text-xs text-slate-600">
                  {it.evidenceRef || "—"}
                  <span className="block text-slate-400">
                    {it.completedDate ? `xong ${it.completedDate.slice(0, 10)}` : "chưa có ngày xong"}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                  <button onClick={() => openEdit(it)} className="px-2.5 py-1 rounded bg-slate-100 text-xs font-semibold mr-1">Sửa</button>
                  <button onClick={() => handleDelete(it.id, it.title)} className="px-2.5 py-1 rounded bg-rose-50 text-rose-700 text-xs font-semibold">Xóa</button>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} className="py-10 text-center text-slate-500">Chưa có kết quả nào trong tháng {month}/{year}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 bg-teal-900 text-white flex items-center justify-between">
              <h3 className="font-semibold">{editing ? "Sửa kết quả tháng" : "Ghi nhận kết quả tháng"}</h3>
              <button onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="p-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Tên nhiệm vụ / công việc *</label>
                  <input required value={fTitle} onChange={(e) => setFTitle(e.target.value)}
                    placeholder="Nhập tên nhiệm vụ, công việc thực tế..."
                    className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Liên kết đầu việc trong kế hoạch cá nhân (tuỳ chọn — chống ghi nhận trùng)
                  </label>
                  <select
                    data-testid="work-item-select"
                    value={fWorkItemId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFWorkItemId(v);
                      if (v) {
                        const wi = planWorkItems.find((x) => x.id === v);
                        if (wi) {
                          // Đầu việc là nguồn chính: tên, hạn và ngày hoàn thành thực tế đi theo đầu việc
                          setFTitle(wi.title);
                          if (wi.dueDate) setFDue(wi.dueDate.slice(0, 16));
                          if (wi.completedDate) setFDoneDate(wi.completedDate.slice(0, 10));
                          // Kế thừa sản phẩm đã gắn ở kế hoạch nếu chưa chọn sản phẩm
                          if (!fProductId && wi.product) {
                            setFProductId(wi.product.id);
                            setFProductLabel(`${wi.product.code} — ${wi.product.taskName}`);
                          }
                        }
                      }
                    }}
                    className="h-10 px-3 rounded-lg border border-slate-300 text-sm"
                  >
                    <option value="">
                      {workItemsLoading ? "-- Đang tải đầu việc... --" : "-- Không liên kết --"}
                    </option>
                    {fWorkItemId && !planWorkItems.some((x) => x.id === fWorkItemId) && editing?.workItem && (
                      <option value={fWorkItemId}>{editing.workItem.title} (bản ghi hiện tại)</option>
                    )}
                    {planWorkItems.map((wi) => (
                      <option key={wi.id} value={wi.id}>
                        {wi.title}
                        {wi.catalogEntry ? ` · TX ${wi.catalogEntry.code}` : ""}
                        {wi.product ? ` · SP ${wi.product.code}` : ""}
                      </option>
                    ))}
                  </select>
                  {fWorkItemId && (
                    <p className="text-[11px] text-teal-700 bg-teal-50 border border-teal-200 rounded px-2 py-1.5">
                      Đã liên kết đầu việc — mỗi đầu việc chỉ có một kết quả tháng. Hạn xử lý và ngày hoàn thành được
                      kế thừa từ đầu việc, có thể sửa trực tiếp bên dưới.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Mã sản phẩm QĐ1277 (để trống = chờ đối chiếu)</label>
                  {fProductId
                    ? <div className="flex items-center gap-2 h-10 px-2 rounded-lg bg-teal-50 border border-teal-200 text-sm">
                      <span className="flex-1 truncate font-mono">{fProductLabel}</span>
                      <button type="button" onClick={() => { setFProductId(""); setFProductLabel(""); }} className="text-rose-600 font-bold">✕</button>
                    </div>
                    : <>
                      <input value={pSearch} onChange={(e) => searchProducts(e.target.value)}
                        placeholder="Gõ từ 2 ký tự để tìm trong 3386 sản phẩm..."
                        className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
                      {pSearching && <span className="text-xs text-slate-400">Đang tìm...</span>}
                      {pResults.length > 0 && (
                        <div className="border border-slate-200 rounded-lg max-h-44 overflow-y-auto divide-y">
                          {pResults.map((p) => (
                            <button type="button" key={p.id}
                              onClick={() => { setFProductId(p.id); setFProductLabel(`${p.code} — ${p.taskName}`); setPResults([]); setPSearch(""); }}
                              className="w-full text-left p-2 hover:bg-teal-50 text-xs">
                              <span className="font-mono font-bold text-teal-900">{p.code}</span>
                              <span className="text-slate-500"> · hệ số {p.convertFactor ?? "—"}</span>
                              <span className="block text-slate-700">{p.taskName}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Sản phẩm thực tế</label>
                  <input value={fOutput} onChange={(e) => setFOutput(e.target.value)}
                    placeholder="Nhập sản phẩm, số lượng cụ thể đã tạo ra..."
                    className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700">Số lượng giao</label>
                    <input type="number" min={0} value={fAssigned} onChange={(e) => setFAssigned(e.target.value)}
                      placeholder="Để trống nếu không có" className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700">Số lượng hoàn thành</label>
                    <input type="number" min={0} value={fCompleted} onChange={(e) => setFCompleted(e.target.value)}
                      placeholder="Nhập số thực tế..." className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700">Ngày phải xong</label>
                    <input type="date" value={fDue} onChange={(e) => setFDue(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700">Ngày xong thực tế</label>
                    <input type="date" value={fDoneDate} onChange={(e) => setFDoneDate(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700">Số lần chậm</label>
                    <input type="number" min={0} value={fLate} onChange={(e) => setFLate(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700">Số lần làm lại</label>
                    <input type="number" min={0} value={fRework} onChange={(e) => setFRework(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Minh chứng / số hiệu văn bản</label>
                  <input value={fEvidence} onChange={(e) => setFEvidence(e.target.value)}
                    placeholder="Nhập số hiệu văn bản, hồ sơ liên quan..."
                    className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Ghi chú</label>
                  <textarea rows={2} value={fNotes} onChange={(e) => setFNotes(e.target.value)}
                    className="p-2.5 rounded-lg border border-slate-300 text-sm" />
                </div>
                <p className="text-[11px] text-slate-500">
                  Gửi xong lãnh đạo nhận tin duyệt ngay. Chọn mã SP để hệ số quy đổi được chốt theo danh mục hiện hành.
                </p>
              </div>
              <div className="p-4 bg-slate-50 flex items-center justify-end gap-2 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm">Hủy</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-teal-800 text-white text-sm font-semibold disabled:opacity-50">
                  {saving ? "Đang lưu..." : "Lưu kết quả"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
