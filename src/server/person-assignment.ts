import { vnDateOnly } from "@/lib/datetime";

/**
 * Giá trị hiển thị khi thiếu dữ liệu phân công/chức vụ/đơn vị.
 * Dùng thống nhất cho các biểu xuất để không bịa dữ liệu mẫu.
 */
export const MISSING_TEXT = "—";

type AssignmentDate = Date | string | null | undefined;

export interface PrimaryAssignmentLike {
  id?: string;
  isPrimary: boolean;
  effectiveFrom?: AssignmentDate;
  effectiveTo?: AssignmentDate;
  createdAt?: AssignmentDate;
}

/** Khóa ngày (YYYY-MM-DD, giờ Việt Nam) để so sánh các trường ngày hiệu lực. */
function dateKey(value: AssignmentDate): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && Number.isNaN(value.getTime())) return null;
  const key = vnDateOnly(value as Date | string);
  return key || null;
}

/**
 * Phân công còn hiệu lực tại ngày kết xuất:
 * - `effectiveFrom` <= ngày kết xuất (thiếu ngày bắt đầu coi như đã hiệu lực);
 * - `effectiveTo` null hoặc >= ngày kết xuất;
 * - chỉ lấy `isPrimary = true`.
 */
export function isPrimaryAssignmentActiveAt(
  assignment: PrimaryAssignmentLike,
  asOf: Date = new Date()
): boolean {
  if (assignment.isPrimary !== true) return false;
  const at = dateKey(asOf);
  if (!at) return false;

  const from = dateKey(assignment.effectiveFrom);
  if (from && from > at) return false;

  const to = dateKey(assignment.effectiveTo);
  if (to && to < at) return false;

  return true;
}

/**
 * Chọn phân công chính đang hiệu lực, ưu tiên bản mới nhất.
 * Không lấy `assignments[0]` một cách mù quáng: dữ liệu có thể có nhiều bản ghi
 * (điều chuyển, kiêm nhiệm) và thứ tự trả về không đảm bảo.
 */
export function pickPrimaryAssignment<T extends PrimaryAssignmentLike>(
  assignments: readonly T[] | null | undefined,
  asOf: Date = new Date()
): T | null {
  const active = (assignments ?? []).filter((assignment) =>
    isPrimaryAssignmentActiveAt(assignment, asOf)
  );
  if (active.length === 0) return null;

  const rank = (assignment: T) => ({
    from: dateKey(assignment.effectiveFrom) ?? "",
    created: dateKey(assignment.createdAt) ?? "",
  });

  return active
    .slice()
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra.from !== rb.from) return rb.from.localeCompare(ra.from);
      if (ra.created !== rb.created) return rb.created.localeCompare(ra.created);
      return 0;
    })[0];
}
