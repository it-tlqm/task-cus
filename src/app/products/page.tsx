"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "@/components/ui/Toast";

interface ProductItem {
  id: string;
  code: string;
  sourceStt: string | null;
  sourceRow: number;
  taskName: string;
  detailWork: string | null;
  outputProduct: string | null;
  groupName: string | null;
  maxScore: number | null;
  pointValue: number | null;
  convertFactor: number | null;
  notes: string | null;
  group?: { id: string; code: string; title: string } | null;
}

/**
 * YC-11 — Mục riêng Danh mục sản phẩm QĐ1277: xem + tìm kiếm + lọc + phân trang.
 * Không tải toàn bộ nghìn dòng một lúc; công chức chỉ xem, không sửa hệ số.
 */
export default function ProductsPage() {
  const [items, setItems] = useState<ProductItem[]>([]);
  const [groups, setGroups] = useState<Array<{ id: string; code: string; title: string }>>([]);
  const [version, setVersion] = useState<{ code: string; title: string; qdRef: string | null } | null>(null);
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async (p: number, s: string, g: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: "30" });
      if (s.trim()) params.set("search", s.trim());
      if (g) params.set("groupId", g);
      const res = await fetch(`/api/products?${params.toString()}`);
      const json = await res.json();
      if (res.ok) {
        setItems(json.data || []);
        setGroups(json.groups || []);
        setVersion(json.version || null);
        setTotal(json.pagination?.total || 0);
        setTotalPages(json.pagination?.totalPages || 1);
      } else {
        toast.error(json.error || "Không thể tải danh mục sản phẩm");
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts(1, "", "");
  }, [fetchProducts]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchProducts(1, search, groupId);
  };

  return (
    <div className="flex w-full flex-col gap-3 pb-4">
      <div>
        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-v5-accent-soft text-v5-accent border border-v5-line">
          Danh mục sản phẩm QĐ1277
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-v5-ink mt-1">Danh mục sản phẩm / công việc theo quy định</h1>
        <p className="text-sm text-v5-muted">
          {version ? `${version.title} (${version.code})` : "Đang tải phiên bản danh mục..."}
          {version?.qdRef && <span className="text-v5-muted"> · Căn cứ {version.qdRef}</span>}
        </p>
      </div>

      <form onSubmit={onSearch} data-tour="search" className="flex flex-col md:flex-row gap-2 bg-v5-surface p-3 rounded-xl border border-v5-line shadow-sm">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo mã SP, STT gốc, tên nhiệm vụ, công việc, sản phẩm..."
          className="flex-1 h-10 px-3 rounded-lg bg-v5-bg border border-v5-line text-sm focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
        />
        <select
          value={groupId}
          onChange={(e) => { setGroupId(e.target.value); setPage(1); fetchProducts(1, search, e.target.value); }}
          className="h-10 px-2 rounded-lg bg-v5-bg border border-v5-line text-sm max-w-full md:max-w-xs"
        >
          <option value="">Tất cả nhóm ({groups.length})</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.title.slice(0, 80)}</option>
          ))}
        </select>
        <button type="submit" className="h-10 px-5 rounded-lg bg-v5-accent text-white text-sm font-semibold hover:bg-v5-accent">
          Tìm kiếm
        </button>
      </form>

      <div className="text-xs text-v5-muted">
        {loading ? "Đang tải..." : <>Hiển thị <strong>{items.length}</strong> / <strong>{total}</strong> sản phẩm · Trang {page}/{totalPages}</>}
      </div>

      <div data-tour="product-table" className="bg-v5-surface rounded-xl border border-v5-line shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-v5-bg text-v5-ink text-xs uppercase">
              <th className="py-2.5 px-3 text-left">Mã SP</th>
              <th className="py-2.5 px-3 text-left">Nhiệm vụ / Công việc chi tiết</th>
              <th className="py-2.5 px-3 text-left">Sản phẩm đầu ra</th>
              <th className="py-2.5 px-3 text-left">Phân nhóm</th>
              <th className="py-2.5 px-3 text-right">Điểm</th>
              <th className="py-2.5 px-3 text-right">Hệ số quy đổi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-v5-line/60">
            {items.map((it) => (
              <tr key={it.id} className="hover:bg-v5-bg">
                <td className="py-2.5 px-3 font-mono text-xs font-bold text-v5-accent whitespace-nowrap">
                  {it.code}
                  {it.sourceStt && <span className="block text-v5-muted font-normal">STT gốc: {it.sourceStt}</span>}
                </td>
                <td className="py-2.5 px-3">
                  <div className="font-semibold text-v5-ink">{it.taskName}</div>
                  {it.detailWork && <div className="text-v5-muted text-xs mt-0.5">{it.detailWork}</div>}
                  {it.group && <div className="text-v5-muted text-[11px] mt-0.5">{it.group.title.slice(0, 100)}</div>}
                </td>
                <td className="py-2.5 px-3 text-v5-ink">{it.outputProduct || "—"}</td>
                <td className="py-2.5 px-3 text-v5-muted whitespace-nowrap">{it.groupName || "—"}</td>
                <td className="py-2.5 px-3 text-right font-semibold">{it.pointValue ?? "—"}</td>
                <td className="py-2.5 px-3 text-right font-bold text-v5-accent">{it.convertFactor ?? "—"}</td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} className="py-10 text-center text-v5-muted">Không tìm thấy sản phẩm phù hợp</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-2">
        <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); fetchProducts(p, search, groupId); }}
          className="px-4 py-2 rounded-lg bg-v5-surface border border-v5-line text-sm disabled:opacity-40">Trước</button>
        <span className="text-sm text-v5-muted">Trang {page} / {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => { const p = page + 1; setPage(p); fetchProducts(p, search, groupId); }}
          className="px-4 py-2 rounded-lg bg-v5-surface border border-v5-line text-sm disabled:opacity-40">Sau</button>
      </div>
    </div>
  );
}
