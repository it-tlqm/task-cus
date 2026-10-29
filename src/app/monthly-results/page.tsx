"use client";

import { V5Icon } from "@/components/v5/ui/icon";

import React, { useState, useEffect, useCallback } from "react";
import { FileDown, Plus, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { calendarDateToIso, toCalendarDate } from "@/lib/datetime";
import { usePermissions } from "@/hooks/usePermissions";
import SelfAssessmentPanel from "@/components/evaluation/SelfAssessmentPanel";
import EvaluationExportPanel from "@/components/evaluation/EvaluationExportPanel";
import { Badge } from "@/components/v5/ui/badge";
import { Button } from "@/components/v5/ui/button";
import { Card } from "@/components/v5/ui/card";

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
    reviewState?: string | null;
    products?: { id: string; reviewState: string | null; quantity: number | null; quantityUnit: string | null; factorSnapshot: number | null; productItem: { id: string; code: string; taskName: string; convertFactor: number | null } }[];
  } | null;
  /** V3: trang thai du dieu kien tinh diem chinh thuc (officialState) */
  officialState?: string;
  officialReady?: boolean;
  spTotal?: number;
  spConfirmed?: number;
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
  /** YC-33: trạng thái + lý do + chi tiết từng dòng */
  status?: string;
  reasons?: string[];
  rows?: Array<{
    id: string; title: string; factor: number | null; factorSource: string;
    assignedQty: number | null; completedQty: number | null; lateDays: number;
    reworkCount: number; g: number | null; i: number | null; l: number | null;
    n: number | null; status: string; reasons: string[];
  }>;
  formulaVersion?: string;
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
  // Người đang đăng nhập (dùng khi chưa chọn cán bộ cụ thể)
  const [mePersonId, setMePersonId] = useState("");
  const [people, setPeople] = useState<Array<{ id: string; fullName: string }>>([]);
  const [items, setItems] = useState<MonthlyItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [scorePreview, setScorePreview] = useState<ScorePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [officialExporting, setOfficialExporting] = useState<string | null>(null);
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
  // V3 (F11/F12): công việc trong kỳ đã được lãnh đạo xác nhận nhưng CHƯA có hồ sơ
  // kết quả tháng => hiển thị thành "bản nháp" để cán bộ ghi nhận (không ghi trùng).
  const [drafts, setDrafts] = useState<Array<{
    id: string; title: string; reviewState: string; officialState: string;
    dueDate?: string | null; completedDate?: string | null; resultText?: string | null;
    evidenceCount: number; spTotal: number; spConfirmed: number;
    product?: { id: string; code: string; taskName: string; convertFactor: number | null } | null;
    catalogEntry?: { id: string; code: string; title: string; convertFactor: number | null } | null;
  }>>([]);
  const [spList, setSpList] = useState<Array<{
    id: string; code: string; taskName: string; factor: number | null; factorSnapshot: number | null;
    quantity: number | null; quantityUnit: string | null; reviewState: string | null;
  }>>([]);
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
        // V3 (F11/F12): công việc đã xác nhận nhưng chưa có hồ sơ kết quả tháng.
        setDrafts(json.drafts || []);
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
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => {
        const pid = j?.user?.personId;
        if (pid) setMePersonId(pid);
      })
      .catch(() => undefined);
  }, []);

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

  // V3 (F11/F12): nạp danh sách sản phẩm QĐ1277 của đầu việc đang chọn (nhiều SP).
  useEffect(() => {
    if (!fWorkItemId) {
      setSpList([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/work-item-products?workItemId=${fWorkItemId}`);
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        const list = (json.data || []).map((x: any) => ({
          id: x.id,
          code: x.code,
          taskName: x.taskName,
          factor: x.factor,
          factorSnapshot: x.factorSnapshot,
          quantity: x.quantity,
          quantityUnit: x.quantityUnit,
          reviewState: x.reviewState,
        }));
        setSpList(list);
        // Chọn sẵn SP đã được lãnh đạo xác nhận (có hệ số) làm sản phẩm chính.
        const confirmed = list.find((x: any) => x.reviewState === "CONFIRMED" && x.factorSnapshot != null);
        if (confirmed) {
          setFProductId(confirmed.id);
          setFProductLabel(`${confirmed.code} — ${confirmed.taskName}`);
        }
      } catch {
        setSpList([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fWorkItemId]);

  // V3 (F11/F12): mở form ghi nhận kết quả cho một công việc đã xác nhận.
  const openAddForDraft = (d: { id: string; title: string; product?: { id: string; code: string; taskName: string } | null }) => {
    setEditing(null);
    setFWorkItemId(d.id);
    setFTitle(d.title);
    setFProductId("");
    setFProductLabel("");
    setFDue("");
    setFDoneDate("");
    setFAssigned("");
    setFCompleted("");
    setFEvidence("");
    setFLate("0");
    setFRework("0");
    setFNotes("");
    setShowModal(true);
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
    // YC-38 D6-F12: lấy NGÀY LỊCH (10 ký tự) — cắt 16 ký tự làm <input type="date"> hiển thị trống
    setFDue(toCalendarDate(it.dueDate)); setFDoneDate(toCalendarDate(it.completedDate));
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
        // YC-38 D6-F12: chi gui khi có giá trị. Nếu gui null, server se GHI NULL
        // (khong ke thua han tu dau viec) ⇒ mat han trong tong hop.
        ...(fDue ? { dueDate: calendarDateToIso(fDue) } : {}),
        ...(fDoneDate ? { completedDate: calendarDateToIso(fDoneDate) } : {}),
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

  const handleOfficialExport = async (code: "2c" | "2d" | "2e" | "cong-van") => {
    if (officialExporting) return;
    const quarter = Math.ceil(month / 3);
    setOfficialExporting(code);
    try {
      const res = await fetch(`/api/reports/official/${code}?year=${year}&quarter=${quarter}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Không thể xuất biểu mẫu");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      a.href = url;
      a.download = m ? m[1] : `Bieu-mau-${code}-Q${quarter}-${year}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Đã xuất biểu mẫu theo file mẫu chính thức");
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi xuất biểu mẫu");
    } finally {
      setOfficialExporting(null);
    }
  };

  return (
    <div className="flex w-full flex-col gap-3 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-v5-ink">Kết quả công tác tháng</h1>
            <Badge variant="outline">Chưa chấm điểm</Badge>
          </div>
          <p className="mt-1 text-sm text-v5-muted">
            Tự động tổng hợp từ việc được giao và việc tự tạo trong tháng · thiếu mã sản phẩm thì chờ đối chiếu.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" /> Bổ sung việc ngoài hệ thống
          </Button>
          <Button data-tour="export-btns" variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            <FileDown className="h-3.5 w-3.5" />
            {exporting ? "Đang xuất..." : "Xuất Bảng 1 + 01A"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport02C} disabled={exporting}>
            <FileDown className="h-3.5 w-3.5" />
            {exporting ? "Đang xuất..." : "Xuất KH tháng 02C"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-v5-line bg-v5-surface p-3 shadow-sm">
        <label className="text-xs font-semibold text-v5-muted">Tháng</label>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="h-9 rounded-md border border-v5-line bg-v5-surface px-2 text-xs text-v5-ink"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>Tháng {m}</option>)}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-9 rounded-md border border-v5-line bg-v5-surface px-2 text-xs text-v5-ink"
        >
          {[2025, 2026, 2027].map((y) => <option key={y} value={y}>Năm {y}</option>)}
        </select>
        {canPickPerson && (
          <select
            value={personId}
            onChange={(e) => { setPersonId(e.target.value); fetchData(year, month, e.target.value); }}
            className="h-9 max-w-xs rounded-md border border-v5-line bg-v5-surface px-2 text-xs text-v5-ink"
          >
            <option value="">Cán bộ của tôi</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        )}
        <Button variant="outline" size="sm" onClick={() => fetchData(year, month, personId)}>
          <RefreshCw className="h-3.5 w-3.5" /> Tải lại
        </Button>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-v5-ink">
              Biểu mẫu quý — xuất từ file mẫu chính thức
            </div>
            <div className="mt-0.5 text-[11px] text-v5-muted">
              Quý {Math.ceil(month / 3)}/{year} · 2C, 2D, 2E và Công văn đánh giá, xếp loại
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={officialExporting !== null}
              onClick={() => handleOfficialExport("2d")}
            >
              <FileDown className="h-3.5 w-3.5" />
              {officialExporting === "2d" ? "Đang xuất..." : "Mẫu 2D"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={officialExporting !== null}
              onClick={() => handleOfficialExport("2e")}
            >
              <FileDown className="h-3.5 w-3.5" />
              {officialExporting === "2e" ? "Đang xuất..." : "Mẫu 2E"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={officialExporting !== null}
              onClick={() => handleOfficialExport("2c")}
            >
              <FileDown className="h-3.5 w-3.5" />
              {officialExporting === "2c" ? "Đang xuất..." : "Mẫu 2C"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={officialExporting !== null}
              onClick={() => handleOfficialExport("cong-van")}
            >
              <FileDown className="h-3.5 w-3.5" />
              {officialExporting === "cong-van" ? "Đang xuất..." : "Công văn"}
            </Button>
          </div>
        </div>
      </Card>

      {summary && (
        <div data-tour="summary" className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Card className="p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-v5-muted">Đầu việc ghi nhận</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-v5-ink">{summary.totalItems}</div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-v5-muted">Hoàn thành (quy đổi)</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-v5-success">{summary.completedConverted}</div>
            <div className="mt-1 text-[10px] text-v5-muted">thô: {summary.completedRaw} · giao quy đổi: {summary.assignedConverted}</div>
          </Card>
          <Card className={`p-3 ${summary.unmappedCount > 0 ? "border-v5-gold/50 bg-v5-gold-soft" : ""}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-v5-muted">Chờ đối chiếu mã SP</div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${summary.unmappedCount > 0 ? "text-v5-gold-ink" : "text-v5-ink"}`}>
              {summary.unmappedCount}
            </div>
          </Card>
          <Card className={`p-3 ${summary.missingFieldsCount > 0 ? "border-v5-danger/30 bg-v5-danger-soft" : ""}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-v5-muted">Thiếu số liệu</div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${summary.missingFieldsCount > 0 ? "text-v5-danger" : "text-v5-ink"}`}>
              {summary.missingFieldsCount}
            </div>
            <div className="mt-1 text-[10px] text-v5-muted">chậm: {summary.lateTotal} · làm lại: {summary.reworkTotal}</div>
          </Card>
        </div>
      )}

      {scorePreview && (
        <div
          data-testid="yc33-score-preview"
          className={`border rounded-xl p-4 shadow-sm ${
            scorePreview.status === "KNOWN"
              ? "bg-v5-gold-soft border-v5-gold/50"
              : "bg-v5-bg border-v5-line"
          }`}
        >
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="px-2 py-0.5 rounded bg-v5-gold-soft text-v5-gold-ink text-[11px] font-bold uppercase">
              Điểm tính thử — chưa chính thức
            </span>
            {/* YC-33: trạng thái tính điểm */}
            <span
              data-testid="yc33-score-status"
              className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                scorePreview.status === "KNOWN"
                  ? "bg-emerald-200 text-v5-success"
                  : scorePreview.status === "PENDING_RULE"
                    ? "bg-v5-gold text-v5-gold-ink"
                    : "bg-v5-line text-v5-ink"
              }`}
            >
              {scorePreview.status === "KNOWN"
                ? "Đủ căn cứ"
                : scorePreview.status === "INSUFFICIENT_DATA"
                  ? "Chưa đủ dữ liệu"
                  : scorePreview.status === "PENDING_RULE"
                    ? "Chờ quy tắc"
                    : scorePreview.status === "NOT_APPLICABLE"
                      ? "Chưa áp dụng"
                      : "Lỗi"}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
            <div><div className="text-[11px] text-v5-muted">Số lượng (a)</div><div className="text-xl font-bold">{scorePreview.qtyRatio ?? "—"}{scorePreview.qtyRatio !== null && "%"}</div></div>
            <div><div className="text-[11px] text-v5-muted">Tiến độ (b)</div><div className="text-xl font-bold">{scorePreview.progressRatio ?? "—"}{scorePreview.progressRatio !== null && "%"}</div></div>
            <div><div className="text-[11px] text-v5-muted">Chất lượng (c)</div><div className="text-xl font-bold">{scorePreview.qualityRatio ?? "—"}{scorePreview.qualityRatio !== null && "%"}</div></div>
            <div><div className="text-[11px] text-v5-muted">d = (a+b+c)/3</div><div className="text-xl font-bold">{scorePreview.averageD ?? "—"}</div></div>
            <div><div className="text-[11px] text-v5-muted">Điểm KQ ×70%</div><div className="text-xl font-bold text-v5-gold-ink">{scorePreview.score70 ?? "—"}</div></div>
          </div>
          <p className="text-[11px] text-v5-muted mt-2">
            Tính đúng công thức mẫu Bảng 1/01A từ số liệu đã ghi. {scorePreview.note}
          </p>

          {/* YC-33: lý do và chi tiết từng dòng */}
          {scorePreview.reasons && scorePreview.reasons.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {scorePreview.reasons.map((r: string, i: number) => (
                <li key={i} className="text-[11px] text-v5-gold-ink flex items-start gap-1">
                  <V5Icon name="info" className="text-[14px] shrink-0" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
          {scorePreview.rows && scorePreview.rows.length > 0 && (
            <details className="mt-2">
              <summary className="text-[11px] font-semibold text-v5-muted cursor-pointer">
                Chi tiết {scorePreview.rows.length} dòng công việc (nguồn hệ số, trạng thái)
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-v5-muted text-left">
                      <th className="py-1 pr-2">Công việc</th>
                      <th className="py-1 pr-2">Nguồn hệ số</th>
                      <th className="py-1 pr-2 text-right">Hệ số</th>
                      <th className="py-1 pr-2 text-right">G</th>
                      <th className="py-1 pr-2 text-right">I</th>
                      <th className="py-1 pr-2 text-right">L</th>
                      <th className="py-1 pr-2 text-right">N</th>
                      <th className="py-1">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorePreview.rows.map((r: any) => (
                      <tr key={r.id} className="border-t border-v5-line">
                        <td className="py-1 pr-2 text-v5-ink max-w-[260px] truncate">
                          {r.title}
                        </td>
                        <td className="py-1 pr-2 text-v5-muted">
                          {r.factorSource === "QD1277_PRODUCT"
                            ? "QĐ1277"
                            : r.factorSource === "TX_CATALOG"
                              ? "Danh mục TX"
                              : r.factorSource === "MANUAL"
                                ? "Đã chốt"
                                : r.factorSource === "PENDING_RULE"
                                  ? "Chờ quy tắc"
                                  : "Chưa có"}
                        </td>
                        <td className="py-1 pr-2 text-right font-mono">
                          {r.factor ?? "—"}
                        </td>
                        <td className="py-1 pr-2 text-right font-mono">{r.g ?? "—"}</td>
                        <td className="py-1 pr-2 text-right font-mono">{r.i ?? "—"}</td>
                        <td className="py-1 pr-2 text-right font-mono">{r.l ?? "—"}</td>
                        <td className="py-1 pr-2 text-right font-mono">{r.n ?? "—"}</td>
                        <td className="py-1 text-v5-muted">
                          {r.status === "KNOWN" ? "OK" : r.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}

      {/* YC-34 — Xem trước & xuất biểu mẫu 01A/01B/02A/02B */}
      {(personId || mePersonId) && (
        <EvaluationExportPanel
          personId={personId || mePersonId}
          year={year}
          month={month}
        />
      )}

      {/* YC-36 — Tự đánh giá, nhận xét lãnh đạo, mức xếp loại đề xuất */}
      {(personId || mePersonId) && (
        <SelfAssessmentPanel
          personId={personId || mePersonId}
          periodType="MONTH"
          year={year}
          number={month}
          taskResultScore={scorePreview?.averageD ?? null}
        />
      )}

      {/* V3 (F11/F12): công việc đã được lãnh đạo xác nhận nhưng chưa có hồ sơ kết quả tháng.
          Hiển thị như BẢN NHÁP — cán bộ bấm "Ghi nhận kết quả" để tạo hồ sơ (1 hồ sơ / 1 công việc). */}
      {!loading && drafts.length > 0 && (
        <div
          data-testid="monthly-drafts"
          className="rounded-xl border border-v5-gold/50 bg-v5-gold-soft/60 p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-v5-gold-ink">
              Công việc đã được lãnh đạo xác nhận — chờ ghi nhận kết quả tháng ({drafts.length})
            </p>
            <span className="text-[11px] text-v5-gold-ink">Đây là bản nháp, chưa tính vào điểm chính thức</span>
          </div>
          {drafts.map((d) => (
            <div
              key={d.id}
              data-testid={`monthly-draft-${d.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-v5-gold/50 bg-v5-surface px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-v5-ink truncate">{d.title}</p>
                <p className="text-[11px] text-v5-muted">
                  {d.officialState === "OFFICIAL" ? "Đã xác nhận" : "Chờ xác nhận"} ·{" "}
                  {d.completedDate ? `hoàn thành ${toCalendarDate(d.completedDate)}` : "chưa có ngày hoàn thành"} ·{" "}
                  {d.spTotal > 0
                    ? `sản phẩm: ${d.spConfirmed}/${d.spTotal} đã xác nhận`
                    : "chưa gắn sản phẩm QĐ1277"}
                  {d.evidenceCount > 0 ? ` · ${d.evidenceCount} minh chứng` : ""}
                </p>
                {d.resultText && (
                  <p className="text-[11px] text-v5-muted truncate">Kết quả: {d.resultText}</p>
                )}
              </div>
              <button
                type="button"
                data-testid={`monthly-draft-open-${d.id}`}
                onClick={() => openAddForDraft(d)}
                className="rounded-lg border border-v5-gold/60 bg-v5-gold px-3 py-1.5 text-xs font-semibold text-v5-ink hover:opacity-90"
              >
                Ghi nhận kết quả
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-v5-surface rounded-xl border border-v5-line shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="bg-v5-bg text-v5-ink text-xs uppercase">
              <th className="py-2.5 px-3 text-left">Nhiệm vụ / Sản phẩm</th>
              <th className="py-2.5 px-3 text-left">Mã SP · Hệ số</th>
              <th className="py-2.5 px-3 text-right">Giao</th>
              <th className="py-2.5 px-3 text-right">Hoàn thành</th>
              <th className="py-2.5 px-3 text-left">Minh chứng / Hạn</th>
              <th className="py-2.5 px-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-v5-line">
            {items.map((it) => (
              <tr key={it.id} className="hover:bg-v5-bg">
                <td className="py-2.5 px-3">
                  <div className="font-semibold text-v5-ink">{it.title}</div>
                  {it.officialReady ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mt-1 rounded bg-v5-success-soft text-v5-success text-[11px] font-semibold" data-testid={`mr-official-${it.id}`}>
                      <V5Icon name="verified" className="text-[13px]" />
                      Đủ điều kiện tổng hợp chính thức
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mt-1 rounded bg-v5-gold-soft text-v5-gold-ink text-[11px] font-semibold" data-testid={`mr-draft-${it.id}`}>
                      <V5Icon name="edit_note" className="text-[13px]" />
                      DỰ THẢO — chưa đủ điều kiện tổng hợp chính thức
                    </span>
                  )}
                  {it.outputText && <div className="text-v5-muted text-xs">{it.outputText}</div>}
                  {it.workItem && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="px-1.5 py-0.5 rounded bg-v5-accent-soft text-v5-accent text-[11px] font-semibold">
                        Đầu việc: {it.workItem.title}
                      </span>
                      {it.workItem.catalogEntry && (
                        <span className="px-1.5 py-0.5 rounded bg-v5-accent-soft text-v5-accent font-mono text-[10px]">
                          {it.workItem.catalogEntry.code}
                        </span>
                      )}
                      {typeof it.workItem._count?.evidences === "number" && (
                        <span className="px-1.5 py-0.5 rounded bg-v5-bg text-v5-muted text-[10px]">
                          {it.workItem._count.evidences} minh chứng
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-1 mt-1">
                    {it.needsReview && <span className="px-1.5 py-0.5 rounded bg-v5-gold-soft text-v5-gold-ink text-[11px] font-semibold">Chờ đối chiếu mã SP</span>}
                    {missing(it) && <span className="px-1.5 py-0.5 rounded bg-v5-danger-soft text-v5-danger text-[11px] font-semibold">Thiếu số liệu</span>}
                  </div>
                </td>
                <td className="py-2.5 px-3 text-xs">
                  {it.productItem
                    ? <><span className="font-mono font-bold text-v5-accent">{it.productItem.code}</span>
                      <span className="block text-v5-muted">hệ số {it.factorSnapshot ?? it.productItem.convertFactor ?? "—"}</span></>
                    : <span className="text-v5-muted">—</span>}
                </td>
                <td className="py-2.5 px-3 text-right">{it.assignedQty ?? "—"}</td>
                <td className="py-2.5 px-3 text-right font-bold">{it.completedQty ?? "—"}</td>
                <td className="py-2.5 px-3 text-xs text-v5-muted">
                  {it.evidenceRef || "—"}
                  <span className="block text-v5-muted">
                    {it.completedDate ? `xong ${it.completedDate.slice(0, 10)}` : "chưa có ngày xong"}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                  <button onClick={() => openEdit(it)} className="px-2.5 py-1 rounded bg-v5-bg text-xs font-semibold mr-1">Sửa</button>
                  <button onClick={() => handleDelete(it.id, it.title)} className="px-2.5 py-1 rounded bg-v5-danger-soft text-v5-danger text-xs font-semibold">Xóa</button>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} className="py-10 text-center text-v5-muted">Chưa có kết quả nào trong tháng {month}/{year}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-v5-surface rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 bg-v5-accent text-white flex items-center justify-between">
              <h3 className="font-semibold">{editing ? "Sửa kết quả tháng" : "Ghi nhận kết quả tháng"}</h3>
              <button onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="p-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-v5-ink">Tên nhiệm vụ / công việc *</label>
                  <input required value={fTitle} onChange={(e) => setFTitle(e.target.value)}
                    placeholder="Nhập tên nhiệm vụ, công việc thực tế..."
                    className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-v5-ink">
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
                          // YC-38 D6-F12: lấy NGÀY LỊCH (10 ký tự) — cắt 16 ký tự làm <input type="date"> hiển thị trống
                          if (wi.dueDate) setFDue(toCalendarDate(wi.dueDate));
                          if (wi.completedDate) setFDoneDate(toCalendarDate(wi.completedDate));
                          // Kế thừa sản phẩm đã gắn ở kế hoạch nếu chưa chọn sản phẩm
                          if (!fProductId && wi.product) {
                            setFProductId(wi.product.id);
                            setFProductLabel(`${wi.product.code} — ${wi.product.taskName}`);
                          }
                        }
                      }
                    }}
                    className="h-10 px-3 rounded-lg border border-v5-line text-sm"
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
                    <p className="text-[11px] text-v5-accent bg-v5-accent-soft border border-v5-line rounded px-2 py-1.5">
                      Đã liên kết đầu việc — mỗi đầu việc chỉ có một kết quả tháng. Hạn xử lý và ngày hoàn thành được
                      kế thừa từ đầu việc, có thể sửa trực tiếp bên dưới.
                    </p>
                  )}
                  {/* V3 (F11/F12): nhiều sản phẩm QĐ1277 trên một công việc — hiển thị trạng thái
                      xác nhận của từng SP; SP chưa xác nhận hoặc thiếu hệ số KHÔNG đủ điều kiện
                      tính điểm chính thức. */}
                  {fWorkItemId && spList.length > 0 && (
                    <div
                      data-testid="work-item-sp-list"
                      className="rounded-lg border border-v5-line bg-v5-bg px-2 py-1.5 space-y-1"
                    >
                      <p className="text-[11px] font-semibold text-v5-ink">
                        Sản phẩm QĐ1277 của công việc ({spList.length})
                      </p>
                      {spList.map((sp) => (
                        <div key={sp.id} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono text-v5-ink truncate">
                            {sp.code} — {sp.taskName}
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="text-v5-muted">
                              hệ số {sp.factorSnapshot ?? sp.factor ?? "chưa có"}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded font-semibold ${
                                sp.reviewState === "CONFIRMED"
                                  ? "bg-v5-success-soft text-v5-success"
                                  : sp.reviewState === "REJECTED"
                                    ? "bg-v5-danger-soft text-v5-danger"
                                    : "bg-v5-gold-soft text-v5-gold-ink"
                              }`}
                            >
                              {sp.reviewState === "CONFIRMED"
                                ? "Đã xác nhận"
                                : sp.reviewState === "REJECTED"
                                  ? "Không duyệt"
                                  : "Chờ xác nhận"}
                            </span>
                          </span>
                        </div>
                      ))}
                      <p className="text-[10px] text-v5-muted">
                        Sản phẩm chưa được lãnh đạo xác nhận hoặc chưa có hệ số sẽ không tham gia điểm chính thức.
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-v5-ink">Mã sản phẩm QĐ1277 (để trống = chờ đối chiếu)</label>
                  {fProductId
                    ? <div className="flex items-center gap-2 h-10 px-2 rounded-lg bg-v5-accent-soft border border-v5-line text-sm">
                      <span className="flex-1 truncate font-mono">{fProductLabel}</span>
                      <button type="button" onClick={() => { setFProductId(""); setFProductLabel(""); }} className="text-v5-danger font-bold">✕</button>
                    </div>
                    : <>
                      <input value={pSearch} onChange={(e) => searchProducts(e.target.value)}
                        placeholder="Gõ từ 2 ký tự để tìm trong 3386 sản phẩm..."
                        className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                      {pSearching && <span className="text-xs text-v5-muted">Đang tìm...</span>}
                      {pResults.length > 0 && (
                        <div className="border border-v5-line rounded-lg max-h-44 overflow-y-auto divide-y">
                          {pResults.map((p) => (
                            <button type="button" key={p.id}
                              onClick={() => { setFProductId(p.id); setFProductLabel(`${p.code} — ${p.taskName}`); setPResults([]); setPSearch(""); }}
                              className="w-full text-left p-2 hover:bg-v5-bg text-xs">
                              <span className="font-mono font-bold text-v5-accent">{p.code}</span>
                              <span className="text-v5-muted">
                                {" · hệ số "}
                                {p.convertFactor !== null && p.convertFactor !== undefined
                                  ? p.convertFactor
                                  : "CHƯA CÓ (chờ đối chiếu)"}
                              </span>
                              <span className="block text-v5-ink">{p.taskName}</span>
                              {p.outputProduct ? (
                                <span className="block text-v5-muted">Sản phẩm đầu ra: {p.outputProduct}</span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      )}
                    </>}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-v5-ink">Sản phẩm thực tế</label>
                  <input value={fOutput} onChange={(e) => setFOutput(e.target.value)}
                    placeholder="Nhập sản phẩm, số lượng cụ thể đã tạo ra..."
                    className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-v5-ink">Số lượng giao</label>
                    <input type="number" min={0} value={fAssigned} onChange={(e) => setFAssigned(e.target.value)}
                      placeholder="Để trống nếu không có" className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-v5-ink">Số lượng hoàn thành</label>
                    <input type="number" min={0} value={fCompleted} onChange={(e) => setFCompleted(e.target.value)}
                      placeholder="Nhập số thực tế..." className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-v5-ink">Ngày phải xong</label>
                    <input type="date" value={fDue} onChange={(e) => setFDue(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-v5-ink">Ngày xong thực tế</label>
                    <input type="date" value={fDoneDate} onChange={(e) => setFDoneDate(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-v5-ink">Số lần chậm</label>
                    <input type="number" min={0} value={fLate} onChange={(e) => setFLate(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-v5-ink">Số lần làm lại</label>
                    <input type="number" min={0} value={fRework} onChange={(e) => setFRework(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-v5-ink">Minh chứng / số hiệu văn bản</label>
                  <input value={fEvidence} onChange={(e) => setFEvidence(e.target.value)}
                    placeholder="Nhập số hiệu văn bản, hồ sơ liên quan..."
                    className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-v5-ink">Ghi chú</label>
                  <textarea rows={2} value={fNotes} onChange={(e) => setFNotes(e.target.value)}
                    className="p-2.5 rounded-lg border border-v5-line text-sm" />
                </div>
                <p className="text-[11px] text-v5-muted">
                  Gửi xong lãnh đạo nhận tin duyệt ngay. Chọn mã SP để hệ số quy đổi được chốt theo danh mục hiện hành.
                </p>
              </div>
              <div className="p-4 bg-v5-bg flex items-center justify-end gap-2 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm">Hủy</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-v5-accent text-white text-sm font-semibold disabled:opacity-50">
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
