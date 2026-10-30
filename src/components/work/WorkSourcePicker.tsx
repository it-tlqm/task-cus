"use client";

import { V5Icon } from "@/components/v5/ui/lucide-icon";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * YC-38B — Bộ chọn nguồn công việc dùng chung cho /plans, /my-work, /tasks.
 *
 * Nguyên tắc (đã chốt):
 * - Cán bộ NHẬP TÊN trước → hệ thống GỢI Ý tối đa 8 đầu việc TX.
 * - Nút "Chọn từ danh mục" để tìm thủ công (2 tab: TX / Sản phẩm QĐ1277).
 * - Tìm KHÔNG DẤU, không phân biệt hoa/thường.
 * - Sản phẩm QĐ1277 tìm SERVER-SIDE (không tải >3.000 bản ghi về trình duyệt).
 * - KHÔNG bắt buộc chọn TX; KHÔNG tự gắn sản phẩm QĐ1277.
 * - "Gần đây" / "Ghim" lưu cục bộ theo người đăng nhập.
 */

export interface PickedCatalogEntry {
  id: string;
  code: string;
  title: string;
  department?: string | null;
  groupCode?: string | null;
  convertFactor?: number | null;
}

export interface PickedProduct {
  id: string;
  code: string;
  taskName: string;
  outputProduct?: string | null;
  convertFactor?: number | null;
  groupName?: string | null;
  /** Đơn vị tính của liên kết (nếu đã có); không tự suy ra. */
  quantityUnit?: string | null;
  /** Số lượng giao của riêng sản phẩm này (nếu đã có). */
  quantity?: number | null;
  /** PROPOSED | CONFIRMED | REJECTED | null (chưa vào luồng xác nhận). */
  reviewState?: string | null;
  /** ID dòng WorkItemProduct khi sửa đầu việc đã có. */
  linkId?: string | null;
  isPrimary?: boolean;
}

interface Props {
  /** Tiêu đề công việc đang nhập — dùng để gợi ý. */
  title: string;
  catalogEntry: PickedCatalogEntry | null;
  /** Chế độ một sản phẩm (tương thích các màn hình cũ). */
  product?: PickedProduct | null;
  onCatalogChange: (entry: PickedCatalogEntry | null) => void;
  onProductChange?: (product: PickedProduct | null) => void;
  /**
   * Chế độ nhiều sản phẩm QĐ1277: truyền products + onProductsChange.
   * Khi có onProductsChange, component cho chọn/bỏ nhiều mã và không tự đóng modal.
   */
  products?: PickedProduct[];
  onProductsChange?: (products: PickedProduct[]) => void;
  /** Khóa lưu "gần đây"/"ghim" — nên gồm mã người dùng. */
  storageKey?: string;
  disabled?: boolean;
  /** Bật/tắt tab sản phẩm QĐ1277 (mặc định bật). */
  allowProduct?: boolean;
  /**
   * Chỉ hiển thị sản phẩm QĐ1277 ở chế độ đọc: dùng khi người đang đăng nhập
   * không phải người thực hiện (lãnh đạo lập hộ). Việc đề xuất SP QĐ1277
   * thuộc quyền của người thực hiện, không phải người giao việc.
   */
  lockProducts?: boolean;
  /** Ẩn danh sách nguồn đã chọn (dùng khi trang cha tự vẽ bảng nguồn + số lượng). */
  hideSelected?: boolean;
}

const RECENT_MAX = 10;
const FAVORITE_MAX = 5;

