/**
 * attachments.ts — đường dẫn tải tệp đính kèm CÓ XÁC THỨC.
 *
 * Mọi tệp đính kèm nhiệm vụ đều được tải qua route có kiểm tra quyền:
 *   GET /api/tasks/{taskId}/attachments/{attachmentId}/file
 * KHÔNG phát URL công khai của Supabase Storage (bucket phải PRIVATE).
 */

export function attachmentFileUrl(taskId: string, attachmentId: string): string {
  return `/api/tasks/${taskId}/attachments/${attachmentId}/file`;
}

type AttachmentLike = {
  id: string;
  taskId?: string | null;
  fileUrl?: string | null;
};

/**
 * Chuẩn hoá tệp đính kèm trả về cho giao diện: `fileUrl` luôn trỏ về route
 * có xác thực (kể cả khi bản ghi trong DB còn lưu URL công khai cũ).
 */
export function toClientAttachment<T extends AttachmentLike>(
  attachment: T,
  taskId?: string
): T & { fileUrl: string } {
  const tid = taskId || attachment.taskId || "";
  return {
    ...attachment,
    fileUrl: tid ? attachmentFileUrl(tid, attachment.id) : "",
  };
}

/** Chuẩn hoá danh sách tệp đính kèm. */
export function toClientAttachments<T extends AttachmentLike>(
  attachments: T[],
  taskId?: string
): Array<T & { fileUrl: string }> {
  return (attachments || []).map((a) => toClientAttachment(a, taskId));
}
