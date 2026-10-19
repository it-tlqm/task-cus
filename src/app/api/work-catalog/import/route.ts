import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";
import {
  buildCatalogDiff,
  getActiveWorkCatalogVersion,
  importWorkCatalog,
  parseWorkCatalogWorkbook,
  isLegacyTemplateSelectable,
} from "@/server/work-catalog";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/**
 * POST /api/work-catalog/import
 * multipart: file (.xlsx), dryRun ("true"/"false"), note, importHash (bước xác nhận)
 * Quyền: catalog.manage.
 * Bắt buộc xem trước (dryRun=true) trước khi nhập; bước xác nhận phải gửi kèm importHash.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!checkPermission(user, "catalog.manage")) {
      return jsonError("Bạn không có quyền nhập danh mục công việc thường xuyên", 403);
    }

    const form = await req.formData();
    const file = form.get("file");
    const dryRun = String(form.get("dryRun") ?? "true").toLowerCase() !== "false";
    const note = (form.get("note") as string) || null;
    const expectedHash = (form.get("importHash") as string) || null;

    if (!file || typeof (file as any).arrayBuffer !== "function") {
      return jsonError("Vui lòng chọn tệp Excel (.xlsx) cần nhập", 400);
    }
    const upload = file as File;
    if (!upload.name.toLowerCase().endsWith(".xlsx")) {
      return jsonError(
        "Hệ thống chỉ nhận tệp .xlsx. Hãy mở file .xls bằng Excel và lưu lại dưới dạng .xlsx (một lần).",
        400
      );
    }
    if (upload.size > MAX_UPLOAD_BYTES) {
      return jsonError("Tệp vượt quá 3 MB — kiểm tra lại đúng file danh mục", 400);
    }

    const buffer = Buffer.from(await upload.arrayBuffer());
    let parsed;
    try {
      parsed = await parseWorkCatalogWorkbook(buffer);
    } catch (err: any) {
      return jsonError("Không đọc được tệp Excel: " + (err.message || "định dạng không hợp lệ"), 400);
    }

    const active = await getActiveWorkCatalogVersion();
    const activeEntries = active
      ? await prisma.workCatalogEntry.findMany({ where: { versionId: active.id } })
      : [];
    const diff = buildCatalogDiff(activeEntries, parsed, active?.importHash || null);

    const report = {
      sheetName: parsed.sheetName,
      totalRowsScanned: parsed.totalRowsScanned,
      totalEntries: parsed.entries.length,
      departments: parsed.departments,
      errors: parsed.errors,
      duplicates: parsed.duplicates,
      crossDepartmentDuplicates: parsed.crossDepartmentDuplicates,
      newEntries: diff.newEntries,
      removedEntries: diff.removedEntries,
      unchangedCount: diff.unchangedCount,
      unchangedHash: diff.unchangedHash,
      activeVersion: active
        ? { id: active.id, code: active.code, entryCount: active.entryCount, importedAt: active.importedAt }
        : null,
      importHash: parsed.importHash,
    };

    const canImport =
      parsed.errors.length === 0 && parsed.duplicates.length === 0 && !diff.unchangedHash;

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        canImport,
        report,
        message: diff.unchangedHash
          ? "Danh mục không thay đổi so với phiên bản đang áp dụng"
          : canImport
            ? "Đọc tệp thành công — kiểm tra báo cáo trước khi xác nhận nhập"
            : "Tệp còn lỗi/trùng — cần sửa file trước khi nhập",
      });
    }

    if (!canImport) {
      return NextResponse.json(
        {
          success: false,
          error: "Không thể nhập: tệp còn lỗi, trùng trong bộ phận hoặc không có thay đổi",
          report,
        },
        { status: 422 }
      );
    }

    const version = await importWorkCatalog({
      parsed,
      sourceFileName: upload.name,
      note,
      userId: user.personId,
      actorAccountId: user.id,
      expectedHash,
    });

    return NextResponse.json(
      {
        success: true,
        dryRun: false,
        message: `Đã nhập danh mục ${version.code} với ${version.entryCount} đầu việc`,
        data: {
          id: version.id,
          code: version.code,
          entryCount: version.entryCount,
          importedAt: version.importedAt,
        },
        legacyTemplatesSelectable: await isLegacyTemplateSelectable(),
      },
      { status: 201 }
    );
  } catch (error: any) {
    return jsonError(error.message || "Lỗi khi nhập danh mục", error.statusCode || 500);
  }
}
