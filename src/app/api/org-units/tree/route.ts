import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";

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
        personnelCount: u._count.assignments,
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

    return NextResponse.json({
      success: true,
      data: rootNodes,
      flatList: units,
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải cây cơ cấu tổ chức: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const body = await req.json();
    const { code, name, parentId } = body;

    if (!code || !name) {
      return jsonError("Mã và tên đơn vị/bộ phận không được để trống", 400);
    }

    const org = await prisma.organization.findFirst();
    if (!org) {
      return jsonError("Không tìm thấy tổ chức gốc trong hệ thống", 404);
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
