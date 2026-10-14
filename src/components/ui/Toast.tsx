"use client";

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
            ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-100"
            : t.type === "error"
            ? "bg-rose-950/90 border-rose-500/40 text-rose-100"
            : t.type === "warning"
            ? "bg-amber-950/90 border-amber-500/40 text-amber-100"
            : "bg-slate-900/90 border-teal-500/40 text-slate-100";

        const iconColor =
          t.type === "success"
            ? "text-emerald-400"
            : t.type === "error"
            ? "text-rose-400"
            : t.type === "warning"
            ? "text-amber-400"
            : "text-teal-400";

        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-200 transform translate-y-0 opacity-100 animate-in fade-in slide-in-from-top-2 ${bgClass}`}
          >
            <span className={`material-symbols-outlined text-[20px] shrink-0 mt-0.5 ${iconColor}`}>
              {iconName}
            </span>
            <div className="flex-1 text-xs font-medium leading-relaxed break-words">
              {t.message}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-slate-400 hover:text-white p-0.5 rounded transition-colors shrink-0"
              aria-label="Đóng thông báo"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
