import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

/**
 * PATCH /api/work-catalog/entries/[id]
 * Cập nhật một đầu việc trong phiên bản ĐANG ÁP DỤNG (không sửa phiên bản cũ).
 *
 * Hỗ trợ:
 *  - status: bật/tắt đầu việc (ACTIVE | INACTIVE).
 *  - convertFactor: bổ sung / chỉnh sửa hệ số quy đổi.
 *      + number  → đặt hệ số (kể cả 0 — hệ số bằng 0 là giá trị hợp lệ, KHÔNG đổi thành NULL).
 *      + null    → xoá hệ số (đưa về trạng thái "chưa có hệ số").
 *
 * Quyền: catalog.manage. Mọi thay đổi đều ghi audit.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!checkPermission(user, "catalog.manage")) {
      return jsonError("Bạn không có quyền quản lý danh mục công việc", 403);
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const entry = await prisma.workCatalogEntry.findUnique({
      where: { id },
      include: { version: { select: { id: true, status: true, code: true } } },
    });
    if (!entry) return jsonError("Đầu việc không tồn tại trong danh mục", 404);
    if (entry.version.status !== "ACTIVE") {
      return jsonError(
        "Chỉ được thay đổi đầu việc trong phiên bản đang áp dụng — phiên bản cũ giữ nguyên để đối soát",
        409
      );
    }

    const data: any = {};

    // ---- Trạng thái ----
    if (body.status !== undefined) {
      const status = String(body.status || "").toUpperCase();
      if (!["ACTIVE", "INACTIVE"].includes(status)) {
        return jsonError("Trạng thái chỉ nhận ACTIVE hoặc INACTIVE", 400);
      }
      data.status = status;
    }

    // ---- Hệ số quy đổi ----
    if (body.convertFactor !== undefined) {
      if (body.convertFactor === null) {
        data.convertFactor = null;
      } else {
        const n = Number(body.convertFactor);
        if (!Number.isFinite(n)) {
          return jsonError("Hệ số quy đổi phải là số (hoặc để trống để xoá hệ số)", 400);
        }
        if (n < 0) {
          return jsonError("Hệ số quy đổi không được âm", 400);
        }
        // Giữ nguyên giá trị 0 — KHÔNG quy đổi thành NULL.
        data.convertFactor = new Prisma.Decimal(n);
      }
    }

    if (Object.keys(data).length === 0) {
      return jsonError("Không có nội dung cần cập nhật", 400);
    }

    const updated = await prisma.workCatalogEntry.update({
      where: { id },
      data,
      select: {
        id: true,
        code: true,
        title: true,
        department: true,
        status: true,
        convertFactor: true,
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "WORK_CATALOG_ENTRY_UPDATE",
      resourceType: "WorkCatalogEntry",
      resourceId: id,
      oldData: {
        status: entry.status,
        title: entry.title,
        department: entry.department,
        convertFactor: entry.convertFactor === null ? null : Number(entry.convertFactor),
      },
      newData: {
        status: updated.status,
        versionCode: entry.version.code,
        convertFactor:
          updated.convertFactor === null ? null : Number(updated.convertFactor),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Đã cập nhật đầu việc danh mục",
      data: {
        ...updated,
        convertFactor:
          updated.convertFactor === null ? null : Number(updated.convertFactor),
      },
    });
  } catch (error: any) {
    return jsonError("Lỗi khi cập nhật đầu việc danh mục: " + error.message, 500);
  }
}
