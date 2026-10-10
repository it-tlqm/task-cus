"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function BottomNav() {
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
    { name: "Công việc", href: "/my-work", icon: "assignment" },
    { name: "Kế hoạch", href: "/plans", icon: "calendar_month" },
    { name: "Nhật ký", href: "/routine", icon: "history_edu" },
    { name: "Thông báo", href: "/notifications", icon: "notifications", hasBadge: unreadCount > 0 },
    { name: "Tổng quan", href: "/dashboard", icon: "space_dashboard" },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 w-full z-50 pb-safe bg-surface/95 backdrop-blur-xl border-t border-border-default/70 shadow-[0_-2px_10px_rgba(0,0,0,0.04)]">
      <div className="h-16 px-space-xs flex items-center justify-around">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.name}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center min-w-[56px] h-12 transition-fast active-press rounded-xl ${
                isActive
                  ? "text-secondary font-body-semibold"
                  : "text-on-surface-variant hover:text-secondary"
              }`}
            >
              {isActive && (
                <span className="absolute top-1 w-6 h-0.5 rounded-full bg-secondary" />
              )}
              <div className="relative flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
                {item.hasBadge && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-status-danger ring-2 ring-surface" />
                )}
              </div>
              <span className="font-label-sm text-[11px] mt-0.5 tracking-tight">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
