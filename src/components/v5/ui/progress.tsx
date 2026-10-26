import * as React from "react";
import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  indicatorClassName,
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
}) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-v5-line/60", className)} role="progressbar" aria-valuenow={safe} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full bg-v5-accent transition-all", indicatorClassName)} style={{ width: `${safe}%` }} />
    </div>
  );
}
