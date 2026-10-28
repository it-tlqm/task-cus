"use client";

import {
  Activity,
  BarChart3,
  BookOpenCheck,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  CheckCheck,
  CircleHelp,
  ClipboardList,
  FileCheck2,
  FileText,
  Folder,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Package,
  PieChart,
  PlusSquare,
  Settings2,
  Shield,
  ShieldCheck,
  UserCheck,
  Users,
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
  "user-check": UserCheck,
  "check-check": CheckCheck,
  "list-checks": ListChecks,
  "plus-square": PlusSquare,
  settings: Settings2,
  "calendar-check": CalendarCheck,
  users: Users,
  folder: Folder,
  shield: Shield,
  "file-check": FileCheck2,
  activity: Activity,
  "message-square": MessageSquare,
};

export function MiniappIcon({ name, className }: { name: MiniappIconName; className?: string }) {
  const Icon = ICONS[name] || LayoutDashboard;
  return <Icon className={className} aria-hidden />;
}
