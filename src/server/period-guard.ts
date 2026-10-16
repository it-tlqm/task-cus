import { prisma } from "./db";

/**
 * E1 — Kỳ đã chốt (isLocked hoặc có snapshot LOCKED) thì đóng băng ghi:
 * kế hoạch, đầu việc cá nhân, nhật ký trong kỳ đó.
 * Nhiệm vụ (Task) xuyên kỳ nên chỉ chặn LINK vào kế hoạch của kỳ đã chốt.
 */
export async function getPeriodLockState(periodId: string): Promise<{ locked: boolean; title?: string }> {
  const period = await prisma.reportingPeriod.findUnique({
    where: { id: periodId },
    include: { snapshots: { where: { status: "LOCKED" }, select: { id: true } } },
  });
  if (!period) return { locked: false };
  const locked = period.isLocked || period.snapshots.length > 0;
  return { locked, title: period.title };
}

export async function assertPeriodWritable(periodId: string): Promise<void> {
  const st = await getPeriodLockState(periodId);
  if (st.locked) {
    const err: any = new Error(
      `Kỳ "${st.title || ""}" đã chốt số liệu — mọi ghi mới/chỉnh sửa trong kỳ đều bị khóa để bảo toàn báo cáo`
    );
    err.statusCode = 423;
    throw err;
  }
}
