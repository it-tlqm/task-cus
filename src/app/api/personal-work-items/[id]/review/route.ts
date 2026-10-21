/**
 * POST /api/personal-work-items/[id]/review — V3.0.1
 * Gửi công việc lên lãnh đạo trực tiếp xác nhận / lãnh đạo xác nhận hoặc trả lại.
 *
 * body: { action: "SUBMIT" | "RETURN" | "CONFIRM", resultText?, completedOn?, note? }
 * Mọi kiểm tra quyền + trạng thái đều thực hiện phía server.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { parseDateOnly } from "@/server/work-dates";
import {
  ReviewError,
  decideWorkItemReview,
  submitWorkItemForReview,
} from "@/server/work-item-review";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { id } = await ctx.params;
    if (!id) return jsonError("Thiếu mã đầu việc", 400);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").toUpperCase();

    if (action === "SUBMIT") {
      const resultText = String(body.resultText || "").trim();
      const parsed = parseDateOnly(body.completedOn);
      if (!parsed.ok) return jsonError(`Ngày hoàn thành thực tế: ${parsed.message}`, 400);
      if (!parsed.value) {
        return jsonError("Vui lòng chọn ngày hoàn thành thực tế.", 400);
      }
      const updated = await submitWorkItemForReview(user, id, {
        resultText,
        completedOn: parsed.value,
      });
      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "RETURN" || action === "CONFIRM") {
      const updated = await decideWorkItemReview(user, id, {
        decision: action,
        note: String(body.note || ""),
      });
      return NextResponse.json({ success: true, data: updated });
    }

    return jsonError("Thao tác không hợp lệ", 400);
  } catch (err: any) {
    if (err instanceof ReviewError || err?.statusCode) {
      return jsonError(err.message, err.statusCode || 400);
    }
    console.error("[WORK_ITEM_REVIEW] lỗi:", err);
    return jsonError("Không xử lý được yêu cầu. Vui lòng thử lại.", 500);
  }
}
