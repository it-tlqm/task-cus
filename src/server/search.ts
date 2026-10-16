import { prisma } from "./db";

/**
 * Tìm không dấu tiếng Việt: unaccent cả 2 vế + ILIKE.
 * Trả về danh sách id khớp (tối đa 500) hoặc null khi không có từ khóa.
 * Dùng tên cột DB thật (snake_case).
 */
export async function unaccentSearchIds(
  table: string,
  columns: string[],
  q: string,
  limit: number = 500
): Promise<string[] | null> {
  const query = q.trim();
  if (!query) return null;
  // Thoát ký tự đặc biệt của LIKE
  const escaped = query.replace(/[\\%_]/g, (m) => `\\${m}`);
  const pattern = `%${escaped}%`;
  const conds = columns.map((c) => `unaccent(${c}::text) ILIKE unaccent($1)`).join(" OR ");
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT id FROM "${table}" WHERE ${conds} LIMIT ${Math.min(Math.max(limit, 1), 1000)}`,
    pattern
  )) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}
