import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { jsonError } from "@/server/guard";

export async function GET() {
  try {
    const groups = await prisma.activityGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        _count: {
          select: { templates: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: groups });
  } catch (error: any) {
    return jsonError("Lỗi khi tải nhóm nghiệp vụ: " + error.message, 500);
  }
}
