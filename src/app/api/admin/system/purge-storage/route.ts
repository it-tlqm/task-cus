/**
 * POST /api/admin/system/purge-storage — DỌN KHO TỆP Storage bằng khoá server
 * (dùng sau khi đã lưu trữ đầy đủ). Mặc định `--dry-run` (chỉ liệt kê).
 *
 * body: { bucket?: "task-attachments", confirm?: "PURGE-2026-10-22" }
 *
 * Yêu cầu quyền `system.config`; mọi lượt gọi ghi audit; KHÔNG in khoá/secret.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { getSupabaseBaseUrl } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRM_TOKEN = "PURGE-2026-10-22";

function serverKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ""
  ).trim();
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!checkPermission(user, "system.config")) {
      return jsonError("Bạn không có quyền quản trị kho lưu trữ", 403);
    }
    const key = serverKey();
    if (!key) {
      return jsonError("Máy chủ chưa có khoá service-role (SUPABASE_SECRET_KEY) — không thể dọn kho", 503);
    }
    const body = await req.json().catch(() => ({}));
    const bucket = String(body.bucket || process.env.SUPABASE_STORAGE_BUCKET || "task-attachments");
    const confirm = String(body.confirm || "");
    const dryRun = confirm !== CONFIRM_TOKEN;
    const base = getSupabaseBaseUrl();
    const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

    // Liệt kê object (đệ quy theo "thư mục" con)
    const objects: string[] = [];
    const walk = async (prefix: string) => {
      const r = await fetch(`${base}/storage/v1/object/list/${bucket}`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({ prefix, limit: 1000 }),
      });
      if (!r.ok) throw new Error(`list không được (HTTP ${r.status})`);
      const items = await r.json().catch(() => []);
      for (const it of items) {
        if (!it?.name) continue;
        if (it.name.includes("/")) await walk(it.name);
        else objects.push(it.name);
      }
    };
    await walk("");

    let deleted = 0;
    const failed: string[] = [];
    if (!dryRun) {
      for (const o of objects) {
        const r = await fetch(`${base}/storage/v1/object/${bucket}/${o}`, { method: "DELETE", headers: H });
        if (r.ok) deleted++;
        else failed.push(o);
      }
    }

    await recordAuditEvent({
      actorId: user.id,
      action: dryRun ? "STORAGE_PURGE_DRYRUN" : "STORAGE_PURGE_EXECUTED",
      resourceType: "Storage",
      resourceId: bucket,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      newData: { bucket, objects: objects.length, deleted, failed: failed.length },
    });

    return NextResponse.json({
      success: true,
      data: {
        bucket,
        mode: dryRun ? "DRY-RUN (chưa xoá)" : "ĐÃ XOÁ",
        objects: objects.length,
        deleted,
        failed,
        objectNames: objects.slice(0, 200),
      },
    });
  } catch (err: any) {
    console.error("[PurgeStorage] lỗi:", err?.message || err);
    return jsonError("Lỗi khi dọn kho lưu trữ: " + String(err?.message || err).slice(0, 120), 500);
  }
}
