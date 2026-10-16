"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";

const MORE_LINKS = [
  { name: "Tổng quan", href: "/dashboard", icon: "space_dashboard" },
  { name: "Nhiệm vụ", href: "/tasks", icon: "hub" },
  { name: "Phê duyệt", href: "/approvals", icon: "fact_check", leadersOnly: true },
  { name: "Báo cáo", href: "/reports", icon: "query_stats" },
  { name: "Danh mục SP", href: "/products", icon: "inventory_2" },
  { name: "KQ tháng", href: "/monthly-results", icon: "assessment" },
  { name: "Nghỉ phép", href: "/leaves", icon: "beach_access" },
  { name: "Lịch công tác", href: "/calendar", icon: "calendar_month" },
  { name: "Lịch trực", href: "/roster", icon: "schedule" },
  { name: "Giao ban", href: "/meetings", icon: "forum" },
  { name: "Sổ văn bản", href: "/docs", icon: "mail" },
  { name: "Tổ chức", href: "/admin/organization", icon: "corporate_fare", adminOnly: true },
  { name: "Cấu hình", href: "/admin/system", icon: "settings", adminOnly: true },
];

export function BottomNav() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = React.useState<number>(0);
  const [showMore, setShowMore] = React.useState(false);
  const { canApprove, showAdminMenu } = usePermissions();

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
    { name: "Thêm", href: "__more__", icon: "apps" },
  ];
  const moreVisible = MORE_LINKS.filter(
    (l) => (!(l as any).leadersOnly || canApprove) && (!(l as any).adminOnly || showAdminMenu)
  );

  return (
    <>
    {showMore && (
      <div className="lg:hidden fixed inset-0 z-[60] flex items-end" onClick={() => setShowMore(false)}>
        <div className="absolute inset-0 bg-black/40" />
        <div
          className="relative w-full bg-surface-container-lowest rounded-t-2xl p-4 pb-8 shadow-2xl max-h-[70vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-10 h-1 rounded-full bg-border-default mx-auto mb-3" />
          <div className="grid grid-cols-4 gap-2">
            {moreVisible.map((l) => {
              const isActive = pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setShowMore(false)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border ${
                    isActive ? "border-secondary bg-secondary/10 text-secondary" : "border-border-default text-on-surface-variant"
                  }`}
                >
                  <span className="material-symbols-outlined text-[24px]">{l.icon}</span>
                  <span className="text-[11px] font-semibold text-center leading-tight">{l.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    )}
    <nav className="lg:hidden fixed bottom-0 w-full z-50 pb-safe bg-surface/95 backdrop-blur-xl border-t border-border-default/70 shadow-[0_-2px_10px_rgba(0,0,0,0.04)]">
      <div className="h-16 px-space-xs flex items-center justify-around">
        {navItems.map((item) => {
          const isMore = item.href === "__more__";
          const isActive = isMore
            ? showMore
            : pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const cls = `relative flex flex-col items-center justify-center min-w-[56px] h-12 transition-fast active-press rounded-xl ${
            isActive ? "text-secondary font-body-semibold" : "text-on-surface-variant hover:text-secondary"
          }`;
          const inner = (
            <>
              {isActive && !isMore && (
                <span className="absolute top-1 w-6 h-0.5 rounded-full bg-secondary" />
              )}
              <div className="relative flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
                {(item as any).hasBadge && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-status-danger ring-2 ring-surface" />
                )}
              </div>
              <span className="font-label-sm text-[11px] mt-0.5 tracking-tight">{item.name}</span>
            </>
          );
          return isMore ? (
            <button key={item.href} onClick={() => setShowMore((v) => !v)} aria-label={item.name} className={cls}>
              {inner}
            </button>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.name}
              aria-current={isActive ? "page" : undefined}
              className={cls}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </nav>
    </>
  );
}
