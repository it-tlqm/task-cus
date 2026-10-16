import webpush from "web-push";
import { prisma } from "./db";

// Loại tin được bắn push ra điện thoại (tránh spam: chỉ việc giao + duyệt/quyết định)
const PUSH_TYPES = new Set([
  "TASK_ASSIGNED",
  "TASK_COMMENT",
  "TASK_ACCEPTED",
  "TASK_COMPLETED",
  "TASK_REJECTED",
  "PLAN_SUBMITTED",
  "PLAN_APPROVED",
  "PLAN_RETURNED",
  "PLAN_AMENDMENT_REQUEST",
  "DEADLINE_REQUEST_PENDING",
  "DEADLINE_REQUEST_APPROVED",
  "DEADLINE_REQUEST_REJECTED",
  "LEAVE_REQUEST_PENDING",
  "LEAVE_APPROVED",
  "LEAVE_REJECTED",
  "LEAVE_HANDOVER",
  "ROUTINE_REMINDER",
]);

let configured = false;
function ensureConfig(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@localhost", pub, priv);
    configured = true;
  }
  return true;
}

/**
 * Bắn push cho 1 thông báo (best-effort, không làm sập luồng chính).
 * Endpoint chết (410/404) thì dọn subscription.
 */
export async function sendPushForNotification(input: {
  recipientId: string;
  type: string;
  title: string;
  content: string;
  actionUrl: string;
  taskCode?: string | null;
}): Promise<void> {
  try {
    if (!PUSH_TYPES.has(input.type)) return;
    if (!ensureConfig()) return;
    const subs = await prisma.pushSubscription.findMany({ where: { personId: input.recipientId } });
    if (subs.length === 0) return;
    const payload = JSON.stringify({
      title: input.title,
      body: input.content.slice(0, 160),
      url: input.actionUrl,
      tag: input.taskCode || input.type,
    });
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          );
        } catch (err: any) {
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          }
        }
      })
    );
  } catch {}
}
