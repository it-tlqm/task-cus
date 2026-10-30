"use client";

import { V5Icon } from "@/components/v5/ui/lucide-icon";

import Link from "next/link";

interface Props {
  waitingReview: number;
  urgentReview: number;
  overdue: number;
  attention: number;
  canApprove: boolean;
}

export default function DashboardActionCenter({
  waitingReview,
  urgentReview,
  overdue,
  attention,
  canApprove,
}: Props) {
  const total = waitingReview + overdue + attention;

  return (
    <section className="px-margin pt-space-md lg:px-space-lg" data-testid="dashboard-action-center">
      <div className="flex flex-col gap-2 rounded-xl border border-v5-line/60 bg-v5-surface p-3 shadow-sm sm:flex-row sm:items-center sm:gap-3">
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-v5-accent/10 text-v5-ink">
            <V5Icon name="bolt" className="text-[18px]" />
          </span>
          <div>
            <div className="text-[12px] font-bold text-v5-ink">Việc cần xử lý</div>
            <div className="text-[11px] text-v5-muted">
              {total > 0 ? `${total} việc đang chờ` : "Không có việc gấp"}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {canApprove && (
            <Link
              href="/approvals"
              className="inline-flex min-w-fit items-center gap-1.5 rounded-lg border border-v5-gold/30 bg-v5-gold-soft/50 px-2.5 py-1.5 text-[11px] font-semibold text-v5-gold-ink hover:brightness-95"
            >
              <V5Icon name="approval" className="text-[15px]" />
              Chờ duyệt
              <span className="rounded-full bg-v5-gold px-1.5 text-[10px] text-v5-gold-ink">
                {waitingReview}
              </span>
              {urgentReview > 0 && (
                <span className="text-[10px] font-bold">({urgentReview} gấp)</span>
              )}
            </Link>
          )}

          <Link
            href="/tasks"
            className="inline-flex min-w-fit items-center gap-1.5 rounded-lg border border-v5-danger/30 bg-v5-danger-soft/50 px-2.5 py-1.5 text-[11px] font-semibold text-v5-danger hover:brightness-95"
          >
            <V5Icon name="warning" className="text-[15px]" />
            Quá hạn
            <span className="rounded-full bg-v5-danger px-1.5 text-[10px] text-white">{overdue}</span>
          </Link>

          <Link
            href="/tasks"
            className="inline-flex min-w-fit items-center gap-1.5 rounded-lg border border-v5-line bg-v5-bg px-2.5 py-1.5 text-[11px] font-semibold text-v5-muted hover:bg-v5-bg-high"
          >
            <V5Icon name="visibility" className="text-[15px]" />
            Cần chú ý
            <span className="rounded-full bg-v5-bg-highest px-1.5 text-[10px] text-v5-ink">
              {attention}
            </span>
          </Link>
        </div>

        <Link
          href="/my-work"
          className="shrink-0 text-[11px] font-semibold text-v5-accent hover:underline"
        >
          Mở việc của tôi →
        </Link>
      </div>
    </section>
  );
}
