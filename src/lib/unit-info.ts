/**
 * Tên đơn vị chính thức theo phản hồi của Hải quan Tà Lùng (10/2026).
 * Mọi nhãn hiển thị dùng hằng số này — không hardcode tên đơn vị rời rạc trong UI.
 */
export const UNIT_OFFICIAL_NAME = "Hải quan cửa khẩu Quốc tế Tà Lùng";

export const UNIT_SHORT_NAME = "Hải quan cửa khẩu Quốc tế Tà Lùng";

export const UNIT_ALL_LABEL = `Toàn đơn vị - ${UNIT_SHORT_NAME}`;

/** Nhãn chức danh hiển thị theo mã vai trò (không đổi mã Role/Enum backend).
 *  Lưu ý: đây là nhãn DỰ PHÒNG khi chưa gán chức vụ (position).
 *  Chức danh chính xác (Trưởng/Phó Trưởng hải quan cửa khẩu…) lấy từ position.title. */
export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  UNIT_LEADER: "Lãnh đạo đơn vị",
  DEPARTMENT_LEADER: "Lãnh đạo bộ phận",
  STAFF: "Công chức",
  SYSTEM_ADMIN: "Quản trị hệ thống",
};

export function getRoleDisplayName(roleCode: string): string {
  return ROLE_DISPLAY_NAMES[roleCode] || "Công chức";
}
