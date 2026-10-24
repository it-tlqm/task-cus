import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError, verifyTaskAccess } from "@/server/guard";
import {
  getTaskUnifiedHistory,
  isTaskHistorySource,
  TASK_HISTORY_SOURCES,
  type TaskHistorySource,
} from "@/server/task-history";

export const runtime = "nodejs";

/**
 * GET /api/tasks/[id]/history
 *
 * E12-A — lịch sử hợp nhất chỉ gồm TaskUpdate + ApprovalDecision + participant events.
 * Không trả bình luận/tệp đính kèm. Giữ nguyên kiểm tra quyền READ của Task.
 *
 * Query:
 *   - `source` : một hoặc nhiều nguồn, cách nhau dấu phẩy (TASK_UPDATE|APPROVAL_DECISION|PARTICIPANT_EVENT)
 *   - `limit`  : 1..500 (mặc định 200)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { id: taskId } = await params;
    const access = await verifyTaskAccess(user, taskId, "READ");
    if (!access.allowed) {
      return jsonError(access.reason || "Truy cập bị từ chối", 403);
    }

    const { searchParams } = new URL(req.url);
    const rawSource = searchParams.get("source") || "";
    const rawSources = rawSource
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const invalid = rawSources.filter((s) => !isTaskHistorySource(s));
    if (invalid.length > 0) {
      return jsonError(
        `Nguồn lịch sử không hợp lệ: ${invalid.join(", ")}. Chỉ chấp nhận ${TASK_HISTORY_SOURCES.join(", ")}.`,
        400
      );
    }

    const rawLimit = searchParams.get("limit");
    if (rawLimit !== null && (!/^\d+$/.test(rawLimit) || Number(rawLimit) <= 0)) {
      return jsonError("limit phải là số nguyên dương (tối đa 500).", 400);
    }

    const history = await getTaskUnifiedHistory(
      taskId,
      {
        sources: rawSources as TaskHistorySource[],
        limit: rawLimit === null ? null : Number(rawLimit),
      },
      {
        viewer: user,
        ownerId: access.task?.ownerId ?? null,
        unitId: access.task?.unitId ?? null,
      }
    );

    return NextResponse.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải lịch sử nhiệm vụ: " + error.message, 500);
  }
}
