/**
 * /api/admin/permissions — Trung tâm cấu hình phân quyền (V3, Giai đoạn 1)
 *
 * GET    : ma trận vai trò × quyền, tài khoản + grant đang hiệu lực, đơn vị,
 *          quan hệ quản lý trực tiếp, nhật ký phân quyền gần đây.
 * POST   : cấp vai trò cho tài khoản (có kiểm tra thẩm quyền + thời hạn + nhật ký).
 * DELETE : thu hồi vai trò (đóng hạn, giữ lịch sử).
 *
 * Mọi kiểm tra thực hiện phía server. SYSTEM_ADMIN không được cấp quyền nghiệp vụ
 * và không được tự cấp/thu hồi quyền cho chính mình.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest, SessionUser } from "@/server/auth";
import { checkPermission, getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

export const runtime = "nodejs";

/** Vai trò nhạy cảm: chưa có quy định "ai được cấp" ⇒ khóa thao tác trong DEMO. */
const SENSITIVE_ROLE_CODES = ["SYSTEM_ADMIN"];
const ROLE_PRIORITY: Record<string, number> = {
  SYSTEM_ADMIN: 4,
  UNIT_LEADER: 3,
  DEPARTMENT_LEADER: 2,
  STAFF: 1,
};
const SCOPE_TYPES = ["OWN", "ASSIGNED", "DEPARTMENT", "SUBTREE", "ORGANIZATION"];

function canManagePermissions(user: SessionUser): boolean {
  return checkPermission(user, "org.manage");
}

function isGrantActive(g: { validFrom: Date; validTo: Date | null }, now = new Date()) {
  return g.validFrom <= now && (!g.validTo || g.validTo >= now);
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!canManagePermissions(user)) {
      return jsonError("Bạn không có quyền xem cấu hình phân quyền.", 403);
    }

    const now = new Date();
    const [roles, permissions, accounts, units, supervisions, auditLogs] = await Promise.all([
      prisma.role.findMany({
        include: { rolePermissions: { include: { permission: true } } },
        orderBy: { code: "asc" },
      }),
      prisma.permission.findMany({ orderBy: [{ module: "asc" }, { code: "asc" }] }),
      prisma.account.findMany({
        include: {
          person: {
            include: {
              assignments: { where: { isPrimary: true }, include: { unit: true } },
            },
          },
          roleGrants: { include: { role: true, scopeUnit: true }, orderBy: { createdAt: "asc" } },
        },
        orderBy: { username: "asc" },
      }),
      prisma.orgUnit.findMany({
        include: { _count: { select: { assignments: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.personSupervision.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.auditEvent.findMany({
        where: { action: { in: ["ROLE_GRANT_CREATE", "ROLE_GRANT_REVOKE"] } },
        orderBy: { timestamp: "desc" },
        take: 50,
      }),
    ]);

    const personById = new Map(accounts.map((a) => [a.person.id, a.person]));

    return NextResponse.json({
      success: true,
      data: {
        roles: roles.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
          permissions: r.rolePermissions.map((p) => p.permission.code),
          accountCount: accounts.filter((a) =>
            a.roleGrants.some((g) => g.roleId === r.id && isGrantActive(g, now))
          ).length,
        })),
        permissions: permissions.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          module: p.module,
          description: p.description,
        })),
        accounts: accounts.map((a) => ({
          id: a.id,
          username: a.username,
          status: a.status,
          personId: a.person.id,
          personCode: a.person.code,
          fullName: a.person.fullName,
          personStatus: a.person.status,
          unit: a.person.assignments[0]?.unit
            ? {
                id: a.person.assignments[0].unit.id,
                code: a.person.assignments[0].unit.code,
                name: a.person.assignments[0].unit.name,
              }
            : null,
          grants: a.roleGrants.map((g) => ({
            id: g.id,
            roleCode: g.role.code,
            roleName: g.role.name,
            scopeType: g.scopeType,
            scopeUnit: g.scopeUnit ? { id: g.scopeUnit.id, code: g.scopeUnit.code, name: g.scopeUnit.name } : null,
            validFrom: g.validFrom,
            validTo: g.validTo,
            active: isGrantActive(g, now),
          })),
        })),
        units: units.map((u) => ({
          id: u.id,
          code: u.code,
          name: u.name,
          parentId: u.parentId,
          staffCount: u._count.assignments,
        })),
        supervision: supervisions.map((s) => ({
          id: s.id,
          manager: personById.get(s.managerPersonId)?.code || s.managerPersonId,
          managerName: personById.get(s.managerPersonId)?.fullName || "—",
          subordinate: personById.get(s.subordinatePersonId)?.code || s.subordinatePersonId,
          subordinateName: personById.get(s.subordinatePersonId)?.fullName || "—",
          status: s.status,
          effectiveFrom: s.effectiveFrom,
          effectiveTo: s.effectiveTo,
          active: s.status === "CONFIRMED" && (!s.effectiveTo || s.effectiveTo >= now),
        })),
        audit: auditLogs.map((a) => ({
          id: a.id,
          action: a.action,
          actorId: a.actorId,
          timestamp: a.timestamp,
          resourceId: a.resourceId,
          newData: a.newData,
          oldData: a.oldData,
        })),
        sensitiveRolesLocked: SENSITIVE_ROLE_CODES,
        myRole: user.role,
      },
    });
  } catch (err: any) {
    console.error("[ADMIN_PERMISSIONS] lỗi:", err);
    return jsonError("Không tải được cấu hình phân quyền.", 500);
  }
}

