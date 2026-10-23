import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import {
  ParticipantError,
  getParticipantSummary,
  getMissingParticipants,
  getLatestSubmissionSnapshot,
  recordParticipantProgress,
  submitParticipantPart,
} from "@/server/task-participant";
import { getTaskPrecheckView } from "@/server/approval-route";

function errorResponse(err: any) {
  if (err instanceof ParticipantError) {
    return NextResponse.json(
      { success: false, error: err.message, data: err.data ?? null },
      { status: err.statusCode }
    );
  }
  return jsonError("Lỗi xử lý phần việc: " + (err?.message || "Không xác định"), 500);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id: taskId } = await params;
    // Dùng lại guard Task hiện có thông qua API chi tiết; ở đây kiểm tra tồn tại + quyền đọc.
    const { verifyTaskAccess } = await import("@/server/guard");
    const access = await verifyTaskAccess(user, taskId, "READ");
    if (!access.allowed) return jsonError(access.reason || "Không có quyền xem nhiệm vụ", 403);

    const participants = await getParticipantSummary(taskId);
    const missing = await getMissingParticipants(taskId);
    const snapshot = await getLatestSubmissionSnapshot(taskId);
    const precheck = await getTaskPrecheckView(taskId, user);
    return NextResponse.json({
      success: true,
      data: {
        participants,
        missingParticipants: missing.map((m: any) => ({
          personId: m.personId,
          personName: m.person?.fullName ?? null,
          partStatus: m.partStatus,
        })),
        canSubmitOverall:
          missing.length === 0 && (!precheck.enabled || precheck.canSubmitOverall === true),
        precheck,
        latestSnapshot: snapshot
          ? {
              round: snapshot.round,
              submittedById: snapshot.submittedById,
              createdAt: snapshot.createdAt,
              snapshot: snapshot.snapshotJson,
            }
          : null,
      },
    });
  } catch (err: any) {
    return errorResponse(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id: taskId } = await params;
    const { verifyTaskAccess } = await import("@/server/guard");
    const access = await verifyTaskAccess(user, taskId, "WRITE");
    if (!access.allowed) return jsonError(access.reason || "Không có quyền cập nhật nhiệm vụ", 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "SUBMIT").toUpperCase();
    if (action === "PROGRESS") {
      const progress = Number(body.progressPercent);
      if (!Number.isFinite(progress)) return jsonError("Thiếu tiến độ phần việc.", 422);
      const row = await recordParticipantProgress(user, taskId, {
        progressPercent: progress,
        notes: body.notes ?? null,
      });
      return NextResponse.json({ success: true, data: row }, { status: 201 });
    }
    if (action !== "SUBMIT") return jsonError("Hành động phần việc không hợp lệ.", 400);
    const row = await submitParticipantPart(user, taskId, {
      partResultText: body.partResultText,
      partCompletedOn: body.partCompletedOn,
      partProgressPercent:
        body.partProgressPercent === undefined ? null : Number(body.partProgressPercent),
      notes: body.notes ?? null,
    });
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (err: any) {
    return errorResponse(err);
  }
}
