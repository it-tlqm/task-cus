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