function readStore(key: string, name: string): string[] {
  try {
    const raw = window.localStorage.getItem(`${key}:${name}`);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeStore(key: string, name: string, value: string[]) {
  try {
    window.localStorage.setItem(`${key}:${name}`, JSON.stringify(value));
  } catch {
    /* bỏ qua lỗi storage */
  }
}

export default function WorkSourcePicker({
  title,
  catalogEntry,
  product,
  onCatalogChange,
  onProductChange,
  products,
  onProductsChange,
  storageKey = "yc38b",
  disabled,
  allowProduct = true,
  lockProducts = false,
  hideSelected = false,
}: Props) {
  const isMulti = typeof onProductsChange === "function";
  const selectedProducts: PickedProduct[] = isMulti
    ? products || []
    : product
      ? [product]
      : [];
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"tx" | "product">("tx");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PickedCatalogEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [txResults, setTxResults] = useState<PickedCatalogEntry[]>([]);
  const [productResults, setProductResults] = useState<PickedProduct[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentItems, setRecentItems] = useState<PickedCatalogEntry[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<PickedCatalogEntry[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRecent(readStore(storageKey, "recent"));
    setFavorites(readStore(storageKey, "favorites"));
  }, [storageKey]);

  // Không giữ tab QĐ1277 khi người dùng không có quyền đề xuất sản phẩm.
  useEffect(() => {
    if ((!allowProduct || lockProducts) && tab === "product") {
      setTab("tx");
    }
  }, [allowProduct, lockProducts, tab]);

  // ---- Gợi ý TX theo tiêu đề đang nhập (debounce 300ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = title.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/work-catalog/suggest?q=${encodeURIComponent(q)}&limit=8`,
          { cache: "no-store" }
        );
        const json = await res.json().catch(() => null);
        if (res.ok) setSuggestions(json.data || []);
      } catch {
        /* im lặng: gợi ý là tiện ích, không chặn nhập liệu */
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [title]);

  const loadItemsByIds = useCallback(
    async (ids: string[]) => {
      if (!ids.length) {
        setRecentItems([]);
        setFavoriteItems([]);
        return;
      }
      try {
        const res = await fetch(`/api/work-catalog?ids=${ids.join(",")}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (res.ok) {
          const list = (json.data?.entries || []) as PickedCatalogEntry[];
          setRecentItems(ids.map((id) => list.find((e) => e.id === id)).filter(Boolean) as PickedCatalogEntry[]);
          setFavoriteItems(
            ids.map((id) => list.find((e) => e.id === id)).filter(Boolean) as PickedCatalogEntry[]
          );
        }
      } catch {
        /* bỏ qua */
      }
    },
    []
  );

  useEffect(() => {
    loadItemsByIds([...new Set([...recent, ...favorites])]);
  }, [recent, favorites, loadItemsByIds]);

  const pushRecent = (id: string) => {
    const next = [id, ...recent.filter((x) => x !== id)].slice(0, RECENT_MAX);
    setRecent(next);
    writeStore(storageKey, "recent", next);
  };

  const toggleFavorite = (id: string) => {
    const has = favorites.includes(id);
    const next = has
      ? favorites.filter((x) => x !== id)
      : [id, ...favorites].slice(0, FAVORITE_MAX);
    setFavorites(next);
    writeStore(storageKey, "favorites", next);
  };

  const pickCatalog = (entry: PickedCatalogEntry) => {
    onCatalogChange(entry);
    pushRecent(entry.id);
    setOpen(false);
    setQuery("");
  };

  const setSelectedProducts = (next: PickedProduct[]) => {
    if (onProductsChange) {
      onProductsChange(next);
      return;
    }
    onProductChange?.(next[0] || null);
  };

  const pickProduct = (p: PickedProduct) => {
    if (isMulti) {
      const exists = selectedProducts.some((item) => item.id === p.id);
      setSelectedProducts(
        exists ? selectedProducts.filter((item) => item.id !== p.id) : [...selectedProducts, p]
      );
      setQuery("");
      return;
    }
    onProductChange?.(p);
    setOpen(false);
    setQuery("");
  };

  const removeProduct = (p: PickedProduct) => {
    if (p.reviewState === "CONFIRMED") return;
    setSelectedProducts(selectedProducts.filter((item) => item.id !== p.id));
  };

  // ---- Tìm trong modal (server-side, không tải toàn bộ danh mục)
  useEffect(() => {
    if (!open) return;
    if (listDebounceRef.current) clearTimeout(listDebounceRef.current);
    const q = query.trim();
    const run = async () => {
      setLoadingList(true);
      try {
        if (tab === "tx") {
          if (!q) {
            setTxResults([]);
            return;
          }
          const res = await fetch(
            `/api/work-catalog?q=${encodeURIComponent(q)}&scope=all`,
            { cache: "no-store" }
          );
          const json = await res.json().catch(() => null);
          if (res.ok) {
            setTxResults((json.data?.entries || []).slice(0, 30) as PickedCatalogEntry[]);
          }
        } else {
          if (!q) {
            setProductResults([]);
            return;
          }
          const res = await fetch(
            `/api/products?search=${encodeURIComponent(q)}&pageSize=20`,
            { cache: "no-store" }
          );
          const json = await res.json().catch(() => null);
          if (res.ok) {
            setProductResults(
              (json.data || []).slice(0, 20).map((p: any) => ({
                id: p.id,
                code: p.code,
                taskName: p.taskName,
                outputProduct: p.outputProduct ?? null,
                convertFactor: p.convertFactor ?? null,
                groupName: p.group?.title || p.groupName || null,
                quantityUnit: null,
                reviewState: null,
              }))
            );
          }
        }
      } catch {
        /* bỏ qua */
      } finally {
        setLoadingList(false);
      }
    };
    if (!q) {
      setTxResults([]);
      setProductResults([]);
      setLoadingList(false);
      return;
    }
    listDebounceRef.current = setTimeout(run, 300);
    return () => {
      if (listDebounceRef.current) clearTimeout(listDebounceRef.current);
    };
  }, [open, tab, query]);

  const factorLabel = useMemo(
    () => (v: number | null | undefined) =>
      v === null || v === undefined ? "Chưa có hệ số" : `Hệ số: ${v}`,
    []
  );

  const reviewLabel = (state?: string | null) => {
    if (state === "CONFIRMED") return "Đã xác nhận";
    if (state === "PROPOSED") return "Đã đề xuất — chờ xác nhận";
    if (state === "REJECTED") return "Bị từ chối — cần điều chỉnh";
    return "Chưa xác nhận";
  };

  return (
    <div className="flex flex-col gap-2" data-testid="work-source-picker">
      {/* Nguồn đã chọn */}
      {!hideSelected && (catalogEntry || selectedProducts.length > 0) && (
        <div className="flex flex-col gap-1.5">
          {catalogEntry && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50/60 px-2.5 py-1.5">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-teal-800 font-semibold">
                  Đầu việc danh mục TX
                </p>
                <p className="text-[12px] text-v5-ink truncate">
                  <span className="font-mono font-semibold">{catalogEntry.code}</span> ·{" "}
                  {catalogEntry.title}
                </p>
                <p className="text-[10px] text-slate-600">
                  {catalogEntry.department || "—"} · {factorLabel(catalogEntry.convertFactor)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleFavorite(catalogEntry.id)}
                  title={favorites.includes(catalogEntry.id) ? "Bỏ ghim" : "Ghim yêu thích"}
                  className={`rounded-md px-1.5 py-1 text-[16px] leading-none ${
                    favorites.includes(catalogEntry.id)
                      ? "text-amber-600"
                      : "text-slate-400 hover:text-amber-600"
                  }`}
                >
                  ★
                </button>
                <button
                  type="button"
                  onClick={() => onCatalogChange(null)}
                  aria-label="Bỏ chọn đầu việc TX"
                  className="rounded-md px-1.5 py-1 text-[16px] leading-none text-slate-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          {selectedProducts.map((p) => (
            <div
              key={p.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-indigo-800 font-semibold">
                  Sản phẩm đầu ra QĐ1277
                  {p.isPrimary ? " · Chính" : ""}
                  {lockProducts ? " · Chỉ đọc" : ""}
                </p>
                <p className="text-[12px] text-v5-ink truncate">
                  <span className="font-mono font-semibold">{p.code}</span> · {p.taskName}
                </p>
                <p className="text-[10px] text-slate-600">
                  Nhóm: {p.groupName || "Chưa phân nhóm"} · {factorLabel(p.convertFactor)}
                </p>
                <p className="text-[10px] text-slate-600">
                  Đơn vị tính: {p.quantityUnit || "Chưa xác nhận"} · {reviewLabel(p.reviewState)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeProduct(p)}
                disabled={p.reviewState === "CONFIRMED" || lockProducts}
                aria-label={
                  lockProducts
                    ? "Chỉ người thực hiện được bỏ sản phẩm QĐ1277"
                    : p.reviewState === "CONFIRMED"
                      ? "Sản phẩm đã xác nhận, không thể bỏ"
                      : "Bỏ chọn sản phẩm QĐ1277"
                }
                title={
                  lockProducts
                    ? "Chỉ người thực hiện công việc được gắn/bỏ sản phẩm QĐ1277"
                    : p.reviewState === "CONFIRMED"
                      ? "Sản phẩm đã được lãnh đạo xác nhận — không thể bỏ khỏi đầu việc"
                      : "Bỏ sản phẩm này"
                }
                className="rounded-md px-1.5 py-1 text-[16px] leading-none text-slate-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hành động */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          data-testid="work-source-open-catalog"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <V5Icon name="library_books" className="text-[15px]" />
          {isMulti ? `Chọn từ danh mục (${selectedProducts.length} SP QĐ1277)` : "Chọn từ danh mục"}
        </button>
        <span className={`text-[10px] ${lockProducts ? "text-amber-700 font-medium" : "text-v5-muted"}`}>
          {lockProducts
            ? "Chỉ người thực hiện công việc được gắn/bỏ sản phẩm QĐ1277. Lãnh đạo chỉ giao việc, không đề xuất sản phẩm thay cán bộ."
            : isMulti
              ? "Có thể gắn nhiều sản phẩm QĐ1277; TX và QĐ1277 là hai danh mục độc lập."
              : "Không bắt buộc chọn danh mục — công việc ngoài danh mục vẫn ghi được."}
        </span>
      </div>

      {/* Gợi ý TX */}
      {suggestions.length > 0 && !catalogEntry && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2" data-testid="work-source-suggestions">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-v5-muted">
            Gợi ý đầu việc danh mục TX
          </p>
          <ul className="flex flex-col gap-1">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => pickCatalog(s)}
                  className="w-full rounded-md border border-transparent bg-white px-2 py-1.5 text-left hover:border-teal-300 hover:bg-teal-50/50"
                >
                  <p className="text-[12px] text-v5-ink">
                    <span className="font-mono font-semibold">{s.code}</span> · {s.title}
                  </p>
                  <p className="text-[10px] text-v5-muted">
                    {s.department || "—"} · {factorLabel(s.convertFactor)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Gần đây / Ghim */}
      {!catalogEntry && (recentItems.length > 0 || favoriteItems.length > 0) && (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2">
          {favoriteItems.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Ghim yêu thích
              </p>
              <ul className="flex flex-wrap gap-1">
                {favoriteItems.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pickCatalog(s)}
                      className="rounded-md border border-amber-200 bg-amber-50/70 px-2 py-1 text-[11px] text-v5-ink hover:bg-amber-100"
                    >
                      <span className="font-mono font-semibold">{s.code}</span> ·{" "}
                      <span className="line-clamp-1 max-w-[220px] inline-block align-bottom">
                        {s.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {recentItems.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-v5-muted">
                Gần đây / thường dùng
              </p>
              <ul className="flex flex-wrap gap-1">
                {recentItems
                  .filter((s) => !favorites.includes(s.id))
                  .map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => pickCatalog(s)}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                      >
                        <span className="font-mono font-semibold">{s.code}</span> ·{" "}
                        <span className="line-clamp-1 max-w-[220px] inline-block align-bottom">
                          {s.title}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Modal chọn danh mục */}
      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/60 p-3">
          <div className="my-4 w-full max-w-2xl rounded-xl border border-v5-line bg-v5-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-v5-line px-4 py-3">
              <h3 className="text-sm font-semibold text-v5-ink">Chọn từ danh mục</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng"
                className="text-v5-muted hover:text-v5-ink"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-1 border-b border-v5-line px-4 pt-3">
              <button
                type="button"
                onClick={() => setTab("tx")}
                className={`rounded-t-lg px-3 py-2 text-[12px] font-semibold ${
                  tab === "tx"
                    ? "border-b-2 border-v5-accent text-v5-accent"
                    : "text-v5-muted"
                }`}
              >
                ① Công việc thường xuyên (TX)
              </button>
              {allowProduct && !lockProducts && (
                <button
                  type="button"
                  onClick={() => setTab("product")}
                  className={`rounded-t-lg px-3 py-2 text-[12px] font-semibold ${
                    tab === "product"
                      ? "border-b-2 border-v5-accent text-v5-accent"
                      : "text-v5-muted"
                  }`}
                >
                  ② Sản phẩm đầu ra (QĐ1277)
                </button>
              )}
            </div>

            <div className="p-4">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  tab === "tx"
                    ? "Tìm theo mã (NV-01) hoặc tên đầu việc — không dấu, không phân biệt hoa thường..."
                    : "Tìm theo mã hoặc tên sản phẩm QĐ1277 (tìm trên máy chủ)..."
                }
                className="mb-3 w-full h-9 rounded-lg border border-v5-line bg-v5-surface px-3 text-[12px] text-v5-ink focus:border-v5-accent focus:outline-none focus:ring-2 focus:ring-v5-accent/10"
              />

              {tab === "tx" ? (
                <div className="max-h-[45vh] overflow-y-auto">
                  {!query && (
                    <p className="py-6 text-center text-[11px] text-v5-muted">
                      Nhập từ khóa để tìm trong danh mục TX (348 đầu việc).
                    </p>
                  )}
                  {loadingList && (
                    <p className="py-4 text-center text-[11px] text-v5-muted">Đang tìm…</p>
                  )}
                  <ul className="flex flex-col gap-1">
                    {txResults.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => pickCatalog(r)}
                          className="w-full rounded-lg border border-v5-line bg-v5-surface px-2.5 py-2 text-left hover:border-v5-accent/40 hover:bg-v5-accent-soft/40"
                        >
                          <p className="text-[12px] text-v5-ink">
                            <span className="font-mono font-semibold">{r.code}</span> · {r.title}
                          </p>
                          <p className="text-[10px] text-v5-muted">
                            {r.department || "—"} · {factorLabel(r.convertFactor)}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {query && !loadingList && txResults.length === 0 && (
                    <p className="py-6 text-center text-[11px] text-v5-muted">
                      Không tìm thấy đầu việc phù hợp.
                    </p>
                  )}
                </div>
              ) : (
                <div className="max-h-[45vh] overflow-y-auto">
                  {!query && (
                    <p className="py-6 text-center text-[11px] text-v5-muted">
                      Nhập từ khóa để tìm sản phẩm QĐ1277 (tìm trên máy chủ).
                    </p>
                  )}
                  {loadingList && (
                    <p className="py-4 text-center text-[11px] text-v5-muted">Đang tìm…</p>
                  )}
                  <ul className="flex flex-col gap-1">
                    {productResults.map((p) => {
                      const picked = selectedProducts.some((item) => item.id === p.id);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => pickProduct(p)}
                            className={`w-full rounded-md border px-2.5 py-2 text-left ${
                              picked
                                ? "border-indigo-400 bg-indigo-50"
                                : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50"
                            }`}
                          >
                            <p className="flex items-center justify-between gap-2 text-[12px] text-v5-ink">
                              <span>
                                <span className="font-mono font-semibold">{p.code}</span> · {p.taskName}
                              </span>
                              {picked && (
                                <span className="shrink-0 rounded bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                  ĐÃ CHỌN
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] text-v5-muted">
                              Nhóm: {p.groupName || "Chưa phân nhóm"} · {factorLabel(p.convertFactor)}
                            </p>
                            <p className="text-[10px] text-v5-muted">
                              Đơn vị tính: {p.quantityUnit || "Chưa xác nhận"} ·{" "}
                              {reviewLabel(p.reviewState)}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {query && !loadingList && productResults.length === 0 && (
                    <p className="py-6 text-center text-[11px] text-v5-muted">
                      Không tìm thấy sản phẩm phù hợp.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-v5-line px-4 py-3">
              <p className="text-[10px] text-v5-muted">
                TX và QĐ1277 là hai danh mục độc lập — chọn riêng khi phù hợp, không bắt buộc chọn cả hai.
                {isMulti ? " Có thể chọn nhiều sản phẩm QĐ1277 cho cùng một đầu việc." : ""}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                {isMulti ? `Xong (${selectedProducts.length})` : "Đóng"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
