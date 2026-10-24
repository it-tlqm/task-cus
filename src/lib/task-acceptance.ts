/**
 * lib/task-acceptance.ts — Xác định việc đang chờ CHÍNH người dùng hiện tại
 * xác nhận "Nhận việc".
 *
 * Quy tắc:
 *  - Chỉ xét việc người dùng là chủ trì hoặc người phối hợp. Danh sách /my-work
 *    của lãnh đạo có thể trả về việc của cả đơn vị, nên không được chỉ dựa vào
 *    trạng thái chung của Task.
 *  - Chủ trì: Task đang NOT_STARTED và không phải việc tự khởi tạo.
 *  - Phối hợp: phần việc của người đó (TaskParticipantResult) đang NOT_STARTED;
 *    nhận phần việc không đổi trạng thái chung của Task.
 */

import { isSelfInitiated } from "./task-origin";

export interface AcceptanceTaskLike {
  status?: string | null;
  originKind?: string | null;
  owner?: { id: string } | null;
  assignees?: Array<{ person?: { id: string } | null }> | null;
  /** Trạng thái phần việc của người dùng hiện tại (nếu là người phối hợp). */
  myPartStatus?: string | null;
}

export function isMyPendingAcceptance(
  task: AcceptanceTaskLike | null | undefined,
  personId?: string | null
): boolean {
  if (!task || !personId) return false;

  const isOwner = task.owner?.id === personId;
  const isCollaborator = (task.assignees || []).some(
    (a) => a.person?.id === personId
  );
  if (!isOwner && !isCollaborator) return false;

  if (isOwner) {
    return task.status === "NOT_STARTED" && !isSelfInitiated(task.originKind);
  }
  return task.myPartStatus === "NOT_STARTED";
}
