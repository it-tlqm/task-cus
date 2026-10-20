"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChangePasswordModal } from "@/components/ui/ChangePasswordModal";
import { usePermissions } from "@/hooks/usePermissions";
import { clearClientSession } from "@/lib/client-session";
import { getRoleDisplayName } from "@/lib/unit-info";
import { NavigationList } from "@/components/layout/NavigationList";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function MobileNavDrawer({ open, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = usePermissions();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!open) return;
    onClose();
    // Chỉ đóng khi đổi route; không phụ thuộc onClose để tránh đóng oan khi re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 30);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await clearClientSession();
    router.push("/login");
    router.refresh();
  };

  if (!open) return null;

  return (
    <>
      <div id="mobile-navigation-drawer" className="fixed inset-0 z-[90] lg:hidden" data-testid="mobile-nav-drawer">
        <button
          type="button"
          aria-label="Đóng menu điều hướng"
          className="absolute inset-0 h-full w-full cursor-default bg-primary/55 backdrop-blur-[2px]"
          onClick={onClose}
        />

        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-nav-title"
          className="relative flex h-full w-[min(88vw,340px)] max-w-full flex-col bg-primary-container text-on-primary shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <Link href="/dashboard" onClick={onClose} className="flex min-w-0 items-center gap-2.5">
              <img
                src="/images/logo-haiquan.png"
                alt="Logo Hải quan Việt Nam"
                className="h-10 w-10 shrink-0 rounded-full bg-white object-cover shadow-sm"
              />
              <span className="flex min-w-0 flex-col">
                <span id="mobile-nav-title" className="truncate text-[14px] font-bold uppercase tracking-wide text-white">
                  Hải quan Tà Lùng
                </span>
                <span className="truncate text-[11px] font-medium text-on-primary-container">
                  Quản lý Kế hoạch &amp; Công việc
                </span>
              </span>
            </Link>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Đóng menu điều hướng"
              data-testid="mobile-nav-close"
              className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-primary-container transition-fast hover:bg-white/10 hover:text-white"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[21px]">
                close
              </span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="px-3 pt-3">
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-on-secondary">
                  <span aria-hidden="true" className="material-symbols-outlined text-[19px]">
                    person
                  </span>
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-semibold text-white">
                    {user?.fullName || "Đang tải thông tin"}
                  </span>
                  <span className="truncate text-[11px] text-on-primary-container">
                    {user?.positionTitle || (user?.role ? getRoleDisplayName(user.role) : "Cán bộ công chức")}
                    {user?.unitName ? ` • ${user.unitName}` : ""}
                  </span>
                </span>
              </div>
            </div>

            <NavigationList variant="drawer" onNavigate={onClose} />
          </div>

          <div className="border-t border-white/10 bg-primary/40 px-4 py-3">
            <Link
              href="/huong-dan"
              onClick={onClose}
              className="focus-ring flex items-center gap-2 rounded-lg px-2 py-2 text-[12px] font-medium text-on-primary-container transition-fast hover:bg-white/10 hover:text-white"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                help
              </span>
              Hướng dẫn sử dụng
            </Link>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setChangePasswordOpen(true)}
                className="focus-ring flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-white/15 px-2 py-1.5 text-[11.5px] font-semibold text-on-primary-container transition-fast hover:bg-white/10 hover:text-white"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[17px]">
                  key
                </span>
                Đổi mật khẩu
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="focus-ring flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-rose-300/40 bg-rose-500/10 px-2 py-1.5 text-[11.5px] font-semibold text-rose-100 transition-fast hover:bg-rose-500/20 disabled:opacity-60"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[17px]">
                  logout
                </span>
                {loggingOut ? "Đang thoát..." : "Đăng xuất"}
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-on-primary-container/80">
              Hỗ trợ kỹ thuật nội bộ • v1.2.4
            </p>
          </div>
        </div>
      </div>

      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </>
  );
}
