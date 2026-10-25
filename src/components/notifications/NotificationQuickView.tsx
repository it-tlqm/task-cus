"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";

interface QuickNotification {
  id: string;
  category: "deadline" | "task" | "approval" | "system";
  type: string;
  title: string;
  description: string;
  time: string;
  createdAt: string;
  isUnread: boolean;
  tag: string;
  tagType: "danger" | "primary" | "success" | "warning";
  taskCode?: string;
  actionUrl: string;
  actionLabel: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function NotificationQuickView({ open, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<QuickNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications?limit=8", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Không tải được thông báo");
      setItems(Array.isArray(json.data) ? json.data : []);
      setUnreadCount(Number(json.unreadCount) || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được thông báo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    const timer = window.setTimeout(() => closeRef.current?.focus(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, load]);

  const markRead = async (id: string) => {
    const target = items.find((item) => item.id === id);
    if (!target?.isUnread) return;
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      if (!res.ok) return;
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isUnread: false } : item)));
      setUnreadCount((count) => Math.max(0, count - 1));
      window.dispatchEvent(new Event("notifications-updated"));
    } catch {
      // Giữ nguyên trạng thái nếu lỗi mạng; người dùng có thể thử lại ở trang đầy đủ.
    }
  };

  const markAllRead = async () => {
    if (busyAll || unreadCount === 0) return;
    setBusyAll(true);
    try {
      const res = await fetch("/api/notifications/read-all", { method: "POST" });
      if (!res.ok) return;
      setItems((prev) => prev.map((item) => ({ ...item, isUnread: false })));
      setUnreadCount(0);
      window.dispatchEvent(new Event("notifications-updated"));
    } finally {
      setBusyAll(false);
    }
  };

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/30 p-0 backdrop-blur-[1px] sm:items-start sm:justify-end sm:p-4 sm:pt-24"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Thông báo nhanh"
        data-testid="notification-quick-view"
        className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border-default bg-surface-container-lowest shadow-2xl sm:max-h-[72vh] sm:w-[430px] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border-default/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">notifications</span>
            <h2 className="font-title-md text-title-md font-bold text-on-surface">Thông báo nhanh</h2>
            {unreadCount > 0 && (
              <span className="rounded-full bg-status-danger px-2 py-0.5 text-[10px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount} chưa đọc
              </span>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng thông báo nhanh"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-fast hover:bg-surface-container active-press"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-border-default/40 px-4 py-2">
          <span className="text-body-xs font-semibold text-on-surface-variant">
            {items.length > 0 ? `Mới nhất ${items.length} thông báo` : "Hộp thư điều hành"}
          </span>
          <button
            type="button"
            onClick={markAllRead}
            disabled={busyAll || unreadCount === 0}
            className="text-body-xs font-semibold text-primary disabled:opacity-40"
          >
            {busyAll ? "Đang xử lý..." : "Đọc tất cả"}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-container" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-status-danger/30 bg-status-danger-bg/40 p-4 text-center">
              <p className="text-body-sm font-semibold text-status-danger">{error}</p>
              <button
                type="button"
                onClick={load}
                className="mt-2 rounded-lg border border-border-default bg-surface px-3 py-1.5 text-body-xs font-semibold"
              >
                Thử lại
              </button>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="material-symbols-outlined text-[32px] text-status-success">check_circle</span>
              <p className="text-body-sm font-semibold text-on-surface">Không có thông báo mới</p>
              <p className="text-body-xs text-on-surface-variant">Các nhiệm vụ và thời hạn đang bình thường.</p>
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={item.actionUrl}
                  onClick={() => {
                    if (item.isUnread) void markRead(item.id);
                    onClose();
                  }}
                  className={`group block rounded-xl border p-3 transition-fast hover:-translate-y-0.5 hover:shadow-md ${
                    item.isUnread
                      ? item.tagType === "danger"
                        ? "border-status-danger/40 border-l-4 border-l-status-danger bg-status-danger-bg/40"
                        : "border-status-warning/40 border-l-4 border-l-status-warning bg-status-warning-bg/40"
                      : "border-border-default/50 bg-surface"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        item.tagType === "danger"
                          ? "bg-status-danger text-white"
                          : item.tagType === "success"
                            ? "bg-status-success text-white"
                            : item.tagType === "warning"
                              ? "bg-status-warning text-white"
                              : "bg-primary text-on-primary"
                      }`}
                    >
                      {item.tag}
                    </span>
                    <span className="shrink-0 text-[10px] text-on-surface-variant">{item.time}</span>
                  </div>
                  <p className="line-clamp-2 text-body-sm font-semibold leading-snug text-on-surface">
                    {item.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-body-xs leading-relaxed text-on-surface-variant">
                    {item.description}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    {item.taskCode ? (
                      <span className="font-mono text-[10px] font-semibold text-primary">{item.taskCode}</span>
                    ) : (
                      <span />
                    )}
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-secondary">
                      {item.actionLabel}
                      <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                    </span>
                  </div>
                  {item.isUnread && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-status-warning">
                      <span className="h-1.5 w-1.5 rounded-full bg-status-warning" />
                      Chưa đọc
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border-default/60 p-3">
          <Link
            href="/notifications"
            onClick={onClose}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-label-md font-semibold text-on-primary transition-fast hover:opacity-90 active-press"
          >
            Xem tất cả thông báo
            <span className="material-symbols-outlined text-[17px]">arrow_forward</span>
          </Link>
        </div>
      </section>
    </div>,
    document.body
  );
}
