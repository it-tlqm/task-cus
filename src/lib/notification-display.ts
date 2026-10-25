export type NotificationTagType = "danger" | "primary" | "success" | "warning";

export interface NotificationDisplaySource {
  type: string;
  tag: string;
  tagType: NotificationTagType;
  title: string;
  content: string;
  actionUrl: string;
  actionLabel: string;
  task?: {
    id: string;
    code: string;
    title: string;
    status: string;
  } | null;
}

export interface NotificationDisplay {
  tag: string;
  tagType: NotificationTagType;
  title: string;
  content: string;
  actionUrl: string;
  actionLabel: string;
}

/**
 * Thông báo "chờ nghiệm thu" được tạo lúc công chức báo hoàn thành.
 * Khi lãnh đạo đã duyệt/trả lại/hủy, thông báo cũ vẫn còn trong DB.
 * Hàm này đọc trạng thái hiện tại của nhiệm vụ để hiển thị nhãn đúng,
 * không cần sửa hàng loạt bản ghi notification cũ.
 */
export function resolveNotificationDisplay(source: NotificationDisplaySource): NotificationDisplay {
  const base: NotificationDisplay = {
    tag: source.tag,
    tagType: source.tagType,
    title: source.title,
    content: source.content,
    actionUrl: source.actionUrl,
    actionLabel: source.actionLabel,
  };

  if (source.type !== "TASK_WAITING_REVIEW" || !source.task) return base;

  const { task } = source;
  switch (task.status) {
    case "WAITING_REVIEW":
      return {
        tag: "CHỜ NGHIỆM THU",
        tagType: "warning",
        title: source.title,
        content: source.content,
        actionUrl: source.actionUrl || `/tasks/${task.id}`,
        actionLabel: source.actionLabel || "Nghiệm thu kết quả",
      };
    case "COMPLETED":
    case "DONE":
      return {
        tag: "ĐÃ PHÊ DUYỆT",
        tagType: "success",
        title: `Nhiệm vụ đã được phê duyệt: [${task.code}]`,
        content: `Lãnh đạo đã phê duyệt kết quả nhiệm vụ '${task.title}'.`,
        actionUrl: `/tasks/${task.id}`,
        actionLabel: "Xem kết quả",
      };
    case "CANCELED":
      return {
        tag: "ĐÃ HỦY",
        tagType: "danger",
        title: `Nhiệm vụ đã bị hủy: [${task.code}]`,
        content: `Nhiệm vụ '${task.title}' đã bị hủy, không cần nghiệm thu.`,
        actionUrl: `/tasks/${task.id}`,
        actionLabel: "Xem nhiệm vụ",
      };
    default:
      return {
        tag: "ĐÃ XỬ LÝ",
        tagType: "primary",
        title: `Nhiệm vụ đã được xử lý: [${task.code}]`,
        content: `Nhiệm vụ '${task.title}' đã được xử lý, không còn chờ nghiệm thu.`,
        actionUrl: `/tasks/${task.id}`,
        actionLabel: "Xem nhiệm vụ",
      };
  }
}
