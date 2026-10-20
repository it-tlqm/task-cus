/**
 * YC-32 — Kiểm soát tệp minh chứng công việc.
 * - Chỉ nhận định dạng tài liệu/ảnh phổ biến; chặn tệp thực thi.
 * - Giới hạn dung lượng (mặc định 4 MB để tương thích Vercel; đổi bằng WORK_EVIDENCE_MAX_MB).
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
  const mb = Number(process.env.WORK_EVIDENCE_MAX_MB || 4);
  const safe = Number.isFinite(mb) && mb > 0 && mb <= 100 ? mb : 4;
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

function startsWith(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) return false;
  return signature.every((b, i) => buffer[i] === b);
}

function containsUtf16Le(buffer: Buffer, text: string): boolean {
  return buffer.includes(Buffer.from(text, "utf16le"));
}

/**
 * Kiểm tra nội dung thực của tệp (magic bytes), không tin phần mở rộng/Content-Type
 * do trình duyệt gửi. Trả về MIME chuẩn hóa để lưu DB và dùng cho header tải xuống.
 */
export function validateEvidenceContent(
  buffer: Buffer,
  fileName: string
): { ok: true; mimeType: string } | { ok: false; message: string } {
  const ext = getExtension(fileName);
  if (!EVIDENCE_ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, message: `Định dạng .${ext} không được phép` };
  }
  if (!buffer || buffer.length === 0) return { ok: false, message: "Tệp rỗng" };
  const max = getMaxEvidenceBytes();
  if (buffer.length > max) {
    return { ok: false, message: `Tệp vượt quá giới hạn ${Math.round(max / 1024 / 1024)} MB` };
  }

  const expectedMime = MIME_BY_EXT[ext] || "application/octet-stream";
  const isPdf = startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
  const isZip = startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(buffer, [0x50, 0x4b, 0x07, 0x08]);
  const isOle = startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const isJpg = startsWith(buffer, [0xff, 0xd8, 0xff]);
  const isPng = startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP";

  if (ext === "pdf") {
    if (!isPdf) return { ok: false, message: "Tệp không phải PDF hợp lệ (thiếu chữ ký %PDF-)" };
    return { ok: true, mimeType: expectedMime };
  }
  if (["docx", "xlsx", "pptx"].includes(ext)) {
    if (!isZip || !buffer.includes(Buffer.from("[Content_Types].xml"))) {
      return {
        ok: false,
        message: `Tệp .${ext} không phải tài liệu Office Open XML hợp lệ`,
      };
    }
    return { ok: true, mimeType: expectedMime };
  }
  if (["doc", "xls", "ppt"].includes(ext)) {
    if (!isOle) {
      return { ok: false, message: `Tệp .${ext} không phải tài liệu Office cũ hợp lệ (thiếu chữ ký OLE)` };
    }
    const streamHint =
      ext === "doc"
        ? "WordDocument"
        : ext === "xls"
          ? "Workbook"
          : "PowerPoint Document";
    if (!containsUtf16Le(buffer, streamHint)) {
      return {
        ok: false,
        message: `Nội dung tệp không khớp phần mở rộng .${ext}`,
      };
    }
    return { ok: true, mimeType: expectedMime };
  }
  if (ext === "jpg" || ext === "jpeg") {
    if (!isJpg) return { ok: false, message: "Tệp không phải ảnh JPEG hợp lệ" };
    return { ok: true, mimeType: "image/jpeg" };
  }
  if (ext === "png") {
    if (!isPng) return { ok: false, message: "Tệp không phải ảnh PNG hợp lệ" };
    return { ok: true, mimeType: expectedMime };
  }
  if (ext === "webp") {
    if (!isWebp) return { ok: false, message: "Tệp không phải ảnh WEBP hợp lệ" };
    return { ok: true, mimeType: expectedMime };
  }
  if (ext === "txt") {
    if (buffer.includes(0)) return { ok: false, message: "Tệp TXT chứa dữ liệu nhị phân" };
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      return { ok: false, message: "Tệp TXT không phải văn bản UTF-8 hợp lệ" };
    }
    const control = buffer.reduce((count, b) => {
      if (b === 9 || b === 10 || b === 13) return count;
      return b < 32 || b === 127 ? count + 1 : count;
    }, 0);
    if (control > 0) return { ok: false, message: "Tệp TXT chứa ký tự điều khiển không hợp lệ" };
    return { ok: true, mimeType: expectedMime };
  }

  return { ok: false, message: `Không xác định được định dạng tệp .${ext}` };
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
