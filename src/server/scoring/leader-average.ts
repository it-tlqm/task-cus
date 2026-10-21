/**
 * YC-35 — Quan hệ phụ trách theo kỳ + tính điểm bình quân cho lãnh đạo.
 *
 * CÔNG THỨC (đối chiếu với workbook gốc `Dữ liệu.zip` → sheet "01B tháng 9"):
 *   F33 = SUM(G33:AD33) / 24        Điểm trung bình các công chức thuộc thẩm quyền
 *                                    giao phụ trách từng mảng công việc
 *   D33 = +F33                       a — điểm % về số lượng của lãnh đạo
 *   D34 = +F34                       b — điểm % về tiến độ
 *   D35 = +F35                       c — điểm % về chất lượng
 *   D36, D37, D38                    d, đ, e — do lãnh đạo tự nhập (mức đơn vị)
 *   D39 = SUM(D33:D38)/6             g = (a+b+c+d+đ+e)/6
 *   D40 = D39*70/100                 điểm tiêu chí kết quả thực hiện nhiệm vụ
 *   D41 = D32 + C30                  tổng điểm
 *
 * NGUYÊN TẮC:
 * - Quan hệ phụ trách CHỈ lấy từ `person_supervisions` (đã được xác nhận) —
 *   KHÔNG suy diễn từ role kỹ thuật.
 * - Bình quân là ĐỆ QUY: Đội trưởng = bình quân các Đội phó; Đội phó = bình quân
 *   các công chức phụ trách (mỗi cấp lấy a/b/c của cấp dưới).
 * - Mẫu gốc chia cho 24 (số cột của ví dụ). Nếu một người chưa có điểm, KHÔNG coi là 0:
 *   trạng thái = INSUFFICIENT_DATA + nêu rõ người thiếu để rà soát/xác nhận.
 * - Vòng quản lý (A→B→A) bị chặn khi thiết lập quan hệ.
 */

import { prisma } from "../db";

export type LeaderDimensionKey = "a" | "b" | "c";

export interface LeaderSubordinateScore {
  personId: string;
  fullName: string;
  a: number | null;
  b: number | null;
  c: number | null;
  /** true nếu người này còn là lãnh đạo (có cấp dưới) → lấy điểm bình quân tiếp. */
  isManager: boolean;
}

export interface LeaderDimensionResult {
  key: LeaderDimensionKey;
  value: number | null;
  /** Số người có điểm hợp lệ được tính vào bình quân. */
  countedCount: number;
  /** Tổng số người thuộc phạm vi phụ trách. */
  totalCount: number;
  missing: Array<{ personId: string; fullName: string }>;
}

export interface LeaderScoreResult {
  managerPersonId: string;
  managerName: string;
  periodType: "MONTH" | "QUARTER";
  periodYear: number;
  periodNumber: number;
  status: "KNOWN" | "INSUFFICIENT_DATA" | "PENDING_RULE" | "NOT_APPLICABLE" | "ERROR";
  reasons: string[];
  dimensions: Record<LeaderDimensionKey, LeaderDimensionResult>;
  /** Các cấp bên dưới đã dùng để tính (để hiển thị/rà soát). */
  subordinates: Array<{
    personId: string;
    fullName: string;
    isManager: boolean;
    a: number | null;
    b: number | null;
    c: number | null;
    depth: number;
  }>;
}

/** Số ngày trong kỳ để xác định quan hệ còn hiệu lực. */
function periodRange(
  periodType: "MONTH" | "QUARTER",
  year: number,
  number: number
): { start: Date; end: Date } {
  if (periodType === "QUARTER") {
    const startMonth = (number - 1) * 3;
    return {
      start: new Date(year, startMonth, 1),
      end: new Date(year, startMonth + 3, 0, 23, 59, 59, 999),
    };
  }
  return {
    start: new Date(year, number - 1, 1),
    end: new Date(year, number, 0, 23, 59, 59, 999),
  };
}

