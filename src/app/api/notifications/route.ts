import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { syncOperationalAlerts } from "@/server/notifications";

function formatRelativeOrDateTime(d: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "Vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để truy cập hộp thư thông báo", 401);
    }

    if (!user.personId) {
      return jsonError("Tài khoản chưa được liên kết hồ sơ cán bộ", 400);
    }

    // 1. Tự động đồng bộ các cảnh báo vận hành mới vào PostgreSQL cho cán bộ này
    await syncOperationalAlerts(user);

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category"); // all, task, approval, deadline, system
    const isReadParam = searchParams.get("isRead");
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const page = Math.max(Number(searchParams.get("page")) || 1, 1);
    const skip = (page - 1) * limit;

    const where: any = {
      recipientId: user.personId,
      isDismissed: false,
    };

    if (category && category !== "all") {
      where.category = category;
    }

    if (isReadParam !== null && isReadParam !== undefined) {
      if (isReadParam === "false" || isReadParam === "0") {
        where.isRead = false;
      } else if (isReadParam === "true" || isReadParam === "1") {
        where.isRead = true;
      }
    }

    const [notifications, totalCount, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: {
          recipientId: user.personId,
          isDismissed: false,
          isRead: false,
        },
      }),
    ]);

    // Format theo contract chuẩn của NotificationItem
    const formattedData = notifications.map((n) => ({
      id: n.id,
      category: n.category as "task" | "approval" | "deadline" | "system",
      type: n.type,
      title: n.title,
      description: n.content,
      time: formatRelativeOrDateTime(n.createdAt),
      createdAt: n.createdAt.toISOString(),
      isUnread: !n.isRead,
      tag: n.tag,
      tagType: n.tagType as "danger" | "primary" | "success" | "warning",
      taskCode: n.taskCode || undefined,
      actionUrl: n.actionUrl,
      actionLabel: n.actionLabel,
      entityType: n.entityType || undefined,
      entityId: n.entityId || undefined,
    }));

    return NextResponse.json({
      success: true,
      data: formattedData,
      unreadCount,
      totalCount,
      page,
      limit,
    });
  } catch (error: any) {
    console.error("Notifications API error:", error);
    return jsonError("Lỗi hệ thống khi tải thông báo: " + error.message, 500);
  }
}
