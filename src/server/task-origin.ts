/**
 * server/task-origin.ts — Quy tắc xác định nguồn phát sinh (chỉ chạy ở server).
 * Phần nhãn/hàm dùng chung nằm ở `src/lib/task-origin.ts`.
 */
import {
  ORIGIN_KIND,
  SELF_DECLARABLE,
  type OriginKind,
} from "@/lib/task-origin";

export {
  ORIGIN_KIND,
  ORIGIN_LABEL,
  ORIGIN_SHORT,
  SELF_DECLARABLE,
  isOriginKind,
  isSelfInitiated,
  originLabel,
  originShort,
} from "@/lib/task-origin";
export type { OriginKind };

/**
 * Xác định nguồn phát sinh — quyết định ở SERVER, không tin giá trị client.
 * @param requested giá trị client tự khai (SELF_INITIATED | OUTSIDE_DIRECTIVE | PLAN | …)
 */
export function resolveOriginKind(args: {
  actorRole: string;
  actorPersonId: string;
  ownerPersonId: string;
  requested?: string | null;
}): { originKind: OriginKind; downgraded: boolean } {
  const requested = (args.requested || "").trim().toUpperCase() as OriginKind | "";
  const isLeader =
    args.actorRole === "UNIT_LEADER" || args.actorRole === "DEPARTMENT_LEADER";

  // Lệnh giao chính thức: lãnh đạo giao cho người KHÁC ⇒ có bằng chứng trên hệ thống
  if (isLeader && args.ownerPersonId && args.ownerPersonId !== args.actorPersonId) {
    return { originKind: ORIGIN_KIND.LEADER_ASSIGNED, downgraded: false };
  }

  // Không được tự khai lệnh giao chính thức hay nguồn văn bản/giao ban
  if (requested === ORIGIN_KIND.LEADER_ASSIGNED || requested === ORIGIN_KIND.DOCUMENT_MEETING) {
    return { originKind: ORIGIN_KIND.OUTSIDE_DIRECTIVE, downgraded: true };
  }

  if (requested && (SELF_DECLARABLE as string[]).includes(requested)) {
    return { originKind: requested as OriginKind, downgraded: false };
  }

  return { originKind: ORIGIN_KIND.SELF_INITIATED, downgraded: false };
}
