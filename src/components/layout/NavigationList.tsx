"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { V5Icon } from "@/components/v5/ui/lucide-icon";
import {
  filterNavigation,
  findActiveNavigation,
  isItemActive,
  type NavigationSection,
} from "@/config/navigation";

const OPEN_SECTIONS_KEY = "hqtl-nav-open-v2";

type NavigationVariant = "desktop" | "drawer";

interface Props {
  collapsed?: boolean;
  variant?: NavigationVariant;
  onNavigate?: () => void;
}

export function NavigationList({ collapsed = false, variant = "desktop", onNavigate }: Props) {
  const pathname = usePathname();
  const { user, can, canApprove, canExport, canLock, showAdminMenu } = usePermissions();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  const visibleSections = useMemo<NavigationSection[]>(
    () =>
      filterNavigation({
        role: user?.role || "",
        can,
        isLeader: canApprove,
        isAdmin: showAdminMenu,
        canExport,
        canLock,
      }),
    // `can` is recreated by the hook; the primitive user role and permission
    // flags are the values that actually change visibility.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.role, canApprove, showAdminMenu, canExport, canLock, user?.permissions?.join("|")]
  );

  const active = findActiveNavigation(pathname);
  const activeSectionId = active
    ? visibleSections.find((section) => section.id === active.section.id)?.id
    : undefined;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPEN_SECTIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") setOpenSections(parsed);
      }
    } catch {
      // Bỏ qua lỗi localStorage (chế độ riêng tư/chặn lưu trữ).
    }
    setPreferencesLoaded(true);
  }, []);

  // Khi vào trang con bằng deep-link, mở đúng nhóm chứa trang đó.
  useEffect(() => {
    if (!preferencesLoaded || !activeSectionId) return;
    setOpenSections((prev) => {
      if (prev[activeSectionId] !== false) return prev;
      const next = { ...prev, [activeSectionId]: true };
      try {
        localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [pathname, activeSectionId, preferencesLoaded]);

  const isSectionOpen = (section: NavigationSection) =>
    openSections[section.id] ?? section.defaultOpen ?? true;

  const toggleSection = (section: NavigationSection) => {
    setOpenSections((prev) => {
      const next = { ...prev, [section.id]: !(prev[section.id] ?? section.defaultOpen ?? true) };
      try {
        localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  return (
    <nav
      aria-label={variant === "drawer" ? "Điều hướng chính (mobile)" : "Điều hướng chính"}
      className="flex flex-col gap-1.5 px-2 pb-4"
      data-testid={variant === "drawer" ? "app-navigation-drawer" : "app-navigation"}
    >
      {visibleSections.map((section, sectionIndex) => {
        const open = isSectionOpen(section);
        const sectionHasActive = section.items.some((item) => isItemActive(pathname, item));
        const showItems = collapsed || open;
        const panelId = `${variant}-nav-section-${section.id}`;

        return (
          <div
            key={section.id}
            className={collapsed && sectionIndex > 0 ? "border-t border-white/10 pt-1.5" : ""}
            data-testid={`nav-section-${section.id}`}
          >
            {!collapsed && (
              <button
                type="button"
                onClick={() => toggleSection(section)}
                aria-expanded={open}
                aria-controls={panelId}
                className={`focus-ring flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-fast ${
                  sectionHasActive ? "text-white" : "text-on-primary-container hover:text-white"
                }`}
                title={open ? `Thu gọn ${section.label}` : `Mở ${section.label}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <V5Icon
                    name={section.icon}
                    className={`shrink-0 text-[17px] ${
                      sectionHasActive ? "text-secondary-fixed" : "text-on-primary-container"
                    }`}
                  />
                  <span className="truncate font-label-sm text-[11px] font-semibold uppercase tracking-[0.08em]">
                    {section.label}
                  </span>
                </span>
                <V5Icon
                  name="expand_more"
                  className={`shrink-0 text-[17px] transition-transform duration-200 ${
                    open ? "" : "-rotate-90"
                  }`}
                />
              </button>
            )}

            {showItems && (
              <div
                id={panelId}
                className={`flex flex-col gap-0.5 ${collapsed ? "items-center" : "mt-0.5"}`}
              >
                {section.items.map((item) => {
                  const activeItem = isItemActive(pathname, item);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={activeItem ? "page" : undefined}
                      title={collapsed ? `${section.label} — ${item.label}` : item.description}
                      data-testid={variant === "drawer" ? `nav-drawer-${item.id}` : `nav-${item.id}`}
                      className={`focus-ring group flex items-center rounded-lg transition-fast active-press ${
                        collapsed
                          ? "h-10 w-10 justify-center"
                          : "min-h-9 gap-2.5 px-2.5 py-2"
                      } ${
                        activeItem
                          ? "bg-secondary text-on-secondary shadow-sm"
                          : "text-on-primary-container hover:bg-white/10 hover:text-white"
                      } ${collapsed && activeItem ? "ring-1 ring-v5-accent-fixed/40" : ""}`}
                    >
                      <V5Icon
                        name={item.icon}
                        className={`shrink-0 text-[20px] ${
                          activeItem ? "text-on-secondary" : "text-on-primary-container group-hover:text-white"
                        }`}
                      />
                      {!collapsed && (
                        <span className="flex min-w-0 flex-col">
                          <span
                            data-testid={`nav-label-${item.id}`}
                            className={`truncate text-[13px] leading-5 ${
                              activeItem ? "font-semibold" : "font-medium"
                            }`}
                          >
                            {item.label}
                          </span>
                          {variant === "drawer" && item.description && (
                            <span
                              className={`mt-0.5 line-clamp-2 text-[10.5px] leading-4 ${
                                activeItem ? "text-on-secondary/80" : "text-on-primary-container/80"
                              }`}
                            >
                              {item.description}
                            </span>
                          )}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
