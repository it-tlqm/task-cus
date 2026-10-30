"use client";

import { V5Icon } from "@/components/v5/ui/lucide-icon";

import React from "react";

/**
 * YC-30 (bổ sung) — Bộ lọc "Nhật ký công việc".
 *
 * Đây là THÀNH PHẦN DÙNG CHUNG cho cả hai nguồn dữ liệu công việc:
 *   - Nhiệm vụ được giao (Task)          → "Công việc phát sinh"
 *   - Đầu việc kế hoạch (PersonalWorkItem) → "Công việc từ kế hoạch"
 * Không tạo bảng dữ liệu mới — chỉ lọc/tra cứu trên các bản ghi đã có.
 */

export type JournalPeriod = "today" | "week" | "month" | "all";
export type JournalSource = "all" | "plan" | "adhoc";
export type JournalStatus = "all" | "active" | "overdue" | "done";

export interface JournalFilterState {
  period: JournalPeriod;
  source: JournalSource;
  status: JournalStatus;
  query: string;
}

export const DEFAULT_JOURNAL_FILTER: JournalFilterState = {
  period: "today",
  source: "all",
  status: "all",
  query: "",
};

/** Bộ lọc toàn thời gian — dùng khi mở deep-link cần thấy đủ việc đang chờ. */
export const ALL_TIME_JOURNAL_FILTER: JournalFilterState = {
  period: "all",
  source: "all",
  status: "all",
  query: "",
};

export const JOURNAL_PERIOD_LABELS: Record<JournalPeriod, string> = {
  today: "Hôm nay",
  week: "Tuần này",
  month: "Tháng này",
  all: "Tất cả thời gian",
};

export const JOURNAL_SOURCE_LABELS: Record<JournalSource, string> = {
  all: "Tất cả",
  plan: "Từ kế hoạch",
  adhoc: "Phát sinh",
};

export const JOURNAL_STATUS_LABELS: Record<JournalStatus, string> = {
  all: "Tất cả trạng thái",
  active: "Đang thực hiện",
  overdue: "Chậm hạn",
  done: "Đã hoàn thành",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Khoảng thời gian của bộ lọc theo kỳ; null = không giới hạn. */
export function journalPeriodRange(period: JournalPeriod): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (period === "today") {
    const from = startOfDay(now);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }
  if (period === "week") {
    const from = startOfDay(now);
    // Thứ hai đầu tuần (0 = Chủ nhật)
    const dow = (from.getDay() + 6) % 7;
    from.setDate(from.getDate() - dow);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }
  if (period === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from, to };
  }
  return { from: null, to: null };
}

/** Ngày có dùng để lọc: hạn xử lý (ưu tiên) hoặc ngày hoàn thành. */
function relevantDate(due?: string | null, completed?: string | null): Date | null {
  if (due) {
    const d = new Date(due);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (completed) {
    const d = new Date(completed);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function journalDateInRange(
  due: string | null | undefined,
  completed: string | null | undefined,
  range: { from: Date | null; to: Date | null }
): boolean {
  if (!range.from || !range.to) return true;
  const d = relevantDate(due, completed);
  if (!d) return false;
  const t = d.getTime();
  return t >= range.from.getTime() && t < range.to.getTime();
}

export function journalTextMatches(query: string, ...fields: Array<string | null | undefined>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const unaccent = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
  const needle = unaccent(q);
  return fields.some((f) => f && unaccent(String(f)).includes(needle));
}

interface Props {
  value: JournalFilterState;
  onChange: (next: JournalFilterState) => void;
  className?: string;
  /** Số liệu tổng để hiển thị đếm nhanh. */
  counts?: { total: number; today?: number };
}

/** Thanh bộ lọc dùng chung cho Nhật ký công việc. */
export function JournalFilterBar({ value, onChange, counts, className = "" }: Props) {
  const set = (patch: Partial<JournalFilterState>) => onChange({ ...value, ...patch });

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-fast whitespace-nowrap ${
      active
        ? "bg-secondary text-on-secondary shadow-sm"
        : "text-v5-muted hover:text-primary hover:bg-v5-bg"
    }`;

  return (
    <section
      data-testid="journal-filter-bar"
      className={`bg-v5-surface rounded-xl shadow-sm border border-v5-line/50 p-space-md flex flex-col gap-3 ${className}`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-headline-sm text-headline-sm text-primary font-bold flex items-center gap-2">
            <V5Icon name="menu_book" className="text-secondary text-[20px]" />
            Nhật ký công việc
          </h2>
          <p className="text-[11px] text-v5-muted">
            {counts?.total !== undefined
              ? ` ${counts.total} công việc đang theo dõi · lọc theo thời gian, nguồn và trạng thái`
              : " Lọc theo thời gian, nguồn và trạng thái"}
          </p>
        </div>
        <div className="relative w-full lg:w-72">
          <V5Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]" />
          <input
            type="search"
            value={value.query}
            onChange={(e) => set({ query: e.target.value })}
            placeholder="Tìm theo tên hoặc mã công việc..."
            aria-label="Tìm công việc trong nhật ký"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-subtle bg-surface text-body-md text-v5-ink placeholder:text-outline focus:border-secondary focus:outline-none focus:ring-1 focus:ring-v5-accent"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="font-label-sm text-label-sm uppercase tracking-wide text-outline shrink-0 w-[86px]">
            Thời gian
          </span>
          <div className="flex items-center gap-1 bg-v5-bg rounded-lg p-1">
            {(Object.keys(JOURNAL_PERIOD_LABELS) as JournalPeriod[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set({ period: p })}
                aria-pressed={value.period === p}
                className={chip(value.period === p)}
              >
                {JOURNAL_PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="font-label-sm text-label-sm uppercase tracking-wide text-outline shrink-0 w-[86px]">
            Nguồn
          </span>
          <div className="flex items-center gap-1 bg-v5-bg rounded-lg p-1">
            {(Object.keys(JOURNAL_SOURCE_LABELS) as JournalSource[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set({ source: s })}
                aria-pressed={value.source === s}
                className={chip(value.source === s)}
              >
                {JOURNAL_SOURCE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="font-label-sm text-label-sm uppercase tracking-wide text-outline shrink-0 w-[86px]">
            Trạng thái
          </span>
          <div className="flex items-center gap-1 bg-v5-bg rounded-lg p-1">
            {(Object.keys(JOURNAL_STATUS_LABELS) as JournalStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set({ status: s })}
                aria-pressed={value.status === s}
                className={chip(value.status === s)}
              >
                {JOURNAL_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
