import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-v5-line bg-v5-surface/60 px-4 text-center",
        compact ? "py-6" : "py-10",
        className
      )}
    >
      {Icon ? (
        <span className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-v5-bg text-v5-muted">
          <Icon className="h-4 w-4" />
        </span>
      ) : null}
      <h3 className="text-sm font-semibold text-v5-ink">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-md text-xs leading-5 text-v5-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