/** Lấy quan hệ phụ trách còn hiệu lực trong kỳ. */
export async function getActiveSupervisions(
  managerPersonId: string,
  periodType: "MONTH" | "QUARTER",
  year: number,
  number: number
) {
  const { start, end } = periodRange(periodType, year, number);
  const rows = await prisma.personSupervision.findMany({
    where: {
      managerPersonId,
      status: "CONFIRMED",
      effectiveFrom: { lte: end },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
    },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  // Khử trùng: cùng một cấp dưới có thể có nhiều quan hệ chồng lấn theo kỳ
  // (người dùng thêm nhiều lần với effectiveFrom khác nhau) → chỉ giữ quan hệ
  // MỚI NHẤT cho mỗi người để không tính trùng khi bình quân.
  const seen = new Set<string>();
  const unique: typeof rows = [];
  for (const r of rows) {
    if (seen.has(r.subordinatePersonId)) continue;
    seen.add(r.subordinatePersonId);
    unique.push(r);
  }
  return unique;
}

/** Kiểm tra vòng quản lý khi thêm quan hệ manager → subordinate. */
export async function wouldCreateCycle(
  managerPersonId: string,
  subordinatePersonId: string
): Promise<boolean> {
  if (managerPersonId === subordinatePersonId) return true;
  // BFS từ subordinate: nếu đi tới được manager thì tạo vòng.
  const seen = new Set<string>();
  const queue: string[] = [subordinatePersonId];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === managerPersonId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const subs = await prisma.personSupervision.findMany({
      where: { managerPersonId: current, status: "CONFIRMED" },
      select: { subordinatePersonId: true },
    });
    for (const s of subs) queue.push(s.subordinatePersonId);
  }
  return false;
}

/**
 * Tính a/b/c của một lãnh đạo theo quan hệ phụ trách (đệ quy).
 *
 * `personalScores` — hàm lấy a/b/c của một CÁN BỘ (không phải lãnh đạo) trong kỳ.
 */
export async function computeLeaderDimensions(
  managerPersonId: string,
  periodType: "MONTH" | "QUARTER",
  year: number,
  number: number,
  personalScores: (personId: string) => Promise<{ a: number | null; b: number | null; c: number | null }>
): Promise<LeaderScoreResult> {
  const manager = await prisma.person.findUnique({
    where: { id: managerPersonId },
    select: { id: true, fullName: true },
  });
  const base: LeaderScoreResult = {
    managerPersonId,
    managerName: manager?.fullName ?? "—",
    periodType,
    periodYear: year,
    periodNumber: number,
    status: "INSUFFICIENT_DATA",
    reasons: [],
    dimensions: {
      a: { key: "a", value: null, countedCount: 0, totalCount: 0, missing: [] },
      b: { key: "b", value: null, countedCount: 0, totalCount: 0, missing: [] },
      c: { key: "c", value: null, countedCount: 0, totalCount: 0, missing: [] },
    },
    subordinates: [],
  };
  if (!manager) {
    base.status = "ERROR";
    base.reasons.push("Không tìm thấy lãnh đạo.");
    return base;
  }

  const collected: Array<{
    personId: string;
    fullName: string;
    isManager: boolean;
    a: number | null;
    b: number | null;
    c: number | null;
    depth: number;
  }> = [];

  /** Gom điểm của nhánh lãnh đạo con. */
  async function collect(
    managerId: string,
    depth: number,
    visited: Set<string>
  ): Promise<Array<{ a: number | null; b: number | null; c: number | null; fullName: string; personId: string }>> {
    if (visited.has(managerId)) {
      base.reasons.push(
        "Phát hiện vòng quản lý trong quan hệ phụ trách — cần rà soát lại dữ liệu."
      );
      return [];
    }
    const nextVisited = new Set(visited);
    nextVisited.add(managerId);

    const subs = await getActiveSupervisions(managerId, periodType, year, number);
    if (subs.length === 0) {
      const p = await prisma.person.findUnique({
        where: { id: managerId },
        select: { fullName: true },
      });
      const sc = await personalScores(managerId);
      const isManager = (await prisma.personSupervision.count({
        where: { managerPersonId: managerId, status: "CONFIRMED" },
      })) > 0;
      if (isManager) {
        // Lãnh đạo không có cấp dưới trong kỳ → chưa có điểm cá nhân để tính.
        return [
          {
            a: null,
            b: null,
            c: null,
            fullName: p?.fullName ?? "—",
            personId: managerId,
          },
        ];
      }
      return [{ ...sc, fullName: p?.fullName ?? "—", personId: managerId }];
    }

    const out: Array<{
      a: number | null;
      b: number | null;
      c: number | null;
      fullName: string;
      personId: string;
    }> = [];
    const seenInBranch = new Set<string>();
    for (const s of subs) {
      if (seenInBranch.has(s.subordinatePersonId)) continue;
      seenInBranch.add(s.subordinatePersonId);
      const person = await prisma.person.findUnique({
        where: { id: s.subordinatePersonId },
        select: { fullName: true },
      });
      const hasSub = await prisma.personSupervision.count({
        where: { managerPersonId: s.subordinatePersonId, status: "CONFIRMED" },
      });
      if (hasSub > 0) {
        // Cấp dưới cũng là lãnh đạo → lấy BÌNH QUÂN của nhánh đó (đệ quy).
        const branch = await collect(s.subordinatePersonId, depth + 1, nextVisited);
        for (const b of branch) {
          out.push(b);
          collected.push({ ...b, isManager: true, depth: depth + 1 });
        }
      } else {
        const sc = await personalScores(s.subordinatePersonId);
        out.push({ ...sc, fullName: person?.fullName ?? "—", personId: s.subordinatePersonId });
        collected.push({
          personId: s.subordinatePersonId,
          fullName: person?.fullName ?? "—",
          isManager: false,
          a: sc.a,
          b: sc.b,
          c: sc.c,
          depth: depth + 1,
        });
      }
    }
    return out;
  }

  const directSubs = await getActiveSupervisions(managerPersonId, periodType, year, number);
  if (directSubs.length === 0) {
    base.status = "NOT_APPLICABLE";
    base.reasons.push(
      "Chưa có quan hệ phụ trách nào được xác nhận cho lãnh đạo trong kỳ này — không tính bình quân."
    );
    return base;
  }

  const branch = await collect(managerPersonId, 0, new Set<string>());
  const total = branch.length;
  if (total === 0) {
    base.status = "NOT_APPLICABLE";
    base.reasons.push("Không xác định được cán bộ phụ trách trong kỳ.");
    return base;
  }

  const keys: LeaderDimensionKey[] = ["a", "b", "c"];
  const missingAny: Array<{ personId: string; fullName: string }> = [];
  for (const k of keys) {
    const values = branch.map((b) => b[k]).filter((v): v is number => typeof v === "number");
    const missing = branch
      .filter((b) => b[k] === null || b[k] === undefined)
      .map((b) => ({ personId: b.personId, fullName: b.fullName }));
    base.dimensions[k] = {
      key: k,
      value: values.length ? values.reduce((s, v) => s + v, 0) / values.length : null,
      countedCount: values.length,
      totalCount: total,
      missing,
    };
    for (const m of missing) {
      if (!missingAny.find((x) => x.personId === m.personId)) missingAny.push(m);
    }
  }

  base.subordinates = collected;
  if (missingAny.length > 0) {
    base.status = "INSUFFICIENT_DATA";
    base.reasons.push(
      `Còn ${missingAny.length} cán bộ chưa có điểm hợp lệ (${missingAny
        .map((m) => m.fullName)
        .join(", ")}) — hệ thống KHÔNG coi điểm thiếu là 0, cần rà soát hoặc xác nhận.`
    );
  } else {
    base.status = "KNOWN";
  }
  return base;
}
