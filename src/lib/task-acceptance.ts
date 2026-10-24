/**
 * lib/task-acceptance.ts — Xác định việc đang chờ CHÍNH người dùng hiện tại
 * xác nhận "Nhận việc".
 *
 * Quy tắc:
 *  - Chỉ xét việc người dùng là chủ trì hoặc người phối hợp. Danh sách /my-work
 *    của lãnh đạo có thể trả về việc của cả đơn vị, nên không được chỉ dựa vào
 *    trạng thái chung của Task.
 *  - Việc tự khởi tạo không có bước nhận việc (server trả 400) — áp dụng mọi vai trò.
 *  - Task đã kết thúc (COMPLETED/DONE/CANCELED) không được nhận.
 *  - Chủ trì: Task đang NOT_STARTED.
 *  - Phối hợp: phần việc của người đó đang NOT_STARTED và Task còn mở để nhận
 *    (NOT_STARTED hoặc IN_PROGRESS; không nhận khi WAITING_REVIEW).
 */

import { isSelfInitiated } from "./task-origin";

const TERMINAL_STATUSES = ["COMPLETED", "DONE", "CANCELED"];

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
  if (isSelfInitiated(task.originKind)) return false;
  if (task.status && TERMINAL_STATUSES.includes(task.status)) return false;

  const isOwner = task.owner?.id === personId;
  const isCollaborator = (task.assignees || []).some(
    (a) => a.person?.id === personId
  );
  if (!isOwner && !isCollaborator) return false;

  if (isOwner) {
    return task.status === "NOT_STARTED";
  }

  return (
    task.myPartStatus === "NOT_STARTED" &&
    (task.status === "NOT_STARTED" || task.status === "IN_PROGRESS")
  );
}
