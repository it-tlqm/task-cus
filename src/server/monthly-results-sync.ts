import { prisma } from "./db";

const DAY_MS = 86_400_000;

/**
 * Đồng bộ nhiệm vụ trong tháng vào KQ tháng.
 * - Lấy cả việc được giao và việc tự tạo (mọi nhiệm vụ của người dùng trong tháng).
 * - Việc không khai báo số lượng được tính mặc định 1 việc; hoàn thành thì ghi 1.
 * - Không ghi đè các dòng KQ tháng thủ công không gắn nhiệm vụ.
 * - Chạy lại nhiều lần vẫn idempotent.
 */
export async function syncMonthlyResultsFromTasks(
  personId: string,
  year: number,
  month: number
): Promise<void> {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  const tasks = await prisma.task.findMany({
    where: {
      ownerId: personId,
      status: { not: "CANCELED" },
      OR: [
        { currentDeadline: { gte: start, lte: end } },
        { completedDate: { gte: start, lte: end } },
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      expectedResultText: true,
      actualResultText: true,
      assignedQty: true,
      completedQty: true,
      quantityUnit: true,
      factorSnapshot: true,
      currentDeadline: true,
      completedDate: true,
      workItemId: true,
      workItem: {
        select: { assignedQty: true, quantityUnit: true, factorSnapshot: true },
      },
      sourceKind: true,
      sourceRefId: true,
      assignedById: true,
      ownerId: true,
    },
  });

  for (const task of tasks) {
    const productItemId =
      task.sourceKind === "QD1277_PRODUCT" && task.sourceRefId ? task.sourceRefId : null;

    let factor = task.factorSnapshot ?? task.workItem?.factorSnapshot ?? null;
    if (factor === null || factor === undefined) {
      if (productItemId) {
        const product = await prisma.productItem.findUnique({
          where: { id: productItemId },
          select: { convertFactor: true },
        });
        factor = product?.convertFactor ?? null;
      } else if (task.sourceKind === "TX_CATALOG" && task.sourceRefId) {
        const entry = await prisma.workCatalogEntry.findUnique({
          where: { id: task.sourceRefId },
          select: { convertFactor: true },
        });
        factor = entry?.convertFactor == null ? null : Number(entry.convertFactor);
      }
    }

    const lateDays =
      task.completedDate && task.currentDeadline
        ? Math.max(
            0,
            Math.floor(
              (new Date(task.completedDate).getTime() - new Date(task.currentDeadline).getTime()) /
                DAY_MS
            )
          )
        : 0;

    const reworkCount = await prisma.taskUpdate.count({
      where: { taskId: task.id, kind: { in: ["return", "reopen"] } },
    });

    const idempotencyKey = `task:${task.id}:${year}-${month}`;
    const existing = await prisma.monthlyWorkResult.findFirst({
      where: {
        personId,
        periodYear: year,
        periodMonth: month,
        OR: [
          { taskId: task.id },
          { idempotencyKey },
          ...(task.workItemId ? [{ workItemId: task.workItemId }] : []),
        ],
      },
      select: { id: true },
    });

    // Việc không khai báo số lượng: lấy theo đầu việc kế hoạch, nếu vẫn thiếu thì 1 việc.
    // Hoàn thành thì ghi 1, chưa hoàn thành thì để trống để không tính vào điểm.
    const assignedQty = task.assignedQty ?? task.workItem?.assignedQty ?? 1;
    const completedQty =
      task.completedQty ?? (task.status === "DONE" ? assignedQty : null);

    const data = {
      taskId: task.id,
      title: task.title,
      outputText: task.expectedResultText || task.actualResultText || task.title,
      assignedQty,
      completedQty,
      dueDate: task.currentDeadline,
      completedDate: task.completedDate,
      factorSnapshot: factor ?? null,
      lateCount: lateDays,
      reworkCount,
      productItemId,
      workItemId: task.workItemId,
      needsReview: false,
      subjectKind: "TASK",
      subjectId: task.id,
      createdById: task.assignedById || task.ownerId,
    };

    if (existing) {
      await prisma.monthlyWorkResult.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.monthlyWorkResult.create({
        data: {
          ...data,
          personId,
          periodYear: year,
          periodMonth: month,
          idempotencyKey,
        },
      });
    }
  }
}
