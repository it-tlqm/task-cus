/**
 * YC-32 — Phân quyền truy cập một đầu việc cá nhân (dùng cho minh chứng).
 * Nguyên tắc:
 * - Chủ sở hữu: xem + ghi.
 * - Lãnh đạo đơn vị / Trưởng bộ phận trong phạm vi: xem + ghi (theo ma trận C2).
 * - Quản trị kỹ thuật (SYSTEM_ADMIN): KHÔNG truy cập nội dung nghiệp vụ (quy ước hiện hành).
 * - Cán bộ khác bộ phận: từ chối, không lộ sự tồn tại của tệp.
 */

import { SessionUser } from "./auth";
import { prisma } from "./db";
import { getAuthorizedUnitIds } from "./guard";

export async function getWorkItemForAccess(workItemId: string) {
  return prisma.personalWorkItem.findUnique({
    where: { id: workItemId },
    include: {
      person: { include: { assignments: { select: { unitId: true } } } },
      period: { include: { snapshots: { where: { status: "LOCKED" }, select: { id: true } } } },
      planItem: { include: { plan: { select: { id: true, status: true, title: true } } } },
      task: { select: { id: true, code: true, title: true, status: true, currentDeadline: true } },
      catalogEntry: {
        select: { id: true, code: true, title: true, department: true, status: true },
      },
    },
  });
}

export type WorkItemAccessItem = NonNullable<Awaited<ReturnType<typeof getWorkItemForAccess>>>;

export interface WorkItemAccessResult {
  allowed: boolean;
  reason?: string;
  item?: WorkItemAccessItem;
  scope: "OWNER" | "LEADER" | "NONE";
}

export async function checkWorkItemAccess(
  user: SessionUser,
  workItemId: string
): Promise<WorkItemAccessResult> {
  if (user.role === "SYSTEM_ADMIN") {
    return {
      allowed: false,
      reason: "Quản trị kỹ thuật không có quyền truy cập nội dung nghiệp vụ",
      scope: "NONE",
    };
  }

  const item = await getWorkItemForAccess(workItemId);
  if (!item) {
    return { allowed: false, reason: "Đầu việc không tồn tại", scope: "NONE" };
  }

  if (item.personId === user.personId) {
    return { allowed: true, item, scope: "OWNER" };
  }

  const authorizedUnits = await getAuthorizedUnitIds(user);
  if (authorizedUnits === "ALL") {
    return { allowed: true, item, scope: "LEADER" };
  }
  if (
    user.role === "DEPARTMENT_LEADER" &&
    item.person.assignments.some((a) => authorizedUnits.includes(a.unitId))
  ) {
    return { allowed: true, item, scope: "LEADER" };
  }

  return {
    allowed: false,
    reason: "Bạn không có quyền truy cập đầu việc/minh chứng của cán bộ khác bộ phận",
    scope: "NONE",
  };
}

export function isPeriodLocked(item: WorkItemAccessItem): boolean {
  return !!item.period?.isLocked || (item.period?.snapshots?.length || 0) > 0;
}
