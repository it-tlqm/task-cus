import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

/**
 * YC-25 — Danh mục đầu việc RIÊNG theo bộ phận.
 * Nguyên tắc:
 *  - Tách biệt hoàn toàn với danh mục thường xuyên (48 mẫu) và danh mục sản phẩm tính điểm (QĐ1277).
 *  - STAFF: chỉ xem đầu việc ACTIVE của bộ phận mình (phục vụ chọn khi lập kế hoạch).
 *  - DEPARTMENT_LEADER: xem + thêm/sửa/ngừng sử dụng cho bộ phận mình.
 *  - UNIT_LEADER: toàn quyền trong đơn vị.
 *  - Không xoá cứng khi đã có kế hoạch tham chiếu — chuyển INACTIVE (giữ lịch sử).
 */

const MAX_TITLE = 500;

function canManageDeptCatalog(user: any): boolean {
  return user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
}

async function resolveScopeUnits(user: any): Promise<string[] | "ALL"> {
  return await getAuthorizedUnitIds(user);
}

function inScope(authorizedUnits: string[] | "ALL", unitId: string): boolean {
  return authorizedUnits === "ALL" || authorizedUnits.includes(unitId);
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập để xem danh mục đầu việc bộ phận", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền truy cập danh mục nghiệp vụ", 403);
    }

    const { searchParams } = new URL(req.url);
    const unitId = searchParams.get("unitId") || "";
    const q = searchParams.get("q")?.trim() || "";
    const statusParam = (searchParams.get("status") || "ACTIVE").toUpperCase();

    const authorizedUnits = await resolveScopeUnits(user);
    if (authorizedUnits !== "ALL" && authorizedUnits.length === 0) {
      return NextResponse.json({ success: true, data: [], canManage: false, units: [] });
    }

    if (unitId && !inScope(authorizedUnits, unitId)) {
      return jsonError("Bạn không có quyền xem danh mục đầu việc của bộ phận khác", 403);
    }

    const where: any = {};
    if (unitId) {
      where.unitId = unitId;
    } else if (authorizedUnits !== "ALL") {
      where.unitId = { in: authorizedUnits };
    }
    if (statusParam !== "ALL") {
      where.status = statusParam === "INACTIVE" ? "INACTIVE" : "ACTIVE";
    }
    if (q) {
      where.title = { contains: q, mode: "insensitive" };
    }

    const items = await prisma.departmentWorkItem.findMany({
      where,
      include: {
        unit: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { workItems: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });

    const canManage = canManageDeptCatalog(user);

    // Danh sách bộ phận trong phạm vi người dùng (nhãn hiển thị + dropdown chọn bộ phận cho người quản lý)
    const unitWhere =
      authorizedUnits === "ALL" ? { status: "ACTIVE" } : { id: { in: authorizedUnits }, status: "ACTIVE" };
    const units: Array<{ id: string; code: string; name: string }> = await prisma.orgUnit.findMany({
      where: unitWhere,
      select: { id: true, code: true, name: true },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: items.map((it) => ({ ...it, usageCount: it._count?.workItems ?? 0 })),
      canManage,
      units,
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải danh mục đầu việc bộ phận: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập để thêm đầu việc bộ phận", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không được thao tác danh mục nghiệp vụ", 403);
    }
    if (!canManageDeptCatalog(user)) {
      return jsonError("Chỉ Trưởng bộ phận hoặc Lãnh đạo đơn vị được quản lý danh mục đầu việc bộ phận", 403);
    }

    const body = await req.json();
    const title = (body.title || "").trim();
    const description = body.description?.toString().trim() || null;
    const sortOrder = Number(body.sortOrder) || 0;

    if (!title) return jsonError("Tên đầu việc là bắt buộc", 400);
    if (title.length > MAX_TITLE) return jsonError(`Tên đầu việc tối đa ${MAX_TITLE} ký tự`, 400);

    const authorizedUnits = await resolveScopeUnits(user);
    const unitId = body.unitId || user.scopeUnitId || user.unitId || "";
    if (!unitId) return jsonError("Không xác định được bộ phận cho đầu việc", 400);
    if (!inScope(authorizedUnits, unitId)) {
      return jsonError("Bạn chỉ được thêm đầu việc cho bộ phận mình quản lý", 403);
    }

    const unit = await prisma.orgUnit.findUnique({ where: { id: unitId } });
    if (!unit) return jsonError("Bộ phận không tồn tại", 400);

    const duplicated = await prisma.departmentWorkItem.findFirst({
      where: { unitId, title: { equals: title, mode: "insensitive" } },
    });
    if (duplicated) {
      return jsonError("Đầu việc này đã tồn tại trong danh mục của bộ phận (không tạo trùng)", 409);
    }

    const created = await prisma.departmentWorkItem.create({
      data: {
        unitId,
        title,
        description,
        sortOrder,
        status: "ACTIVE",
        createdById: user.personId,
      },
      include: {
        unit: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "DEPARTMENT_WORK_ITEM_CREATE",
      resourceType: "DepartmentWorkItem",
      resourceId: created.id,
      newData: { unitId, title, description, sortOrder },
    });

    return NextResponse.json({ success: true, data: { ...created, usageCount: 0 } }, { status: 201 });
  } catch (error: any) {
    return jsonError("Lỗi khi thêm đầu việc bộ phận: " + error.message, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập để chỉnh sửa đầu việc bộ phận", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không được thao tác danh mục nghiệp vụ", 403);
    }
    if (!canManageDeptCatalog(user)) {
      return jsonError("Chỉ Trưởng bộ phận hoặc Lãnh đạo đơn vị được quản lý danh mục đầu việc bộ phận", 403);
    }

    const body = await req.json();
    const { id } = body;
    if (!id) return jsonError("Thiếu ID đầu việc bộ phận cần cập nhật", 400);

    const current = await prisma.departmentWorkItem.findUnique({ where: { id } });
    if (!current) return jsonError("Đầu việc bộ phận không tồn tại", 404);

    const authorizedUnits = await resolveScopeUnits(user);
    if (!inScope(authorizedUnits, current.unitId)) {
      return jsonError("Bạn chỉ được chỉnh sửa đầu việc thuộc bộ phận mình quản lý", 403);
    }

    const updateData: any = {};
    if (body.title !== undefined) {
      const title = (body.title || "").trim();
      if (!title) return jsonError("Tên đầu việc không được để trống", 400);
      if (title.length > MAX_TITLE) return jsonError(`Tên đầu việc tối đa ${MAX_TITLE} ký tự`, 400);
      const duplicated = await prisma.departmentWorkItem.findFirst({
        where: { unitId: current.unitId, title: { equals: title, mode: "insensitive" }, NOT: { id } },
      });
      if (duplicated) return jsonError("Đã có đầu việc cùng tên trong danh mục của bộ phận", 409);
      updateData.title = title;
    }
    if (body.description !== undefined) updateData.description = body.description?.toString().trim() || null;
    if (body.sortOrder !== undefined) updateData.sortOrder = Number(body.sortOrder) || 0;
    if (body.status !== undefined) {
      const status = (body.status || "").toUpperCase();
      if (status !== "ACTIVE" && status !== "INACTIVE") {
        return jsonError("Trạng thái chỉ nhận ACTIVE (đang dùng) hoặc INACTIVE (ngừng sử dụng)", 400);
      }
      updateData.status = status;
    }

    const updated = await prisma.departmentWorkItem.update({
      where: { id },
      data: updateData,
      include: {
        unit: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { workItems: true } },
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "DEPARTMENT_WORK_ITEM_UPDATE",
      resourceType: "DepartmentWorkItem",
      resourceId: id,
      oldData: { title: current.title, description: current.description, status: current.status, sortOrder: current.sortOrder },
      newData: updateData,
    });

    return NextResponse.json({ success: true, data: { ...updated, usageCount: updated._count?.workItems ?? 0 } });
  } catch (error: any) {
    return jsonError("Lỗi khi cập nhật đầu việc bộ phận: " + error.message, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập để ngừng sử dụng đầu việc bộ phận", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không được thao tác danh mục nghiệp vụ", 403);
    }
    if (!canManageDeptCatalog(user)) {
      return jsonError("Chỉ Trưởng bộ phận hoặc Lãnh đạo đơn vị được quản lý danh mục đầu việc bộ phận", 403);
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("Thiếu ID đầu việc bộ phận", 400);

    const current = await prisma.departmentWorkItem.findUnique({
      where: { id },
      include: { _count: { select: { workItems: true } } },
    });
    if (!current) return jsonError("Đầu việc bộ phận không tồn tại", 404);

    const authorizedUnits = await resolveScopeUnits(user);
    if (!inScope(authorizedUnits, current.unitId)) {
      return jsonError("Bạn chỉ được thao tác đầu việc thuộc bộ phận mình quản lý", 403);
    }

    // Đã từng được dùng trong kế hoạch → chỉ ngừng sử dụng để bảo toàn lịch sử
    if (current._count.workItems > 0) {
      const disabled = await prisma.departmentWorkItem.update({
        where: { id },
        data: { status: "INACTIVE" },
        include: { unit: { select: { id: true, code: true, name: true } } },
      });
      await recordAuditEvent({
        actorId: user.id,
        action: "DEPARTMENT_WORK_ITEM_DISABLE",
        resourceType: "DepartmentWorkItem",
        resourceId: id,
        oldData: { title: current.title, status: current.status },
        newData: { status: "INACTIVE", reason: "Đã dùng trong kế hoạch — giữ lịch sử" },
      });
      return NextResponse.json({
        success: true,
        message: "Đầu việc đã được dùng trong kế hoạch nên chuyển sang trạng thái NGỪNG SỬ DỤNG (giữ nguyên nội dung kế hoạch cũ)",
        data: disabled,
      });
    }

    await prisma.departmentWorkItem.delete({ where: { id } });
    await recordAuditEvent({
      actorId: user.id,
      action: "DEPARTMENT_WORK_ITEM_DELETE",
      resourceType: "DepartmentWorkItem",
      resourceId: id,
      oldData: { unitId: current.unitId, title: current.title },
    });

    return NextResponse.json({ success: true, message: "Đã xoá đầu việc bộ phận khỏi danh mục" });
  } catch (error: any) {
    return jsonError("Lỗi khi ngừng sử dụng đầu việc bộ phận: " + error.message, 500);
  }
}
