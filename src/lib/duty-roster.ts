/**
 * Quy ước dùng chung cho bảng phân công nhiệm vụ (YC-24).
 *
 * - "Trực trưa" là một NHÓM TRỰC RIÊNG, không tính trùng với trực thường.
 *   Một cán bộ có thể vừa trực thường vừa trực trưa trong cùng ngày.
 * - Mỗi vị trí danh mục được phép thêm tối đa 12 dòng bổ sung RIÊNG CHO NGÀY
 *   đang phân công (không làm thay đổi danh mục dùng cho các ngày khác).
 */

/** Số dòng bổ sung tối đa cho một vị trí trong một ngày. */
export const MAX_EXTRA_SLOTS_PER_POSITION = 12;

/**
 * Nhận diện vị trí "Trực trưa" từ tiêu đề snapshot của phân công.
 * So khớp không dấu, không phân biệt hoa/thường và cho phép tiêu đề có tiền tố
 * (ví dụ: "Trực trưa:", "TRỰC TRƯA — Vị trí cửa Nhập cảnh").
 */
export function isNoonDutyTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const normalized = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.includes("truc trua") || normalized.includes("truc ca trua");
}

/** Nhãn ngắn của nhóm trực để hiển thị trong cảnh báo. */
export function dutyCategoryLabel(title: string | null | undefined): "trực trưa" | "trực thường" {
  return isNoonDutyTitle(title) ? "trực trưa" : "trực thường";
}
