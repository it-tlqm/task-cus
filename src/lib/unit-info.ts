/**
 * Tên đơn vị chính thức theo phản hồi của Hải quan Tà Lùng (10/2026).
 * Mọi nhãn hiển thị dùng hằng số này — không hardcode tên đơn vị rời rạc trong UI.
 */
export const UNIT_OFFICIAL_NAME =
  "Chi cục Hải quan khu vực XVI - Hải quan cửa khẩu Quốc tế Tà Lùng";

export const UNIT_SHORT_NAME = "Hải quan cửa khẩu Quốc tế Tà Lùng";

export const UNIT_ALL_LABEL = `Toàn đơn vị - ${UNIT_SHORT_NAME}`;

export const PARENT_UNIT_NAME = "Chi cục Hải quan khu vực XVI";

/** Nhãn chức danh hiển thị theo mã vai trò (không đổi mã Role/Enum backend). */
export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  UNIT_LEADER: "Trưởng hải quan cửa khẩu",
  DEPARTMENT_LEADER: "Trưởng bộ phận",
  STAFF: "Công chức",
  SYSTEM_ADMIN: "Quản trị hệ thống",
};

export function getRoleDisplayName(roleCode: string): string {
  return ROLE_DISPLAY_NAMES[roleCode] || "Công chức";
}
