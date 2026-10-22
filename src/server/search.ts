import { prisma } from "./db";
import { normalizeForSearch } from "@/lib/text";

/**
 * Tìm kiếm không dấu trên nhiều bảng.
 *
 * Cơ chế (F16 — V3):
 *  - Nếu DB có extension `unaccent` (như Production) → dùng SQL `unaccent()` như cũ.
 *  - Nếu DB KHÔNG có extension (demo/local) → **tự động lùi về so khớp ở tầng ứng dụng**:
 *    lấy tối đa 5.000 dòng ứng viên (chỉ cột cần tìm) rồi lọc bằng chuẩn hoá bỏ dấu.
 *    ⇒ Tìm được theo mã/tên CÓ dấu và KHÔNG dấu trên mọi DB, không lỗi 42883.
 *
 * An toàn: dữ liệu tìm kiếm luôn được truyền qua **tham số** ($1); tên bảng/cột là hằng số
 * nội bộ và được **kiểm tra dạng** trước khi ghép vào câu lệnh.
 */

/** Chỉ cho phép tên bảng/cột dạng snake_case để không thể chèn SQL từ đầu vào. */
const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

function assertSafeIdentifier(name: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error(`Tên bảng/cột không hợp lệ: ${name}`);
  }
  return name;
}

/** Số dòng ứng viên tối đa khi lùi về lọc ở tầng ứng dụng. */
const FALLBACK_CANDIDATE_LIMIT = 5000;

/** Cache trạng thái có extension unaccent (kiểm tra 1 lần, hết hạn sau 10 phút). */
let unaccentAvailable: { value: boolean; checkedAt: number } | null = null;
const UNACCENT_TTL_MS = 10 * 60 * 1000;

async function hasUnaccent(): Promise<boolean> {
  const now = Date.now();
  if (unaccentAvailable && now - unaccentAvailable.checkedAt < UNACCENT_TTL_MS) {
    return unaccentAvailable.value;
  }
  let value = false;
  try {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT 1 AS ok FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'unaccent' LIMIT 1`
    )) as Array<{ ok: number }>;
    value = rows.length > 0;
  } catch {
    value = false;
  }
  unaccentAvailable = { value, checkedAt: now };
  return value;
}

/** Tìm bằng `unaccent()` (chỉ khi DB có extension). */
async function searchWithUnaccent(
  table: string,
  columns: string[],
  pattern: string,
  limit: number
): Promise<string[] | null> {
  if (!(await hasUnaccent())) return null;
  const conds = columns.map((c) => `unaccent("${c}"::text) ILIKE unaccent($1)`).join(" OR ");
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT id FROM "${table}" WHERE ${conds} LIMIT $2`,
    pattern,
    Math.min(Math.max(limit, 1), 1000)
  )) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

/** Lùi về lọc ở tầng ứng dụng khi DB không có extension `unaccent`. */
async function searchWithoutUnaccent(
  table: string,
  columns: string[],
  query: string,
  limit: number
): Promise<string[]> {
  const colList = columns.map((c) => `"${c}"::text AS "${c}"`).join(", ");
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT id, ${colList} FROM "${table}" LIMIT $1`,
    FALLBACK_CANDIDATE_LIMIT
  )) as Array<Record<string, any>>;
  const needle = normalizeForSearch(query);
  if (!needle) return [];
  const out: string[] = [];
  for (const row of rows) {
    const hit = columns.some((c) => normalizeForSearch(row[c]).includes(needle));
    if (hit) {
      out.push(String(row.id));
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Tìm không dấu tiếng Việt: khớp theo cột (tên cột DB thật, snake_case).
 * Trả về danh sách id khớp (tối đa `limit`) hoặc `null` khi không có từ khóa.
 */
export async function unaccentSearchIds(
  table: string,
  columns: string[],
  q: string,
  limit: number = 500
): Promise<string[] | null> {
  const query = (q || "").trim();
  if (!query) return null;

  const safeTable = assertSafeIdentifier(table);
  const safeColumns = columns.map(assertSafeIdentifier);

  // Thoát ký tự đặc biệt của LIKE
  const escaped = query.replace(/[\\%_]/g, (m) => `\\${m}`);
  const pattern = `%${escaped}%`;

  try {
    const viaUnaccent = await searchWithUnaccent(safeTable, safeColumns, pattern, limit);
    if (viaUnaccent) return viaUnaccent;
  } catch (err: any) {
    // DB không có extension (42883) hoặc lỗi SQL → lùi về lọc ở tầng ứng dụng
    console.warn("[search] unaccent không khả dụng, dùng so khớp tầng ứng dụng:", err?.message?.slice(0, 120));
  }

  return searchWithoutUnaccent(safeTable, safeColumns, query, limit);
}