/** Cấp vai trò cho tài khoản. */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!canManagePermissions(user)) {
      return jsonError("Bạn không có quyền cấp vai trò.", 403);
    }

    const body = await req.json().catch(() => ({}));
    const { accountId, roleCode, scopeType, scopeUnitId, validFrom, validTo, reason } = body;

    if (!accountId || !roleCode) return jsonError("Thiếu tài khoản hoặc vai trò.", 400);

    // 1) Vai trò nhạy cảm — chưa có quy định ai được cấp ⇒ khóa
    if (SENSITIVE_ROLE_CODES.includes(roleCode)) {
      return jsonError(
        "Chưa có quy định về việc cấp vai trò Quản trị hệ thống. Thao tác này đang được khóa trong bản DEMO — đề nghị lãnh đạo đơn vị xác nhận chính sách.",
        403
      );
    }

    // 2) Không cho tự nâng quyền: chỉ cấp được vai trò không cao hơn vai trò của mình
    if ((ROLE_PRIORITY[roleCode] || 0) > (ROLE_PRIORITY[user.role] || 0)) {
      return jsonError("Bạn không có quyền cấp vai trò cao hơn vai trò của chính mình.", 403);
    }
    if (accountId === user.id) {
      return jsonError("Bạn không thể tự cấp quyền cho chính mình.", 403);
    }

    const [account, role] = await Promise.all([
      prisma.account.findUnique({ where: { id: accountId } }),
      prisma.role.findUnique({ where: { code: roleCode } }),
    ]);
    if (!account) return jsonError("Không tìm thấy tài khoản.", 404);
    if (!role) return jsonError("Vai trò không tồn tại.", 400);

    // 3) Phạm vi
    const scope = (scopeType || "DEPARTMENT").toString().toUpperCase();
    if (!SCOPE_TYPES.includes(scope)) return jsonError("Phạm vi không hợp lệ.", 400);
    let unitId: string | null = scopeUnitId || null;
    if (scope === "DEPARTMENT" || scope === "SUBTREE") {
      if (!unitId) return jsonError("Vui lòng chọn đơn vị cho phạm vi.", 400);
      const authorized = await getAuthorizedUnitIds(user);
      if (authorized !== "ALL" && !authorized.includes(unitId)) {
        return jsonError("Bạn không có quyền cấp phạm vi ngoài đơn vị của mình.", 403);
      }
    }
    if (scope === "ORGANIZATION" && user.role !== "UNIT_LEADER" && user.role !== "SYSTEM_ADMIN") {
      return jsonError("Chỉ lãnh đạo đơn vị mới cấp được phạm vi toàn tổ chức.", 403);
    }

    // 4) Thời gian hiệu lực
    const from = validFrom ? new Date(validFrom) : new Date();
    const to = validTo ? new Date(validTo) : null;
    if (Number.isNaN(from.getTime())) return jsonError("Ngày bắt đầu không hợp lệ.", 400);
    if (to && (Number.isNaN(to.getTime()) || to <= from)) {
      return jsonError("Ngày kết thúc phải sau ngày bắt đầu.", 400);
    }

    // 5) Trùng grant đang hiệu lực
    const existing = await prisma.roleGrant.findFirst({
      where: { accountId, roleId: role.id, scopeType: scope, scopeUnitId: unitId },
    });
    if (existing && isGrantActive(existing)) {
      return jsonError("Tài khoản này đã có vai trò này trong phạm vi đó.", 409);
    }

    const created = existing
      ? await prisma.roleGrant.update({
          where: { id: existing.id },
          data: { validFrom: from, validTo: to },
        })
      : await prisma.roleGrant.create({
          data: { accountId, roleId: role.id, scopeType: scope, scopeUnitId: unitId, validFrom: from, validTo: to },
        });

    await recordAuditEvent({
      actorId: user.id,
      action: "ROLE_GRANT_CREATE",
      resourceType: "RoleGrant",
      resourceId: created.id,
      oldData: existing
        ? { roleCode, scopeType: scope, scopeUnitId: unitId, validFrom: existing.validFrom, validTo: existing.validTo }
        : null,
      newData: {
        account: account.username,
        roleCode,
        scopeType: scope,
        scopeUnitId: unitId,
        validFrom: from,
        validTo: to,
        reason: reason || null,
      },
    });

    return NextResponse.json({ success: true, data: created });
  } catch (err: any) {
    console.error("[ADMIN_PERMISSIONS] lỗi cấp quyền:", err);
    return jsonError("Không cấp được vai trò.", 500);
  }
}

