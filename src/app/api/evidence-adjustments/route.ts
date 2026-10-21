/**
 * /api/evidence-adjustments — V3.0.3: quy trình điều chỉnh minh chứng SAU KHI đã nghiệm thu (R3-C).
 *
 * Quy trình 2 cấp (theo R3-C):
 *   1) Người phụ trách lập ĐỀ NGHỞI (nêu lý do + nội dung + minh chứng đề xuất) — KHÔNG mở khóa.
 *   2) Lãnh đạo trực tiếp đã xác nhận công việc XEM XÉT (chưa phải phê duyệt cuối).
 *   3) Trưởng bộ phận PHÊ DUYỆT CUỐI CÙNG (hoặc từ chối).
 *   4) Khi được duyệt mới thực hiện điều chỉnh; bản minh chứng CŨ được giữ (không xoá vĩnh viễn).
 *
 * Ngoại lệ CHƯA CHỐT: nếu hai cấp phê duyệt trùng một người hoặc không xác định được
 * Trưởng bộ phận hợp lệ ⇒ bước phê duyệt bị KHOÁ (409) và ghi nhận cần quyết định.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { ensureEvidenceStorageReady } from "@/server/storage";
import { canReviewAsDirectLeader } from "@/server/work-item-review";

export const runtime = "nodejs";

const KINDS = ["ADD", "REPLACE", "REMOVE"];

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const workItemId = req.nextUrl.searchParams.get("workItemId");
    if (!workItemId) {
      // Danh sách đề nghị mà người đang đăng nhập có thể xử lý
      const all = await prisma.workEvidenceAdjustment.findMany({
        where: { state: { in: ["PROPOSED", "LEADER_REVIEWED"] } },
        include: {
          workItem: { select: { id: true, title: true, personId: true, person: { select: { fullName: true, code: true } } } },
          evidence: { select: { id: true, fileName: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      const actionable: any[] = [];
      for (const a of all) {
        const isLeader = await canReviewAsDirectLeader(user, a.workItem.personId);
        const isDeptHead = user.role === "DEPARTMENT_LEADER" || user.role === "UNIT_LEADER";
        if (a.state === "PROPOSED" && isLeader) {
          actionable.push({ ...a, myStep: "ENDORSE", myStepLabel: "Xem xét" });
        } else if (a.state === "LEADER_REVIEWED" && isDeptHead && a.leaderReviewedById !== user.personId) {
          actionable.push({ ...a, myStep: "APPROVE", myStepLabel: "Phê duyệt cuối" });
        }
      }
      return NextResponse.json({ success: true, data: actionable });
    }

    const item = await prisma.personalWorkItem.findUnique({ where: { id: workItemId } });
    if (!item) return jsonError("Đầu việc không tồn tại", 404);
    const canView = item.personId === user.personId || (await canReviewAsDirectLeader(user, item.personId));
    if (!canView) return jsonError("Bạn không có quyền xem đề nghị điều chỉnh của công việc này.", 403);

    const rows = await prisma.workEvidenceAdjustment.findMany({
      where: { workItemId },
      include: {
        evidence: { select: { id: true, fileName: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error("[EVIDENCE_ADJUSTMENT] lỗi:", err);
    return jsonError("Không tải được danh sách đề nghị.", 500);
  }
}

/** Bước 1 — lập đề nghị điều chỉnh. */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const form = await req.formData().catch(() => null);
    if (!form) return jsonError("Dữ liệu gửi lên không hợp lệ.", 400);
    const workItemId = String(form.get("workItemId") || "");
    const kind = String(form.get("kind") || "").toUpperCase();
    const reason = String(form.get("reason") || "").trim();
    const description = String(form.get("description") || "").trim();
    const evidenceId = String(form.get("evidenceId") || "") || null;
    const file = form.get("file");

    if (!workItemId || !kind) return jsonError("Thiếu đầu việc hoặc loại điều chỉnh.", 400);
    if (!KINDS.includes(kind)) return jsonError("Loại điều chỉnh không hợp lệ.", 400);
    if (reason.length < 5) return jsonError("Vui lòng nêu rõ lý do đề nghị điều chỉnh.", 400);

    const item = await prisma.personalWorkItem.findUnique({ where: { id: workItemId } });
    if (!item) return jsonError("Đầu việc không tồn tại", 404);
    // Chỉ sau khi công việc ĐÃ ĐƯỢC XÁC NHẬN mới được đề nghị điều chỉnh
    if ((item.reviewState || "DRAFT") !== "CONFIRMED") {
      return jsonError(
        "Chỉ được đề nghị điều chỉnh minh chứng sau khi công việc đã được lãnh đạo xác nhận.",
        409
      );
    }
    if (item.personId !== user.personId) {
      return jsonError("Chỉ người phụ trách công việc mới lập được đề nghị điều chỉnh.", 403);
    }
    if (kind !== "ADD" && !evidenceId) {
      return jsonError("Vui lòng chọn minh chứng cần điều chỉnh.", 400);
    }
    if (evidenceId) {
      const ev = await prisma.workEvidence.findUnique({ where: { id: evidenceId } });
      if (!ev || ev.workItemId !== workItemId) return jsonError("Minh chứng không thuộc công việc này.", 400);
      if (ev.status !== "ACTIVE") return jsonError("Minh chứng này không còn hiệu lực để điều chỉnh.", 409);
    }

    // Tệp đề xuất (nếu có) — lưu vào kho riêng, CHƯA gắn vào minh chứng
    let fileName: string | null = null;
    let storageKey: string | null = null;
    let fileSize: number | null = null;
    let mimeType: string | null = null;
    if (file && typeof (file as any).arrayBuffer === "function" && kind !== "REMOVE") {
      const buffer = Buffer.from(await (file as Blob).arrayBuffer());
      const safeName = (file as File).name.replace(/[^\w.\- ]+/g, "_");
      fileName = safeName;
      fileSize = buffer.length;
      mimeType = (file as File).type || "application/octet-stream";
      const storage = await ensureEvidenceStorageReady();
      const uploaded = await storage.upload(buffer, safeName, mimeType, `evidence-adjustment/${workItemId}`);
      storageKey = uploaded.key || null;
    }

    const created = await prisma.workEvidenceAdjustment.create({
      data: {
        workItemId,
        evidenceId,
        kind,
        reason,
        description: description || null,
        proposedFileName: fileName,
        proposedStorageKey: storageKey,
        proposedSize: fileSize,
        proposedMime: mimeType,
        state: "PROPOSED",
        proposedById: user.personId,
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "EVIDENCE_ADJUSTMENT_PROPOSE",
      resourceType: "WorkEvidenceAdjustment",
      resourceId: created.id,
      newData: { workItemId, kind, reason, evidenceId },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err: any) {
    console.error("[EVIDENCE_ADJUSTMENT] lỗi đề nghị:", err);
    return jsonError("Không tạo được đề nghị điều chỉnh.", 500);
  }
}
