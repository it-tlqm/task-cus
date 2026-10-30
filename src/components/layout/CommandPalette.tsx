"use client";

import { V5Icon } from "@/components/v5/ui/lucide-icon";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Command {
  id: string;
  group: "Điều hướng" | "Hành động";
  label: string;
  description: string;
  href: string;
  icon: string;
  permission?: string;
  keywords?: string;
}

const COMMANDS: Command[] = [
  {
    id: "nav-dashboard",
    group: "Điều hướng",
    label: "Bảng điều hành",
    description: "Tổng quan KPI, việc cần chú ý",
    href: "/v5",
    icon: "dashboard",
    keywords: "trang chủ home",
  },
  {
    id: "nav-tasks",
    group: "Điều hướng",
    label: "Nhiệm vụ",
    description: "Danh sách nhiệm vụ, tìm kiếm, lọc",
    href: "/tasks",
    icon: "task_alt",
    keywords: "task công việc",
  },
  {
    id: "nav-my-work",
    group: "Điều hướng",
    label: "Nhật ký của tôi",
    description: "Đầu việc được giao và cập nhật tiến độ",
    href: "/my-work",
    icon: "assignment",
    keywords: "my work việc của tôi",
  },
  {
    id: "nav-plans",
    group: "Điều hướng",
    label: "Kế hoạch công tác",
    description: "Kế hoạch ngày, tuần, tháng và Gantt",
    href: "/plans",
    icon: "calendar_month",
    keywords: "plan kế hoạch tuần",
  },
  {
    id: "nav-approvals",
    group: "Điều hướng",
    label: "Duyệt hồ sơ",
    description: "Kế hoạch, kết quả nhiệm vụ, gia hạn",
    href: "/approvals",
    icon: "verified",
    permission: "plans.approve",
    keywords: "approve duyệt phê duyệt",
  },
  {
    id: "nav-routine",
    group: "Điều hướng",
    label: "Nhật ký tác nghiệp",
    description: "Khai báo ca trực, tags TX/1277",
    href: "/routine",
    icon: "history_edu",
    keywords: "routine trực ca nhật ký",
  },
  {
    id: "nav-giao-ban",
    group: "Điều hướng",
    label: "Số liệu giao ban",
    description: "Số liệu thu NSNN, so sánh, cấu hình",
    href: "/v5/giao-ban",
    icon: "monitoring",
    keywords: "metrics giao ban thuế",
  },
  {
    id: "nav-reports",
    group: "Điều hướng",
    label: "Báo cáo",
    description: "Báo cáo, Excel, snapshot",
    href: "/reports",
    icon: "bar_chart",
    keywords: "report báo cáo",
  },
  {
    id: "nav-roster",
    group: "Điều hướng",
    label: "Lịch trực",
    description: "Phân công trực và lịch công tác",
    href: "/roster",
    icon: "calendar_today",
    keywords: "roster trực lịch",
  },
  {
    id: "nav-notifications",
    group: "Điều hướng",
    label: "Thông báo",
    description: "Hộp thư điều hành và thông báo",
    href: "/notifications",
    icon: "notifications",
    keywords: "notification thông báo",
  },
  {
    id: "action-assign-task",
    group: "Hành động",
    label: "Giao nhiệm vụ mới",
    description: "Mở form tạo nhiệm vụ",
    href: "/tasks?new=1",
    icon: "add_task",
    permission: "tasks.assign",
    keywords: "tạo giao việc task mới",
  },
  {
    id: "action-enter-metrics",
    group: "Hành động",
    label: "Nhập số liệu giao ban",
    description: "Nhập số thực tế theo ngày",
    href: "/v5/giao-ban/nhap",
    icon: "edit_note",
    keywords: "nhập số liệu actual",
  },
  {
    id: "action-config-metrics",
    group: "Hành động",
    label: "Cấu hình số liệu",
    description: "Chỉ tiêu, mốc lũy kế, phân công, so sánh",
    href: "/giao-ban/cau-hinh",
    icon: "tune",
    permission: "metrics.config",
    keywords: "cấu hình metric target",
  },
  {
    id: "action-admin",
    group: "Hành động",
    label: "Quản trị hệ thống",
    description: "Tổ chức, quyền, danh mục, audit",
    href: "/admin",
    icon: "admin_panel_settings",
    permission: "org.manage",
    keywords: "admin quản trị",
  },
];

