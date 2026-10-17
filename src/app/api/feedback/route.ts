import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, SessionUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { checkPermission, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { unaccentSearchIds } from "@/server/search";
import { createNotification } from "@/server/notifications";

const CATEGORIES = ["GOP_Y", "BAO_LOI", "DE_XUAT"];
const DAILY_LIMIT = 15;

/** Ai được đọc toàn bộ phản hồi: Lãnh đạo đơn vị + quản trị kỹ thuật (audit.view) */
function canReadAll(user: SessionUser): boolean {
  return user.role === "UNIT_LEADER" || checkPermission(user, "audit.view");
}

/**
 * Góp ý & Báo lỗi trong app (gom phản hồi UAT về một mối).
 * POST: công chức gửi — kèm màn hình đang mở + thiết bị để dễ soi lỗi.
 * GET:  lãnh đạo/kỹ thuật xem toàn bộ; công chức chỉ thấy phản hồi của mình.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập để gửi phản hồi", 401);

    const body = await req.json().catch(() => ({}));
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    const category = CATEGORIES.includes(body?.category) ? body.category : "GOP_Y";
    if (content.length < 5) {
      return jsonError("Nội dung quá ngắn — bạn ghi rõ hơn giúp nhé (ít nhất 5 ký tự)", 400);
    }
    if (content.length > 2000) {
      return jsonError("Nội dung quá dài (tối đa 2.000 ký tự)", 400);
    }
    const pagePath = typeof body?.pagePath === "string" ? body.pagePath.slice(0, 300) : null;

    // Chống gửi dồn dập: tối đa 15 phản hồi / người / 24 giờ
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await prisma.feedback.count({
      where: { personId: user.personId, createdAt: { gte: since } },
    });
    if (recent >= DAILY_LIMIT) {
      return jsonError("Bạn đã gửi khá nhiều phản hồi trong hôm nay — cảm ơn bạn, hẹn gặp lại ngày mai", 429);
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
    const userAgent = req.headers.get("user-agent")?.slice(0, 300) || null;

    const feedback = await prisma.feedback.create({
      data: { category, content, pagePath, userAgent, personId: user.personId },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "FEEDBACK_SUBMITTED",
      resourceType: "Feedback",
      resourceId: feedback.id,
      newData: { category, pagePath },
      ipAddress: clientIp,
    });

    // Báo cho người đọc (lãnh đạo đơn vị + kỹ thuật) — best-effort, không chặn gửi
    try {
      const now = new Date();
      const readers = await prisma.account.findMany({
        where: {
          status: "ACTIVE",
          person: { status: "ACTIVE" },
          roleGrants: {
            some: {
              validFrom: { lte: now },
              OR: [{ validTo: null }, { validTo: { gte: now } }],
              role: { code: { in: ["UNIT_LEADER", "SYSTEM_ADMIN"] } },
            },
          },
        },
        select: { personId: true },
      });
      for (const r of readers) {
        await createNotification({
          recipientId: r.personId,
          category: "system",
          type: "FEEDBACK_NEW",
          title: "Phản hồi mới từ phần mềm",
          content: `${user.fullName}: ${content.slice(0, 120)}`,
          tag: "GÓP Ý MỚI",
          tagType: "primary",
          entityType: "FEEDBACK",
          entityId: feedback.id,
          actionUrl: "/admin/feedback",
          actionLabel: "Xem và xử lý",
          idempotencyKey: `EVENT_FEEDBACK_${feedback.id}_${r.personId}`,
        });
      }
    } catch {}

    return NextResponse.json(
      { success: true, message: "Đã gửi phản hồi — cảm ơn bạn!", data: { id: feedback.id } },
      { status: 201 }
    );
  } catch (error: any) {
    return jsonError("Lỗi khi gửi phản hồi: " + error.message, 500);
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const reader = canReadAll(user);

    const { searchParams } = new URL(req.url);

    // Số đếm cho các tab trạng thái
    if (searchParams.get("meta") === "counts") {
      if (!reader) return jsonError("Bạn không có quyền xem phản hồi toàn hệ thống", 403);
      const grouped = await prisma.feedback.groupBy({
        by: ["status"],
        _count: { _all: true },
      });
      const counts: Record<string, number> = { NEW: 0, DONE: 0, total: 0 };
      for (const g of grouped) {
        counts[g.status] = g._count._all;
        counts.total += g._count._all;
      }
      return NextResponse.json({ success: true, counts });
    }

    const status = searchParams.get("status")?.trim() || "";
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(5, parseInt(searchParams.get("pageSize") || "20", 10)));

    const where: any = {};
    if (!reader) where.personId = user.personId; // công chức chỉ thấy phản hồi của chính mình
    if (status && status !== "ALL") where.status = status;
    if (search) {
      // Tìm không dấu theo nội dung phản hồi
      const ids = await unaccentSearchIds("feedbacks", ["content"], search);
      if (!ids || ids.length === 0) {
        return NextResponse.json({
          success: true,
          data: [],
          pagination: { page, pageSize, total: 0, totalPages: 1 },
        });
      }
      where.id = { in: ids };
    }

    const [total, rows] = await Promise.all([
      prisma.feedback.count({ where }),
      prisma.feedback.findMany({
        where,
        include: { person: { select: { id: true, code: true, fullName: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: rows.map((f) => ({
        id: f.id,
        category: f.category,
        content: f.content,
        pagePath: f.pagePath,
        userAgent: f.userAgent,
        status: f.status,
        adminNote: f.adminNote,
        createdAt: f.createdAt.toISOString(),
        resolvedAt: f.resolvedAt ? f.resolvedAt.toISOString() : null,
        senderName: f.person?.fullName || "Không rõ",
        senderCode: f.person?.code || "",
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải phản hồi: " + error.message, 500);
  }
}
