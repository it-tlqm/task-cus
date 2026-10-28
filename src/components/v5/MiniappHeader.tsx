"use client";

import Link from "next/link";
import { ArrowLeftRight, LayoutGrid } from "lucide-react";
import { MiniappIcon } from "@/components/v5/miniapp-icon";
import {
  MINIAPP_ACCENTS,
  miniappCategoryLabel,
  miniappNavigation,
  type Miniapp,
} from "@/config/miniapps";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function MiniappHeader({ app, pathname }: { app: Miniapp; pathname: string }) {
  const accent = MINIAPP_ACCENTS[app.accent];
  const nav = miniappNavigation(app.id);

  return (
    <section
      aria-label={`Ứng dụng ${app.name}`}
      className="rounded-xl border border-v5-line bg-v5-surface p-3 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${accent.tile} shadow-sm`}>
            <MiniappIcon name={app.icon} className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[15px] font-semibold tracking-tight text-v5-ink">{app.name}</h1>
              <span className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold sm:inline-flex ${accent.soft} ${accent.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
                {miniappCategoryLabel(app.category)}
              </span>
            </div>
            <p className="mt-0.5 hidden line-clamp-1 text-[11px] text-v5-muted sm:block">{app.description}</p>
          </div>
        </div>

        <Link
          href="/store"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-v5-line bg-v5-bg px-2.5 py-1.5 text-[11px] font-semibold text-v5-ink transition-colors hover:border-v5-accent/30 hover:bg-v5-surface"
          title="Mở Kho ứng dụng"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span className="whitespace-nowrap">Kho ứng dụng</span>
          <ArrowLeftRight className="hidden h-3 w-3 text-v5-muted sm:inline" />
        </Link>
      </div>

      {nav.length > 1 && (
        <nav
          aria-label={`Menu ${app.name}`}
          className="-mx-1 mt-2.5 flex gap-1 overflow-x-auto border-t border-v5-line pt-2 no-scrollbar lg:hidden"
        >
          {nav.map((item) => {
            const active = isActive(pathname, item.href.split("?")[0]);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[10.5px] font-semibold transition-colors",
                  active
                    ? "bg-v5-accent-soft text-v5-accent"
                    : "text-v5-muted hover:bg-v5-bg hover:text-v5-ink"
                )}
              >
                <MiniappIcon name={item.icon} className="h-3.5 w-3.5" />
                {item.shortLabel || item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </section>
  );
}
