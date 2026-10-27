"use client";

import { V5Icon } from "@/components/v5/ui/icon";

import React, { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

// Global dispatcher using custom events
export const toast = {
  success: (message: string, duration = 3500) => emitToast(message, "success", duration),
  error: (message: string, duration = 4500) => emitToast(message, "error", duration),
  info: (message: string, duration = 3000) => emitToast(message, "info", duration),
  warning: (message: string, duration = 4000) => emitToast(message, "warning", duration),
};

function emitToast(message: string, type: ToastType, duration: number) {
  if (typeof window === "undefined") return;
  const detail: ToastMessage = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type,
    message,
    duration,
  };
  window.dispatchEvent(new CustomEvent("app:toast", { detail }));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const customEvent = e as CustomEvent<ToastMessage>;
      if (!customEvent.detail) return;
      const newToast = customEvent.detail;
      setToasts((prev) => [...prev, newToast]);

      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, newToast.duration || 3500);

      return () => clearTimeout(timer);
    };

    window.addEventListener("app:toast", handleToast);
    return () => window.removeEventListener("app:toast", handleToast);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed z-[9999] top-4 right-4 left-4 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none select-none"
    >
      {toasts.map((t) => {
        const iconName =
          t.type === "success"
            ? "check_circle"
            : t.type === "error"
            ? "error"
            : t.type === "warning"
            ? "warning"
            : "info";

        const bgClass =
          t.type === "success"
            ? "border-v5-success/40 bg-v5-surface text-v5-ink"
            : t.type === "error"
              ? "border-v5-danger/40 bg-v5-surface text-v5-ink"
              : t.type === "warning"
                ? "border-v5-gold/50 bg-v5-surface text-v5-ink"
                : "border-v5-line bg-v5-surface text-v5-ink";

        const iconColor =
          t.type === "success"
            ? "text-v5-success"
            : t.type === "error"
              ? "text-v5-danger"
              : t.type === "warning"
                ? "text-v5-gold-ink"
                : "text-v5-accent";

        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-200 transform translate-y-0 opacity-100 animate-in fade-in slide-in-from-top-2 ${bgClass}`}
          >
            <V5Icon name={iconName} className={`mt-0.5 shrink-0 text-[20px] ${iconColor}`} />
            <div className="flex-1 text-xs font-medium leading-relaxed break-words">
              {t.message}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="shrink-0 rounded p-0.5 text-v5-muted transition-colors hover:text-v5-ink"
              aria-label="Đóng thông báo"
            >
              <V5Icon name="close" className="text-[16px]" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
