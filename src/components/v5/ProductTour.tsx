"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

type TourStep = {
  route: string;
  selector: string;
  eyebrow: string;
  title: string;
  body: string;
};

const STEPS: TourStep[] = [
  {
    route: "/v5",
    selector: '[data-tour="dashboard-summary"]',
    eyebrow: "Tổng quan điều hành",
    title: "Nắm tình hình trong một màn hình",
    body: "Theo dõi số thu, chỉ tiêu tháng, so sánh cùng kỳ và cơ cấu thuế. Chuyển Tuần / Tháng / Năm để xem đúng kỳ cần làm việc.",
  },
  {
    route: "/v5/giao-ban",
    selector: '[data-tour="giao-ban-summary"]',
    eyebrow: "Số liệu giao ban",
    title: "Bảng tổng hợp số thu",
    body: "Số liệu được tổng hợp theo phân loại. Chuyển tab Theo chỉ tiêu, So sánh hoặc Nhận xét để xem chi tiết và biểu đồ.",
  },
  {
    route: "/v5/giao-ban/nhap",
    selector: '[data-tour="entry-modes"]',
    eyebrow: "Nhập số liệu",
    title: "Nhập phát sinh hoặc lũy kế",
    body: "Mỗi chỉ tiêu có 2 kiểu nhập. Chọn Phát sinh nếu nhập số trong kỳ, chọn Lũy kế nếu nhập tổng đến cuối kỳ — hệ thống tự quy đổi.",
  },
  {
    route: "/my-work",
    selector: '[data-tour="task-list"]',
    eyebrow: "Công việc của tôi",
    title: "Việc cần xử lý trong ngày",
    body: "Xem việc được giao, hạn chót, tiến độ và phối hợp. Bấm vào từng việc để cập nhật kết quả hoặc báo hoàn thành.",
  },
  {
    route: "/reports",
    selector: '[data-tour="export-btns"]',
    eyebrow: "Báo cáo",
    title: "Xem trước và kết xuất",
    body: "Kiểm tra báo cáo trước khi chốt kỳ. Xuất Mẫu A hoặc Mẫu B ra Excel; mọi lượt xuất đều được ghi nhật ký.",
  },
  {
    route: "/reports",
    selector: '[data-tour="notifications"]',
    eyebrow: "Thông báo",
    title: "Không bỏ lỡ việc mới",
    body: "Chuông thông báo hiển thị giao việc, phê duyệt và nhắc hạn. Bấm vào để xem nhanh, không cần rời trang đang làm.",
  },
];

const STORAGE_PREFIX = "talung.productTour.v1.";
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

function measure(selector: string): Rect | null {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return null;
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

export function ProductTour() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = usePermissions();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const [viewport, setViewport] = useState({ width: 1440, height: 900 });
  const nextButtonRef = useRef<HTMLButtonElement | null>(null);
  const autoStarted = useRef(false);

  const step = STEPS[stepIndex];
  const storageKey = useMemo(
    () => (user?.username ? `${STORAGE_PREFIX}${user.username}` : ""),
    [user?.username]
  );

  const finish = useCallback(() => {
    if (storageKey) markCompleted(storageKey);
    setActive(false);
    setRect(null);
    setReady(false);
  }, [storageKey]);

  const start = useCallback(() => {
    autoStarted.current = true;
    setStepIndex(0);
    setActive(true);
    setReady(false);
    setRect(null);
  }, []);

  const goTo = useCallback((index: number) => {
    setStepIndex(index);
    setReady(false);
    setRect(null);
  }, []);

  const next = useCallback(() => {
    if (stepIndex >= STEPS.length - 1) finish();
    else goTo(stepIndex + 1);
  }, [stepIndex, finish, goTo]);

  const back = useCallback(() => {
    if (stepIndex > 0) goTo(stepIndex - 1);
  }, [stepIndex, goTo]);

  // Bắt đầu tự động lần đầu, hoặc khi có ?tour=1 / sự kiện từ trang Hướng dẫn.
  useEffect(() => {
    if (!user || autoStarted.current) return;
    if (pathname === "/login" || pathname === "/change-password") return;

    let forced = false;
    try {
      forced = new URLSearchParams(window.location.search).get("tour") === "1";
    } catch {
      forced = false;
    }

    if (!forced && readCompleted(storageKey)) return;
    autoStarted.current = true;

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
  }, [user, pathname, storageKey, start]);

  // Nút "Bắt đầu tour" ở trang Hướng dẫn.
  useEffect(() => {
    const handler = () => start();
    window.addEventListener(START_EVENT, handler);
    return () => window.removeEventListener(START_EVENT, handler);
  }, [start]);

  // Điều hướng tới đúng trang của bước và tìm điểm neo.
  useEffect(() => {
    if (!active) return;
    if (!step) return;

    setReady(false);
    setRect(null);

    if (pathname !== step.route) {
      router.push(step.route);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let settleTimer: number | undefined;

    const find = () => {
      if (cancelled) return;
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (!el) {
        attempts += 1;
        if (attempts >= 40) {
          setReady(true);
          setRect(null);
          return;
        }
        window.setTimeout(find, 120);
        return;
      }

      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      settleTimer = window.setTimeout(() => {
        if (cancelled) return;
        setRect(measure(step.selector));
        setReady(true);
      }, 380);
    };

    find();

    return () => {
      cancelled = true;
      if (settleTimer) window.clearTimeout(settleTimer);
    };
  }, [active, step, pathname, router]);

  // Bám theo khi người dùng cuộn / đổi kích thước.
  useEffect(() => {
    if (!active) return;
    const update = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      if (step) setRect(measure(step.selector));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, step]);

  // Escape để đóng, focus nút Tiếp tục.
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
        aria-label="Hướng dẫn sử dụng"
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
                Hướng dẫn nhanh · {stepIndex + 1}/{STEPS.length}
              </div>
              <div className="text-[10px] font-medium text-v5-accent">{step.eyebrow}</div>
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
          <h3 className="text-[15px] font-semibold tracking-tight text-v5-ink">{step.title}</h3>
          <p className="mt-1 text-[11.5px] leading-5 text-v5-muted">{step.body}</p>

          <div className="mt-3 flex items-center gap-1">
            {STEPS.map((item, index) => (
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
              {stepIndex === STEPS.length - 1 ? (
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
