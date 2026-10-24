import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { aiEnabled, draftDirective, summarizePeriod } from "@/server/ai";
import { recordAuditEvent } from "@/server/audit";
import { vietnamDayRange } from "@/server/work-dates";
import { formatVnDate } from "@/lib/datetime";

const DAILY_LIMIT = 20;

async function checkQuota(user: any, action: string): Promise<boolean> {
  const range = vietnamDayRange();
  const start = range.start;
  const used = await prisma.auditEvent.count({
    where: { actorId: user.id, action, timestamp: { gte: start } },
  });
  return used < DAILY_LIMIT;
}

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req);
  if (!user) return jsonError("Yêu cầu đăng nhập", 401);
  return NextResponse.json({ success: true, enabled: aiEnabled(), dailyLimit: DAILY_LIMIT });
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!aiEnabled()) return jsonError("Chưa cấu hình AI trên máy chủ", 503);
    const body = await req.json().catch(() => ({}));
    const { op } = body;

    if (op === "draft") {
      const idea = String(body.idea || "").trim();
      if (idea.length < 4) return jsonError("Nhập vài từ khóa về việc cần giao", 400);
      if (!(await checkQuota(user, "AI_DRAFT"))) return jsonError(`Hết lượt gợi ý hôm nay (${DAILY_LIMIT} lượt)`, 429);
      const out = await draftDirective(idea);
      await recordAuditEvent({
        actorId: user.id, action: "AI_DRAFT", resourceType: "Task", newData: { ideaLen: idea.length },
      });
      return NextResponse.json({ success: true, data: out });
    }

    if (op === "extract") {
      const { extractConclusions } = await import("@/server/ai");
      const minutes = String(body.minutes || "").trim();
      if (minutes.length < 20) return jsonError("Dán biên bản họp (ít nhất vài dòng) để AI tách kết luận", 400);
      if (!(await checkQuota(user, "AI_EXTRACT"))) return jsonError(`Hết lượt trích xuất hôm nay (${DAILY_LIMIT} lượt)`, 429);
      const items = await extractConclusions(minutes);
      await recordAuditEvent({
        actorId: user.id, action: "AI_EXTRACT", resourceType: "Meeting", newData: { minutesLen: minutes.length, count: items.length },
      });
      return NextResponse.json({ success: true, data: { items } });
    }

    if (op === "summarize") {      if (!(await checkQuota(user, "AI_SUMMARY"))) return jsonError(`Hết lượt tóm tắt hôm nay (${DAILY_LIMIT} lượt)`, 429);
      // Chỉ dùng số tổng hợp theo phạm vi của người gọi — không gửi chi tiết cá nhân
      const authorizedUnits = await getAuthorizedUnitIds(user);
      const scopeWhere =
        authorizedUnits === "ALL" ? {} : { unitId: { in: authorizedUnits } };
      const [total, completed, inProgress, overdue, waiting] = await Promise.all([
        prisma.task.count({ where: { ...scopeWhere, status: { not: "CANCELED" } } }),
        prisma.task.count({ where: { ...scopeWhere, status: { in: ["COMPLETED", "DONE"] } } }),
        prisma.task.count({ where: { ...scopeWhere, status: "IN_PROGRESS" } }),
        prisma.task.count({ where: { ...scopeWhere, status: { in: ["IN_PROGRESS", "WAITING_REVIEW"] }, currentDeadline: { lt: new Date() } } }),
        prisma.task.count({ where: { ...scopeWhere, status: "WAITING_REVIEW" } }),
      ]);
      const leaveApproved = await prisma.leaveRequest.count({ where: { status: "APPROVED" } });
      const now = new Date();
      const label = `tuần ${formatVnDate(now)}`;
      const text = await summarizePeriod({ label, total, completed, inProgress, overdue, waiting, leaveApproved });
      await recordAuditEvent({
        actorId: user.id, action: "AI_SUMMARY", resourceType: "ReportSnapshot", newData: { total, completed, overdue },
      });
      return NextResponse.json({ success: true, data: { text } });
    }

    return jsonError("Thao tác AI không hợp lệ", 400);
  } catch (error: any) {
    return jsonError(error.message || "AI bận, thử lại sau", 500);
  }
}
