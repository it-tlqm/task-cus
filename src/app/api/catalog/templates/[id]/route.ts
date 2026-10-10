import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const template = await prisma.activityTemplate.findUnique({
      where: { id },
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

    if (!template) {
      return jsonError("Không tìm thấy hoạt động mẫu", 404);
    }

    const usageCount = (template._count?.workItems || 0) + (template._count?.routines || 0);

    return NextResponse.json({
      success: true,
      data: {
        ...template,
        usageCount,
      },
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải thông tin hoạt động mẫu: " + error.message, 500);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để thực hiện thao tác", 401);
    }

    const canManage = checkPermission(user, "catalog.manage");
    if (!canManage) {
      return jsonError("Bạn không có quyền quản trị danh mục đầu việc mẫu", 403);
    }

    const { id } = await params;
    const template = await prisma.activityTemplate.findUnique({
      where: { id },
      include: { group: true },
    });

    if (!template) {
      return jsonError("Không tìm thấy hoạt động mẫu để cập nhật", 404);
    }

    const body = await req.json().catch(() => ({}));
    const {
      title,
      description,
      groupId,
      defaultPriority,
      reportingMode,
      reviewStatus,
      sourceRawText,
    } = body;

    if (title !== undefined && (!title || typeof title !== "string" || !title.trim())) {
      return jsonError("Tên hoạt động mẫu không được để trống", 400);
    }

    if (groupId) {
      const groupExists = await prisma.activityGroup.findUnique({
        where: { id: groupId },
      });
      if (!groupExists) {
        return jsonError("Nhóm nghiệp vụ được chọn không tồn tại trong hệ thống", 400);
      }
    }

    const updated = await prisma.activityTemplate.update({
      where: { id },
      data: {
        title: title ? title.trim() : undefined,
        description: description !== undefined ? description?.trim() || null : undefined,
        groupId: groupId || undefined,
        defaultPriority: defaultPriority || undefined,
        reportingMode: reportingMode || undefined,
        reviewStatus: reviewStatus || undefined,
        sourceRawText: sourceRawText !== undefined ? sourceRawText?.trim() || title?.trim() : undefined,
      },
      include: {
        group: true,
      },
    });

    await prisma.auditEvent.create({
      data: {
        action: "CATALOG_TEMPLATE_UPDATE",
        resourceType: "ActivityTemplate",
        resourceId: id,
        actorId: user.id,
        oldData: {
          title: template.title,
          groupId: template.groupId,
          reportingMode: template.reportingMode,
          reviewStatus: template.reviewStatus,
        },
        newData: {
          actorName: user.fullName || user.username,
          actorRole: user.role,
          title: updated.title,
          groupId: updated.groupId,
          reportingMode: updated.reportingMode,
          reviewStatus: updated.reviewStatus,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Đã cập nhật thông tin hoạt động mẫu "${updated.code}"`,
    });
  } catch (error: any) {
    return jsonError("Lỗi khi cập nhật hoạt động mẫu: " + error.message, 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để thực hiện thao tác", 401);
    }

    const canManage = checkPermission(user, "catalog.manage");
    if (!canManage) {
      return jsonError("Bạn không có quyền quản trị danh mục đầu việc mẫu", 403);
    }

    const { id } = await params;
    const template = await prisma.activityTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return jsonError("Không tìm thấy hoạt động mẫu", 404);
    }

    const body = await req.json().catch(() => ({}));
    let newStatus: string = body.reviewStatus || body.status;

    if (body.action === "RETIRE") {
      newStatus = "RETIRED";
    } else if (body.action === "ACTIVATE" || body.action === "VERIFY") {
      newStatus = "VERIFIED";
    } else if (body.action === "RESET_REVIEW") {
      newStatus = "NEEDS_REVIEW";
    }

    if (!newStatus || !["VERIFIED", "RETIRED", "NEEDS_REVIEW"].includes(newStatus)) {
      return jsonError("Trạng thái mới không hợp lệ (hỗ trợ VERIFIED, RETIRED, NEEDS_REVIEW)", 400);
    }

    const updated = await prisma.activityTemplate.update({
      where: { id },
      data: { reviewStatus: newStatus },
      include: { group: true },
    });

    await prisma.auditEvent.create({
      data: {
        action: "CATALOG_TEMPLATE_STATUS_CHANGE",
        resourceType: "ActivityTemplate",
        resourceId: id,
        actorId: user.id,
        oldData: { reviewStatus: template.reviewStatus },
        newData: {
          actorName: user.fullName || user.username,
          actorRole: user.role,
          reviewStatus: newStatus,
        },
      },
    });

    const statusLabel =
      newStatus === "VERIFIED"
        ? "Đang áp dụng"
        : newStatus === "RETIRED"
        ? "Ngừng áp dụng"
        : "Chưa xác nhận";

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Đã chuyển trạng thái hoạt động "${template.code}" sang "${statusLabel}"`,
    });
  } catch (error: any) {
    return jsonError("Lỗi khi đổi trạng thái hoạt động mẫu: " + error.message, 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để thực hiện thao tác", 401);
    }

    const canManage = checkPermission(user, "catalog.manage");
    if (!canManage) {
      return jsonError("Bạn không có quyền quản trị danh mục đầu việc mẫu", 403);
    }

    const { id } = await params;
    const template = await prisma.activityTemplate.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            workItems: true,
            routines: true,
          },
        },
      },
    });

    if (!template) {
      return jsonError("Không tìm thấy hoạt động mẫu để xóa", 404);
    }

    const workItemsCount = template._count?.workItems || 0;
    const routinesCount = template._count?.routines || 0;

    // QUY TẮC BẢO TOÀN DỮ LIỆU LỊCH SỬ:
    // Nếu hoạt động mẫu đã từng được gắn vào PersonalWorkItem hoặc RoutineEntry thì TUYỆT ĐỐI KHÔNG XÓA CỨNG
    if (workItemsCount > 0 || routinesCount > 0) {
      return jsonError(
        `Không thể xóa vĩnh viễn hoạt động mẫu "${template.code}" vì đang được liên kết trong ${workItemsCount} đầu việc cá nhân và ${routinesCount} nhật ký tác nghiệp. Vui lòng chuyển sang trạng thái "Ngừng áp dụng" (RETIRED) để bảo đảm tính toàn vẹn của lịch sử dữ liệu.`,
        400
      );
    }

    await prisma.activityTemplate.delete({
      where: { id },
    });

    await prisma.auditEvent.create({
      data: {
        action: "CATALOG_TEMPLATE_DELETE",
        resourceType: "ActivityTemplate",
        resourceId: id,
        actorId: user.id,
        oldData: {
          actorName: user.fullName || user.username,
          actorRole: user.role,
          code: template.code,
          title: template.title,
          groupId: template.groupId,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Đã xóa thành công hoạt động mẫu "${template.code} - ${template.title}"`,
    });
  } catch (error: any) {
    return jsonError("Lỗi khi xóa hoạt động mẫu: " + error.message, 500);
  }
}
