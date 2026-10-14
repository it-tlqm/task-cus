import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: "Đã đăng xuất phiên làm việc thành công",
  });

  // Xóa cookie token xác thực
  response.cookies.delete("token");
  return response;
}
