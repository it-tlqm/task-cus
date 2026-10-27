import * as React from "react";
import { cn } from "@/lib/utils";

export interface FilterBarProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function FilterBar({ children, actions, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-v5-line bg-v5-surface p-2 md:flex-row md:items-center md:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1">{children}</div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export interface FilterChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  tone?: "default" | "danger" | "gold";
}

export function FilterChip({
  active,
  tone = "default",
  className,
  children,
  ...props
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
        active
          ? tone === "danger"
            ? "bg-v5-danger text-white shadow-sm"
            : tone === "gold"
              ? "bg-v5-gold text-v5-ink shadow-sm"
              : "bg-v5-accent text-white shadow-sm"
          : tone === "danger"
            ? "bg-v5-danger-soft text-v5-danger hover:bg-v5-danger/10"
            : "text-v5-muted hover:bg-v5-bg hover:text-v5-ink",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
