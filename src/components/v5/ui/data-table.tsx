import * as React from "react";
import { cn } from "@/lib/utils";

export interface DataTableProps
  extends React.TableHTMLAttributes<HTMLTableElement> {
  wrapperClassName?: string;
}

/**
 * Table shell: horizontal scroll on mobile, consistent typography and borders.
 * Pages keep their own columns/rows so business logic stays untouched.
 */
export function DataTable({
  className,
  wrapperClassName,
  children,
  ...props
}: DataTableProps) {
  return (
    <div className={cn("w-full overflow-x-auto", wrapperClassName)}>
      <table
        className={cn("w-full border-collapse text-left", className)}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function DataTableEmpty({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-v5-muted">
        {children}
      </td>
    </tr>
  );
}
