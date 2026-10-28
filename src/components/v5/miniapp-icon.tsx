"use client";

import {
  BarChart3,
  BookOpenCheck,
  Building2,
  CalendarDays,
  CalendarRange,
  CircleHelp,
  ClipboardList,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Package,
  PieChart,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { MiniappIconName } from "@/config/miniapps";

const ICONS: Record<MiniappIconName, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  "clipboard-list": ClipboardList,
  "bar-chart-3": BarChart3,
  "calendar-days": CalendarDays,
  "calendar-range": CalendarRange,
  "file-text": FileText,
  "pie-chart": PieChart,
  "book-open-check": BookOpenCheck,
  "building-2": Building2,
  "shield-check": ShieldCheck,
  "folder-kanban": FolderKanban,
  package: Package,
  "circle-help": CircleHelp,
};

export function MiniappIcon({ name, className }: { name: MiniappIconName; className?: string }) {
  const Icon = ICONS[name] || LayoutDashboard;
  return <Icon className={className} aria-hidden />;
}
