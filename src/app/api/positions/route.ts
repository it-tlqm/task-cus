import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để truy cập danh mục chức vụ", 401);
    }

    const positions = await prisma.position.findMany({
      where: { status: "ACTIVE" },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        status: true,
      },
    });

    return NextResponse.json({ success: true, data: positions });
  } catch (error: any) {
    return jsonError("Lỗi khi tải danh mục chức vụ: " + error.message, 500);
  }
}
