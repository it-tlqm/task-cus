"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getPageHelp } from "@/data/page-help";
import { getTour, TOUR_START_EVENT } from "@/data/page-tour";

/**
 * Nút "?" nổi toàn app (trừ trang đăng nhập): mở hướng dẫn
 * đúng màn hình đang xem. 1 điểm gắn duy nhất ở AppShell.
 */
export function ContextHelp() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isFirstVisit, setIsFirstVisit] = useState(false);

  // Lần đầu vào trang này → tự mở lời hỏi xem hướng dẫn (mỗi trang 1 lần/máy).
  // Trang nào có tour từng bước thì để tour tự chạy, bảng này không giành.
  // Trang hướng dẫn tổng thì không tự phủ overlay lên chính nó.
  useEffect(() => {
    setOpen(false);
    setIsFirstVisit(false);
    if (pathname === "/huong-dan") return;
    if (getTour(pathname)) return;
    let seen: Record<string, boolean> = {};
    try {
      seen = JSON.parse(localStorage.getItem("hqtl-seen-pages") || "{}");
    } catch {}
    if (seen[pathname]) return;
    const t = setTimeout(() => {
      setIsFirstVisit(true);
      setOpen(true);
    }, 900);
    return () => clearTimeout(t);
  }, [pathname]);

  const close = () => {
    setOpen(false);
    try {
      const seen = JSON.parse(localStorage.getItem("hqtl-seen-pages") || "{}");
      seen[pathname] = true;
      localStorage.setItem("hqtl-seen-pages", JSON.stringify(seen));
    } catch {}
  };

  if (pathname === "/login") return null;
  const help = getPageHelp(pathname);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Hướng dẫn màn hình này"
        aria-label="Hướng dẫn màn hình này"
        className={`focus-ring fixed bottom-20 left-4 z-40 h-11 w-11 items-center justify-center rounded-full border border-border-default bg-white text-primary shadow-lg transition-transform hover:bg-surface-container active:scale-95 lg:bottom-6 lg:left-[calc(var(--sidebar-width,260px)+16px)] ${
          pathname.startsWith("/roster") ? "hidden lg:flex" : "flex"
        }`}
      >
        <span className="material-symbols-outlined text-[22px]">help</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4" onClick={close}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md bg-surface-container-lowest rounded-2xl shadow-2xl p-5 flex flex-col gap-3 max-h-[75vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {isFirstVisit && (
              <span className="self-start px-2 py-0.5 rounded bg-secondary/15 text-secondary text-[11px] font-bold uppercase">
                Lần đầu bạn vào trang này?
              </span>
            )}
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">help</span>
                {help.title}
              </h3>
              <button onClick={close} className="p-1 rounded hover:bg-surface-container text-outline" aria-label="Đóng">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <ol className="list-decimal list-inside text-sm text-on-surface flex flex-col gap-1.5">
              {help.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ol>
            {help.modals && help.modals.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1 border-t border-border-default">
                <span className="text-xs font-bold text-primary uppercase tracking-wide">Trong các cửa sổ thao tác</span>
                {help.modals.map((m) => (
                  <p key={m.name} className="text-sm text-on-surface">
                    <strong>{m.name}: </strong>
                    <span className="text-on-surface-variant">{m.tip}</span>
                  </p>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Link
                href="/huong-dan"
                onClick={close}
                className="px-3 py-1.5 rounded-lg bg-surface-container text-primary text-xs font-bold"
              >
                Xem hướng dẫn 5 phút ›
              </Link>
              {getTour(pathname) && (
                <button
                  onClick={() => {
                    close();
                    window.dispatchEvent(new Event(TOUR_START_EVENT));
                  }}
                  className="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary text-xs font-bold"
                >
                  ▶ Tour từng bước
                </button>
              )}
              {isFirstVisit && (
                <button
                  onClick={close}
                  className="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary text-xs font-bold"
                >
                  Rồi, tôi tự làm được
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
