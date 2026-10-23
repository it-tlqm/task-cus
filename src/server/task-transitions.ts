import { SessionUser } from "./auth";
import { AuthorizationError, checkPermission, getAuthorizedUnitIds } from "./guard";

export const TASK_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "WAITING_REVIEW",
  "COMPLETED",
  "DONE",
  "CANCELED",
] as const;

export interface StatusTransitionInput {
  currentStatus: string;
  targetStatus?: string | null;
  deadlineChanged: boolean;
  isLeader: boolean;
  /**
   * Người gọi có phải người chủ trì nhiệm vụ không.
   * - true  : chặn tự nghiệm thu / tự duyệt nhiệm vụ của chính mình.
   * - false : chặn người phối hợp nộp thay / đổi trạng thái nghiệp vụ.
   * - bỏ trống: giữ tương thích cho unit test thuần của guard.
   */
  isOwner?: boolean;
  /** Chỉ luồng "loại nhiệm vụ trùng" có lý do mới được chuyển CANCELED. */
  allowCancel?: boolean;
}

/**
 * F1 (YC-38 — vá lỗ hổng quyền ghi sau nghiệm thu)
 *
 * Các trạng thái KẾT THÚC của nhiệm vụ: đã nghiệm thu (COMPLETED/DONE) hoặc đã loại (CANCELED).
 * Từ các trạng thái này KHÔNG được quay lại trạng thái khác.
 * Chưa xây dựng quy trình mở lại (ngoại lệ) ⇒ chặn tuyệt đối, kể cả với lãnh đạo.
 */
export const TERMINAL_TASK_STATUSES = ["COMPLETED", "DONE", "CANCELED"] as const;

export function isTerminalTaskStatus(status?: string | null): boolean {
  return !!status && (TERMINAL_TASK_STATUSES as readonly string[]).includes(status);
}

/** Nhãn trạng thái kết thúc để hiển thị thông báo. */
export function terminalStatusLabel(status?: string | null): string {
  if (status === "CANCELED") return "đã bị loại";
  return "đã được nghiệm thu hoàn thành";
}

/**
 * Chặn MỌI thao tác ghi nghiệp vụ trên nhiệm vụ đã kết thúc:
 * cập nhật tiến độ, ghi chú, thay đổi trạng thái, ghi đè kết quả thực hiện, nộp lại.
 * Dùng ở mọi đường ghi (không phụ thuộc giao diện).
 */
export function assertTaskNotTerminal(input: { currentStatus: string }): void {
  if (isTerminalTaskStatus(input.currentStatus)) {
    throw new AuthorizationError(
      `Nhiệm vụ ${terminalStatusLabel(input.currentStatus)} — không thể cập nhật tiến độ, thay đổi trạng thái, ghi đè kết quả hoặc nộp lại.`,
      409
    );
  }
}

/**
 * Guard tập trung cho mọi thay đổi status/deadline của Task (Slice 1).
 * Mọi route (tasks/[id] PATCH, tasks PATCH, updates/progress POST) phải đi qua đây.
 */
export function assertTaskStatusTransition(input: StatusTransitionInput): void {
  const { currentStatus, targetStatus, deadlineChanged, isLeader, isOwner, allowCancel } = input;
  const target = targetStatus || null;

  // F1: nguồn là trạng thái KẾT THÚC ⇒ không được chuyển sang trạng thái khác.
  // (Chưa có quy trình mở lại được phê duyệt.)
  if (isTerminalTaskStatus(currentStatus) && target && target !== currentStatus) {
    throw new AuthorizationError(
      `Nhiệm vụ ${terminalStatusLabel(currentStatus)} — không thể mở lại bằng thao tác thông thường.`,
      409
    );
  }

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

  // Dời hạn trực tiếp: chỉ lãnh đạo (cán bộ phải đi luồng xin lùi hạn)
  if (deadlineChanged && !isLeader) {
    throw new AuthorizationError(
      "Bạn không có thẩm quyền dời hạn trực tiếp. Vui lòng gửi đề nghị lùi hạn kèm lý do để Lãnh đạo phê duyệt",
      403
    );
  }

  // Không chỉ định trạng thái (chỉ cập nhật tiến độ/nội dung): hợp lệ sau các guard trên.
  if (!target) return;

  // Whitelist trạng thái — không nhận giá trị lạ từ client.
  if (!(TASK_STATUSES as readonly string[]).includes(target)) {
    throw new AuthorizationError(`Trạng thái nhiệm vụ "${target}" không hợp lệ`, 400);
  }

  // YC-38 B4: chống nộp duyệt lặp — không lặp lại chuyển trạng thái WAITING_REVIEW → WAITING_REVIEW
  if (currentStatus === "WAITING_REVIEW" && target === "WAITING_REVIEW") {
    throw new AuthorizationError(
      "Nhiệm vụ này đã được trình Lãnh đạo phê duyệt — không thể trình lặp lại.",
      409
    );
  }

  // Nghiệm thu hoàn thành: chỉ lãnh đạo, phải đang chờ duyệt, và KHÔNG được tự duyệt.
  if (target === "COMPLETED" || target === "DONE") {
    if (!isLeader) {
      throw new AuthorizationError(
        "Chỉ Lãnh đạo đơn vị hoặc Trưởng bộ phận phụ trách mới có thẩm quyền nghiệm thu xác nhận hoàn thành nhiệm vụ",
        403
      );
    }
    if (isOwner) {
      throw new AuthorizationError(
        "Bạn không thể tự nghiệm thu nhiệm vụ do chính mình chủ trì — cần lãnh đạo khác thẩm quyền.",
        403
      );
    }
    if (currentStatus !== "WAITING_REVIEW") {
      throw new AuthorizationError(
        `Chỉ nghiệm thu được nhiệm vụ đang ở trạng thái "WAITING_REVIEW" (hiện tại: ${currentStatus}).`,
        409
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

  // Trình duyệt: chỉ người chủ trì, không cho người phối hợp nộp thay.
  if (target === "WAITING_REVIEW") {
    if (isOwner === false) {
      throw new AuthorizationError(
        "Chỉ người chủ trì nhiệm vụ mới được nộp kết quả trình Lãnh đạo phê duyệt.",
        403
      );
    }
    if (currentStatus !== "IN_PROGRESS" && currentStatus !== "NOT_STARTED") {
      throw new AuthorizationError(
        `Không thể trình duyệt từ trạng thái "${currentStatus}".`,
        409
      );
    }
    return;
  }

  // Loại nhiệm vụ: chỉ qua thao tác riêng có lý do (CANCEL_DUPLICATE), không nhận status tự do.
  if (target === "CANCELED") {
    if (!allowCancel) {
      throw new AuthorizationError(
        "Không thể tự đặt trạng thái hủy. Vui lòng dùng thao tác loại nhiệm vụ trùng kèm lý do.",
        403
      );
    }
    if (!isLeader) {
      throw new AuthorizationError("Chỉ Lãnh đạo phụ trách mới được loại nhiệm vụ", 403);
    }
    return;
  }

  // Chuyển sang đang thực hiện: nhận việc / cập nhật tiến độ.
  if (target === "IN_PROGRESS" && (currentStatus === "NOT_STARTED" || currentStatus === "IN_PROGRESS")) {
    return;
  }

  throw new AuthorizationError(
    `Chuyển trạng thái nhiệm vụ từ "${currentStatus}" sang "${target}" không hợp lệ.`,
    409
  );
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
