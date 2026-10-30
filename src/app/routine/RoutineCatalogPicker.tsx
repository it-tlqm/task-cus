"use client";

/**
 * RoutineCatalogPicker — F18 / UX 2B1: chọn N công việc thường xuyên (danh mục TX)
 * và đề xuất nhiều sản phẩm QĐ1277 cho MỘT bản ghi nhật ký tác nghiệp.
 *
 * Nguyên tắc:
 *  - Nhiều tag TX là phân loại của cùng một bản ghi, KHÔNG tạo N bản ghi.
 *  - Tìm được theo mã/tên, CÓ dấu và KHÔNG dấu (API /api/products & /api/work-catalog đã xử lý).
 *  - Chọn SP KHÔNG có nghĩa SP đã được xác nhận → hiển thị rõ "chờ xác nhận".
 *  - Không tự điền hệ số còn thiếu; không dùng hệ số TX thay hệ số QĐ1277.
 *  - Không tự ánh xạ TX → SP.
 */
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/Toast";

export interface ProposedProduct {
  productItemId: string;
  code: string;
  taskName: string;
  outputProduct: string | null;
  factor: number | null;
  quantity: number | null;
  unit: string | null;
  reviewState: "PROPOSED";
}

export interface TxTag {
  id: string;
  code: string;
  title: string;
  department: string;
  convertFactor: number | null;
}

