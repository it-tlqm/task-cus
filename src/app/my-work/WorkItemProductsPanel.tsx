"use client";

/**
 * WorkItemProductsPanel — V3.0.2: sản phẩm QĐ1277 của một công việc.
 * Dùng chung cho phía cán bộ (đề xuất mã SP) và phía lãnh đạo (xác nhận TỪNG SP).
 *
 * Quy tắc hiển thị: hệ số luôn ghi rõ nguồn (QĐ1277); đơn vị tính chưa có quy tắc
 * chính thức nên ghi chú "cần đối chiếu" — không tự hợp thức hoá số liệu.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/Toast";
import { V5Icon } from "@/components/v5/ui/lucide-icon";

interface SpRow {
  id: string;
  productItemId: string;
  code: string;
  taskName: string;
  outputProduct: string | null;
  factor: number | null;
  factorSnapshot: number | null;
  factorSource: string;
  quantity: number | null;
  quantityUnit: string | null;
  note: string | null;
  reviewState: string | null;
  confirmedAt: string | null;
  canReview: boolean;
}

const STATE_META: Record<string, { label: string; cls: string; icon: string }> = {
  PROPOSED: {
    label: "Chờ lãnh đạo xác nhận",
    cls: "bg-v5-gold-soft text-v5-gold-ink border-v5-gold/30",
    icon: "hourglass_top",
  },
  CONFIRMED: {
    label: "Đã xác nhận",
    cls: "bg-v5-success-soft text-v5-success border-v5-success/30",
    icon: "verified",
  },
  REJECTED: {
    label: "Lãnh đạo không duyệt",
    cls: "bg-v5-danger-soft text-v5-danger border-v5-danger/30",
    icon: "assignment_return",
  },
};

function fmtFactor(v: number | null | undefined) {
  if (v === null || v === undefined) return "chưa có";
  return String(v);
}

export default function WorkItemProductsPanel({
  workItemId,
  canPropose,
  onChanged,
}: {
  workItemId: string;
  canPropose: boolean;
  onChanged?: () => void | Promise<void>;
}) {
  const [rows, setRows] = useState<SpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; code: string; taskName: string; convertFactor: number | null }[]>([]);
  const [picked, setPicked] = useState<{ id: string; code: string; taskName: string } | null>(null);
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/work-item-products?workItemId=${workItemId}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) setRows(json.data || []);
    } catch {
      /* im lặng */
    } finally {
      setLoading(false);
    }
  }, [workItemId]);

  useEffect(() => {
    load();
  }, [load]);

  const search = async (text: string) => {
    setQ(text);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(text.trim())}&pageSize=8`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) setResults(json.data || []);
    } catch {
      setResults([]);
    }
  };

  const propose = async () => {
    if (!picked) {
      toast.error("Vui lòng chọn mã sản phẩm trong danh mục.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/work-item-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workItemId,
          productItemId: picked.id,
          quantity: qty === "" ? null : Number(qty),
          quantityUnit: unit || null,
          note: note || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "Không đề xuất được mã sản phẩm.");
        return;
      }
      toast.success("Đã đề xuất mã sản phẩm — chờ lãnh đạo trực tiếp xác nhận.");
      setPicked(null);
      setQ("");
      setResults([]);
      setQty("");
      setUnit("");
      setNote("");
      await load();
      await onChanged?.();
    } catch {
      toast.error("Không đề xuất được mã sản phẩm.");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (row: SpRow, action: "CONFIRM" | "REJECT") => {
    let noteText = "";
    if (action === "REJECT") {
      const input = window.prompt("Lý do không duyệt mã sản phẩm này (để cán bộ điều chỉnh):");
      if (input === null) return;
      noteText = input.trim();
      if (noteText.length < 3) {
        toast.error("Vui lòng ghi rõ lý do.");
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/work-item-products/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: noteText }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "Không xử lý được mã sản phẩm.");
        return;
      }
      toast.success(action === "CONFIRM" ? "Đã xác nhận mã sản phẩm." : "Đã trả lại mã sản phẩm.");
      await load();
      await onChanged?.();
    } catch {
      toast.error("Không xử lý được mã sản phẩm.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid={`sp-panel-${workItemId}`} className="mt-2 rounded-lg border border-v5-line bg-v5-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-v5-ink">Sản phẩm QĐ1277 của công việc</p>
        <button
          type="button"
          data-testid={`sp-toggle-${workItemId}`}
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] font-semibold text-v5-accent hover:underline"
        >
          {open ? "Ẩn" : `${rows.length} sản phẩm`}
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          {loading && <p className="text-[11px] text-v5-muted">Đang tải…</p>}
          {!loading && rows.length === 0 && (
            <p className="text-[11px] text-v5-muted">
              Công việc này chưa gắn mã sản phẩm. Công việc vẫn được ghi nhận bình thường, phần sản
              phẩm chờ đối chiếu.
            </p>
          )}

          {rows.map((r) => {
            const meta = STATE_META[r.reviewState || ""];
            return (
              <div key={r.id} data-testid={`sp-row-${r.id}`} className="rounded-lg border border-v5-line p-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-v5-ink">
                      {r.code} — {r.taskName}
                    </p>
                    <p className="text-[11px] text-v5-muted">
                      Hệ số: {fmtFactor(r.factorSnapshot ?? r.factor)}
                      {r.factorSnapshot != null ? " (đã chốt khi xác nhận)" : " (theo danh mục)"} · nguồn: QĐ1277
                      {r.quantity != null ? ` · số lượng: ${r.quantity}${r.quantityUnit ? ` ${r.quantityUnit}` : ""}` : ""}
                    </p>
                    {r.quantityUnit && (
                      <p className="text-[10px] text-v5-gold-ink">
                        Đơn vị tính do người nhập khai — cần đối chiếu với danh mục chính thức.
                      </p>
                    )}
                    {r.note && <p className="text-[11px] text-v5-muted mt-0.5">Ghi chú: {r.note}</p>}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      meta?.cls || "bg-v5-bg text-v5-muted border-v5-line"
                    }`}
                  >
                    <V5Icon name={meta?.icon || "help"} className="text-[13px]" />
                    {meta?.label || "Chưa xác nhận"}
                  </span>
                </div>

                {r.canReview && r.reviewState === "PROPOSED" && (
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      data-testid={`sp-confirm-${r.id}`}
                      disabled={busy}
                      onClick={() => decide(r, "CONFIRM")}
                      className="px-2 py-1 rounded text-[11px] font-semibold border border-v5-success text-v5-success hover:bg-v5-success-soft disabled:opacity-50"
                    >
                      Xác nhận mã SP
                    </button>
                    <button
                      type="button"
                      data-testid={`sp-reject-${r.id}`}
                      disabled={busy}
                      onClick={() => decide(r, "REJECT")}
                      className="px-2 py-1 rounded text-[11px] font-semibold border border-v5-line text-v5-muted hover:bg-v5-bg disabled:opacity-50"
                    >
                      Không duyệt
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {canPropose && (
            <div className="rounded-lg border border-dashed border-v5-line p-2 space-y-2">
              <p className="text-[11px] font-semibold text-v5-ink">Đề xuất mã sản phẩm (QĐ1277)</p>
              {!picked ? (
                <>
                  <input
                    data-testid={`sp-search-${workItemId}`}
                    value={q}
                    onChange={(e) => search(e.target.value)}
                    placeholder="Tìm mã sản phẩm hoặc tên nhiệm vụ…"
                    className="w-full rounded-lg border border-v5-line bg-v5-surface px-2 py-1.5 text-xs"
                  />
                  {results.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-v5-line">
                      {results.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          data-testid={`sp-option-${p.id}`}
                          onClick={() => {
                            setPicked({ id: p.id, code: p.code, taskName: p.taskName });
                            setResults([]);
                          }}
                          className="block w-full text-left px-2 py-1.5 text-[11px] hover:bg-v5-bg"
                        >
                          <b>{p.code}</b> — {p.taskName}
                          {p.convertFactor != null ? ` · hệ số ${p.convertFactor}` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-v5-ink">
                    Đã chọn: <b>{picked.code}</b> — {picked.taskName}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      data-testid={`sp-qty-${workItemId}`}
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      type="number"
                      placeholder="Số lượng (nếu có)"
                      className="rounded-lg border border-v5-line bg-v5-surface px-2 py-1.5 text-xs"
                    />
                    <input
                      data-testid={`sp-unit-${workItemId}`}
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="Đơn vị tính (nếu có)"
                      className="rounded-lg border border-v5-line bg-v5-surface px-2 py-1.5 text-xs"
                    />
                  </div>
                  <input
                    data-testid={`sp-note-${workItemId}`}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ghi chú (không bắt buộc)"
                    className="w-full rounded-lg border border-v5-line bg-v5-surface px-2 py-1.5 text-xs"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-testid={`sp-propose-${workItemId}`}
                      disabled={busy}
                      onClick={propose}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-v5-accent bg-v5-accent text-white hover:bg-v5-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v5-muted/40 focus-visible:ring-offset-1 active-press disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Gửi đề xuất
                    </button>
                    <button
                      type="button"
                      onClick={() => setPicked(null)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-v5-line text-v5-muted"
                    >
                      Huỷ
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
