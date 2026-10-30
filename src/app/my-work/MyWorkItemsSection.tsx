"use client";

import { V5Icon } from "@/components/v5/ui/lucide-icon";

import { vnDateOnly } from "@/lib/datetime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/Toast";
import WorkItemReviewBox from "./WorkItemReviewBox";
import WorkItemProductsPanel from "./WorkItemProductsPanel";
import EvidenceAdjustmentsPanel from "./EvidenceAdjustmentsPanel";
import {
  journalDateInRange,
  journalPeriodRange,
  journalTextMatches,
  type JournalFilterState,
} from "@/components/work/JournalFilterBar";

interface WorkItem {
  id: string;
  personId: string;
  title: string;
  status: string;
  priority?: string | null;
  expectedResult?: string | null;
  dueDate?: string | null;
  completedDate?: string | null;
  createdAt: string;
  catalogEntryId?: string | null;
  catalogEntry?: { id: string; code: string; title: string; department: string; status: string } | null;
  assignedQty?: number | null;
  completedQty?: number | null;
  quantityUnit?: string | null;
  deptWorkItemId?: string | null;
  deptWorkItem?: { id: string; title: string; unit?: { id: string; name: string } | null } | null;
  templateId?: string | null;
  template?: { id: string; code: string; title: string } | null;
  productItemId?: string | null;
  product?: { id: string; code: string; taskName: string } | null;
  taskId?: string | null;
  task?: { id: string; code: string; title: string; status: string; currentDeadline?: string } | null;
  _count?: { evidences: number };
  period?: { id: string; title?: string | null } | null;
  planItemId?: string | null;
  /** V3.0.1: trạng thái hồ sơ xác nhận của công việc tự ghi nhận. */
  reviewState?: string | null;
  resultText?: string | null;
  reviewNote?: string | null;
  submitCount?: number | null;
  submittedAt?: string | null;
  /** YC-32 liên thông: công việc đã đưa vào kết quả đánh giá tháng hay chưa. */
  inEvaluation?: boolean;
  evaluationPeriods?: Array<{ year: number; month: number; needsReview: boolean }>;
  planItem?: {
    id: string;
    plan?: { id: string; title: string; status: string } | null;
  } | null;
}

interface Evidence {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  note?: string | null;
  createdAt: string;
  uploadedBy?: { id: string; fullName: string; code?: string } | null;
  canDelete: boolean;
}

interface EvidenceMeta {
  canUpload: boolean;
  periodLocked: boolean;
  scope: string;
  maxFileMb: number;
}

interface Props {
  personId?: string;
  /** YC-30 (bổ sung) — bộ lọc Nhật ký công việc dùng chung (thời gian / nguồn / trạng thái). */
  journalFilter?: JournalFilterState;
}

const pad = (n: number) => String(n).padStart(2, "0");

  // V2 (YC-38 UAT-D5.1): ngày theo giờ Việt Nam — KHÔNG phụ thuộc múi giờ thiết bị.
  // (trước đây dùng getFullYear/getMonth/getDate của máy ⇒ lệch 1 ngày ở TZ khác UTC+7)
  const toDateInput = (d: Date) => vnDateOnly(d);

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const sourceBadge = (item: WorkItem) => {
  if (item.catalogEntry) {
    return {
      label: `TX · ${item.catalogEntry.code}`,
      className: "bg-teal-50 text-teal-800 border-teal-200",
      title: `Danh mục TX — ${item.catalogEntry.department}`,
    };
  }
  if (item.deptWorkItem) {
    return {
      label: `Bộ phận${item.deptWorkItem.unit?.name ? ` · ${item.deptWorkItem.unit.name}` : ""}`,
      className: "bg-sky-50 text-sky-800 border-sky-200",
      title: item.deptWorkItem.title,
    };
  }
  if (item.template) {
    return {
      label: `Mẫu cũ · ${item.template.code}`,
      className: "bg-slate-100 text-slate-700 border-slate-200",
      title: item.template.title,
    };
  }
  return {
    label: "Tự nhập",
    className: "bg-slate-100 text-slate-600 border-slate-200",
    title: "Đầu việc tự nhập ngoài danh mục",
  };
};

const isOverdue = (item: WorkItem) => {
  if (item.completedDate || !item.dueDate) return false;
  const due = new Date(item.dueDate);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
};

