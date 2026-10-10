import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để thực hiện thao tác", 401);
    }

    const canManage =
      checkPermission(user, "org.manage") ||
      checkPermission(user, "users.manage") ||
      user.role === "UNIT_LEADER" ||
      user.role === "SYSTEM_ADMIN";

    if (!canManage) {
      return jsonError("Bạn không có quyền điều chuyển đơn vị cán bộ công chức", 403);
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { newUnitId, newPositionId, effectiveDate, decisionNumber, notes } = body;

    // 1. Kiểm tra cán bộ tồn tại và đang hoạt động
    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        assignments: {
          where: { isPrimary: true },
          include: { unit: true, position: true },
        },
        account: {
          include: { roleGrants: true },
        },
      },
    });

    if (!person) {
      return jsonError("Không tìm thấy hồ sơ cán bộ công chức để điều chuyển", 404);
    }

    if (person.status !== "ACTIVE") {
      return jsonError("Cán bộ công chức đang ở trạng thái ngừng hoạt động, không thể điều chuyển", 400);
    }

    // 2. Kiểm tra đơn vị mới
    if (!newUnitId || typeof newUnitId !== "string") {
      return jsonError("Đơn vị tiếp nhận mới là bắt buộc", 400);
    }

    const newUnit = await prisma.orgUnit.findUnique({
      where: { id: newUnitId },
      select: { id: true, name: true, code: true, status: true },
    });
    if (!newUnit) {
      return jsonError("Đơn vị tiếp nhận mới không tồn tại trong hệ thống", 400);
    }
    if (newUnit.status !== "ACTIVE") {
      return jsonError("Đơn vị tiếp nhận mới đã ngừng hoạt động", 400);
    }

    // 3. Kiểm tra chức vụ mới nếu có
    let newPosition = null;
    if (newPositionId) {
      newPosition = await prisma.position.findUnique({
        where: { id: newPositionId },
        select: { id: true, title: true, status: true },
      });
      if (!newPosition || newPosition.status !== "ACTIVE") {
        return jsonError("Chức vụ mới được chọn không tồn tại hoặc đã ngừng áp dụng", 400);
      }
    }

    // 4. Kiểm tra phân công hiện tại
    const currentAssignment = person.assignments[0];
    if (
      currentAssignment &&
      currentAssignment.unitId === newUnitId &&
      (!newPositionId || newPositionId === currentAssignment.positionId)
    ) {
      return jsonError(
        "Cán bộ hiện đã đang công tác tại đơn vị và chức vụ này. Vui lòng chọn đơn vị hoặc chức vụ mới để điều chuyển.",
        400
      );
    }

    // 5. Chuẩn hóa ngày có hiệu lực
    const effDate = effectiveDate ? new Date(effectiveDate) : new Date();
    if (isNaN(effDate.getTime())) {
      return jsonError("Ngày có hiệu lực điều chuyển không hợp lệ", 400);
    }

    // 6. Thực hiện Transaction điều chuyển bảo đảm tính nhất quán và bảo toàn lịch sử
    const result = await prisma.$transaction(async (tx) => {
      // a. Đóng phân công cũ (lưu lịch sử effectiveTo, isPrimary = false)
      if (currentAssignment) {
        await tx.personAssignment.update({
          where: { id: currentAssignment.id },
          data: {
            isPrimary: false,
            effectiveTo: effDate,
          },
        });
      }

      // b. Tạo bản ghi phân công mới (isPrimary = true, effectiveFrom = effDate, effectiveTo = null)
      const targetPositionId = newPositionId || currentAssignment?.positionId || null;
      const newAssignment = await tx.personAssignment.create({
        data: {
          personId: person.id,
          unitId: newUnitId,
          positionId: targetPositionId,
          isPrimary: true,
          effectiveFrom: effDate,
          effectiveTo: null,
        },
        include: {
          unit: true,
          position: true,
        },
      });

      // c. Cập nhật phạm vi quyền (ScopeUnit) của tài khoản nếu có phân quyền theo DEPARTMENT
      if (person.account) {
        for (const grant of person.account.roleGrants) {
          if (grant.scopeType === "DEPARTMENT") {
            await tx.roleGrant.update({
              where: { id: grant.id },
              data: { scopeUnitId: newUnitId },
            });
          }
        }
      }

      // d. Ghi nhận nhật ký kiểm toán bất biến (AuditEvent)
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "PERSON_TRANSFER",
          resourceType: "Person",
          resourceId: person.id,
          oldData: {
            unitId: currentAssignment?.unitId || null,
            unitName: currentAssignment?.unit?.name || null,
            positionId: currentAssignment?.positionId || null,
            positionTitle: currentAssignment?.position?.title || null,
          },
          newData: {
            unitId: newUnitId,
            unitName: newUnit.name,
            positionId: targetPositionId,
            positionTitle: newPosition?.title || currentAssignment?.position?.title || null,
            effectiveDate: effDate.toISOString(),
            decisionNumber: decisionNumber || null,
            notes: notes || null,
          },
        },
      });

      return newAssignment;
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Đã điều chuyển cán bộ ${person.fullName} sang đơn vị "${newUnit.name}" thành công`,
    });
  } catch (error: any) {
    console.error("POST /api/people/[id]/transfer error:", error);
    return jsonError("Lỗi hệ thống khi điều chuyển cán bộ: " + error.message, 500);
  }
}
