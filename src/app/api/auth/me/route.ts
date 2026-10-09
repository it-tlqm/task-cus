import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req);
  if (!user) {
    return jsonError("Chưa đăng nhập hoặc phiên làm việc đã hết hạn", 401);
  }
  return NextResponse.json({ success: true, user });
}

export async function POST() {
  const response = NextResponse.json({ success: true, message: "Đăng xuất thành công" });
  response.cookies.delete("token");
  return response;
}
