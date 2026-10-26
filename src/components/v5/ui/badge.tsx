import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none",
  {
    variants: {
      variant: {
        default: "border-v5-line bg-v5-bg text-v5-muted",
        accent: "border-v5-accent/20 bg-v5-accent-soft text-v5-accent",
        success: "border-v5-success/20 bg-v5-success-soft text-v5-success",
        warning: "border-v5-warning/20 bg-v5-warning-soft text-v5-warning",
        danger: "border-v5-danger/20 bg-v5-danger-soft text-v5-danger",
        outline: "border-v5-line bg-transparent text-v5-muted",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