/** Thu hồi vai trò (đóng hạn — giữ lịch sử). */
export async function DELETE(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!canManagePermissions(user)) {
      return jsonError("Bạn không có quyền thu hồi vai trò.", 403);
    }
    const grantId = req.nextUrl.searchParams.get("grantId");
    const reason = req.nextUrl.searchParams.get("reason") || "";
    if (!grantId) return jsonError("Thiếu mã lượt cấp quyền.", 400);

    const grant = await prisma.roleGrant.findUnique({
      where: { id: grantId },
      include: { role: true, account: true, scopeUnit: true },
    });
    if (!grant) return jsonError("Không tìm thấy lượt cấp quyền.", 404);
    if (grant.accountId === user.id) {
      return jsonError("Bạn không thể tự thu hồi quyền của chính mình.", 403);
    }
    if (!isGrantActive(grant)) {
      return jsonError("Lượt cấp quyền này đã hết hiệu lực.", 409);
    }

    const now = new Date();
    const updated = await prisma.roleGrant.update({
      where: { id: grantId },
      data: { validTo: now },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "ROLE_GRANT_REVOKE",
      resourceType: "RoleGrant",
      resourceId: grantId,
      oldData: {
        account: grant.account.username,
        roleCode: grant.role.code,
        scopeType: grant.scopeType,
        scopeUnitId: grant.scopeUnitId,
        validTo: grant.validTo,
      },
      newData: { validTo: now, reason: reason || null },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    console.error("[ADMIN_PERMISSIONS] lỗi thu hồi:", err);
    return jsonError("Không thu hồi được vai trò.", 500);
  }
}
