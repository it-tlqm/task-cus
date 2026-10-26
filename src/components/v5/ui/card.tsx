import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-xl border border-v5-line/80 bg-v5-surface text-v5-ink shadow-[0_1px_0_rgba(23,33,28,0.04)]", className)}
      {...props}
    />
  )
);
Card.displayName = "V5Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1 p-4 pb-2", className)} {...props} />
  )
);
CardHeader.displayName = "V5CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-sm font-semibold leading-tight tracking-tight text-v5-ink", className)} {...props} />
  )
);
CardTitle.displayName = "V5CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-xs text-v5-muted", className)} {...props} />
  )
);
CardDescription.displayName = "V5CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-4 pt-2", className)} {...props} />
  )
);
CardContent.displayName = "V5CardContent";

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
