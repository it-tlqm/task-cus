import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

export async function GET() {
  try {
    const groups = await prisma.activityGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        templates: {
          select: {
            id: true,
            reviewStatus: true,
          },
        },
      },
    });

    const data = groups.map((g) => {
      const total = g.templates.length;
      const active = g.templates.filter((t) => t.reviewStatus === "VERIFIED").length;
      const retired = g.templates.filter((t) => t.reviewStatus === "RETIRED").length;
      const needsReview = g.templates.filter((t) => t.reviewStatus === "NEEDS_REVIEW").length;
      return {
        id: g.id,
        code: g.code,
        name: g.name,
        sortOrder: g.sortOrder,
        description: g.description,
        totalCount: total,
        activeCount: active,
        retiredCount: retired,
        needsReviewCount: needsReview,
        _count: { templates: total },
      };
    });

    return NextResponse.json(
      { success: true, data },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error: any) {
    return jsonError("Lỗi khi tải nhóm nghiệp vụ: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để thực hiện thao tác", 401);
    }
    if (!checkPermission(user, "catalog.manage")) {
      return jsonError("Bạn không có quyền quản trị danh mục", 403);
    }

    const body = await req.json().catch(() => ({}));
    const { code, name, description } = body;
    if (!code || typeof code !== "string" || !code.trim()) {
      return jsonError("Mã nhóm nghiệp vụ là bắt buộc", 400);
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return jsonError("Tên nhóm nghiệp vụ là bắt buộc", 400);
    }
    if (name.trim().length > 120) {
      return jsonError("Tên nhóm không được vượt quá 120 ký tự", 400);
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = await prisma.activityGroup.findUnique({ where: { code: cleanCode } });
    if (existing) {
      return jsonError(`Mã nhóm "${cleanCode}" đã tồn tại`, 409);
    }

    const maxSort = await prisma.activityGroup.aggregate({ _max: { sortOrder: true } });
    const maxRow = await prisma.activityGroup.aggregate({ _max: { sourceRow: true } });
    const group = await prisma.activityGroup.create({
      data: {
        code: cleanCode,
        name: name.trim(),
        description: typeof description === "string" ? description.trim() || null : null,
        sortOrder: (maxSort._max.sortOrder || 0) + 1,
        sourceRow: (maxRow._max.sourceRow || 0) + 1,
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "CATALOG_GROUP_CREATE",
      resourceType: "ActivityGroup",
      resourceId: group.id,
      newData: { code: group.code, name: group.name },
    });

    return NextResponse.json({ success: true, data: group }, { status: 201 });
  } catch (error: any) {
    return jsonError("Lỗi khi thêm nhóm nghiệp vụ: " + error.message, 500);
  }
}
