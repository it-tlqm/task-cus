"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { getTour, TOUR_START_EVENT, TourStep } from "@/data/page-tour";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Tour từng bước: khung sáng di chuyển đến từng khu vực + nút Trước/Tiếp/Bỏ qua.
 * Lần đầu vào trang có tour thì tự chạy; mỗi trang 1 lần/máy. Thiếu phần tử
 * (do phân quyền) thì tự bỏ qua bước đó.
 */
export function TourGuide() {
  const pathname = usePathname();
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [active, setActive] = useState(false);

  const stop = useCallback((done: boolean) => {
    if (done) {
      try {
        const m = JSON.parse(localStorage.getItem("hqtl-tour-done") || "{}");
        m[pathname] = true;
        localStorage.setItem("hqtl-tour-done", JSON.stringify(m));
      } catch {}
    }
    setActive(false);
    setSteps([]);
    setRect(null);
  }, [pathname]);

  /** Phần tử đầu tiên còn hiển thị (bỏ qua bản desktop/mobile đang ẩn). */
  const findVisible = (target: string): HTMLElement | null => {
    const els = document.querySelectorAll(`[data-tour="${target}"]`);
    for (const el of Array.from(els)) {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el as HTMLElement;
    }
    return null;
  };

  const measure = useCallback((target: string): boolean => {
    const el = findVisible(target);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    // Phần tử quá bé/coi như ẩn (menu gấp, tab ẩn) thì bỏ qua bước
    if (r.width < 24 || r.height < 24) return false;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    // Đo sau khi cuộn xong
    window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) return;
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }, 350);
    return true;
  }, []);

  const start = useCallback(() => {
    const s = getTour(pathname);
    if (!s || s.length === 0) return;
    setSteps(s);
    setIdx(0);
    setActive(true);
  }, [pathname]);

  // Lần đầu vào trang có tour → tự chạy (mỗi trang 1 lần)
  useEffect(() => {
    setActive(false);
    let done: Record<string, boolean> = {};
    try {
      done = JSON.parse(localStorage.getItem("hqtl-tour-done") || "{}");
    } catch {}
    if (done[pathname]) return;
    if (!getTour(pathname)) return;
    const t = window.setTimeout(start, 900);
    return () => window.clearTimeout(t);
  }, [pathname, start]);

  // Cho phép bảng "?" gọi tour thủ công
  useEffect(() => {
    const handler = () => start();
    window.addEventListener(TOUR_START_EVENT, handler);
    return () => window.removeEventListener(TOUR_START_EVENT, handler);
  }, [start]);

  // Bước hiện tại: đo khung, thiếu thì nhảy bước kế
  useEffect(() => {
    if (!active || steps.length === 0) return;
    const step = steps[idx];
    if (!step) {
      stop(true);
      return;
    }
    if (!measure(step.target)) {
      if (idx + 1 < steps.length) setIdx(idx + 1);
      else stop(true);
    }
  }, [active, steps, idx, measure, stop]);

  // Theo dõi cuộn/resize để khung bám theo
  useEffect(() => {
    if (!active || steps.length === 0) return;
    const onMove = () => {
      const step = steps[idx];
      if (!step) return;
      const el = findVisible(step.target);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) return;
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [active, steps, idx]);

  if (!active || steps.length === 0) return null;
  const step = steps[idx];
  if (!step) return null;
  const last = idx === steps.length - 1;

  const tipBelow = rect ? rect.top + rect.height + 12 + 180 < window.innerHeight : true;
  const tipStyle: React.CSSProperties = rect
    ? tipBelow
      ? { top: Math.min(rect.top + rect.height + 12, window.innerHeight - 200), left: Math.max(12, Math.min(rect.left, window.innerWidth - 340)) }
      : { top: Math.max(12, rect.top - 200), left: Math.max(12, Math.min(rect.left, window.innerWidth - 340)) }
    : { bottom: 100, left: 16, right: 16 };

  return (
    <div className="fixed inset-0 z-[80]">
      {/* Phủ mờ + khung sáng */}
      <div className="absolute inset-0 bg-black/55" onClick={() => stop(false)} />
      {rect && (
        <div
          className="absolute rounded-xl border-[3px] border-secondary shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] transition-all duration-300"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      {/* Thẻ nội dung + Trước/Tiếp */}
      <div className="absolute w-[320px] max-w-[calc(100vw-24px)] bg-surface-container-lowest rounded-2xl shadow-2xl p-4 flex flex-col gap-2.5" style={tipStyle}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-secondary uppercase">
            Bước {idx + 1}/{steps.length} · {step.title}
          </span>
          <button onClick={() => stop(false)} className="text-xs text-outline hover:text-primary font-semibold">
            Bỏ qua
          </button>
        </div>
        <p className="text-sm text-on-surface leading-relaxed">{step.text}</p>
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => idx > 0 && setIdx(idx - 1)}
            disabled={idx === 0}
            className="px-4 py-2 rounded-lg bg-surface-container text-sm font-bold disabled:opacity-40"
          >
            ‹ Trước
          </button>
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === idx ? "bg-secondary" : "bg-border-default"}`} />
            ))}
          </div>
          {last ? (
            <button onClick={() => stop(true)} className="px-4 py-2 rounded-lg bg-secondary text-on-secondary text-sm font-bold">
              Xong ✓
            </button>
          ) : (
            <button onClick={() => setIdx(idx + 1)} className="px-4 py-2 rounded-lg bg-secondary text-on-secondary text-sm font-bold">
              Tiếp ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
