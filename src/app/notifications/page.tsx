"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/Toast";

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
  const [activeFilter, setActiveFilter] = useState<"all" | "task" | "approval" | "deadline">("all");
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
    return item.category === activeFilter;
  });

  const unreadCount = notifications.filter((n) => n.isUnread).length;

  return (
    <div className="w-full min-h-screen bg-app-bg pb-24">
      <div className="max-w-2xl mx-auto px-margin pt-4 flex flex-col gap-4">
        {/* Interactive Top Action Strip */}
        <section className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            {unreadCount > 0 ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold tracking-wide uppercase bg-status-danger-bg text-status-danger">
                {unreadCount} CHƯA ĐỌC
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold tracking-wide uppercase bg-status-success-bg text-status-success">
                TẤT CẢ ĐÃ ĐỌC
              </span>
            )}
            <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold">
              Hộp thư điều hành tác nghiệp
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchNotifications}
              disabled={loading}
              className="p-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-fast active-press shadow-sm"
              title="Làm mới thông báo từ máy chủ"
            >
              <span className={`material-symbols-outlined text-[18px] ${loading ? "animate-spin" : ""}`}>
                refresh
              </span>
            </button>
            <button
              onClick={handleReadAll}
              disabled={isProcessingAll || unreadCount === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-label-sm transition-fast active-press shadow-sm font-semibold disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] text-primary">done_all</span>
              <span>{isProcessingAll ? "Đang xử lý..." : "Đã đọc hết"}</span>
            </button>
          </div>
        </section>

        {/* Error Banner if any */}
        {errorMsg && (
          <div className="p-4 rounded-xl bg-status-danger-bg border border-status-danger text-status-danger flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">error</span>
              <span className="text-xs font-semibold">{errorMsg}</span>
            </div>
            <button
              onClick={fetchNotifications}
              className="px-2.5 py-1 rounded bg-status-danger text-white text-xs font-semibold active-press"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* Filter Pills (Horizontal Scrollable) */}
        <section className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            onClick={() => setActiveFilter("all")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-label-md text-label-md whitespace-nowrap shadow-sm transition-fast active-press ${
              activeFilter === "all"
                ? "bg-primary text-on-primary font-bold"
                : "bg-surface-container text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span>Tất cả</span>
            <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[11px] font-semibold leading-tight">
              {notifications.length}
            </span>
          </button>
          <button
            onClick={() => setActiveFilter("task")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-label-md text-label-md whitespace-nowrap shadow-sm transition-fast active-press ${
              activeFilter === "task"
                ? "bg-primary text-on-primary font-bold"
                : "bg-surface-container text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span>Giao việc mới</span>
            <span className="px-1.5 py-0.2 rounded-full bg-primary/10 text-primary text-[11px] font-semibold leading-tight">
              {notifications.filter((n) => n.category === "task").length}
            </span>
          </button>
          <button
            onClick={() => setActiveFilter("approval")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-label-md text-label-md whitespace-nowrap shadow-sm transition-fast active-press ${
              activeFilter === "approval"
                ? "bg-primary text-on-primary font-bold"
                : "bg-surface-container text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span>Phê duyệt</span>
            <span className="px-1.5 py-0.2 rounded-full bg-primary/10 text-primary text-[11px] font-semibold leading-tight">
              {notifications.filter((n) => n.category === "approval").length}
            </span>
          </button>
          <button
            onClick={() => setActiveFilter("deadline")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-label-md text-label-md whitespace-nowrap shadow-sm transition-fast active-press ${
              activeFilter === "deadline"
                ? "bg-primary text-on-primary font-bold"
                : "bg-surface-container text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span>Nhắc hạn</span>
            <span className="px-1.5 py-0.2 rounded-full bg-status-danger-bg text-status-danger text-[11px] font-semibold leading-tight">
              {notifications.filter((n) => n.category === "deadline").length}
            </span>
          </button>
        </section>

        {/* FEED TIMELINE */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider font-bold">
                Cập nhật mới nhất
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant capitalize">
                {new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" })}
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center bg-surface-container-lowest rounded-xl border border-border-default/50 text-on-surface-variant text-sm animate-pulse">
                Đang nạp dữ liệu điều hành tác nghiệp từ PostgreSQL...
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="bg-surface-container-lowest p-8 rounded-2xl border border-border-default/50 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                <div className="w-12 h-12 rounded-full bg-status-success-bg text-status-success flex items-center justify-center">
                  <span className="material-symbols-outlined text-[28px]">check_circle</span>
                </div>
                <p className="font-headline-sm text-primary font-bold">Không có thông báo mới</p>
                <p className="font-body-md text-on-surface-variant max-w-sm text-sm">
                  Tất cả các nhiệm vụ, kế hoạch công tác và thời hạn ca trực đều đang ở trạng thái bình thường.
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif) => (
                <article
                  key={notif.id}
                  className={`relative overflow-hidden rounded-xl p-3.5 shadow-sm transition-fast border border-border-default/50 hover-lift ${
                    notif.isUnread ? "bg-status-unassigned-bg/70 ring-1 ring-secondary/20" : "bg-surface-container-lowest"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div
                      className={`relative shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${
                        notif.tagType === "danger"
                          ? "bg-status-danger-bg text-status-danger"
                          : notif.tagType === "success"
                          ? "bg-status-success-bg text-status-success"
                          : "bg-primary-fixed text-primary"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[22px]">
                        {notif.category === "deadline"
                          ? "alarm"
                          : notif.category === "approval"
                          ? "verified"
                          : "assignment_add"}
                      </span>
                      {notif.isUnread && notif.tagType === "danger" && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-status-danger animate-ping" />
                      )}
                    </div>

                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-tight ${
                              notif.tagType === "danger"
                                ? "bg-status-danger text-on-primary"
                                : notif.tagType === "success"
                                ? "bg-status-success text-on-primary"
                                : "bg-primary text-on-primary"
                            }`}
                          >
                            {notif.tag}
                          </span>
                          {notif.isUnread && (
                            <span className="w-2 h-2 rounded-full bg-secondary" title="Chưa đọc" />
                          )}
                        </div>
                        <span className="font-label-sm text-label-sm text-on-surface-variant text-[11px]">
                          {notif.time}
                        </span>
                      </div>

                      <p className="font-body-semibold text-body-semibold text-on-surface leading-snug mb-1 font-bold">
                        {notif.title}
                      </p>
                      <p className="font-body-md text-body-md text-on-surface-variant text-[13px] leading-relaxed mb-2">
                        {notif.description}
                      </p>

                      {/* Metadata Box if any */}
                      {notif.taskCode && (
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 py-1.5 px-2.5 rounded-lg bg-surface-container/70 mb-3 text-[12px]">
                          <div className="flex items-center gap-1 text-on-surface-variant">
                            <span>Mã việc:</span>
                            <span className="font-semibold text-primary font-mono">{notif.taskCode}</span>
                          </div>
                          {notif.assigner && (
                            <>
                              <div className="text-on-surface-variant/40">•</div>
                              <div className="flex items-center gap-1 text-on-surface-variant">
                                <span>Người giao:</span>
                                <span className="font-semibold text-on-surface">{notif.assigner}</span>
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
                            className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-md text-label-md shadow-sm transition-fast active-press font-semibold"
                          >
                            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                            <span>{notif.actionLabel}</span>
                          </Link>

                          {notif.isUnread && (
                            <button
                              onClick={() => handleMarkAsRead(notif.id)}
                              className="px-2.5 py-1.5 rounded-lg border border-border-default hover:bg-surface-container text-on-surface-variant font-label-sm text-label-sm transition-fast active-press"
                              title="Đánh dấu đã đọc"
                            >
                              Đã đọc
                            </button>
                          )}
                        </div>

                        <button
                          onClick={() => handleDismiss(notif.id)}
                          className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface transition-colors active-press"
                          title="Ẩn thông báo khỏi danh sách"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
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
