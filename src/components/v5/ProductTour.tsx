"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { findScreenTour, type ScreenTourStep } from "@/config/screen-tours";
import { cn } from "@/lib/utils";

const STORAGE_PREFIX = "talung.screenTour.v1.";
const START_EVENT = "talung:start-tour";

type Rect = { top: number; left: number; width: number; height: number };

function readCompleted(key: string): boolean {
  try {
    return localStorage.getItem(key) === "done";
  } catch {
    return false;
  }
}

function markCompleted(key: string) {
  try {
    localStorage.setItem(key, "done");
  } catch {
    // Trình duyệt chặn localStorage — tour vẫn chạy được trong phiên này.
  }
}

function measure(selectors: string[]): { rect: Rect | null; element: HTMLElement | null } {
  for (const selector of selectors) {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    return { rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }, element: el };
  }
  return { rect: null, element: null };
}

export function ProductTour() {
  const pathname = usePathname();
  const { user } = usePermissions();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const [viewport, setViewport] = useState({ width: 1440, height: 900 });
  const nextButtonRef = useRef<HTMLButtonElement | null>(null);
  const autoStartedFor = useRef<string | null>(null);
  const pathRef = useRef(pathname);

  const tour = useMemo(() => findScreenTour(pathname), [pathname]);
  const step: ScreenTourStep | undefined = tour.steps[stepIndex];
  const storageKey = useMemo(
    () => (user?.username ? `${STORAGE_PREFIX}${user.username}.${tour.id}` : ""),
    [user?.username, tour.id]
  );

  const finish = useCallback(() => {
    if (storageKey) markCompleted(storageKey);
    setActive(false);
    setRect(null);
    setReady(false);
  }, [storageKey]);

  const start = useCallback(() => {
    autoStartedFor.current = tour.id;
    setStepIndex(0);
    setActive(true);
    setReady(false);
    setRect(null);
  }, [tour.id]);

  const goTo = useCallback((index: number) => {
    setStepIndex(index);
    setReady(false);
    setRect(null);
  }, []);

  const next = useCallback(() => {
    if (stepIndex >= tour.steps.length - 1) finish();
    else goTo(stepIndex + 1);
  }, [stepIndex, tour.steps.length, finish, goTo]);

  const back = useCallback(() => {
    if (stepIndex > 0) goTo(stepIndex - 1);
  }, [stepIndex, goTo]);

  // Đổi màn hình: đóng tour cũ, cho phép auto-start tour của màn hình mới.
  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    setActive(false);
    setRect(null);
    setReady(false);
    setStepIndex(0);
  }, [pathname]);

  // Tự chạy lần đầu cho từng màn hình; hoặc khi có ?tour=1.
  useEffect(() => {
    if (!user || active) return;
    if (pathname === "/login" || pathname === "/change-password") return;
    if (autoStartedFor.current === tour.id) return;

    let forced = false;
    try {
      forced = new URLSearchParams(window.location.search).get("tour") === "1";
    } catch {
      forced = false;
    }

    if (!forced && readCompleted(storageKey)) return;
    autoStartedFor.current = tour.id;

    const timer = window.setTimeout(() => {
      if (forced) {
        try {
          window.history.replaceState({}, "", window.location.pathname);
        } catch {
          // bỏ qua
        }
      }
      start();
    }, forced ? 250 : 1400);

    return () => window.clearTimeout(timer);
  }, [user, pathname, tour.id, storageKey, active, start]);

  // Nút "Hướng dẫn" trên thanh trên cùng / trang Hướng dẫn.
  useEffect(() => {
    const handler = () => start();
    window.addEventListener(START_EVENT, handler);
    return () => window.removeEventListener(START_EVENT, handler);
  }, [start]);

  // Tìm điểm neo trong màn hình hiện tại, không điều hướng.
  useEffect(() => {
    if (!active || !step) return;

    setReady(false);
    setRect(null);

    let cancelled = false;
    let attempts = 0;
    let settleTimer: number | undefined;

    const find = () => {
      if (cancelled) return;
      const found = measure(step.selectors);
      if (!found.element) {
        attempts += 1;
        if (attempts >= 40) {
          setReady(true);
          setRect(null);
          return;
        }
        window.setTimeout(find, 120);
        return;
      }

      found.element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      settleTimer = window.setTimeout(() => {
        if (cancelled) return;
        setRect(measure(step.selectors).rect);
        setReady(true);
      }, 380);
    };

    find();

    return () => {
      cancelled = true;
      if (settleTimer) window.clearTimeout(settleTimer);
    };
  }, [active, step]);

  // Bám theo khi cuộn / đổi kích thước.
  useEffect(() => {
    if (!active || !step) return;
    const update = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      setRect(measure(step.selectors).rect);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, step]);

  // Escape để đóng, phím mũi tên để chuyển bước.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKeyDown);
    nextButtonRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, finish, next, back]);

  if (!active || !step) return null;

  const isMobile = viewport.width < 640;
  const cardWidth = isMobile ? viewport.width - 32 : 360;
  const cardHeight = 250;
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  let cardLeft = (viewport.width - cardWidth) / 2;
  let cardTop = viewport.height / 2 - cardHeight / 2;

  if (rect) {
    cardLeft = clamp(rect.left + rect.width / 2 - cardWidth / 2, 16, viewport.width - cardWidth - 16);
    const below = rect.top + rect.height + 14;
    const above = rect.top - cardHeight - 14;
    if (below + cardHeight <= viewport.height - 12) cardTop = below;
    else if (above >= 12) cardTop = above;
    else cardTop = viewport.height / 2 - cardHeight / 2;
  }

  const cardStyle: React.CSSProperties = isMobile
    ? { left: 16, right: 16, bottom: 16, width: "auto" }
    : { left: cardLeft, top: cardTop, width: cardWidth };

  return (
    <>
      <div className="fixed inset-0 z-[90]" aria-hidden onClick={(event) => event.stopPropagation()} />

      {rect ? (
        <div
          className="pointer-events-none fixed z-[95] rounded-xl border-2 border-v5-gold transition-all duration-200"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.62)",
          }}
        />
      ) : (
        <div className="fixed inset-0 z-[92] bg-slate-950/60" aria-hidden />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Hướng dẫn ${tour.name}`}
        className={cn(
          "fixed z-[100] overflow-hidden rounded-2xl border border-v5-line bg-v5-surface shadow-2xl",
          isMobile ? "max-h-[70vh] overflow-y-auto" : ""
        )}
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3 border-b border-v5-line bg-v5-bg px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-v5-accent text-white">
              <Compass className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-v5-muted">
                Hướng dẫn · {stepIndex + 1}/{tour.steps.length}
              </div>
              <div className="text-[10px] font-medium text-v5-accent">{tour.name}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={finish}
            className="rounded-md p-1 text-v5-muted transition-colors hover:bg-v5-surface hover:text-v5-ink"
            aria-label="Đóng hướng dẫn"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-v5-muted">{step.eyebrow}</div>
          <h3 className="mt-1 text-[15px] font-semibold tracking-tight text-v5-ink">{step.title}</h3>
          <p className="mt-1 text-[11.5px] leading-5 text-v5-muted">{step.body}</p>

          <div className="mt-3 flex items-center gap-1">
            {tour.steps.map((item, index) => (
              <span
                key={item.title}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === stepIndex ? "w-5 bg-v5-accent" : index < stepIndex ? "w-1.5 bg-v5-accent/40" : "w-1.5 bg-v5-line"
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-v5-line px-4 py-3">
          <button
            type="button"
            onClick={finish}
            className="text-[11px] font-semibold text-v5-muted transition-colors hover:text-v5-ink"
          >
            Bỏ qua
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={back}
                className="inline-flex items-center gap-1 rounded-md border border-v5-line bg-v5-surface px-2.5 py-1.5 text-[11px] font-semibold text-v5-ink transition-colors hover:bg-v5-bg"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Quay lại
              </button>
            )}
            <button
              ref={nextButtonRef}
              type="button"
              onClick={next}
              disabled={!ready}
              className="inline-flex items-center gap-1 rounded-md bg-v5-accent px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {stepIndex === tour.steps.length - 1 ? (
                <>
                  Hoàn tất <Check className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Tiếp tục <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function startProductTour() {
  window.dispatchEvent(new Event(START_EVENT));
}
