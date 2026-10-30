"use client";

import { V5Icon } from "@/components/v5/ui/lucide-icon";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "@/components/ui/Toast";
import { usePermissions } from "@/hooks/usePermissions";

interface FeedbackItem {
  id: string;
  category: string;
  content: string;
  pagePath: string | null;
  userAgent: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  senderName: string;
  senderCode: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  GOP_Y: "Góp ý",
  BAO_LOI: "Báo lỗi",
  DE_XUAT: "Đề xuất",
};

const CATEGORY_STYLES: Record<string, string> = {
  GOP_Y: "bg-v5-accent-soft text-v5-accent border-v5-line",
  BAO_LOI: "bg-v5-danger-soft text-v5-danger border-v5-danger/30",
  DE_XUAT: "bg-v5-gold-soft text-v5-gold-ink border-v5-gold/50",
};

const PAGE_SIZE = 20;

/** Nhãn thiết bị gọn để đọc nhanh; UA gốc vẫn hiện khi rê chuột */
function deviceLabel(ua?: string | null) {
  if (!ua) return "—";
  if (/iPhone|iPad|Android|Mobile/i.test(ua)) return "Điện thoại";
  return "Máy tính";
}

export default function AdminFeedbackPage() {
  const { showAdminMenu, loading: permLoading } = usePermissions();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [tab, setTab] = useState<"NEW" | "DONE" | "ALL">("NEW");
  const [counts, setCounts] = useState<{ NEW: number; DONE: number; total: number }>({ NEW: 0, DONE: 0, total: 0 });
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkNote, setBulkNote] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  // Gõ tới đâu chờ 400ms mới hỏi máy chủ, đổi từ khóa thì về trang 1
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const fetchCounts = useCallback(() => {
    fetch("/api/feedback?meta=counts")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data.counts) {
          setCounts({
            NEW: data.counts.NEW || 0,
            DONE: data.counts.DONE || 0,
            total: data.counts.total || 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (permLoading || !showAdminMenu) return;
    fetchCounts();
  }, [permLoading, showAdminMenu, fetchCounts, refreshKey]);

  // Tải danh sách theo trang + tab + từ khóa (lọc phía máy chủ)
  useEffect(() => {
    if (permLoading || !showAdminMenu) return;
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch) qs.set("search", debouncedSearch);
    if (tab !== "ALL") qs.set("status", tab);
    fetch(`/api/feedback?${qs.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.data)) {
          setItems(data.data);
          setTotal(data.pagination?.total ?? data.data.length);
          setTotalPages(data.pagination?.totalPages ?? 1);
        } else {
          setItems([]);
          setTotal(0);
          setTotalPages(1);
        }
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
        setTotalPages(1);
      })
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, tab, permLoading, showAdminMenu, refreshKey]);

  useEffect(() => {
    setSelectedIds([]);
    setBulkNote("");
  }, [tab, page, debouncedSearch, refreshKey]);

  const selectableIds = items.filter((item) => item.status === "NEW").map((item) => item.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));

  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const bulkResolve = async () => {
    if (bulkBusy || selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      const results = await Promise.all(
        selectedIds.map(async (id) => {
          const res = await fetch(`/api/feedback/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "resolve", adminNote: bulkNote.trim() || undefined }),
          });
          return res.ok;
        })
      );
      const okCount = results.filter(Boolean).length;
      if (okCount > 0) {
        toast.success(`Đã xử lý ${okCount}/${selectedIds.length} góp ý.`);
        setSelectedIds([]);
        setBulkNote("");
        setRefreshKey((key) => key + 1);
      } else {
        toast.error("Không xử lý được góp ý nào.");
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      setBulkBusy(false);
    }
  };

  const act = async (id: string, action: "resolve" | "reopen" | "note") => {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, adminNote: noteDraft[id] }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(json.message || "Đã lưu");
        setNoteDraft((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setRefreshKey((k) => k + 1);
      } else {
        toast.error(json.error || "Không thực hiện được");
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      setBusyId(null);
    }
  };

  const pageBtn =
    "px-2.5 h-8 rounded bg-v5-bg hover:bg-v5-bg text-[12px] font-semibold text-v5-ink transition-fast active-press disabled:opacity-40 disabled:cursor-not-allowed";

  if (!permLoading && !showAdminMenu) {
    return (
      <div className="p-6 text-sm text-v5-muted">
        Trang này dành cho lãnh đạo đơn vị và quản trị kỹ thuật.
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full p-space-md lg:p-space-lg gap-space-lg pb-16">
      {/* Đầu trang */}
      <div className="flex flex-col gap-1">
        <h1 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
          <V5Icon name="campaign" />
          Góp ý &amp; Báo lỗi
        </h1>
        <p className="text-sm text-v5-muted">
          Phản hồi công chức gửi từ nút <b>Góp ý</b> trong app — xem xong đánh dấu đã xử lý để không sót.
        </p>
      </div>

      {/* Bộ lọc */}
      <div className="bg-v5-surface rounded-xl border border-v5-line shadow-sm p-3 flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="flex gap-1.5">
          {(
            [
              { id: "NEW", label: `Mới (${counts.NEW})` },
              { id: "DONE", label: `Đã xử lý (${counts.DONE})` },
              { id: "ALL", label: `Tất cả (${counts.total})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setPage(1);
              }}
              className={`h-9 px-3 rounded-lg text-xs font-bold border transition-fast ${
                tab === t.id
                  ? "bg-primary text-white border-primary"
                  : "bg-v5-surface text-v5-ink border-v5-line hover:bg-v5-bg"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab !== "DONE" && selectableIds.length > 0 && (
          <label className="flex h-9 items-center gap-2 rounded-lg border border-v5-line bg-v5-bg px-3 text-xs font-semibold text-v5-muted">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) =>
                setSelectedIds(event.target.checked ? selectableIds : [])
              }
              data-testid="feedback-select-all"
            />
            Chọn trang ({selectableIds.length})
          </label>
        )}
        <div className="flex-1" />
        <div className="relative">
          <V5Icon name="search" className="text-[18px] text-v5-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm trong nội dung phản hồi... (gõ không dấu vẫn ra)"
            className="h-9 w-full sm:w-80 pl-9 pr-3 rounded-lg border border-v5-line text-sm"
          />
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-secondary/30 bg-secondary/5 p-3 shadow-sm sm:flex-row sm:items-center">
          <span className="text-xs font-bold text-secondary">
            Đã chọn {selectedIds.length} góp ý mới
          </span>
          <input
            value={bulkNote}
            onChange={(event) => setBulkNote(event.target.value)}
            placeholder="Ghi chú chung (tùy chọn)"
            className="h-8 min-w-0 flex-1 rounded-lg border border-v5-line px-2.5 text-xs"
          />
          <button
            type="button"
            onClick={bulkResolve}
            disabled={bulkBusy}
            className="h-8 rounded-lg bg-secondary px-3 text-xs font-bold text-on-secondary disabled:opacity-50"
          >
            {bulkBusy ? "Đang xử lý..." : "Đánh dấu đã xử lý"}
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="h-8 rounded-lg border border-v5-line bg-v5-surface px-3 text-xs font-semibold text-v5-muted"
          >
            Bỏ chọn
          </button>
        </div>
      )}

      {/* Danh sách */}
      <div className="flex flex-col gap-3">
        {loading && <p className="text-sm text-v5-muted text-center py-8">Đang tải phản hồi...</p>}
        {!loading && items.length === 0 && (
          <div className="bg-v5-surface rounded-xl border border-v5-line shadow-sm p-8 text-center">
            <p className="text-sm text-v5-muted">
              {tab === "NEW"
                ? "Không còn phản hồi nào chưa xử lý — sạch sẽ!"
                : "Chưa có phản hồi nào khớp bộ lọc."}
            </p>
          </div>
        )}

        {items.map((f) => (
          <div key={f.id} className="bg-v5-surface rounded-xl border border-v5-line shadow-sm p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {f.status === "NEW" && (
                <input
                  type="checkbox"
                  checked={selectedIds.includes(f.id)}
                  onChange={() => toggleSelected(f.id)}
                  aria-label={`Chọn góp ý của ${f.senderName}`}
                  data-testid={`feedback-select-${f.id}`}
                />
              )}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${
                  CATEGORY_STYLES[f.category] || "bg-v5-bg text-v5-muted border-v5-line"
                }`}
              >
                {CATEGORY_LABELS[f.category] || f.category}
              </span>
              {f.status === "DONE" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-v5-success-soft text-v5-success border border-v5-success/30">
                  <V5Icon name="check_circle" className="text-[13px]" />
                  Đã xử lý
                  {f.resolvedAt ? ` ${new Date(f.resolvedAt).toLocaleDateString("vi-VN")}` : ""}
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-v5-danger-soft text-v5-danger border border-v5-danger/30">
                  Mới
                </span>
              )}
              <span className="text-[11px] text-v5-muted ml-auto">
                {new Date(f.createdAt).toLocaleString("vi-VN")}
              </span>
            </div>

            <p className="text-sm text-v5-ink whitespace-pre-wrap">{f.content}</p>

            <div className="flex items-center gap-3 flex-wrap text-[12px] text-v5-muted">
              <span className="inline-flex items-center gap-1">
                <V5Icon name="person" className="text-[15px]" />
                {f.senderName}
                {f.senderCode ? ` (${f.senderCode})` : ""}
              </span>
              <span className="inline-flex items-center gap-1" title={f.userAgent || ""}>
                <V5Icon
                  name={deviceLabel(f.userAgent) === "Điện thoại" ? "smartphone" : "computer"}
                  className="text-[15px]"
                />
                {deviceLabel(f.userAgent)}
              </span>
              {f.pagePath && (
                <span className="inline-flex items-center gap-1">
                  <V5Icon name="pin_drop" className="text-[15px]" />
                  gửi từ <code className="px-1 rounded bg-v5-bg">{f.pagePath}</code>
                  <a
                    href={f.pagePath}
                    className="font-bold text-v5-accent hover:underline"
                    title="Mở lại màn hình người gửi đang đứng lúc gửi"
                  >
                    Mở lại trang ›
                  </a>
                </span>
              )}
            </div>

            {f.adminNote && (
              <p className="text-[12px] text-v5-muted bg-v5-bg border border-v5-line rounded-lg px-2.5 py-1.5">
                <b>Ghi chú xử lý:</b> {f.adminNote}
              </p>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1 border-t border-v5-line/60">
              {f.status === "NEW" ? (
                <button
                  onClick={() => act(f.id, "resolve")}
                  disabled={busyId === f.id}
                  className="h-8 px-3 rounded-lg bg-secondary text-on-secondary text-xs font-bold disabled:opacity-50"
                >
                  {busyId === f.id ? "Đang lưu..." : "✓ Đánh dấu đã xử lý"}
                </button>
              ) : (
                <button
                  onClick={() => act(f.id, "reopen")}
                  disabled={busyId === f.id}
                  className="h-8 px-3 rounded-lg bg-v5-surface border border-v5-line text-xs font-bold text-v5-muted disabled:opacity-50"
                >
                  Mở lại
                </button>
              )}
              <input
                value={noteDraft[f.id] ?? f.adminNote ?? ""}
                onChange={(e) => setNoteDraft((prev) => ({ ...prev, [f.id]: e.target.value }))}
                placeholder="Ghi chú xử lý (tùy chọn) — VD: đã sửa ở bản cập nhật tối nay"
                className="h-8 flex-1 min-w-0 px-2.5 rounded-lg border border-v5-line text-xs"
              />
              <button
                onClick={() => act(f.id, "note")}
                disabled={busyId === f.id || (noteDraft[f.id] ?? f.adminNote ?? "").trim() === (f.adminNote ?? "").trim()}
                className="h-8 px-3 rounded-lg bg-v5-bg border border-v5-line text-xs font-semibold text-v5-muted disabled:opacity-40"
              >
                Lưu ghi chú
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Phân trang thật (phía máy chủ) */}
      {!loading && total > 0 && (
        <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-between bg-v5-surface rounded-xl border border-v5-line shadow-sm px-4 py-2.5">
          <span className="text-[12px] text-v5-muted">
            Tổng <b>{total.toLocaleString("vi-VN")}</b> phản hồi • Trang <b>{page}</b>/{totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button className={pageBtn} disabled={page <= 1} onClick={() => setPage(1)} title="Trang đầu">
              « Đầu
            </button>
            <button className={pageBtn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} title="Trang trước">
              ‹ Trước
            </button>
            <button
              className={pageBtn}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              title="Trang sau"
            >
              Sau ›
            </button>
            <button className={pageBtn} disabled={page >= totalPages} onClick={() => setPage(totalPages)} title="Trang cuối">
              Cuối »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
