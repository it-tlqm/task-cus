/**
 * YC-32 — Kiểm soát tệp minh chứng công việc.
 * - Chỉ nhận định dạng tài liệu/ảnh phổ biến; chặn tệp thực thi.
 * - Giới hạn dung lượng (mặc định 20 MB, đổi bằng WORK_EVIDENCE_MAX_MB).
 * - Tên tệp được làm sạch trước khi lưu/đặt header tải xuống.
 */

export const EVIDENCE_ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "txt",
]);

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  txt: "text/plain",
};

export function getMaxEvidenceBytes(): number {
  const mb = Number(process.env.WORK_EVIDENCE_MAX_MB || 20);
  const safe = Number.isFinite(mb) && mb > 0 && mb <= 100 ? mb : 20;
  return Math.round(safe * 1024 * 1024);
}

export function sanitizeEvidenceFileName(name: string): string {
  const base = String(name || "tep-minh-chung")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (base || "tep-minh-chung").slice(0, 180);
}

export function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : "";
}

export function validateEvidenceFile(
  fileName: string,
  size: number
): { ok: true; ext: string; mimeType: string } | { ok: false; message: string } {
  const ext = getExtension(fileName);
  if (!ext) return { ok: false, message: "Tệp không có phần mở rộng — không thể kiểm tra định dạng" };
  if (!EVIDENCE_ALLOWED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      message: `Định dạng .${ext} không được phép. Chỉ nhận: PDF, Word, Excel, PowerPoint, ảnh (JPG/PNG/WEBP), TXT.`,
    };
  }
  if (!size || size <= 0) return { ok: false, message: "Tệp rỗng" };
  const max = getMaxEvidenceBytes();
  if (size > max) {
    return { ok: false, message: `Tệp vượt quá giới hạn ${Math.round(max / 1024 / 1024)} MB` };
  }
  return { ok: true, ext, mimeType: MIME_BY_EXT[ext] || "application/octet-stream" };
}

/** Header Content-Disposition an toàn cho tên tệp tiếng Việt (RFC 5987). */
export function contentDispositionAttachment(fileName: string): string {
  const clean = sanitizeEvidenceFileName(fileName);
  const fallback = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}
