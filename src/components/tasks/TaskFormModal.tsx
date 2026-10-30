"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/Toast";
import { V5Icon } from "@/components/v5/ui/icon";
import WorkSourcePicker, {
  type PickedCatalogEntry,
  type PickedProduct,
} from "@/components/work/WorkSourcePicker";
import {
  WorkSourceQuantityTable,
  type WorkSourceLine,
} from "@/components/work/WorkSourceQuantityTable";
import { CollaboratorPicker } from "./CollaboratorPicker";
import { originLabel } from "@/lib/task-origin";

export interface TaskPersonOption {
  id: string;
  fullName: string;
  code?: string | null;
  position?: string | null;
}

export interface TaskUnitOption {
  id: string;
  name: string;
}

export interface TaskFormPrefill {
  workItemId?: string;
  title?: string;
  ownerId?: string;
  unitId?: string;
  /** Giá trị cho <input type="datetime-local">. */
  deadline?: string;
  priority?: string;
  expectedResult?: string;
  assignedQty?: number | null;
  quantityUnit?: string | null;
  factorSnapshot?: number | null;
  catalogEntry?: PickedCatalogEntry | null;
  product?: PickedProduct | null;
}

interface Props {
  open: boolean;
  /** self = cá nhân tự tạo; assign = lãnh đạo giao việc. */
  mode: "self" | "assign";
  onClose: () => void;
  onCreated: (task: any) => void | Promise<void>;
  currentPersonId?: string;
  currentUnitId?: string;
  people: TaskPersonOption[];
  units: TaskUnitOption[];
  canAssign: boolean;
  aiEnabled?: boolean;
  prefill?: TaskFormPrefill | null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function defaultDeadline(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T17:00`;
}

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function TaskFormModal({
  open,
  mode,
  onClose,
  onCreated,
  currentPersonId,
  currentUnitId,
  people,
  units,
  canAssign,
  aiEnabled = false,
  prefill,
}: Props) {
  const isAssign = mode === "assign";

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState(isAssign ? "Cao" : "Trung bình");
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [sourceType, setSourceType] = useState("SELF_INITIATED");
  const [description, setDescription] = useState("");
  const [expectedResult, setExpectedResult] = useState("");

  const [catalogEntry, setCatalogEntry] = useState<PickedCatalogEntry | null>(null);
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [assignedQty, setAssignedQty] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("");
  const [productQty, setProductQty] = useState("");
  const [productUnit, setProductUnit] = useState("");

  const [ownerId, setOwnerId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [collabIds, setCollabIds] = useState<string[]>([]);

  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [aiIdea, setAiIdea] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);

  // Nạp lại form mỗi lần mở (kể cả khi mở với dữ liệu điền sẵn từ đầu việc).
  useEffect(() => {
    if (!open) return;
    setTitle(prefill?.title || "");
    setPriority(prefill?.priority || (isAssign ? "Cao" : "Trung bình"));
    setDeadline(prefill?.deadline || defaultDeadline());
    setSourceType("SELF_INITIATED");
    setDescription(isAssign ? "Chỉ đạo đột xuất Lãnh đạo" : "");
    setExpectedResult(prefill?.expectedResult || "");
    setCatalogEntry(prefill?.catalogEntry || null);
    setProduct(prefill?.product || null);
    setAssignedQty(prefill?.assignedQty != null ? String(prefill.assignedQty) : "");
    setQuantityUnit(prefill?.quantityUnit || "");
    setProductQty(prefill?.product?.quantity != null ? String(prefill.product.quantity) : "");
    setProductUnit(prefill?.product?.quantityUnit || "");
    setOwnerId(prefill?.ownerId || (isAssign ? "" : currentPersonId || ""));
    setUnitId(prefill?.unitId || currentUnitId || "");
    setCollabIds([]);
    setAttachFiles([]);
    setAiIdea("");
    setSubmitting(false);
    setIdempotencyKey(newKey());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill, mode]);

  const lines: WorkSourceLine[] = useMemo(() => {
    const out: WorkSourceLine[] = [];
    if (catalogEntry) {
      out.push({
        key: "tx",
        kind: "TX",
        code: catalogEntry.code,
        title: catalogEntry.title,
        quantity: assignedQty,
        quantityUnit,
        factor: catalogEntry.convertFactor ?? null,
        canEdit: true,
        canRemove: true,
      });
    }
    if (product) {
      out.push({
        key: "sp",
        kind: "QD1277",
        code: product.code,
        title: product.taskName,
        quantity: productQty,
        quantityUnit: productUnit,
        factor: product.convertFactor ?? null,
        canEdit: true,
        canRemove: true,
      });
    }
    return out;
  }, [catalogEntry, product, assignedQty, quantityUnit, productQty, productUnit]);

  const handleLineQuantity = (key: string, value: string) => {
    if (key === "tx") setAssignedQty(value);
    else setProductQty(value);
  };
  const handleLineUnit = (key: string, value: string) => {
    if (key === "tx") setQuantityUnit(value);
    else setProductUnit(value);
  };
  const handleLineRemove = (key: string) => {
    if (key === "tx") {
      setCatalogEntry(null);
      setAssignedQty("");
      setQuantityUnit("");
    } else {
      setProduct(null);
      setProductQty("");
      setProductUnit("");
    }
  };

  const handleAiDraft = async () => {
    if (aiLoading || !aiIdea.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "draft", idea: aiIdea.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data) {
        if (json.data.title) setTitle(json.data.title);
        if (json.data.content) setDescription(json.data.content);
        toast.success("AI đã soạn nháp — kiểm tra và sửa lại trước khi lưu.");
      } else {
        toast.error(json.error || "AI bận, thử lại sau");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const uploadAttachments = async (taskId: string, files: File[]) => {
    let ok = 0;
    for (const f of files.slice(0, 5)) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch(`/api/tasks/${taskId}/attachments`, {
          method: "POST",
          body: fd,
        });
        if (r.ok) ok++;
      } catch {
        // bỏ qua tệp lỗi, báo sau
      }
    }
    return ok;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!title.trim()) {
      toast.warning("Nhập tên nhiệm vụ.");
      return;
    }
    if (isAssign && !ownerId) {
      toast.warning("Chọn cán bộ chủ trì.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          priority,
          currentDeadline: new Date(deadline).toISOString(),
          description: isAssign
            ? description.trim() || undefined
            : `Nguồn: ${originLabel(sourceType)}`,
          ...(isAssign ? {} : { originKind: sourceType }),
          expectedResultText: expectedResult.trim() || undefined,
          status: "IN_PROGRESS",
          progressPercent: 0,
          catalogEntryId: catalogEntry?.id || undefined,
          productItemId: product?.id || undefined,
          assignedQty:
            catalogEntry
              ? assignedQty === ""
                ? null
                : Number(assignedQty)
              : productQty === ""
                ? undefined
                : Number(productQty),
          quantityUnit:
            (catalogEntry ? quantityUnit : productUnit).trim() || undefined,
          factorSnapshot:
            catalogEntry?.convertFactor ?? product?.convertFactor ?? undefined,
          productQuantity: productQty === "" ? undefined : Number(productQty),
          productQuantityUnit: productUnit.trim() || undefined,
          unitId: isAssign ? unitId || undefined : currentUnitId || undefined,
          ownerId: isAssign ? ownerId || undefined : currentPersonId || undefined,
          assigneeIds: isAssign ? collabIds : [],
          idempotencyKey,
          ...(prefill?.workItemId ? { workItemId: prefill.workItemId } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "Không thể tạo nhiệm vụ");
        return;
      }

      let attachMsg = "";
      if (isAssign && attachFiles.length > 0 && json.data?.id) {
        const n = await uploadAttachments(json.data.id, attachFiles);
        if (n > 0) attachMsg = ` (đính kèm ${n} tệp)`;
      }

      toast.success(
        (json.deduplicated
          ? "Nhiệm vụ vừa được tạo (hệ thống chặn bấm trùng)"
          : isAssign
            ? "Đã giao nhiệm vụ"
            : "Đã tạo nhiệm vụ") + attachMsg
      );
      await onCreated(json.data);
      onClose();
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + (err?.message || "Không thể tạo nhiệm vụ"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-space-md">
      <div className="w-full max-w-xl bg-v5-surface rounded-xl shadow-xl overflow-hidden flex flex-col border border-v5-line">
        <div className="flex items-center justify-between gap-3 border-b border-v5-line bg-v5-surface px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-v5-accent-soft text-v5-accent">
              <V5Icon name={isAssign ? "assignment_add" : "add_task"} className="text-[20px]" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-v5-ink">
                {isAssign ? "Giao nhiệm vụ" : "Tạo nhiệm vụ"}
              </h3>
              <p className="mt-0.5 text-[11px] text-v5-muted">
                {isAssign
                  ? "Lãnh đạo giao việc, chọn người chủ trì và phối hợp"
                  : "Việc tự tạo hoặc ghi nhận theo chỉ đạo ngoài hệ thống"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-v5-muted transition-colors hover:bg-v5-bg hover:text-v5-ink"
            aria-label="Đóng"
          >
            <V5Icon name="close" className="text-[20px]" />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="p-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
            {isAssign && aiEnabled && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiIdea}
                  onChange={(e) => setAiIdea(e.target.value)}
                  placeholder="Gõ vài từ khóa, AI soạn nháp giúp..."
                  className="flex-1 h-9 rounded-lg border border-dashed border-v5-accent/40 bg-v5-surface px-3 text-[12px] text-v5-ink focus:outline-none focus:ring-2 focus:ring-v5-accent/10"
                />
                <button
                  type="button"
                  onClick={handleAiDraft}
                  disabled={aiLoading}
                  className="h-9 shrink-0 rounded-lg bg-v5-accent-soft px-3 text-[12px] font-semibold text-v5-accent disabled:opacity-50"
                >
                  {aiLoading ? "..." : "✨ Soạn"}
                </button>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-v5-ink">
                Tên nhiệm vụ / Nội dung chỉ đạo *
              </label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nhập nội dung công việc..."
                className="h-9 rounded-lg border border-v5-line bg-v5-surface px-3 text-[12px] text-v5-ink focus:outline-none focus:ring-2 focus:ring-v5-accent/10"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-v5-ink">
                Nguồn công việc (tuỳ chọn)
              </label>
              <WorkSourcePicker
                title={title}
                catalogEntry={catalogEntry}
                product={product}
                onCatalogChange={setCatalogEntry}
                onProductChange={(p) => {
                  setProduct(p);
                  if (p?.quantityUnit && !productUnit.trim()) setProductUnit(p.quantityUnit);
                  if (p?.quantity != null && !productQty) setProductQty(String(p.quantity));
                }}
                hideSelected
                storageKey={`yc38b:${mode}`}
              />
              <WorkSourceQuantityTable
                lines={lines}
                onQuantityChange={handleLineQuantity}
                onUnitChange={handleLineUnit}
                onRemove={handleLineRemove}
              />
            </div>

            {isAssign && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-v5-ink">Đơn vị chủ trì</label>
                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="h-9 rounded-lg border border-v5-line bg-v5-surface px-2 text-[12px] text-v5-ink focus:outline-none focus:ring-2 focus:ring-v5-accent/10"
                  >
                    <option value="">-- Chọn đơn vị --</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-v5-ink">Cán bộ chủ trì *</label>
                  <select
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    className="h-9 rounded-lg border border-v5-line bg-v5-surface px-2 text-[12px] text-v5-ink focus:outline-none focus:ring-2 focus:ring-v5-accent/10"
                  >
                    <option value="">-- Chọn cán bộ --</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {isAssign && (
              <CollaboratorPicker
                people={people}
                value={collabIds}
                onChange={setCollabIds}
                excludeId={ownerId}
                disabled={submitting}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-v5-ink">Mức độ ưu tiên</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="h-9 rounded-lg border border-v5-line bg-v5-surface px-2 text-[12px] text-v5-ink focus:outline-none focus:ring-2 focus:ring-v5-accent/10"
                >
                  <option value="Khẩn">Khẩn cấp</option>
                  <option value="Cao">Cao</option>
                  <option value="Trung bình">Trung bình</option>
                  <option value="Thấp">Thấp</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-v5-ink">Hạn hoàn thành</label>
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="h-9 rounded-lg border border-v5-line bg-v5-surface px-2 text-[12px] text-v5-ink focus:outline-none focus:ring-2 focus:ring-v5-accent/10"
                />
              </div>
            </div>

            {!isAssign && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-v5-ink">Phân loại nguồn</label>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                  className="h-9 rounded-lg border border-v5-line bg-v5-surface px-2 text-[12px] text-v5-ink focus:outline-none focus:ring-2 focus:ring-v5-accent/10"
                >
                  <option value="SELF_INITIATED">Tự khởi tạo phát sinh</option>
                  <option value="OUTSIDE_DIRECTIVE">
                    Tự ghi nhận theo chỉ đạo ngoài hệ thống
                  </option>
                  <option value="PLAN">Kế hoạch công tác tuần</option>
                </select>
              </div>
            )}

            {isAssign && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-v5-ink">
                  Nguồn gốc / Chỉ đạo từ đâu
                </label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Chỉ đạo đột xuất Lãnh đạo Chi cục..."
                  className="h-9 rounded-lg border border-v5-line bg-v5-surface px-3 text-[12px] text-v5-ink focus:outline-none focus:ring-2 focus:ring-v5-accent/10"
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-v5-ink">
                Sản phẩm / Kết quả yêu cầu
              </label>
              <textarea
                rows={2}
                value={expectedResult}
                onChange={(e) => setExpectedResult(e.target.value)}
                placeholder="Biên bản kiểm tra điện tử, xác nhận thông quan đúng hạn..."
                className="rounded-lg border border-v5-line bg-v5-surface p-2.5 text-[12px] text-v5-ink focus:outline-none focus:ring-2 focus:ring-v5-accent/10 resize-none"
              />
            </div>

            {isAssign && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-v5-ink">
                  Ảnh / Văn bản kèm theo
                  {attachFiles.length > 0 && ` (${attachFiles.length} tệp)`}
                </label>
                <input
                  type="file"
                  multiple
                  accept=".png,.jpg,.jpeg,.pdf,.doc,.docx,.xls,.xlsx"
                  disabled={submitting}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    const valid = files
                      .filter((f) => {
                        if (f.size > 10 * 1024 * 1024) {
                          toast.warning(`Tệp ${f.name} quá 10MB — bỏ qua`);
                          return false;
                        }
                        return true;
                      })
                      .slice(0, 5);
                    setAttachFiles(valid);
                  }}
                  className="text-[12px] text-v5-ink file:mr-2 file:rounded file:border file:border-v5-line file:bg-v5-bg file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-v5-ink"
                />
                <p className="text-[10px] text-v5-muted">
                  Tối đa 5 tệp, mỗi tệp ≤ 10MB. Tải lên sau khi nhiệm vụ được tạo.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-v5-line bg-v5-bg px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-v5-line bg-v5-surface px-4 text-[12px] font-semibold text-v5-ink hover:bg-v5-bg transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-9 rounded-lg bg-v5-accent px-4 text-[12px] font-semibold text-white hover:bg-v5-accent/90 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {submitting ? "Đang lưu..." : isAssign ? "Giao nhiệm vụ" : "Tạo nhiệm vụ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
