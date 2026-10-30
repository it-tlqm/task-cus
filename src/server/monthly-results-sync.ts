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
        select: {
          assignedQty: true,
          quantityUnit: true,
          factorSnapshot: true,
          productItemId: true,
          linkedProducts: {
            select: {
              productItemId: true,
              factorSnapshot: true,
              reviewState: true,
              productItem: { select: { convertFactor: true } },
            },
          },
        },
      },
      sourceKind: true,
      sourceRefId: true,
      assignedById: true,
      ownerId: true,
    },
  });

  for (const task of tasks) {
    // Nguồn sản phẩm: ưu tiên QĐ1277 trực tiếp trên nhiệm vụ, sau đó đến
    // đầu việc kế hoạch / liên kết sản phẩm (trường hợp nhiệm vụ có cả TX và QĐ1277).
    const linkedProduct =
      task.workItem?.linkedProducts.find((p) => p.reviewState === "CONFIRMED") ||
      task.workItem?.linkedProducts[0] ||
      null;
    const productItemId =
      (task.sourceKind === "QD1277_PRODUCT" && task.sourceRefId
        ? task.sourceRefId
        : null) ||
      task.workItem?.productItemId ||
      linkedProduct?.productItemId ||
      null;

    let factor =
      task.factorSnapshot ??
      task.workItem?.factorSnapshot ??
      linkedProduct?.factorSnapshot ??
      linkedProduct?.productItem?.convertFactor ??
      null;
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

/**
 * Đồng bộ đầu việc kế hoạch (Việc của tôi) đã hoàn thành vào KQ tháng.
 * Chỉ lấy đầu việc KHÔNG có nhiệm vụ liên kết — đầu việc có nhiệm vụ đã được
 * đồng bộ theo nhiệm vụ để tránh ghi trùng.
 */
export async function syncMonthlyResultsFromWorkItems(
  personId: string,
  year: number,
  month: number
): Promise<void> {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  const items = await prisma.personalWorkItem.findMany({
    where: {
      personId,
      taskId: null,
      status: { not: "DISCONTINUED" },
      OR: [
        { dueDate: { gte: start, lte: end } },
        { completedDate: { gte: start, lte: end } },
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      assignedQty: true,
      completedQty: true,
      factorSnapshot: true,
      dueDate: true,
      completedDate: true,
      reviewState: true,
      resultText: true,
      productItemId: true,
      catalogEntryId: true,
      product: { select: { convertFactor: true } },
      catalogEntry: { select: { convertFactor: true } },
    },
  });

  for (const item of items) {
    const catalogFactor =
      item.catalogEntry?.convertFactor == null
        ? null
        : Number(item.catalogEntry.convertFactor);
    const factor =
      item.factorSnapshot ?? item.product?.convertFactor ?? catalogFactor ?? null;

    const assignedQty = item.assignedQty ?? 1;
    const completedQty = item.completedQty ?? (item.completedDate ? assignedQty : null);
    const lateDays =
      item.completedDate && item.dueDate
        ? Math.max(
            0,
            Math.floor(
              (new Date(item.completedDate).getTime() - new Date(item.dueDate).getTime()) /
                DAY_MS
            )
          )
        : 0;

    const idempotencyKey = `workitem:${item.id}:${year}-${month}`;
    const existing = await prisma.monthlyWorkResult.findFirst({
      where: {
        personId,
        OR: [{ workItemId: item.id }, { idempotencyKey }],
      },
      select: { id: true },
    });

    const data = {
      workItemId: item.id,
      title: item.title,
      outputText: item.resultText || item.title,
      assignedQty,
      completedQty,
      dueDate: item.dueDate,
      completedDate: item.completedDate,
      factorSnapshot: factor,
      lateCount: lateDays,
      reworkCount: 0,
      productItemId: item.productItemId,
      needsReview: item.reviewState !== "CONFIRMED",
      subjectKind: "WORK_ITEM",
      subjectId: item.id,
      createdById: personId,
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
