import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId");
    const search = searchParams.get("q");
    const reviewStatus = searchParams.get("reviewStatus") || searchParams.get("status");
    const activeOnly = searchParams.get("activeOnly") === "true";

    const where: any = {};

    if (groupId && groupId !== "ALL") {
      where.groupId = groupId;
    }

    if (activeOnly) {
      where.reviewStatus = "VERIFIED";
    } else if (reviewStatus && reviewStatus !== "ALL") {
      where.reviewStatus = reviewStatus;
    }

    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { sourceRawText: { contains: search, mode: "insensitive" } },
      ];
    }

    const templates = await prisma.activityTemplate.findMany({
      where,
      orderBy: [{ sourceRow: "asc" }, { code: "asc" }],
      include: {
        group: true,
        _count: {
          select: {
            workItems: true,
            routines: true,
          },
        },
      },
    });

    const enriched = templates.map((t) => ({
      ...t,
      usageCount: (t._count?.workItems || 0) + (t._count?.routines || 0),
    }));

    return NextResponse.json(
      { success: true, data: enriched, total: enriched.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error: any) {
    return jsonError("Lỗi khi tải danh mục đầu việc mẫu: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để thực hiện thao tác", 401);
    }

    const canManage = checkPermission(user, "catalog.manage");
    if (!canManage) {
      return jsonError("Bạn không có quyền quản trị danh mục đầu việc mẫu", 403);
    }

    const body = await req.json().catch(() => ({}));

    // 1. Nếu là thao tác hàng loạt (Batch approval/reset)
    if (body.action === "APPROVE_ALL" || body.action === "RESET_REVIEW") {
      const newStatus = body.action === "RESET_REVIEW" ? "NEEDS_REVIEW" : "VERIFIED";

      const updateResult = await prisma.activityTemplate.updateMany({
        data: {
          reviewStatus: newStatus,
        },
      });

      await prisma.auditEvent.create({
        data: {
          action: body.action === "RESET_REVIEW" ? "CATALOG_RESET" : "CATALOG_APPROVED",
          resourceType: "ActivityTemplate",
          actorId: user.id,
          newData: {
            actorName: user.fullName || user.username,
            actorRole: user.role,
            updatedCount: updateResult.count,
            status: newStatus,
            timestamp: new Date().toISOString(),
          },
        },
      });

      return NextResponse.json({
        success: true,
        message: `Đã cập nhật trạng thái ${updateResult.count} hoạt động mẫu thành ${newStatus}`,
        status: newStatus,
        count: updateResult.count,
      });
    }

    // 2. Thao tác thêm mới một ActivityTemplate
    const {
      code,
      title,
      groupId,
      description,
      sourceRawText,
      defaultPriority = "Trung bình",
      reportingMode = "EVERY_PERIOD",
      reviewStatus = "VERIFIED",
    } = body;

    if (!code || typeof code !== "string" || !code.trim()) {
      return jsonError("Mã hoạt động mẫu là bắt buộc", 400);
    }

    if (!title || typeof title !== "string" || !title.trim()) {
      return jsonError("Tên hoạt động mẫu là bắt buộc", 400);
    }

    if (!groupId || typeof groupId !== "string" || !groupId.trim()) {
      return jsonError("Nhóm nghiệp vụ là bắt buộc", 400);
    }

    const cleanCode = code.trim().toUpperCase();

    // Kiểm tra trùng mã code
    const existingCode = await prisma.activityTemplate.findUnique({
      where: { code: cleanCode },
    });
    if (existingCode) {
      return jsonError(`Mã hoạt động mẫu "${cleanCode}" đã tồn tại trong danh mục`, 409);
    }

    // Kiểm tra nhóm nghiệp vụ tồn tại
    const group = await prisma.activityGroup.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      return jsonError("Nhóm nghiệp vụ được chọn không tồn tại trong hệ thống", 400);
    }

    // Tìm sourceRow cao nhất
    const maxRow = await prisma.activityTemplate.aggregate({
      _max: { sourceRow: true },
    });
    const nextRow = (maxRow._max.sourceRow || 0) + 1;

    const newTemplate = await prisma.activityTemplate.create({
      data: {
        code: cleanCode,
        title: title.trim(),
        groupId,
        description: description?.trim() || null,
        sourceRawText: sourceRawText?.trim() || title.trim(),
        sourceRow: nextRow,
        defaultPriority,
        reportingMode,
        reviewStatus,
      },
      include: {
        group: true,
      },
    });

    await prisma.auditEvent.create({
      data: {
        action: "CATALOG_TEMPLATE_CREATE",
        resourceType: "ActivityTemplate",
        resourceId: newTemplate.id,
        actorId: user.id,
        newData: {
          actorName: user.fullName || user.username,
          actorRole: user.role,
          id: newTemplate.id,
          code: newTemplate.code,
          title: newTemplate.title,
          groupId: newTemplate.groupId,
          groupName: group.name,
          reportingMode: newTemplate.reportingMode,
          reviewStatus: newTemplate.reviewStatus,
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: newTemplate,
        message: `Đã thêm mới thành công hoạt động mẫu "${newTemplate.code} - ${newTemplate.title}"`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return jsonError("Lỗi khi xử lý danh mục đầu việc: " + error.message, 500);
  }
}
