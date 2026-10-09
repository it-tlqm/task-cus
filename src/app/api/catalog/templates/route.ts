import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { jsonError } from "@/server/guard";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId");
    const search = searchParams.get("q");

    const where: any = {};
    if (groupId) {
      where.groupId = groupId;
    }
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
        { sourceRawText: { contains: search, mode: "insensitive" } },
      ];
    }

    const templates = await prisma.activityTemplate.findMany({
      where,
      orderBy: [{ sourceRow: "asc" }, { code: "asc" }],
      include: {
        group: true,
      },
    });

    return NextResponse.json({ success: true, data: templates, total: templates.length });
  } catch (error: any) {
    return jsonError("Lỗi khi tải danh mục đầu việc mẫu: " + error.message, 500);
  }
}
