import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, getAuthorizedUnitIds, jsonError } from "@/server/guard";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    // In dev demo mode, allow reading tree or require auth
    const units = await prisma.orgUnit.findMany({
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
      include: {
        assignments: {
          include: {
            person: true,
            position: true,
          },
        },
        _count: {
          select: {
            assignments: true,
            tasks: true,
          },
        },
      },
    });

    // Structure into tree
    const unitMap = new Map<string, any>();
    units.forEach((u) => {
      unitMap.set(u.id, {
        ...u,
        children: [],
        // personnelCount = số NGƯỜI duy nhất thuộc cây con của đơn vị (không đếm trùng
        // người làm việc ở 2 bộ phận). Sẽ cộng dồn ở bước sau.
        personnelCount: 0,
        directCount: new Set(u.assignments.map((a) => a.personId)).size,
        taskCount: u._count.tasks,
      });
    });

    const rootNodes: any[] = [];
    units.forEach((u) => {
      const node = unitMap.get(u.id);
      if (u.parentId && unitMap.has(u.parentId)) {
        unitMap.get(u.parentId).children.push(node);
      } else {
        rootNodes.push(node);
      }
    });

    // Cộng dồn số người theo cây (mỗi người tính 1 lần cho mỗi nhánh cha)
    const countPersons = (node: any): Set<string> => {
      const set = new Set<string>(node.assignments.map((a: any) => a.personId));
      for (const child of node.children) {
        for (const pid of countPersons(child)) set.add(pid);
      }
      node.personnelCount = set.size;
      return set;
    };
    for (const root of rootNodes) countPersons(root);

    // Số cán bộ chưa được gán đơn vị (hiển thị thành nhóm riêng trong UI)
    const unassignedCount = await prisma.person.count({ where: { assignments: { none: {} } } });

    return NextResponse.json({
      success: true,
      data: rootNodes,
      flatList: units,
      unassignedCount,
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải cây cơ cấu tổ chức: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    // P1 (YC-39): bắt buộc xác thực trước khi xử lý.
    if (!user) {
      return jsonError("Yêu cầu đăng nhập", 401);
    }

    // =====================================================================
    // P1 (YC-39) — KIỂM TRA THẨM QUYỀN TẠO ĐƠN VỊ/BỘ PHẬN
    //
    // LƯU Ý QUAN TRỌNG (an toàn):
    //  - Hai kiểm tra dưới đây KHÔNG có feature flag tắt được.
    //    Tắt cờ RBAC_HARDEN_ORGUNIT_CREATE_SCOPE chỉ bỏ kiểm tra PHẠM VI,
    //    vẫn giữ kiểm tra thẩm quyền tối thiểu (org.manage) ⇒ rollback an toàn.
    //  - Không thay đổi quyền hệ thống (guard.ts) — chỉ kiểm tra tại route.
    // =====================================================================
    // (1) Quản trị hệ thống (SYSTEM_ADMIN): quyền quản trị KỸ THUẬT "mặc nhiên" KHÔNG
    //     đủ để tạo đơn vị nghiệp vụ. Điều kiện: quyền 'org.manage' phải đến từ MỘT VAI TRÒ
    //     NGHIỆP VỤ (không phải role kỹ thuật SYSTEM_ADMIN). Không thay đổi quyền hệ thống.
    const accountId = (user as any).accountId || (user as any).id;
    const orgManageFromBusinessRole = await prisma.roleGrant.findFirst({
      where: {
        accountId,
        role: {
          code: { not: "SYSTEM_ADMIN" },
          rolePermissions: { some: { permission: { code: "org.manage" } } },
        },
      },
      select: { id: true },
    });
    const orgManageFromTechRole = await prisma.roleGrant.findFirst({
      where: {
        accountId,
        role: {
          code: "SYSTEM_ADMIN",
          rolePermissions: { some: { permission: { code: "org.manage" } } },
        },
      },
      select: { id: true },
    });
    if (orgManageFromTechRole && !orgManageFromBusinessRole) {
      return jsonError(
        "Quản trị kỹ thuật (SYSTEM_ADMIN) không có thẩm quyền tạo đơn vị nghiệp vụ. Cần được cấp quyền 'org.manage' tường minh từ một vai trò nghiệp vụ.",
        403
      );
    }
    // (2) Mọi vai trò khác: phải có quyền 'org.manage'
    //     (Công chức / Trưởng bộ phận không có quyền này ⇒ bị chặn 403).
    if (!checkPermission(user, "org.manage")) {
      return jsonError("Bạn không có quyền tạo đơn vị/bộ phận mới.", 403);
    }

    const body = await req.json();
    const { code, name, parentId } = body;

    if (!code || !name) {
      return jsonError("Mã và tên đơn vị/bộ phận không được để trống", 400);
    }

    const org = await prisma.organization.findFirst();
    if (!org) {
      return jsonError("Không tìm thấy tổ chức gốc trong hệ thống", 404);
    }

    // (3) Phạm vi: đơn vị cha phải nằm trong phạm vi được phép.
    //     Cờ RBAC_HARDEN_ORGUNIT_CREATE_SCOPE (mặc định BẬT). Tắt cờ chỉ bỏ kiểm tra này,
    //     không ảnh hưởng (1) và (2) ⇒ không mở lại đường tạo đơn vị trái quyền.
    if (process.env.RBAC_HARDEN_ORGUNIT_CREATE_SCOPE !== "0" && parentId) {
      const authorizedUnits = await getAuthorizedUnitIds(user);
      if (authorizedUnits !== "ALL" && !authorizedUnits.includes(parentId)) {
        return jsonError(
          "Bạn không có quyền tạo đơn vị ngoài phạm vi bộ phận được giao.",
          403
        );
      }
    }

    // Check duplicate code
    const existing = await prisma.orgUnit.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (existing) {
      return jsonError(`Mã đơn vị "${code}" đã tồn tại trong hệ thống`, 400);
    }

    let level = 1;
    if (parentId) {
      const parent = await prisma.orgUnit.findUnique({ where: { id: parentId } });
      if (parent) {
        level = parent.level + 1;
      }
    }

    const newUnit = await prisma.orgUnit.create({
      data: {
        orgId: org.id,
        parentId: parentId || null,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        level,
        status: "ACTIVE",
      },
    });

    return NextResponse.json({
      success: true,
      data: newUnit,
      message: "Tạo đơn vị mới thành công",
    });
  } catch (error: any) {
    return jsonError("Lỗi khi thêm đơn vị: " + error.message, 500);
  }
}
