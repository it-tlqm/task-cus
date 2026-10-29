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
 * Tab "Sản phẩm QĐ1277" trong trang Danh mục & sản phẩm.
 * Chỉ xem/tìm kiếm/lọc/phân trang; không sửa hệ số.
 */
export default function ProductCatalogTab() {
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
    <div className="flex w-full flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-v5-ink">
          Danh mục sản phẩm / công việc theo QĐ1277
        </h2>
        <p className="text-sm text-v5-muted">
          {version ? `${version.title} (${version.code})` : "Đang tải phiên bản danh mục..."}
          {version?.qdRef && <span className="text-v5-muted"> · Căn cứ {version.qdRef}</span>}
        </p>
      </div>

      <form onSubmit={onSearch} className="flex flex-col gap-2 rounded-xl border border-v5-line bg-v5-surface p-3 shadow-sm md:flex-row">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo mã SP, STT gốc, tên nhiệm vụ, công việc, sản phẩm..."
          className="h-10 flex-1 rounded-lg border border-v5-line bg-v5-bg px-3 text-sm focus:outline-none focus:ring-1 focus:ring-v5-accent/30"
        />
        <select
          value={groupId}
          onChange={(e) => {
            setGroupId(e.target.value);
            setPage(1);
            fetchProducts(1, search, e.target.value);
          }}
          className="h-10 max-w-full rounded-lg border border-v5-line bg-v5-bg px-2 text-sm md:max-w-xs"
        >
          <option value="">Tất cả nhóm ({groups.length})</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.title.slice(0, 80)}</option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-lg bg-v5-accent px-5 text-sm font-semibold text-white hover:bg-v5-accent">
          Tìm kiếm
        </button>
      </form>

      <div className="text-xs text-v5-muted">
        {loading ? "Đang tải..." : <>Hiển thị <strong>{items.length}</strong> / <strong>{total}</strong> sản phẩm · Trang {page}/{totalPages}</>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-v5-line bg-v5-surface shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="bg-v5-bg text-xs uppercase text-v5-ink">
              <th className="px-3 py-2.5 text-left">Mã SP</th>
              <th className="px-3 py-2.5 text-left">Nhiệm vụ / Công việc chi tiết</th>
              <th className="px-3 py-2.5 text-left">Sản phẩm đầu ra</th>
              <th className="px-3 py-2.5 text-left">Phân nhóm</th>
              <th className="px-3 py-2.5 text-right">Điểm</th>
              <th className="px-3 py-2.5 text-right">Hệ số quy đổi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-v5-line/60">
            {items.map((it) => (
              <tr key={it.id} className="hover:bg-v5-bg">
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-bold text-v5-accent">
                  {it.code}
                  {it.sourceStt && <span className="block font-normal text-v5-muted">STT gốc: {it.sourceStt}</span>}
                </td>
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-v5-ink">{it.taskName}</div>
                  {it.detailWork && <div className="mt-0.5 text-xs text-v5-muted">{it.detailWork}</div>}
                  {it.group && <div className="mt-0.5 text-[11px] text-v5-muted">{it.group.title.slice(0, 100)}</div>}
                </td>
                <td className="px-3 py-2.5 text-v5-ink">{it.outputProduct || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-v5-muted">{it.groupName || "—"}</td>
                <td className="px-3 py-2.5 text-right font-semibold">{it.pointValue ?? "—"}</td>
                <td className="px-3 py-2.5 text-right font-bold text-v5-accent">{it.convertFactor ?? "—"}</td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} className="py-10 text-center text-v5-muted">Không tìm thấy sản phẩm phù hợp</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          disabled={page <= 1}
          onClick={() => { const p = page - 1; setPage(p); fetchProducts(p, search, groupId); }}
          className="rounded-lg border border-v5-line bg-v5-surface px-4 py-2 text-sm disabled:opacity-40"
        >
          Trước
        </button>
        <span className="text-sm text-v5-muted">Trang {page} / {totalPages}</span>
        <button
          disabled={page >= totalPages}
          onClick={() => { const p = page + 1; setPage(p); fetchProducts(p, search, groupId); }}
          className="rounded-lg border border-v5-line bg-v5-surface px-4 py-2 text-sm disabled:opacity-40"
        >
          Sau
        </button>
      </div>
    </div>
  );
}
