"use client";

/**
 * RoutineCatalogPicker — F18: chọn công việc thường xuyên (danh mục TX 348 mục) và
 * đề xuất nhiều sản phẩm QĐ1277 cho một bản ghi nhật ký tác nghiệp.
 *
 * Nguyên tắc:
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

interface TxEntry {
  id: string;
  code: string;
  title: string;
  department: string;
  convertFactor: number | null;
}

export default function RoutineCatalogPicker({
  selectedTxId,
  onTxChange,
  products,
  onProductsChange,
}: {
  selectedTxId: string;
  onTxChange: (tx: TxEntry | null) => void;
  products: ProposedProduct[];
  onProductsChange: (p: ProposedProduct[]) => void;
}) {
  const [txQuery, setTxQuery] = useState("");
  const [txResults, setTxResults] = useState<TxEntry[]>([]);
  const [txBusy, setTxBusy] = useState(false);
  const [selectedTx, setSelectedTx] = useState<TxEntry | null>(null);

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
      {/* ---------- Công việc thường xuyên (danh mục TX) ---------- */}
      <div className="flex flex-col gap-1">
        <label className="font-label-md text-label-md text-primary font-semibold">
          Công việc thường xuyên (danh mục TX)
        </label>
        {selectedTx ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-container-lowest px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-semibold text-on-surface truncate">
                <span className="font-mono">{selectedTx.code}</span> — {selectedTx.title}
              </p>
              <p className="text-[11px] text-on-surface-variant">
                {selectedTx.department} · hệ số TX:{" "}
                {selectedTx.convertFactor === null || selectedTx.convertFactor === undefined
                  ? "chưa có (không dùng thay hệ số SP)"
                  : selectedTx.convertFactor}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedTx(null);
                onTxChange(null);
              }}
              className="text-[11px] font-semibold text-status-danger hover:underline"
            >
              Bỏ chọn
            </button>
          </div>
        ) : (
          <>
            <input
              data-testid="routine-tx-search"
              value={txQuery}
              onChange={(e) => setTxQuery(e.target.value)}
              placeholder="Tìm công việc thường xuyên theo mã hoặc tên (có/không dấu)…"
              className="h-10 px-3 rounded bg-surface-container-lowest text-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
            />
            {txBusy && <span className="text-[11px] text-outline">Đang tìm…</span>}
            {!txBusy && txResults.length > 0 && (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-border-subtle divide-y divide-border-subtle">
                {txResults.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    data-testid={`routine-tx-option-${t.code}`}
                    onClick={() => {
                      setSelectedTx(t);
                      onTxChange(t);
                      setTxQuery("");
                      setTxResults([]);
                    }}
                    className="block w-full text-left px-3 py-2 text-xs hover:bg-surface-container"
                  >
                    <span className="font-mono font-bold text-primary">{t.code}</span> — {t.title}
                    <span className="block text-[10px] text-outline">
                      {t.department} · hệ số TX:{" "}
                      {t.convertFactor === null || t.convertFactor === undefined ? "chưa có" : t.convertFactor}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {!txBusy && txQuery.trim().length >= 2 && txResults.length === 0 && (
              <span className="text-[11px] text-outline">Không tìm thấy trong danh mục TX.</span>
            )}
          </>
        )}
        <span className="text-[11px] text-outline">
          Có thể bỏ trống nếu công việc phát sinh ngoài danh mục (ghi nội dung thực tế ở ô bên trên).
        </span>
      </div>

      {/* ---------- Sản phẩm QĐ1277 (đề xuất nhiều SP) ---------- */}
      <div className="flex flex-col gap-1">
        <label className="font-label-md text-label-md text-primary font-semibold">
          Sản phẩm QĐ1277 dự kiến (có thể chọn nhiều)
        </label>
        {products.length > 0 && (
          <div className="flex flex-col gap-1" data-testid="routine-sp-list">
            {products.map((p, i) => (
              <div
                key={p.productItemId}
                data-testid={`routine-sp-item-${p.code}`}
                className="rounded-lg border border-border-subtle bg-surface-container-lowest px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-on-surface truncate">
                      <span className="font-mono">{p.code}</span> — {p.taskName}
                    </p>
                    <p className="text-[10px] text-outline">
                      {p.outputProduct ? p.outputProduct + " · " : ""}
                      hệ số: {p.factor === null ? "chưa có (cần đối chiếu)" : p.factor} ·{" "}
                      <span className="text-status-warning">chờ lãnh đạo xác nhận</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onProductsChange(products.filter((_, k) => k !== i))}
                    className="text-[11px] font-semibold text-status-danger hover:underline shrink-0"
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
                    className="h-8 w-28 rounded bg-surface-container-lowest text-[11px] border border-border-subtle px-2"
                  />
                  <input
                    value={p.unit ?? ""}
                    onChange={(e) => updateProduct(i, { unit: e.target.value || null })}
                    placeholder="Đơn vị tính (nếu có)"
                    className="h-8 flex-1 rounded bg-surface-container-lowest text-[11px] border border-border-subtle px-2"
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
          className="h-10 px-3 rounded bg-surface-container-lowest text-body-md text-on-surface border border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary"
        />
        {spBusy && <span className="text-[11px] text-outline">Đang tìm…</span>}
        {!spBusy && spResults.length > 0 && (
          <div className="max-h-44 overflow-y-auto rounded-lg border border-border-subtle divide-y divide-border-subtle">
            {spResults.map((p) => (
              <button
                key={p.id}
                type="button"
                data-testid={`routine-sp-option-${p.code}`}
                onClick={() => addProduct(p)}
                className="block w-full text-left px-3 py-2 text-xs hover:bg-surface-container"
              >
                <span className="font-mono font-bold text-primary">{p.code}</span> — {p.taskName}
                <span className="block text-[10px] text-outline">
                  {p.outputProduct ? p.outputProduct + " · " : ""}
                  hệ số: {p.convertFactor === null ? "chưa có (cần đối chiếu)" : p.convertFactor}
                </span>
              </button>
            ))}
          </div>
        )}
        <span className="text-[11px] text-outline">
          Chọn sản phẩm KHÔNG đồng nghĩa đã được lãnh đạo xác nhận. Sản phẩm chỉ tham gia điểm chính thức
          sau khi được xác nhận độc lập và đủ dữ liệu.
        </span>
      </div>
    </div>
  );
}
