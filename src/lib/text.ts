/**
 * text.ts — chuẩn hoá chuỗi tiếng Việt phục vụ TÌM KIẾM (không phụ thuộc extension DB).
 *
 * Vì sao: DB demo/local không bật extension `unaccent` của PostgreSQL
 * (Production có). Nếu dựa vào `unaccent()` ở SQL thì tìm kiếm hỏng.
 * Vì vậy phần "bỏ dấu" được thực hiện ở TẦNG ỨNG DỤNG, hoạt động ở mọi DB.
 */

/** Bỏ dấu tiếng Việt + hạ chữ thường, giữ lại chữ/số, gộp khoảng trắng. */
export function stripDiacritics(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  try {
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch {
    /* môi trường không hỗ trợ normalize → dùng bảng thay thế bên dưới */
  }
  // Các ký tự đặc biệt còn lại sau NFD (đ, Đ)
  s = s.replace(/[đĐ]/g, "d");
  return s.toLowerCase();
}

/** Chuẩn hoá để so khớp: bỏ dấu, bỏ ký tự đặc biệt, gộp khoảng trắng. */
export function normalizeForSearch(value: unknown): string {
  return stripDiacritics(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tách thành danh sách từ đã chuẩn hoá (dùng để so khớp tên bộ phận). */
export function searchTokens(value: unknown): string[] {
  return normalizeForSearch(value).split(" ").filter(Boolean);
}
