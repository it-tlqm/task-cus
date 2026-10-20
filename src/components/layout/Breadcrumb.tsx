"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getBreadcrumbTrail } from "@/config/navigation";

export function Breadcrumb({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const trail = getBreadcrumbTrail(pathname);

  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="page-breadcrumb"
      className={`flex min-w-0 items-center text-[11px] leading-4 text-on-surface-variant ${className}`}
    >
      <ol className="flex min-w-0 items-center gap-1.5">
        {trail.map((entry, index) => {
          const last = index === trail.length - 1;
          return (
            <li key={`${entry.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 && (
                <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[13px] text-outline">
                  chevron_right
                </span>
              )}
              {entry.href && !last ? (
                <Link
                  href={entry.href}
                  className="focus-ring flex shrink-0 items-center gap-1 rounded text-on-surface-variant transition-fast hover:text-secondary"
                >
                  {index === 0 && (
                    <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                      home
                    </span>
                  )}
                  <span className={index === 0 ? "hidden sm:inline" : ""}>{entry.label}</span>
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  title={entry.label}
                  className={`truncate ${last ? "font-semibold text-primary" : "text-on-surface-variant/80"} ${
                    !last && index < trail.length - 1 ? "hidden sm:inline" : ""
                  }`}
                >
                  {entry.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
