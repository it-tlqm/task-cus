"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  onOpenMenu: () => void;
  mobileMenuOpen?: boolean;
}

export function BottomNav({ onOpenMenu, mobileMenuOpen = false }: Props) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = React.useState<number>(0);

  React.useEffect(() => {
    const loadUnreadCount = () => {
      fetch("/api/notifications")
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (typeof json?.unreadCount === "number") {
            setUnreadCount(json.unreadCount);
          }
        })
        .catch(() => {});
    };

    loadUnreadCount();
    window.addEventListener("notifications-updated", loadUnreadCount);
    return () => {
      window.removeEventListener("notifications-updated", loadUnreadCount);
    };
  }, []);

  if (pathname === "/login") return null;

  const navItems = [
    { name: "Việc cá nhân", href: "/my-work", icon: "assignment", testId: "bottom-my-work" },
    { name: "Kế hoạch", href: "/plans", icon: "calendar_month", testId: "bottom-plans" },
    { name: "Nhật ký", href: "/routine", icon: "history_edu", testId: "bottom-routine" },
    {
      name: "Thông báo",
      href: "/notifications",
      icon: "notifications",
      hasBadge: unreadCount > 0,
      testId: "bottom-notifications",
    },
  ];

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  return (
    <nav
      aria-label="Điều hướng nhanh trên điện thoại"
      className="fixed bottom-0 z-50 w-full border-t border-border-default/70 bg-surface/95 pb-safe shadow-[0_-2px_10px_rgba(0,0,0,0.04)] backdrop-blur-xl lg:hidden"
    >
      <div className="flex h-16 items-center justify-around px-space-xs">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.name}
              aria-current={active ? "page" : undefined}
              data-testid={item.testId}
              className={`focus-ring relative flex h-12 min-w-[56px] flex-col items-center justify-center rounded-xl transition-fast active-press ${
                active ? "font-body-semibold text-secondary" : "text-on-surface-variant hover:text-secondary"
              }`}
            >
              {active && <span className="absolute top-1 h-0.5 w-6 rounded-full bg-secondary" />}
              <span className="relative flex items-center justify-center">
                <span aria-hidden="true" className="material-symbols-outlined text-[22px]">
                  {item.icon}
                </span>
                {item.hasBadge && (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-status-danger ring-2 ring-surface" />
                )}
              </span>
              <span className="mt-0.5 text-[11px] tracking-tight">{item.name}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Mở toàn bộ menu"
          aria-controls="mobile-navigation-drawer"
          aria-expanded={mobileMenuOpen}
          data-testid="bottom-menu"
          className={`focus-ring relative flex h-12 min-w-[56px] flex-col items-center justify-center rounded-xl transition-fast active-press ${
            mobileMenuOpen ? "font-body-semibold text-secondary" : "text-on-surface-variant hover:text-secondary"
          }`}
        >
          {mobileMenuOpen && <span className="absolute top-1 h-0.5 w-6 rounded-full bg-secondary" />}
          <span aria-hidden="true" className="material-symbols-outlined text-[22px]">
            apps
          </span>
          <span className="mt-0.5 text-[11px] tracking-tight">Menu</span>
        </button>
      </div>
    </nav>
  );
}
