import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Phạm vi đơn vị đã được xác định bởi getAuthorizedUnitIds().
 * "ALL" = lãnh đạo đơn vị / phạm vi ORGANIZATION (giữ nguyên hành vi cũ).
 */
export type AiSummaryUnitScope = string[] | "ALL";

export interface AiSummaryStats {
  total: number;
  completed: number;
  inProgress: number;
  overdue: number;
  waiting: number;
  leaveApproved: number;
}

/**
 * Số liệu tổng hợp cho phần "Tóm tắt tuần" của AI.
 *
 * Toàn bộ số liệu (nhiệm vụ VÀ nghỉ phép) phải dùng CÙNG một phạm vi đơn vị do
 * người gọi truyền vào, để lãnh đạo bộ phận không thấy dữ liệu ngoài đơn vị mình.
 * LeaveRequest không có unitId: phạm vi được xác định qua phân công CHÍNH của
 * người xin nghỉ (PersonAssignment.isPrimary), đồng bộ với cách tính task.
 *
 * Hàm thuần dữ liệu — không gọi AI/provider, không ghi audit.
 */
export async function getAiSummaryStats(authorizedUnits: AiSummaryUnitScope): Promise<AiSummaryStats> {
  const taskScope: Prisma.TaskWhereInput =
    authorizedUnits === "ALL" ? {} : { unitId: { in: authorizedUnits } };
  const leaveScope: Prisma.LeaveRequestWhereInput =
    authorizedUnits === "ALL"
      ? {}
      : {
          person: {
            assignments: {
              some: {
                isPrimary: true,
                unitId: { in: authorizedUnits },
              },
            },
          },
        };

  const [total, completed, inProgress, overdue, waiting, leaveApproved] = await Promise.all([
    prisma.task.count({ where: { ...taskScope, status: { not: "CANCELED" } } }),
    prisma.task.count({ where: { ...taskScope, status: { in: ["COMPLETED", "DONE"] } } }),
    prisma.task.count({ where: { ...taskScope, status: "IN_PROGRESS" } }),
    prisma.task.count({
      where: {
        ...taskScope,
        status: { in: ["IN_PROGRESS", "WAITING_REVIEW"] },
        currentDeadline: { lt: new Date() },
      },
    }),
    prisma.task.count({ where: { ...taskScope, status: "WAITING_REVIEW" } }),
    prisma.leaveRequest.count({ where: { ...leaveScope, status: "APPROVED" } }),
  ]);

  return { total, completed, inProgress, overdue, waiting, leaveApproved };
}
