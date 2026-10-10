import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { prisma } from "@/server/db";
import { checkPermission, jsonError } from "@/server/guard";
import { getAllSystemConfigs } from "@/server/system-config";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để truy cập thông tin tổng quan hệ thống", 401);
    }

    const canView =
      checkPermission(user, "system.config") ||
      user.role === "SYSTEM_ADMIN" ||
      user.role === "UNIT_LEADER";

    if (!canView) {
      return jsonError("Bạn không có quyền truy cập trung tâm quản trị hệ thống", 403);
    }

    const [
      unitsCount,
      positionsCount,
      personsCount,
      activePersonsCount,
      accountsCount,
      activeAccountsCount,
      roles,
      permissionsCount,
      groupsCount,
      templatesCount,
      activeTemplatesCount,
      retiredTemplatesCount,
      formTemplatesCount,
      auditEventsCount,
      configs,
    ] = await Promise.all([
      prisma.orgUnit.count(),
      prisma.position.count(),
      prisma.person.count(),
      prisma.person.count({ where: { status: "ACTIVE" } }),
      prisma.account.count(),
      prisma.account.count({ where: { status: "ACTIVE" } }),
      prisma.role.findMany({
        include: {
          _count: {
            select: {
              rolePermissions: true,
              roleGrants: true,
            },
          },
          rolePermissions: {
            include: { permission: true },
          },
        },
        orderBy: { code: "asc" },
      }),
      prisma.permission.count(),
      prisma.activityGroup.count(),
      prisma.activityTemplate.count(),
      prisma.activityTemplate.count({ where: { reviewStatus: "VERIFIED" } }),
      prisma.activityTemplate.count({ where: { reviewStatus: "RETIRED" } }),
      prisma.formTemplate.count(),
      prisma.auditEvent.count(),
      getAllSystemConfigs(),
    ]);

    const formattedRoles = roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      permissionsCount: r._count.rolePermissions,
      grantsCount: r._count.roleGrants,
      permissions: r.rolePermissions.map((rp) => rp.permission.code),
    }));

    return NextResponse.json({
      success: true,
      data: {
        organization: {
          totalUnits: unitsCount,
          totalPositions: positionsCount,
          totalPersons: personsCount,
          activePersons: activePersonsCount,
          totalAccounts: accountsCount,
          activeAccounts: activeAccountsCount,
        },
        rbac: {
          totalRoles: roles.length,
          totalPermissions: permissionsCount,
          roles: formattedRoles,
        },
        catalog: {
          totalGroups: groupsCount,
          totalTemplates: templatesCount,
          activeTemplates: activeTemplatesCount,
          retiredTemplates: retiredTemplatesCount,
        },
        forms: {
          totalForms: formTemplatesCount,
        },
        audit: {
          totalEvents: auditEventsCount,
        },
        configs,
        backupStatus: {
          isConfigured: false,
          status: "NOT_CONFIGURED",
          message: "Chưa cấu hình giám sát sao lưu tự động qua WebApp",
          note: "Theo quy trình an ninh, chức năng sao lưu hiện được vận hành độc lập qua script bảo mật (scripts/backup-db.ps1) và chưa tích hợp giao diện Restore để bảo vệ tính toàn vẹn cơ sở dữ liệu.",
        },
      },
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải thông tin tổng quan hệ thống: " + error.message, 500);
  }
}
