/**
 * Quy tắc hiển thị form "Khai báo đầu việc trong ca" theo vai trò.
 *
 * Đây là quy tắc GIAO DIỆN TẠM THỜI (chưa chốt mapping "lãnh đạo đội / trưởng nhóm /
 * phó nhóm"): API `/api/routine` vẫn cho phép khai báo nếu gọi trực tiếp, server chưa
 * chặn theo vai trò. Khi nghiệp vụ chốt mapping, cập nhật bảng dưới đây và bổ sung
 * guard phía server trong cùng đợt.
 */
export type RoutineDeclarationMode = "HIDDEN" | "COLLAPSED";

/** Vai trò → cách hiển thị form khai báo đầu việc. */
export const ROUTINE_DECLARATION_MODE_BY_ROLE: Record<string, RoutineDeclarationMode> = {
  UNIT_LEADER: "HIDDEN",
  SYSTEM_ADMIN: "HIDDEN",
  DEPARTMENT_LEADER: "COLLAPSED",
  STAFF: "COLLAPSED",
};

/**
 * Lấy cách hiển thị form theo vai trò.
 * - Vai trò đã biết: theo bảng mapping.
 * - Chưa đăng nhập xong / vai trò lạ: mặc định thu gọn — không chặn oan người có
 *   nhu cầu khai báo; backend vẫn là chốt chặn cuối cùng.
 */
export function getRoutineDeclarationMode(
  role: string | null | undefined
): RoutineDeclarationMode {
  if (!role) return "COLLAPSED";
  return ROUTINE_DECLARATION_MODE_BY_ROLE[role] ?? "COLLAPSED";
}

/** Vai trò này có được phép thấy form khai báo đầu việc hay không. */
export function canDeclareRoutine(role: string | null | undefined): boolean {
  return getRoutineDeclarationMode(role) !== "HIDDEN";
}
