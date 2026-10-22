/**
 * POST /api/routine/[id]/submit — F18 (C): đề nghị ghi nhận kết quả chính thức từ
 * một bản ghi nhật ký tác nghiệp, đi qua ĐÚNG quy trình V3:
 *   công chức báo kết quả → lãnh đạo trực tiếp xác nhận → SP QĐ1277 xác nhận độc lập.
 *
 * Bản ghi nhật ký tác nghiệp KHÔNG tự động trở thành công việc đã nghiệm thu.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { submitWorkItemForReview, isWorkItemReviewLocked } from "@/server/work-item-review";
import { recordAuditEvent } from "@/server/audit";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const resultText = String(body.resultText || "").trim();
    const completedOn = String(body.completedOn || "").trim();

    const entry = await prisma.routineEntry.findUnique({
      where: { id },
      include: { workItem: true },
    });
    if (!entry) return jsonError("Không tìm thấy bản ghi nhật ký tác nghiệp", 404);
    if (entry.personId !== user.personId) {
      return jsonError("Chỉ người ghi nhật ký tác nghiệp mới đề nghị được ghi nhận kết quả.", 403);
    }
    if (!entry.workItemId || !entry.workItem) {
      return jsonError(
        "Bản ghi này không gắn với công việc nào. Hãy ghi kèm công việc khi tạo nhật ký để đề nghị được ghi nhận kết quả.",
        409
      );
    }
    if (entry.occurrenceStatus === "NOT_OCCURRED") {
      return jsonError(
        "Bản ghi xác nhận không phát sinh không dùng để đề nghị ghi nhận kết quả công việc.",
        409
      );
    }
    if (isWorkItemReviewLocked(entry.workItem)) {
      return jsonError(
        entry.workItem.reviewState === "CONFIRMED"
          ? "Công việc đã được lãnh đạo xác nhận — không thể đề nghị ghi nhận lại."
          : "Công việc đang chờ lãnh đạo xác nhận — không thể đề nghị ghi nhận lại.",
        409
      );
    }
    if (resultText.length < 5) {
      return jsonError("Vui lòng nhập nội dung kết quả công việc (ít nhất 5 ký tự).", 400);
    }
    if (!completedOn) {
      return jsonError("Vui lòng chọn ngày hoàn thành thực tế.", 400);
    }

    const updated = await submitWorkItemForReview(user, entry.workItemId, {
      resultText,
      completedOn: new Date(completedOn + "T00:00:00.000Z"),
    });

    await prisma.routineEntry.update({
      where: { id },
      data: { reviewState: "SUBMITTED" },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "ROUTINE_SUBMIT_FOR_REVIEW",
      resourceType: "RoutineEntry",
      resourceId: id,
      newData: { workItemId: entry.workItemId, reviewState: "SUBMITTED" },
    });

    return NextResponse.json({ success: true, data: { entryId: id, workItem: updated } });
  } catch (err: any) {
    if (err?.statusCode) return jsonError(err.message, err.statusCode);
    console.error("[ROUTINE_SUBMIT] lỗi:", err);
    return jsonError("Không đề nghị được ghi nhận kết quả.", 500);
  }
}