export default function MyWorkItemsSection({ personId, journalFilter }: Props) {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [evidences, setEvidences] = useState<Record<string, Evidence[]>>({});
  const [evidenceMeta, setEvidenceMeta] = useState<Record<string, EvidenceMeta>>({});
  const [evidenceLoadingId, setEvidenceLoadingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<Record<string, File | null>>({});
  const [evidenceNote, setEvidenceNote] = useState<Record<string, string>>({});
  const [dueEditId, setDueEditId] = useState<string | null>(null);
  const [dueDraft, setDueDraft] = useState("");
  const [showCompleted, setShowCompleted] = useState(true);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/personal-work-items?year=${year}&month=${month}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không tải được đầu việc kế hoạch");
      const list: WorkItem[] = json.data || [];
      const mine = personId ? list.filter((it) => it.personId === personId) : list;
      setItems(mine);
    } catch (err: any) {
      toast.error(err.message || "Không tải được đầu việc kế hoạch");
    } finally {
      setLoading(false);
    }
  }, [year, month, personId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const aDone = !!a.completedDate;
      const bDone = !!b.completedDate;
      if (aDone !== bDone) return aDone ? 1 : -1;
      if (!aDone) {
        if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [items]);

  const visibleItems = useMemo(() => {
    const base = showCompleted ? sortedItems : sortedItems.filter((it) => !it.completedDate);
    if (!journalFilter) return base;

    // Bộ lọc Nhật ký công việc (YC-30 bổ sung) — áp dụng cho đầu việc kế hoạch.
    const range = journalPeriodRange(journalFilter.period);
    return base.filter((it) => {
      if (!journalDateInRange(it.dueDate, it.completedDate, range)) return false;
      if (
        !journalTextMatches(
          journalFilter.query,
          it.title,
          it.catalogEntry?.code,
          it.deptWorkItem?.title,
          it.template?.code
        )
      ) {
        return false;
      }
      // Nguồn: "Từ kế hoạch" = đầu việc có liên kết kế hoạch; "Phát sinh" = tự nhập.
      if (journalFilter.source === "plan" && !it.planItemId) return false;
      if (journalFilter.source === "adhoc" && it.planItemId) return false;
      // Trạng thái
      if (journalFilter.status === "active" && it.completedDate) return false;
      if (journalFilter.status === "overdue" && !isOverdue(it)) return false;
      if (journalFilter.status === "done" && !it.completedDate) return false;
      return true;
    });
  }, [sortedItems, showCompleted, journalFilter]);

  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter((it) => !!it.completedDate).length;
    const overdue = items.filter(isOverdue).length;
    return { total, done, overdue, remaining: total - done };
  }, [items]);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setExpandedId(null);
  };

  const patchItem = async (id: string, payload: Record<string, any>, successMessage: string) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/personal-work-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không cập nhật được đầu việc");
      toast.success(successMessage);
      await fetchItems();
      return true;
    } catch (err: any) {
      toast.error(err.message || "Không cập nhật được đầu việc");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const markComplete = async (item: WorkItem) => {
    const today = toDateInput(new Date());
    if (item.completedDate) {
      const ok = await patchItem(item.id, { completedDate: null }, "Đã bỏ đánh dấu hoàn thành");
      if (ok && expandedId === item.id) await fetchEvidences(item.id);
      return;
    }
    const ok = await patchItem(item.id, { completedDate: today }, "Đã đánh dấu hoàn thành hôm nay");
    if (ok && expandedId === item.id) await fetchEvidences(item.id);
  };

  const saveDueDate = async (item: WorkItem) => {
    const ok = await patchItem(
      item.id,
      { dueDate: dueDraft || null },
      dueDraft ? "Đã cập nhật hạn xử lý" : "Đã xóa hạn xử lý"
    );
    if (ok) {
      setDueEditId(null);
      setDueDraft("");
    }
  };

  const fetchEvidences = async (workItemId: string) => {
    setEvidenceLoadingId(workItemId);
    try {
      const res = await fetch(`/api/work-evidence?workItemId=${workItemId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không tải được minh chứng");
      setEvidences((prev) => ({ ...prev, [workItemId]: json.data || [] }));
      setEvidenceMeta((prev) => ({ ...prev, [workItemId]: json.meta }));
    } catch (err: any) {
      toast.error(err.message || "Không tải được minh chứng");
    } finally {
      setEvidenceLoadingId(null);
    }
  };

  const toggleEvidence = async (item: WorkItem) => {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.id);
    if (!evidences[item.id]) await fetchEvidences(item.id);
    else await fetchEvidences(item.id);
  };

  const uploadEvidence = async (item: WorkItem) => {
    const file = evidenceFile[item.id];
    if (!file) {
      toast.warning("Vui lòng chọn tệp minh chứng");
      return;
    }
    setUploadingId(item.id);
    try {
      const form = new FormData();
      form.append("workItemId", item.id);
      form.append("file", file);
      const note = evidenceNote[item.id]?.trim();
      if (note) form.append("note", note);
      const res = await fetch("/api/work-evidence", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không tải được minh chứng");
      toast.success(json.message || "Đã tải lên minh chứng");
      setEvidenceFile((prev) => ({ ...prev, [item.id]: null }));
      setEvidenceNote((prev) => ({ ...prev, [item.id]: "" }));
      await fetchEvidences(item.id);
      await fetchItems();
    } catch (err: any) {
      toast.error(err.message || "Không tải được minh chứng");
    } finally {
      setUploadingId(null);
    }
  };

  const downloadEvidence = async (item: WorkItem, evidence: Evidence) => {
    try {
      const res = await fetch(`/api/work-evidence/${evidence.id}/file`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || "Không tải được tệp minh chứng");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = evidence.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || "Không tải được tệp minh chứng");
    }
  };

  const deleteEvidence = async (item: WorkItem, evidence: Evidence) => {
    if (!confirm(`Xóa minh chứng "${evidence.fileName}"? Thao tác này được ghi nhật ký.`)) return;
    try {
      const res = await fetch(`/api/work-evidence/${evidence.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không xóa được minh chứng");
      toast.success(json.message || "Đã xóa minh chứng");
      await fetchEvidences(item.id);
      await fetchItems();
    } catch (err: any) {
      toast.error(err.message || "Không xóa được minh chứng");
    }
  };

  const createLinkedTask = async (item: WorkItem) => {
    if (!confirm(`Giao nhiệm vụ "${item.title}" cho chính đầu việc này? Hệ thống chỉ tạo/lấy nhiệm vụ liên kết, không nhân bản.`)) {
      return;
    }
    setBusyId(item.id);
    try {
      const deadlineDate = item.dueDate
        ? new Date(item.dueDate)
        : new Date(Date.now() + 7 * 86400000);
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          ownerId: item.personId,
          deadline: toDateInput(deadlineDate),
          priority: item.priority || "Trung bình",
          expectedResultText: item.expectedResult || undefined,
          workItemId: item.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không giao được nhiệm vụ");
      toast.success(
        json.linkedExisting || json.deduplicated
          ? "Đầu việc đã có nhiệm vụ liên kết — không tạo trùng"
          : `Đã giao nhiệm vụ ${json.data?.code || ""}`
      );
      await fetchItems();
    } catch (err: any) {
      toast.error(err.message || "Không giao được nhiệm vụ");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      data-testid="my-work-items"
      className="bg-v5-surface rounded-xl shadow-sm border border-v5-line/50 overflow-hidden"
    >
      <div className="p-space-md bg-surface-subtle border-b border-v5-line flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-headline-sm text-headline-sm text-primary font-bold flex items-center gap-2">
            <V5Icon name="checklist" className="text-secondary text-[22px]" />
            Đầu việc kế hoạch — hạn xử lý, kết quả &amp; minh chứng
          </h2>
          <p className="text-xs text-outline">
            Luồng thống nhất YC-32: chọn đầu việc → hạn xử lý → thực hiện → ngày hoàn thành → minh chứng → kết quả
            tháng. Không tự tạo nhiệm vụ hay kết quả trùng.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-v5-surface rounded-lg border border-border-subtle p-1">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="p-1 rounded hover:bg-v5-bg"
              title="Tháng trước"
            >
              <V5Icon name="chevron_left" className="text-[18px]" />
            </button>
            <span className="px-2 text-xs font-semibold text-primary whitespace-nowrap">
              Tháng {pad(month)}/{year}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="p-1 rounded hover:bg-v5-bg"
              title="Tháng sau"
            >
              <V5Icon name="chevron_right" className="text-[18px]" />
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-v5-muted cursor-pointer">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="rounded border-border-subtle"
            />
            Hiện việc đã xong
          </label>
          <button
            type="button"
            onClick={fetchItems}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-v5-bg border border-border-subtle disabled:opacity-50"
            title="Làm mới đầu việc"
          >
            <V5Icon name="sync" className="text-[18px]" />
          </button>
        </div>
      </div>

      <div className="px-space-md py-space-sm flex flex-wrap items-center gap-2 text-[11px] border-b border-border-subtle bg-v5-bg/40">
        <span className="px-2 py-0.5 rounded bg-v5-bg font-semibold text-primary">
          {stats.total} đầu việc
        </span>
        <span className="px-2 py-0.5 rounded bg-status-success-bg text-status-success font-semibold">
          {stats.done} đã hoàn thành
        </span>
        <span className="px-2 py-0.5 rounded bg-v5-bg text-v5-muted">
          {stats.remaining} đang thực hiện
        </span>
        {stats.overdue > 0 && (
          <span className="px-2 py-0.5 rounded bg-status-danger-bg text-status-danger font-semibold flex items-center gap-1">
            <V5Icon name="warning" className="text-[13px]" />
            {stats.overdue} quá hạn
          </span>
        )}
        <span className="ml-auto text-outline">
          Hạn xử lý chỉ chỉnh được trước khi kế hoạch duyệt; sau duyệt bị khóa đến khi có quy trình
          gia hạn. Ngày hoàn thành thực tế vẫn cập nhật và ghi nhật ký.
        </span>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-outline">Đang tải đầu việc kế hoạch...</div>
      ) : visibleItems.length === 0 ? (
        <div className="p-8 text-center space-y-1">
          <V5Icon name="task" className="text-[32px] text-outline" />
          <p className="text-sm font-semibold text-primary">Tháng này chưa có đầu việc phù hợp</p>
          <p className="text-xs text-outline">
            Đầu việc được thêm từ kế hoạch tuần (/plans). Không bắt buộc có nhiệm vụ, sản phẩm hay minh chứng.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border-subtle">
          {visibleItems.map((item) => {
            const badge = sourceBadge(item);
            const overdue = isOverdue(item);
            const done = !!item.completedDate;
            const expanded = expandedId === item.id;
            const planLocked =
              item.planItem?.plan?.status === "APPROVED" ||
              item.planItem?.plan?.status === "IN_EFFECT";
            const list = evidences[item.id] || [];
            const meta = evidenceMeta[item.id];
            const evidenceCount = item._count?.evidences ?? list.length;
            return (
              <div key={item.id} data-testid={`work-item-${item.id}`} className={done ? "bg-v5-bg/30" : ""}>
                <div className="p-space-md flex flex-col gap-space-sm">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-2">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${badge.className}`}
                          title={badge.title}
                        >
                          {badge.label}
                        </span>
                        {item.product && (
                          <span
                            className="px-1.5 py-0.5 rounded border border-border-subtle bg-v5-bg text-[10px] text-v5-muted"
                            title={item.product.taskName}
                          >
                            QĐ1277 · {item.product.code}
                          </span>
                        )}
                        {item.task && (
                          <span className="px-1.5 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-800 text-[10px] font-semibold flex items-center gap-1">
                            <V5Icon name="link" className="text-[12px]" />
                            {item.task.code}
                          </span>
                        )}
                        {item.priority && (
                          <span className="text-[10px] text-outline">Ưu tiên: {item.priority}</span>
                        )}
                      </div>
                      <p
                        className={`font-body-semibold text-body-semibold ${
                          done ? "text-v5-muted line-through" : "text-primary"
                        }`}
                      >
                        {item.title}
                      </p>
                      {item.expectedResult && (
                        <p className="text-[11px] text-outline line-clamp-2">
                          Kết quả dự kiến: {item.expectedResult}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border ${
                          done
                            ? "bg-status-success-bg text-status-success border-status-success/30"
                            : overdue
                              ? "bg-status-danger-bg text-status-danger border-status-danger/30"
                              : item.dueDate
                                ? "bg-v5-bg text-v5-muted border-border-subtle"
                                : "bg-v5-bg text-outline border-border-subtle"
                        }`}
                        title={overdue ? "Đã quá hạn xử lý" : "Hạn xử lý"}
                      >
                        <V5Icon name="event_upcoming" className="text-[14px]" />
                        Hạn: {formatDate(item.dueDate)}
                        {overdue ? " · Quá hạn" : ""}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border ${
                          done
                            ? "bg-status-success-bg text-status-success border-status-success/30"
                            : "bg-v5-bg text-outline border-border-subtle"
                        }`}
                        title="Ngày hoàn thành thực tế"
                      >
                        <V5Icon name="task_alt" className="text-[14px]" />
                        Hoàn thành: {formatDate(item.completedDate)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* V3-F01: chi cong viec da gan NHEM VU moi dung nut danh dau hoan thanh
                        (luong V1/V2, lanh dao duyet qua nhiem vu). Cong viec tu ghi nhan chi
                        co 1 duong: "Bao hoan thanh & gui lanh dao" (WorkItemReviewBox).
                        Khi dang cho duyet / da xac nhan => khoa moi thao tac. */}
                    {!!item.taskId && (item.reviewState || "DRAFT") === "DRAFT" && (
                      <button
                        type="button"
                        data-testid={`work-item-complete-${item.id}`}
                        disabled={busyId === item.id}
                        onClick={() => markComplete(item)}
                        title="Cán bộ đánh dấu đã hoàn thành. Việc này được lãnh đạo xác nhận trong luồng duyệt của nhiệm vụ."
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border active-press disabled:opacity-50 ${
                          done
                            ? "bg-v5-surface text-v5-muted border-v5-line hover:bg-v5-bg"
                            : "bg-status-success text-on-error border-status-success hover:opacity-90"
                        }`}
                      >
                        <V5Icon
                          name={done ? "undo" : "check_circle"}
                          className="text-[16px]"
                        />
                        {done ? "Bỏ đánh dấu hoàn thành" : "Đánh dấu đã hoàn thành"}
                      </button>
                    )}

                    <EvidenceAdjustmentsPanel
                      mode="staff"
                      workItemId={item.id}
                      canPropose={item.reviewState === "CONFIRMED"}
                      onChanged={async () => {
                        await fetchItems();
                      }}
                    />

                    <WorkItemProductsPanel
                      workItemId={item.id}
                      canPropose
                      onChanged={async () => {
                        await fetchItems();
                      }}
                    />

                    <WorkItemReviewBox
                      item={{
                        id: item.id,
                        title: item.title,
                        taskId: item.taskId,
                        reviewState: item.reviewState,
                        resultText: item.resultText,
                        reviewNote: item.reviewNote,
                        submitCount: item.submitCount,
                        submittedAt: item.submittedAt,
                        completedDate: item.completedDate,
                        catalogEntryId: item.catalogEntryId,
                        productItemId: item.productItemId,
                        assignedQty: item.assignedQty,
                        completedQty: item.completedQty,
                        quantityUnit: item.quantityUnit,
                      }}
                      onChanged={async () => {
                        await fetchItems();
                      }}
                    />

                    <button
                      type="button"
                      data-testid={`work-item-evidence-${item.id}`}
                      onClick={() => toggleEvidence(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-v5-line bg-v5-surface hover:bg-v5-bg active-press"
                    >
                      <V5Icon name="attach_file" className="text-[16px]" />
                      Kết quả &amp; minh chứng
                      <span className="px-1.5 py-0.5 rounded bg-v5-bg text-[10px]">
                        {evidenceCount}
                      </span>
                    </button>

                    {planLocked ? (
                      <span
                        data-testid={`work-item-due-lock-${item.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border-subtle bg-v5-bg text-v5-muted"
                        title={`Kế hoạch "${item.planItem?.plan?.title || ""}" đã duyệt — hạn xử lý gốc bị khóa. Chưa có quy trình gia hạn được duyệt; vẫn cập nhật được tiến độ/ngày hoàn thành thực tế.`}
                      >
                        <V5Icon name="lock" className="text-[16px]" />
                        Hạn đã khóa
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setDueEditId(dueEditId === item.id ? null : item.id);
                          setDueDraft(item.dueDate ? toDateInput(new Date(item.dueDate)) : "");
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border-subtle bg-v5-surface hover:bg-v5-bg active-press"
                      >
                        <V5Icon name="edit_calendar" className="text-[16px]" />
                        Sửa hạn
                      </button>
                    )}

                    {item.task ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-indigo-800 bg-indigo-50 border border-indigo-200 rounded">
                        Nhiệm vụ liên quan: {item.task.code} · {item.task.status}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => createLinkedTask(item)}
                        disabled={busyId === item.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 active-press disabled:opacity-50"
                        title="Chỉ tạo khi người dùng chủ động bấm — hệ thống không tự tạo nhiệm vụ"
                      >
                        <V5Icon name="add_task" className="text-[16px]" />
                        Giao nhiệm vụ
                      </button>
                    )}
                  </div>

                  {dueEditId === item.id && (
                    <div className="flex items-center gap-2 flex-wrap p-2 rounded-lg bg-v5-bg border border-border-subtle">
                      <label className="text-xs font-semibold text-primary">Hạn xử lý:</label>
                      <input
                        type="date"
                        value={dueDraft}
                        onChange={(e) => setDueDraft(e.target.value)}
                        className="h-9 px-2 rounded border border-border-subtle bg-v5-surface text-xs"
                      />
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => saveDueDate(item)}
                        className="px-3 py-1.5 rounded bg-secondary text-on-secondary text-xs font-semibold disabled:opacity-50"
                      >
                        Lưu hạn
                      </button>
                      <button
                        type="button"
                        onClick={() => setDueEditId(null)}
                        className="px-3 py-1.5 rounded border border-border-subtle text-xs"
                      >
                        Hủy
                      </button>
                      <span className="text-[10px] text-outline">
                        Thay đổi hạn được ghi nhật ký (giá trị cũ → mới).
                      </span>
                    </div>
                  )}

                  {expanded && (
                    <div
                      data-testid={`work-item-evidence-panel-${item.id}`}
                      className="rounded-lg border border-v5-line bg-v5-bg/40 p-3 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="text-xs font-bold text-primary flex items-center gap-1.5">
                          <V5Icon name="folder_open" className="text-[16px] text-secondary" />
                          Kết quả &amp; minh chứng
                        </h3>
                        <span className="text-[10px] text-outline">
                          Tệp được tải qua máy chủ có kiểm tra quyền, không phát URL công khai. Tối đa{" "}
                          {meta?.maxFileMb || 4} MB/tệp.
                        </span>
                      </div>

                      {evidenceLoadingId === item.id && list.length === 0 ? (
                        <p className="text-xs text-outline">Đang tải minh chứng...</p>
                      ) : list.length === 0 ? (
                        <p className="text-xs text-outline">Chưa có tệp minh chứng nào.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {list.map((ev) => (
                            <li
                              key={ev.id}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded bg-v5-surface border border-border-subtle"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-primary truncate" title={ev.fileName}>
                                  {ev.fileName}
                                </p>
                                <p className="text-[10px] text-outline">
                                  {formatBytes(ev.fileSize)} · {formatDateTime(ev.createdAt)}
                                  {ev.uploadedBy?.fullName ? ` · ${ev.uploadedBy.fullName}` : ""}
                                  {ev.note ? ` · ${ev.note}` : ""}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => downloadEvidence(item, ev)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border-subtle text-[11px] hover:bg-v5-bg"
                                >
                                  <V5Icon name="download" className="text-[14px]" />
                                  Tải
                                </button>
                                {ev.canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => deleteEvidence(item, ev)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-status-danger/30 text-[11px] text-status-danger hover:bg-status-danger-bg"
                                  >
                                    <V5Icon name="delete" className="text-[14px]" />
                                    Xóa
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}

                      {meta?.periodLocked ? (
                        <p className="text-[11px] text-status-warning flex items-center gap-1">
                          <V5Icon name="lock" className="text-[14px]" />
                          Kỳ đã chốt số liệu — minh chứng được khóa, chỉ xem/tải.
                        </p>
                      ) : (
                        <div className="flex flex-col md:flex-row md:items-center gap-2">
                          <input
                            type="file"
                            data-testid={`work-item-evidence-file-${item.id}`}
                            onChange={(e) =>
                              setEvidenceFile((prev) => ({ ...prev, [item.id]: e.target.files?.[0] || null }))
                            }
                            className="block w-full md:w-auto text-xs text-slate-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-800 hover:file:bg-teal-100"
                          />
                          <input
                            type="text"
                            value={evidenceNote[item.id] || ""}
                            onChange={(e) =>
                              setEvidenceNote((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            placeholder="Ghi chú minh chứng (tuỳ chọn)"
                            maxLength={500}
                            className="h-9 px-2.5 rounded border border-border-subtle bg-v5-surface text-xs w-full md:w-64"
                          />
                          <button
                            type="button"
                            data-testid={`work-item-evidence-upload-${item.id}`}
                            disabled={uploadingId === item.id}
                            onClick={() => uploadEvidence(item)}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-on-secondary text-xs font-semibold disabled:opacity-50 active-press"
                          >
                            <V5Icon name="upload_file" className="text-[16px]" />
                            {uploadingId === item.id ? "Đang tải..." : "Tải lên"}
                          </button>
                        </div>
                      )}

                      <p className="text-[10px] text-outline">
                        Chỉ người thực hiện và lãnh đạo trong phạm vi được xem/tải; người tải lên hoặc lãnh đạo trong
                        phạm vi được xóa khi kỳ chưa chốt. Mọi thao tác đều ghi nhật ký.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
