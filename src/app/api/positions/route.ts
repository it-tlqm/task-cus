import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để truy cập danh mục chức vụ", 401);
    }

    const positions = await prisma.position.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        status: true,
      },
    });

    return NextResponse.json({ success: true, data: positions });
  } catch (error: any) {
    return jsonError("Lỗi khi tải danh mục chức vụ: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để thực hiện thao tác", 401);
    }
    if (
      !checkPermission(user, "org.manage") &&
      !checkPermission(user, "users.manage") &&
      user.role !== "UNIT_LEADER" &&
      user.role !== "SYSTEM_ADMIN"
    ) {
      return jsonError("Bạn không có quyền quản trị danh mục chức vụ", 403);
    }

    const body = await req.json().catch(() => ({}));
    const { code, title, description } = body;
    if (!code || typeof code !== "string" || !code.trim()) {
      return jsonError("Mã chức vụ là bắt buộc", 400);
    }
    if (!title || typeof title !== "string" || !title.trim()) {
      return jsonError("Tên chức vụ là bắt buộc", 400);
    }
    if (title.trim().length > 120) {
      return jsonError("Tên chức vụ không được vượt quá 120 ký tự", 400);
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = await prisma.position.findUnique({ where: { code: cleanCode } });
    if (existing) {
      return jsonError(`Mã chức vụ "${cleanCode}" đã tồn tại`, 409);
    }

    const position = await prisma.position.create({
      data: {
        code: cleanCode,
        title: title.trim(),
        description: typeof description === "string" && description.trim() ? description.trim() : null,
        status: "ACTIVE",
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "POSITION_CREATE",
      resourceType: "Position",
      resourceId: position.id,
      newData: { code: position.code, title: position.title },
    });

    return NextResponse.json({ success: true, data: position }, { status: 201 });
  } catch (error: any) {
    return jsonError("Lỗi khi thêm chức vụ: " + error.message, 500);
  }
}