export default function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const { can } = usePermissions();
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const commands = useMemo(() => {
    const available = COMMANDS.filter((command) => !command.permission || can(command.permission));
    const q = query.trim().toLowerCase();
    const matched = q
      ? available.filter((command) =>
          `${command.label} ${command.description} ${command.keywords || ""}`
            .toLowerCase()
            .includes(q)
        )
      : available;
    if (q) {
      const searchCommand: Command = {
        id: "search-tasks",
        group: "Hành động",
        label: `Tìm nhiệm vụ “${query.trim()}”`,
        description: "Mở danh sách nhiệm vụ với từ khóa này",
        href: `/tasks?q=${encodeURIComponent(query.trim())}`,
        icon: "search",
        keywords: "tìm kiếm",
      };
      // Ưu tiên trang/hành động khớp trực tiếp; tìm nhiệm vụ là lựa chọn cuối.
      return matched.length > 0 ? [...matched, searchCommand] : [searchCommand];
    }
    return matched;
  }, [query, can]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!mounted || !open) return null;

  const run = (command: Command) => {
    onClose();
    router.push(command.href);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(commands.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = commands[activeIndex];
      if (command) run(command);
    }
  };

  return createPortal(
    <div
      className="v5-shell fixed inset-0 z-[120] flex items-start justify-center bg-black/35 px-4 pt-[12vh] backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Tìm nhanh và hành động"
        data-testid="command-palette"
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-v5-line bg-v5-surface shadow-sm"
      >
        <div className="flex items-center gap-3 border-b border-v5-line/60 px-4 py-3">
          <Search className="h-5 w-5 text-v5-accent" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Tìm trang, nhiệm vụ hoặc hành động..."
            className="min-w-0 flex-1 bg-transparent text-[12px] text-v5-ink outline-none placeholder:text-v5-muted"
            aria-label="Tìm nhanh"
          />
          <kbd className="hidden rounded border border-v5-line bg-v5-bg px-1.5 py-0.5 text-[10px] text-v5-muted sm:inline">
            ESC
          </kbd>
        </div>

        <div className="max-h-[58vh] overflow-y-auto p-2">
          {commands.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-v5-muted">
              Không tìm thấy trang hoặc hành động phù hợp.
            </div>
          ) : (
            (["Điều hướng", "Hành động"] as const).map((group) => {
              const groupCommands = commands.filter((command) => command.group === group);
              if (groupCommands.length === 0) return null;
              return (
                <div key={group} className="mb-1">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-v5-muted">
                    {group}
                  </div>
                  {groupCommands.map((command) => {
                    const index = commands.findIndex((item) => item.id === command.id);
                    const active = index === activeIndex;
                    return (
                      <button
                        key={command.id}
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => run(command)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-fast ${
                          active ? "bg-v5-accent/10" : "hover:bg-v5-bg"
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                            active ? "bg-v5-accent text-white" : "bg-v5-bg text-v5-ink"
                          }`}
                        >
                          <V5Icon name={command.icon} className="text-[19px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-semibold text-v5-ink">
                            {command.label}
                          </span>
                          <span className="block truncate text-[11px] text-v5-muted">
                            {command.description}
                          </span>
                        </span>
                        {active && (
                          <V5Icon name="keyboard_return" className="text-[18px] text-v5-ink" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-v5-line/60 px-4 py-2 text-[10px] text-v5-muted">
          <span>↑ ↓ chọn · Enter mở · Esc đóng</span>
          <span>Ctrl + K</span>
        </div>
      </section>
    </div>,
    document.body
  );
}
