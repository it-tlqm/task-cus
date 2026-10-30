"use client";

import { V5Icon } from "@/components/v5/ui/lucide-icon";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { PushToggle } from "@/components/ui/PushToggle";
import { EmptyState } from "@/components/v5/ui/empty-state";
import { FilterBar, FilterChip } from "@/components/v5/ui/filter-bar";
import { PageHeader } from "@/components/v5/ui/page-header";

interface NotificationItem {
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
  assigner?: string;
  actionUrl: string;
  actionLabel: string;
  entityType?: string;
  entityId?: string;
}

export default function NotificationsPage() {
  const [activeFilter, setActiveFilter] = useState<"all" | "unread" | "task" | "approval" | "deadline">("all");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessingAll, setIsProcessingAll] = useState(false);

  // Nạp thông báo từ PostgreSQL qua API thực tế
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/notifications");
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Không thể tải danh sách thông báo");
      }

      if (Array.isArray(json.data)) {
        setNotifications(json.data);
      }
    } catch (err: any) {
      console.error("Error fetching notifications:", err);
      setErrorMsg(err.message || "Lỗi tải thông báo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Đánh dấu tất cả là đã đọc vào PostgreSQL
  const handleReadAll = async () => {
    if (isProcessingAll) return;
    setIsProcessingAll(true);
    try {
      const res = await fetch("/api/notifications/read-all", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Không thể cập nhật trạng thái đã đọc");
      }

      setNotifications((prev) => prev.map((n) => ({ ...n, isUnread: false })));
      toast.success("Đã đánh dấu tất cả thông báo là đã đọc");

      // Báo cho Header và BottomNav cập nhật badge
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("notifications-updated"));
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi đánh dấu đã đọc");
    } finally {
      setIsProcessingAll(false);
    }
  };

  // Đánh dấu 1 thông báo cụ thể là đã đọc vào PostgreSQL
  const handleMarkAsRead = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Không thể cập nhật trạng thái");
      }

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isUnread: false } : n))
      );

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("notifications-updated"));
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi cập nhật thông báo");
    }
  };

  // Ẩn thông báo vào PostgreSQL
  const handleDismiss = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/dismiss`, {
        method: "PATCH",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Không thể ẩn thông báo");
      }

      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.info("Đã ẩn thông báo khỏi danh sách");

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("notifications-updated"));
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi ẩn thông báo");
    }
  };

  const filteredNotifications = notifications.filter((item) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "unread") return item.isUnread;
    return item.category === activeFilter;
  });

  const unreadCount = notifications.filter((n) => n.isUnread).length;

  return (
    <div className="w-full min-h-screen bg-transparent pb-24">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-4">
        <PageHeader
          eyebrow="Hộp thư điều hành"
          title="Thông báo"
          badges={
            unreadCount > 0 ? (
              <span className="inline-flex items-center rounded bg-v5-danger-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-v5-danger">
                {unreadCount} chưa đọc
              </span>
            ) : (
              <span className="inline-flex items-center rounded bg-v5-success-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-v5-success">
                Đã đọc hết
              </span>
            )
          }
          description="Cập nhật giao việc, phê duyệt, hạn xử lý và thay đổi dữ liệu liên quan đến anh/chị."
          actions={
            <>
              <button
                onClick={fetchNotifications}
                disabled={loading}
                className="rounded-lg border border-v5-line bg-v5-surface p-2 text-v5-muted transition-colors hover:bg-v5-bg disabled:opacity-50"
                title="Làm mới thông báo từ máy chủ"
              >
                <V5Icon
                  name="refresh"
                  className={`text-[18px] ${loading ? "animate-spin" : ""}`}
                />
              </button>
              <button
                onClick={handleReadAll}
                disabled={isProcessingAll || unreadCount === 0}
                className="flex items-center gap-1.5 rounded-lg border border-v5-line bg-v5-surface px-3 py-2 text-xs font-semibold text-v5-ink transition-colors hover:bg-v5-bg disabled:opacity-50"
              >
                <V5Icon name="done_all" className="text-[16px]" />
                <span>{isProcessingAll ? "Đang xử lý..." : "Đã đọc hết"}</span>
              </button>
              <div data-tour="push-toggle">
                <PushToggle />
              </div>
            </>
          }
        />

        {/* Error Banner if any */}
        {errorMsg && (
          <div className="p-4 rounded-xl bg-v5-danger-soft border border-v5-danger text-v5-danger flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <V5Icon name="error" className="text-[20px]" />
              <span className="text-xs font-semibold">{errorMsg}</span>
            </div>
            <button
              onClick={fetchNotifications}
              className="px-2.5 py-1 rounded bg-v5-danger text-white text-xs font-semibold active-press"
            >
              Thử lại
            </button>
          </div>
        )}

        <div data-tour="filter-tabs">
          <FilterBar>
            <FilterChip
              active={activeFilter === "all"}
              onClick={() => setActiveFilter("all")}
              className="inline-flex items-center gap-1.5"
            >
              Tất cả
              <span className="rounded bg-v5-surface/20 px-1.5 text-[10px]">{notifications.length}</span>
            </FilterChip>
            <FilterChip
              active={activeFilter === "unread"}
              onClick={() => setActiveFilter("unread")}
              tone="gold"
              className="inline-flex items-center gap-1.5"
            >
              Chưa đọc
              <span className="rounded bg-v5-surface/30 px-1.5 text-[10px]">{unreadCount}</span>
            </FilterChip>
            <FilterChip
              active={activeFilter === "task"}
              onClick={() => setActiveFilter("task")}
              className="inline-flex items-center gap-1.5"
            >
              Giao việc mới
              <span className="text-[10px]">{notifications.filter((n) => n.category === "task").length}</span>
            </FilterChip>
            <FilterChip
              active={activeFilter === "approval"}
              onClick={() => setActiveFilter("approval")}
              className="inline-flex items-center gap-1.5"
            >
              Phê duyệt
              <span className="text-[10px]">{notifications.filter((n) => n.category === "approval").length}</span>
            </FilterChip>
            <FilterChip
              active={activeFilter === "deadline"}
              onClick={() => setActiveFilter("deadline")}
              tone="danger"
              className="inline-flex items-center gap-1.5"
            >
              Nhắc hạn
              <span className="text-[10px]">{notifications.filter((n) => n.category === "deadline").length}</span>
            </FilterChip>
          </FilterBar>
        </div>

        {/* FEED TIMELINE */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] text-v5-ink uppercase tracking-wider font-bold">
                Cập nhật mới nhất
              </span>
              <span
                className="text-[11px] text-v5-muted capitalize"
                suppressHydrationWarning
              >
                {new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" })}
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center bg-v5-surface rounded-xl border border-v5-line/50 text-v5-muted text-sm animate-pulse">
                Đang nạp dữ liệu điều hành tác nghiệp...
              </div>
            ) : filteredNotifications.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Không có thông báo mới"
                description="Tất cả nhiệm vụ, kế hoạch công tác và thời hạn ca trực đang ở trạng thái bình thường."
              />
            ) : (
              filteredNotifications.map((notif) => (
                <article
                  key={notif.id}
                  className={`relative overflow-hidden rounded-xl p-3.5 shadow-sm transition-fast border border-v5-line/50 hover-lift ${
                    notif.isUnread
                      ? notif.tagType === "danger"
                        ? "bg-v5-danger-soft/45 border-v5-danger/40 border-l-4 border-l-v5-danger ring-1 ring-v5-danger/15"
                        : "bg-v5-gold-soft/45 border-v5-gold/40 border-l-4 border-l-v5-gold ring-1 ring-v5-gold/15"
                      : "bg-v5-surface"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div
                      className={`relative shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${
                        notif.tagType === "danger"
                          ? "bg-v5-danger-soft text-v5-danger"
                          : notif.tagType === "success"
                          ? "bg-v5-success-soft text-v5-success"
                          : "bg-v5-accent-fixed text-v5-ink"
                      }`}
                    >
                      <V5Icon
                        name={
                          notif.category === "deadline"
                            ? "alarm"
                            : notif.category === "approval"
                              ? "verified"
                              : "assignment_add"
                        }
                        className="text-[22px]"
                      />
                      {notif.isUnread && notif.tagType === "danger" && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-v5-danger animate-ping" />
                      )}
                    </div>

                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-tight ${
                              notif.tagType === "danger"
                                ? "bg-v5-danger text-white"
                                : notif.tagType === "success"
                                ? "bg-v5-success text-white"
                                : "bg-v5-accent text-white"
                            }`}
                          >
                            {notif.tag}
                          </span>
                          {notif.isUnread && (
                            <span className="w-2 h-2 rounded-full bg-v5-accent" title="Chưa đọc" />
                          )}
                        </div>
                        <span className="text-[11px] text-v5-muted text-[11px]">
                          {notif.time}
                        </span>
                      </div>

                      <p className="text-[13px] font-semibold text-v5-ink leading-snug mb-1 font-bold">
                        {notif.title}
                      </p>
                      <p className="text-[12px] text-v5-muted text-[13px] leading-relaxed mb-2">
                        {notif.description}
                      </p>

                      {/* Metadata Box if any */}
                      {notif.taskCode && (
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 py-1.5 px-2.5 rounded-lg bg-v5-bg/70 mb-3 text-[12px]">
                          <div className="flex items-center gap-1 text-v5-muted">
                            <span>Mã việc:</span>
                            <span className="font-semibold text-v5-ink font-mono">{notif.taskCode}</span>
                          </div>
                          {notif.assigner && (
                            <>
                              <div className="text-v5-muted/40">•</div>
                              <div className="flex items-center gap-1 text-v5-muted">
                                <span>Người giao:</span>
                                <span className="font-semibold text-v5-ink">{notif.assigner}</span>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 gap-2">
                        <div className="flex items-center gap-2">
                          <Link
                            href={notif.actionUrl}
                            onClick={() => {
                              if (notif.isUnread) {
                                handleMarkAsRead(notif.id);
                              }
                            }}
                            className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-v5-accent text-white text-[12px] shadow-sm transition-fast active-press font-semibold"
                          >
                            <V5Icon name="arrow_forward" className="text-[16px]" />
                            <span>{notif.actionLabel}</span>
                          </Link>

                          {notif.isUnread && (
                            <button
                              onClick={() => handleMarkAsRead(notif.id)}
                              className="px-2.5 py-1.5 rounded-lg border border-v5-line hover:bg-v5-bg text-v5-muted text-[11px] transition-fast active-press"
                              title="Đánh dấu đã đọc"
                            >
                              Đã đọc
                            </button>
                          )}
                        </div>

                        <button
                          onClick={() => handleDismiss(notif.id)}
                          className="p-1.5 rounded-lg text-v5-muted hover:text-v5-ink transition-colors active-press"
                          title="Ẩn thông báo khỏi danh sách"
                        >
                          <V5Icon name="close" className="text-[18px]" />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
