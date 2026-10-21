/**
 * /api/evidence-adjustments/[id] — V3.0.3: bước 2 & 3 của quy trình R3-C.
 *
 * PATCH { action: "ENDORSE" | "APPROVE" | "REJECT", note? }
 *  - ENDORSE : lãnh đạo TRỰC TIẾP đã xác nhận công việc xem xét (chưa phải phê duyệt cuối).
 *  - APPROVE : Trưởng bộ phận phê duyệt cuối cùng → mới thực hiện điều chỉnh.
 *  - REJECT  : từ chối ở cấp nào cũng được.
 *
 * Khi được duyệt: bản minh chứng CŨ được GIỮ (đánh dấu SUPERSEDED / WITHDRAWN),
 * không xoá vĩnh viễn ⇒ luôn khôi phục được.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { canReviewAsDirectLeader } from "@/server/work-item-review";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").toUpperCase();
    const note = String(body.note || "").trim();

    const adj = await prisma.workEvidenceAdjustment.findUnique({
      where: { id },
      include: { workItem: { include: { person: { include: { assignments: true } } } } },
    });
    if (!adj) return jsonError("Không tìm thấy đề nghị điều chỉnh.", 404);

    // ---------------------------------------------------------------- TỪ CHỐI
    if (action === "REJECT") {
      const isLeader = await canReviewAsDirectLeader(user, adj.workItem.personId);
      const isOwner = adj.workItem.personId === user.personId;
      if (!isLeader && !isOwner) {
        return jsonError("Bạn không có quyền xử lý đề nghị này.", 403);
      }
      if (adj.state === "APPROVED") {
        return jsonError("Đề nghị đã được phê duyệt — không thể từ chối nữa.", 409);
      }
      const updated = await prisma.workEvidenceAdjustment.update({
        where: { id },
        data: { state: "REJECTED", leaderNote: note || adj.leaderNote, approvedById: user.personId, approvedAt: new Date() },
      });
      await recordAuditEvent({
        actorId: user.id,
        action: "EVIDENCE_ADJUSTMENT_REJECT",
        resourceType: "WorkEvidenceAdjustment",
        resourceId: id,
        newData: { note: note || null },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    // ---------------------------------------------------------------- BƯỚC 2: LÃNH ĐẠO TRỰC TIẾP XEM XÉT
    if (action === "ENDORSE") {
      if (adj.state !== "PROPOSED") {
        return jsonError("Đề nghị này không ở bước chờ lãnh đạo xem xét.", 409);
      }
      const isLeader = await canReviewAsDirectLeader(user, adj.workItem.personId);
      if (!isLeader) {
        return jsonError("Chỉ lãnh đạo trực tiếp đã xác nhận công việc mới xem xét được đề nghị này.", 403);
      }
      const updated = await prisma.workEvidenceAdjustment.update({
        where: { id },
        data: {
          state: "LEADER_REVIEWED",
          leaderReviewedById: user.personId,
          leaderReviewedAt: new Date(),
          leaderNote: note || null,
        },
      });
      await recordAuditEvent({
        actorId: user.id,
        action: "EVIDENCE_ADJUSTMENT_ENDORSE",
        resourceType: "WorkEvidenceAdjustment",
        resourceId: id,
        newData: { note: note || null },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    // ---------------------------------------------------------------- BƯỚC 3: TRƯỞNG BỘ PHẬN PHÊ DUYỆT
    if (action === "APPROVE") {
      if (adj.state !== "LEADER_REVIEWED") {
        return jsonError("Đề nghị chưa qua bước lãnh đạo trực tiếp xem xét.", 409);
      }
      // Người phê duyệt cuối phải là Trưởng bộ phận (DEPARTMENT_LEADER) phụ trách đơn vị của cán bộ
      const isDeptHead = user.role === "DEPARTMENT_LEADER" || user.role === "UNIT_LEADER";
      if (!isDeptHead) {
        return jsonError("Bước phê duyệt cuối cùng thuộc Trưởng bộ phận.", 403);
      }
      // Ngoại lệ chưa chốt: hai cấp phê duyệt trùng một người ⇒ KHOÁ bước phê duyệt
      if (adj.leaderReviewedById && adj.leaderReviewedById === user.personId) {
        return jsonError(
          "Hai cấp phê duyệt trùng một người — chưa có quy định cách bố trí hai cấp độc lập. Bước phê duyệt đang được khóa, đề nghị lãnh đạo quyết định.",
          409
        );
      }
      // Không xác định được Trưởng bộ phận phụ trách đơn vị của cán bộ ⇒ KHOÁ
      const staffUnits = (adj.workItem.person.assignments || []).map((a) => a.unitId).filter(Boolean) as string[];
      const authorized = await getAuthorizedUnitIds(user);
      const scopeList: string[] = authorized === "ALL" ? [] : authorized;
      const inScope =
        user.role === "UNIT_LEADER" ||
        authorized === "ALL" ||
        staffUnits.some((u) => scopeList.includes(u));
      if (!inScope) {
        return jsonError(
          "Không xác định được Trưởng bộ phận có thẩm quyền phê duyệt cho đơn vị này — bước phê duyệt đang được khóa, đề nghị lãnh đạo quyết định.",
          409
        );
      }

      // Thực hiện điều chỉnh — bản minh chứng cũ được GIỮ
      const applied = await prisma.$transaction(async (tx) => {
        let newEvidenceId: string | null = null;
        if (adj.kind === "ADD" || adj.kind === "REPLACE") {
          const created = await tx.workEvidence.create({
            data: {
              workItemId: adj.workItemId,
              fileName: adj.proposedFileName || `Đề nghị điều chỉnh — ${adj.kind}`,
              fileSize: adj.proposedSize || 0,
              mimeType: adj.proposedMime || "text/plain",
              storageKey: adj.proposedStorageKey || `adjustment/${adj.id}`,
              note: `${adj.kind === "ADD" ? "Bổ sung" : "Thay thế"} theo đề nghị #${adj.id} — ${adj.reason}`,
              uploadedById: user.personId,
              status: "ACTIVE",
            },
          });
          newEvidenceId = created.id;
        }
        if (adj.evidenceId) {
          await tx.workEvidence.update({
            where: { id: adj.evidenceId },
            data:
              adj.kind === "REMOVE"
                ? { status: "WITHDRAWN", withdrawnNote: note || adj.reason }
                : { status: "SUPERSEDED", supersededById: newEvidenceId, withdrawnNote: note || adj.reason },
          });
        }
        return tx.workEvidenceAdjustment.update({
          where: { id },
          data: {
            state: "APPROVED",
            approvedById: user.personId,
            approvedAt: new Date(),
            approvalNote: note || null,
            appliedAt: new Date(),
          },
        });
      });

      await recordAuditEvent({
        actorId: user.id,
        action: "EVIDENCE_ADJUSTMENT_APPROVE",
        resourceType: "WorkEvidenceAdjustment",
        resourceId: id,
        oldData: { state: adj.state },
        newData: { state: "APPROVED", kind: adj.kind, note: note || null },
      });

      return NextResponse.json({ success: true, data: applied });
    }

    return jsonError("Thao tác không hợp lệ.", 400);
  } catch (err: any) {
    console.error("[EVIDENCE_ADJUSTMENT] lỗi xử lý:", err);
    return jsonError("Không xử lý được đề nghị.", 500);
  }
}