export default function RoutineCatalogPicker({
  selectedTags,
  onTagsChange,
  products,
  onProductsChange,
}: {
  selectedTags: TxTag[];
  onTagsChange: (tags: TxTag[]) => void;
  products: ProposedProduct[];
  onProductsChange: (p: ProposedProduct[]) => void;
}) {
  const [txQuery, setTxQuery] = useState("");
  const [txResults, setTxResults] = useState<TxTag[]>([]);
  const [txBusy, setTxBusy] = useState(false);

  const [spQuery, setSpQuery] = useState("");
  const [spResults, setSpResults] = useState<
    Array<{ id: string; code: string; taskName: string; outputProduct: string | null; convertFactor: number | null }>
  >([]);
  const [spBusy, setSpBusy] = useState(false);

  useEffect(() => {
    if (txQuery.trim().length < 2) {
      setTxResults([]);
      return;
    }
    setTxBusy(true);
    (async () => {
      try {
        const res = await fetch(`/api/work-catalog?search=${encodeURIComponent(txQuery.trim())}`);
        const json = await res.json().catch(() => ({}));
        if (res.ok) setTxResults(((json.data || {}).entries || []).slice(0, 12));
      } catch {
        setTxResults([]);
      } finally {
        setTxBusy(false);
      }
    })();
  }, [txQuery]);

  useEffect(() => {
    if (spQuery.trim().length < 2) {
      setSpResults([]);
      return;
    }
    setSpBusy(true);
    (async () => {
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(spQuery.trim())}&pageSize=8`);
        const json = await res.json().catch(() => ({}));
        if (res.ok) setSpResults(json.data || []);
      } catch {
        setSpResults([]);
      } finally {
        setSpBusy(false);
      }
    })();
  }, [spQuery]);

  const addTag = (tag: TxTag) => {
    if (selectedTags.some((x) => x.id === tag.id)) {
      toast.info("Đầu việc TX này đã được gắn cho bản ghi.");
      return;
    }
    onTagsChange([...selectedTags, tag]);
    setTxQuery("");
    setTxResults([]);
  };

  const addProduct = (p: any) => {
    if (products.some((x) => x.productItemId === p.id)) {
      toast.info("Sản phẩm này đã có trong danh sách đề xuất.");
      return;
    }
    onProductsChange([
      ...products,
      {
        productItemId: p.id,
        code: p.code,
        taskName: p.taskName,
        outputProduct: p.outputProduct ?? null,
        factor: p.convertFactor ?? null,
        quantity: null,
        unit: null,
        reviewState: "PROPOSED",
      },
    ]);
    setSpQuery("");
    setSpResults([]);
  };

  const updateProduct = (idx: number, patch: Partial<ProposedProduct>) => {
    const next = [...products];
    next[idx] = { ...next[idx], ...patch };
    onProductsChange(next);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="routine-catalog-picker">
      {/* ---------- Công việc thường xuyên (danh mục TX) — chọn nhiều ---------- */}
      <div className="flex flex-col gap-1">
        <label className="text-[12px] text-v5-ink font-semibold">
          Công việc thường xuyên (danh mục TX — có thể chọn nhiều)
        </label>

        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-testid="routine-tx-tags">
            {selectedTags.map((tag) => (
              <span
                key={tag.id}
                data-testid={`routine-tx-chip-${tag.code}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-v5-accent/30 bg-v5-accent/10 px-2.5 py-1 text-[11px]"
              >
                <span className="font-mono font-bold text-v5-ink">{tag.code}</span>
                <span className="max-w-[280px] truncate text-v5-ink">{tag.title}</span>
                <button
                  type="button"
                  data-testid={`routine-tx-remove-${tag.code}`}
                  aria-label={`Bỏ chọn ${tag.code}`}
                  onClick={() => onTagsChange(selectedTags.filter((x) => x.id !== tag.id))}
                  className="text-v5-danger font-bold leading-none hover:opacity-70"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <input
          data-testid="routine-tx-search"
          value={txQuery}
          onChange={(e) => setTxQuery(e.target.value)}
          placeholder="Tìm công việc thường xuyên theo mã hoặc tên (có/không dấu)…"
          className="h-10 px-3 rounded bg-v5-surface text-[12px] text-v5-ink border border-border-subtle focus:outline-none focus:ring-1 focus:ring-v5-accent"
        />
        {txBusy && <span className="text-[11px] text-v5-muted">Đang tìm…</span>}
        {!txBusy && txResults.length > 0 && (
          <div className="max-h-44 overflow-y-auto rounded-lg border border-border-subtle divide-y divide-border-subtle">
            {txResults.map((t) => {
              const already = selectedTags.some((x) => x.id === t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`routine-tx-option-${t.code}`}
                  onClick={() => addTag(t)}
                  className={`block w-full text-left px-3 py-2 text-xs hover:bg-v5-bg ${
                    already ? "opacity-60" : ""
                  }`}
                >
                  <span className="font-mono font-bold text-v5-ink">{t.code}</span> — {t.title}
                  <span className="block text-[10px] text-v5-muted">
                    {t.department} · hệ số TX:{" "}
                    {t.convertFactor === null || t.convertFactor === undefined ? "chưa có" : t.convertFactor}
                    {already ? " · đã gắn" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {!txBusy && txQuery.trim().length >= 2 && txResults.length === 0 && (
          <span className="text-[11px] text-v5-muted">Không tìm thấy trong danh mục TX.</span>
        )}
        <span className="text-[11px] text-v5-muted">
          Có thể chọn nhiều đầu việc TX cho cùng một bản ghi. Bỏ trống nếu công việc phát sinh ngoài danh mục
          (ghi nội dung thực tế ở ô bên trên).
        </span>
      </div>

      {/* ---------- Sản phẩm QĐ1277 (đề xuất nhiều SP) ---------- */}
      <div className="flex flex-col gap-1">
        <label className="text-[12px] text-v5-ink font-semibold">
          Sản phẩm QĐ1277 dự kiến (có thể chọn nhiều)
        </label>
        {products.length > 0 && (
          <div className="flex flex-col gap-1" data-testid="routine-sp-list">
            {products.map((p, i) => (
              <div
                key={p.productItemId}
                data-testid={`routine-sp-item-${p.code}`}
                className="rounded-lg border border-border-subtle bg-v5-surface px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-v5-ink truncate">
                      <span className="font-mono">{p.code}</span> — {p.taskName}
                    </p>
                    <p className="text-[10px] text-v5-muted">
                      {p.outputProduct ? p.outputProduct + " · " : ""}
                      hệ số: {p.factor === null ? "chưa có (cần đối chiếu)" : p.factor} ·{" "}
                      <span className="text-v5-gold-ink">chờ lãnh đạo xác nhận</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onProductsChange(products.filter((_, k) => k !== i))}
                    className="text-[11px] font-semibold text-v5-danger hover:underline shrink-0"
                  >
                    Bỏ
                  </button>
                </div>
                <div className="flex gap-2 mt-1.5">
                  <input
                    type="number"
                    value={p.quantity ?? ""}
                    onChange={(e) =>
                      updateProduct(i, { quantity: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    placeholder="Số lượng (nếu có)"
                    className="h-8 w-28 rounded bg-v5-surface text-[11px] border border-border-subtle px-2"
                  />
                  <input
                    value={p.unit ?? ""}
                    onChange={(e) => updateProduct(i, { unit: e.target.value || null })}
                    placeholder="Đơn vị tính (nếu có)"
                    className="h-8 flex-1 rounded bg-v5-surface text-[11px] border border-border-subtle px-2"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <input
          data-testid="routine-sp-search"
          value={spQuery}
          onChange={(e) => setSpQuery(e.target.value)}
          placeholder="Tìm sản phẩm QĐ1277 theo mã hoặc tên (có/không dấu)…"
          className="h-10 px-3 rounded bg-v5-surface text-[12px] text-v5-ink border border-border-subtle focus:outline-none focus:ring-1 focus:ring-v5-accent"
        />
        {spBusy && <span className="text-[11px] text-v5-muted">Đang tìm…</span>}
        {!spBusy && spResults.length > 0 && (
          <div className="max-h-44 overflow-y-auto rounded-lg border border-border-subtle divide-y divide-border-subtle">
            {spResults.map((p) => (
              <button
                key={p.id}
                type="button"
                data-testid={`routine-sp-option-${p.code}`}
                onClick={() => addProduct(p)}
                className="block w-full text-left px-3 py-2 text-xs hover:bg-v5-bg"
              >
                <span className="font-mono font-bold text-v5-ink">{p.code}</span> — {p.taskName}
                <span className="block text-[10px] text-v5-muted">
                  {p.outputProduct ? p.outputProduct + " · " : ""}
                  hệ số: {p.convertFactor === null ? "chưa có (cần đối chiếu)" : p.convertFactor}
                </span>
              </button>
            ))}
          </div>
        )}
        <span className="text-[11px] text-v5-muted">
          Chọn sản phẩm KHÔNG đồng nghĩa đã được lãnh đạo xác nhận. Sản phẩm chỉ tham gia điểm chính thức
          sau khi được xác nhận độc lập và đủ dữ liệu.
        </span>
      </div>
    </div>
  );
}
