import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để truy cập danh mục vai trò", 401);
    }

    const roles = await prisma.role.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isSystem: true,
      },
    });

    return NextResponse.json({ success: true, data: roles });
  } catch (error: any) {
    return jsonError("Lỗi khi tải danh mục vai trò: " + error.message, 500);
  }
}
