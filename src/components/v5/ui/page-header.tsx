import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/**
 * V5 page header: one title rhythm, one action area, consistent on desktop/mobile.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  badges,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 md:flex-row md:items-start md:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-v5-muted">
            {eyebrow}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-v5-ink md:text-2xl">
            {title}
          </h1>
          {badges}
        </div>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-v5-muted">{description}</p>
        ) : null}
        {children}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
