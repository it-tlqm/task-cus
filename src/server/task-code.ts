import { advisoryLock } from "./idempotency";

/**
 * E1 — Mã nhiệm vụ serial theo năm: NV-YYYY-NNNN (NV-2026-0001...).
 * Chạy BÊN TRONG transaction tạo Task (sau dedupe-check), dùng khóa tư vấn
 * theo năm nên hai request đồng thời không bao giờ trùng số.
 */
export async function nextTaskCode(tx: any, year?: number): Promise<string> {
  const y = year || new Date().getFullYear();
  await advisoryLock(tx, `task-counter:${y}`);
  let counter = await tx.taskCounter.findUnique({ where: { year: y } });
  if (!counter) {
    // Khởi tạo từ số Task đã có trong năm (bảo toàn mã cũ dạng timestamp)
    const existing = await tx.task.count({
      where: { code: { startsWith: `NV-${y}-` } },
    });
    counter = await tx.taskCounter.create({ data: { year: y, lastNumber: existing } });
  }
  counter = await tx.taskCounter.update({
    where: { year: y },
    data: { lastNumber: { increment: 1 } },
  });
  return `NV-${y}-${String(counter.lastNumber).padStart(4, "0")}`;
}
