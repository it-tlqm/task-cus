import { prisma } from "./db";
import { getAuthorizedUnitIds } from "./guard";

/**
 * YC-24 PHƯƠNG ÁN B — Phạm vi bộ phận dùng chung cho các API phân công.
 *
 * Nguyên tắc:
 * - Mọi API đọc/ghi/xuất phải xác định bộ phận đích từ YÊU CẦU của client nhưng đối chiếu
 *   với PHẠM VI THỰC TẾ của tài khoản (getAuthorizedUnitIds) — không tin unitId gửi lên.
 * - Bộ phận hợp lệ để lập bảng phân công: đơn vị ACTIVE, cấp > 1 (không lập bảng cho đơn vị gốc cấp 1).
 */

export interface DutyScopeUnit {
  id: string;
  code: string;
  name: string;
}

/** Danh sách bộ phận trong phạm vi người xem (kèm cờ "ALL" cho Lãnh đạo đơn vị). */
export async function scopeUnitsOf(user: any): Promise<{ authorized: string[] | "ALL"; units: DutyScopeUnit[] }> {
  const authorized = await getAuthorizedUnitIds(user);
  const units = await prisma.orgUnit.findMany({
    where:
      authorized === "ALL"
        ? { level: { gt: 1 }, status: "ACTIVE" }
        : { id: { in: authorized }, level: { gt: 1 }, status: "ACTIVE" },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  return { authorized, units };
}

/** Đơn vị chính của cán bộ (chọn bộ phận mặc định khi người xem không gửi unitId). */
export async function primaryUnitOf(personId: string | null | undefined): Promise<string | null> {
  if (!personId) return null;
  const asg = await prisma.personAssignment.findFirst({
    where: { personId, isPrimary: true },
    select: { unitId: true },
  });
  return asg?.unitId || null;
}

export type ResolvedDutyUnit =
  | { ok: true; unitId: string; authorized: string[] | "ALL"; units: DutyScopeUnit[]; isDefault: boolean }
  | { ok: false; status: number; error: string };

/**
 * Xác định bộ phận đích từ tham số client + phạm vi thực tế:
 * - Có unitId → phải nằm trong phạm vi (else 403).
 * - Không có unitId → mặc định = bộ phận chính của người xem (nếu trong phạm vi) hoặc bộ phận đầu tiên.
 */
export async function resolveDutyUnitId(user: any, requested: string | null): Promise<ResolvedDutyUnit> {
  const { authorized, units } = await scopeUnitsOf(user);
  if (requested) {
    if (!units.some((u) => u.id === requested)) {
      return { ok: false, status: 403, error: "Bạn không có quyền truy cập bộ phận này" };
    }
    return { ok: true, unitId: requested, authorized, units, isDefault: false };
  }
  const primary = await primaryUnitOf(user.personId);
  const primaryValid = primary && units.some((u) => u.id === primary) ? primary : null;
  let fallback = primaryValid || units[0]?.id || "";

  // Tránh mở trang vào một bảng trống: Lãnh đạo đơn vị (phạm vi ALL) thường có đơn vị chính là
  // "Lãnh đạo đơn vị" — nơi không có danh mục vị trí. Khi đó ưu tiên bộ phận đã có danh mục
  // vị trí/nhiệm vụ đang hoạt động để trang mở đúng bảng cần phân công.
  if (primaryValid && authorized === "ALL" && units.length > 1) {
    const hasCatalog = await prisma.dutyPosition.count({
      where: { unitId: primaryValid, status: "ACTIVE" },
    });
    if (hasCatalog === 0) {
      const withCatalog = await prisma.dutyPosition.groupBy({
        by: ["unitId"],
        where: { unitId: { in: units.map((u) => u.id) }, status: "ACTIVE" },
      });
      const preferred = units.find((u) => withCatalog.some((w) => w.unitId === u.id));
      if (preferred) fallback = preferred.id;
    }
  }

  if (!fallback) return { ok: false, status: 400, error: "Không xác định được bộ phận — vui lòng chọn bộ phận" };
  return { ok: true, unitId: fallback, authorized, units, isDefault: true };
}
