import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dữ liệu cho form lập kế hoạch: chỉ trả về đơn vị trong phạm vi được cấp quyền,
 * cùng danh mục nhóm nghiệp vụ. Không trả toàn bộ cây đơn vị cho cán bộ.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền lập kế hoạch nghiệp vụ", 403);
    }

    const authorizedUnits = await getAuthorizedUnitIds(user);
    const units = await prisma.orgUnit.findMany({
      where:
        authorizedUnits === "ALL"
          ? {}
          : { id: { in: authorizedUnits } },
      select: { id: true, code: true, name: true, parentId: true },
      orderBy: [{ name: "asc" }],
    });
    const groups = await prisma.activityGroup.findMany({
      select: { id: true, code: true, name: true },
      orderBy: [{ name: "asc" }],
    });

    return NextResponse.json({
      success: true,
      canCreatePlan: checkPermission(user, "plans.create"),
      currentUnitId: user.unitId || null,
      units,
      groups,
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải dữ liệu lập kế hoạch: " + error.message, 500);
  }
}
