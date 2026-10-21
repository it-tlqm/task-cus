import { SessionUser } from "./auth";
import { AuthorizationError, checkPermission, getAuthorizedUnitIds } from "./guard";

export interface StatusTransitionInput {
  currentStatus: string;
  targetStatus?: string | null;
  deadlineChanged: boolean;
  isLeader: boolean;
}

/**
 * Guard tập trung cho mọi thay đổi status/deadline của Task (Slice 1).
 * Mọi route (tasks/[id] PATCH, tasks PATCH, updates/progress POST) phải đi qua đây.
 */
export function assertTaskStatusTransition(input: StatusTransitionInput): void {
  const { currentStatus, targetStatus, deadlineChanged, isLeader } = input;
  const target = targetStatus || null;

  // Chống phê duyệt lặp lại
  if (
    (currentStatus === "COMPLETED" || currentStatus === "DONE") &&
    (target === "COMPLETED" || target === "DONE")
  ) {
    throw new AuthorizationError(
      "Nhiệm vụ này đã được nghiệm thu hoàn thành trước đó (COMPLETED), không thể phê duyệt lại",
      400
    );
  }

  // YC-38 B4: chống nộp duyệt lặp — không lặp lại chuyển trạng thái WAITING_REVIEW → WAITING_REVIEW
  if (currentStatus === "WAITING_REVIEW" && target === "WAITING_REVIEW") {
    throw new AuthorizationError(
      "Nhiệm vụ này đã được trình Lãnh đạo phê duyệt — không thể trình lặp lại.",
      409
    );
  }

  // Nghiệm thu hoàn thành: chỉ lãnh đạo
  if (target === "COMPLETED" || target === "DONE") {
    if (!isLeader) {
      throw new AuthorizationError(
        "Chỉ Lãnh đạo đơn vị hoặc Trưởng bộ phận phụ trách mới có thẩm quyền nghiệm thu xác nhận hoàn thành nhiệm vụ",
        403
      );
    }
    return;
  }

  // Trả lại từ WAITING_REVIEW về IN_PROGRESS: chỉ lãnh đạo
  if (currentStatus === "WAITING_REVIEW" && target === "IN_PROGRESS") {
    if (!isLeader) {
      throw new AuthorizationError(
        "Chỉ Lãnh đạo mới có thẩm quyền yêu cầu giải trình hoặc trả lại kết quả nhiệm vụ",
        403
      );
    }
    return;
  }

  // Dời hạn trực tiếp: chỉ lãnh đạo (cán bộ phải đi luồng xin lùi hạn)
  if (deadlineChanged && !isLeader) {
    throw new AuthorizationError(
      "Bạn không có thẩm quyền dời hạn trực tiếp. Vui lòng gửi đề nghị lùi hạn kèm lý do để Lãnh đạo phê duyệt",
      403
    );
  }
}

/**
 * Xác định người gọi có phải lãnh đạo phụ trách đơn vị của task không.
 */
export async function isTaskLeader(user: SessionUser, unitId: string): Promise<boolean> {
  if (user.role === "UNIT_LEADER") return true;
  const authorizedUnits = await getAuthorizedUnitIds(user);
  const isUnitAuthorized = authorizedUnits === "ALL" || authorizedUnits.includes(unitId);
  return (
    (user.role === "DEPARTMENT_LEADER" && isUnitAuthorized) ||
    checkPermission(user, "tasks.approve")
  );
}
