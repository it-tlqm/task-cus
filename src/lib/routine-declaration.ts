/**
 * Quy tắc hiển thị form "Khai báo đầu việc trong ca" theo vai trò.
 *
 * Đây là quy tắc GIAO DIỆN TẠM THỜI (chưa chốt mapping "lãnh đạo đội / trưởng nhóm /
 * phó nhóm"): API `/api/routine` vẫn cho phép khai báo nếu gọi trực tiếp, server chưa
 * chặn theo vai trò. Khi nghiệp vụ chốt mapping, cập nhật bảng dưới đây và bổ sung
 * guard phía server trong cùng đợt.
 */
export type RoutineDeclarationMode = "HIDDEN" | "COLLAPSED";

/**
 * Trạng thái hiển thị của khu vực khai báo:
 * - `LOADING`: chưa biết vai trò → chỉ hiện placeholder, KHÔNG hiện form/nút 1-chạm.
 * - `UNKNOWN`: đã tải xong nhưng không có phiên/vai trò → không hiện form (tránh lộ
 *   form cho lãnh đạo khi `/api/auth/me` lỗi); danh sách vẫn hiển thị.
 * - `HIDDEN` / `COLLAPSED`: theo mapping vai trò.
 */
export type RoutineDeclarationState = RoutineDeclarationMode | "LOADING" | "UNKNOWN";

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

/**
 * Chốt trạng thái hiển thị sau khi đã biết quyền đang tải hay chưa.
 *
 * Quan trọng: khi `loading` còn true, luôn trả `LOADING` dù `role` truyền vào là gì.
 * Nhờ vậy lãnh đạo không thấy form/nút 1-chạm trong lúc chờ `/api/auth/me`
 * (chống flash khai báo ở lần tải nguội).
 */
export function resolveRoutineDeclarationState(
  loading: boolean,
  role: string | null | undefined
): RoutineDeclarationState {
  if (loading) return "LOADING";
  // Đã tải xong nhưng không có user/vai trò: không thể xác nhận đây là người được
  // khai báo (ví dụ /api/auth/me lỗi) → không hiện form; không đoán bừa.
  if (!role) return "UNKNOWN";
  return getRoutineDeclarationMode(role);
}
