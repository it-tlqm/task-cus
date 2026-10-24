import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getReleaseInfo } from "@/server/release-info";

/** Sức khỏe hệ thống cho giám sát/uptime (không cần đăng nhập, không lộ dữ liệu).
 *  Kèm thông tin phiên bản đang chạy trên Vercel để đối chiếu khi nghiệm thu/triển khai. */
export async function GET() {
  const started = Date.now();
  const build = getReleaseInfo();
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json({
      success: true,
      status: "ok",
      db: "up",
      ...build,
      latencyMs: Date.now() - started,
      time: new Date().toISOString(),
    });
  } catch (error: unknown) {
    // Chi tiết lỗi (chuỗi kết nối, host...) chỉ ghi log phía server, không trả ra ngoài.
    console.error("[health] database check failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, status: "degraded", db: "down", ...build, error: "database_unavailable" },
      { status: 503 }
    );
  }
}
