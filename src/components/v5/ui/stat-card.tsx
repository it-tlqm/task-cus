import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/v5/ui/card";
import { cn } from "@/lib/utils";

type StatTone = "default" | "accent" | "success" | "warning" | "danger";

const valueTone: Record<StatTone, string> = {
  default: "text-v5-ink",
  accent: "text-v5-accent",
  success: "text-v5-success",
  warning: "text-v5-gold-ink",
  danger: "text-v5-danger",
};

const iconTone: Record<StatTone, string> = {
  default: "text-v5-muted",
  accent: "text-v5-accent",
  success: "text-v5-success",
  warning: "text-v5-gold-ink",
  danger: "text-v5-danger",
};

export interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  hint?: React.ReactNode;
  footer?: React.ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  className?: string;
  onClick?: () => void;
}

export function StatCard({
  label,
  value,
  unit,
  hint,
  footer,
  icon: Icon,
  tone = "default",
  className,
  onClick,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        "p-3",
        tone === "danger" && "border-v5-danger/30",
        onClick && "cursor-pointer transition-colors hover:bg-v5-bg/60",
        className
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-v5-muted">
          {label}
        </span>
        {Icon ? <Icon className={cn("h-4 w-4", iconTone[tone])} /> : null}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={cn("text-2xl font-bold tabular-nums", valueTone[tone])}>
          {value}
        </span>
        {unit ? <span className="text-[10px] text-v5-muted">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-1 text-[10px] text-v5-muted">{hint}</div> : null}
      {footer ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[10px]">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}
