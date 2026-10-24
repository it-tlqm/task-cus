/**
 * lib/task-origin.ts — Nguồn phát sinh của nhiệm vụ (YC-38, UAT fix) — dùng chung client/server.
 *
 * ⚠️ KHÔNG thay thế `tasks.source_kind`:
 *   - `source_kind`  = NGUỒN DANH MỤC (TX_CATALOG / QD1277_PRODUCT / …) — theo thiết kế YC-38C.
 *   - `origin_kind`  = NGUỒN PHÁT SINH của nhiệm vụ (tự khởi tạo / lãnh đạo giao / kế hoạch / văn bản).
 *
 * Quy tắc:
 *  - Lệnh giao CHÍNH THỨC chỉ có khi LÃNH ĐẠO giao cho người khác (có bằng chứng trên hệ thống).
 *  - Cán bộ tự khai "lãnh đạo giao" ⇒ ghi nhận là `OUTSIDE_DIRECTIVE`
 *    (tự ghi nhận theo chỉ đạo ngoài hệ thống) — KHÔNG tạo bằng chứng lệnh giao chính thức.
 *  - Dữ liệu lịch sử chưa có `origin_kind` (NULL) ⇒ giữ nguyên hành vi cũ, nhãn "Chưa xác định nguồn".
 */

export const ORIGIN_KIND = {
  SELF_INITIATED: "SELF_INITIATED",
  LEADER_ASSIGNED: "LEADER_ASSIGNED",
  PLAN: "PLAN",
  DOCUMENT_MEETING: "DOCUMENT_MEETING",
  OUTSIDE_DIRECTIVE: "OUTSIDE_DIRECTIVE",
  UNKNOWN: "UNKNOWN",
} as const;

export type OriginKind = (typeof ORIGIN_KIND)[keyof typeof ORIGIN_KIND];

export const ORIGIN_LABEL: Record<OriginKind, string> = {
  SELF_INITIATED: "Công việc tự khởi tạo",
  LEADER_ASSIGNED: "Nhiệm vụ do lãnh đạo giao",
  PLAN: "Công việc từ kế hoạch",
  DOCUMENT_MEETING: "Công việc từ văn bản/giao ban",
  OUTSIDE_DIRECTIVE: "Công việc tự ghi nhận theo chỉ đạo ngoài hệ thống",
  UNKNOWN: "Chưa xác định nguồn phát sinh",
};

export const ORIGIN_SHORT: Record<OriginKind, string> = {
  SELF_INITIATED: "Tự khởi tạo",
  LEADER_ASSIGNED: "Lãnh đạo giao",
  PLAN: "Từ kế hoạch",
  DOCUMENT_MEETING: "Văn bản/giao ban",
  OUTSIDE_DIRECTIVE: "Tự ghi nhận theo chỉ đạo",
  UNKNOWN: "Chưa xác định",
};

/** Các loại nguồn người dùng được phép TỰ KHAI (không phải lệnh giao chính thức). */
export const SELF_DECLARABLE: OriginKind[] = [
  ORIGIN_KIND.SELF_INITIATED,
  ORIGIN_KIND.OUTSIDE_DIRECTIVE,
  ORIGIN_KIND.PLAN,
];

export function isOriginKind(value: unknown): value is OriginKind {
  return typeof value === "string" && (ORIGIN_KIND as Record<string, string>)[value] !== undefined;
}

/**
 * Việc tự khởi tạo (tự ghi nhận) — KHÔNG có bước "xác nhận nhận việc".
 * Dữ liệu lịch sử (origin_kind = NULL) KHÔNG thuộc nhóm này ⇒ giữ hành vi cũ.
 */
export function isSelfInitiated(originKind?: string | null): boolean {
  return originKind === ORIGIN_KIND.SELF_INITIATED || originKind === ORIGIN_KIND.OUTSIDE_DIRECTIVE;
}

/**
 * Công việc được giao đang chờ người được giao xác nhận "Nhận việc".
 * Việc tự khởi tạo/tự ghi nhận không có bước này.
 */
export function isAwaitingAcceptance(
  status?: string | null,
  originKind?: string | null
): boolean {
  return status === "NOT_STARTED" && !isSelfInitiated(originKind);
}

export function originLabel(originKind?: string | null): string {
  if (!originKind || !isOriginKind(originKind)) return ORIGIN_LABEL.UNKNOWN;
  return ORIGIN_LABEL[originKind];
}

export function originShort(originKind?: string | null): string {
  if (!originKind || !isOriginKind(originKind)) return ORIGIN_SHORT.UNKNOWN;
  return ORIGIN_SHORT[originKind];
}

