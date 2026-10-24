/**
 * POST /api/admin/system/purge-storage — DỌN KHO TỆP Storage bằng khoá server.
 *
 * MẶC ĐỊNH TẮT. Chỉ hoạt động khi ops bật tường minh trên môi trường:
 *   STORAGE_PURGE_ENABLED=true
 *   STORAGE_PURGE_TOKEN=<bí mật ngẫu nhiên>
 *   STORAGE_PURGE_BUCKETS=task-attachments   (allowlist, KHÔNG gồm work-evidence)
 * và gửi header `x-purge-token` khớp token (so sánh timing-safe).
 *
 * body: { bucket: "task-attachments", dryRun?: boolean }
 *  - Mặc định dry-run (chỉ liệt kê); chỉ xoá khi `dryRun: false`.
 *  - Bucket phải nằm trong allowlist; không có bucket mặc định, không fallback.
 *  - `work-evidence` bị chặn cứng qua endpoint này.
 *
 * Yêu cầu đăng nhập + quyền `system.config`; mọi lượt dọn ghi audit trước và sau
 * khi xoá; KHÔNG in khoá/secret.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { getSupabaseBaseUrl } from "@/server/storage";
import {
  isPurgeExecutionRequested,
  resolveStoragePurgeRequest,
} from "@/server/storage-purge-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const body = (await req.json().catch(() => ({}))) as {
      bucket?: unknown;
      dryRun?: unknown;
    };

    // Chặn trước khi chạm Storage: endpoint tắt mặc định, token bí mật, allowlist.
    const access = resolveStoragePurgeRequest({
      token: req.headers.get("x-purge-token"),
      bucket: body?.bucket,
    });
    if (!access.ok) return jsonError(access.error, access.status);

    const key = serverKey();
    if (!key) {
      return jsonError("Máy chủ chưa có khoá service-role (SUPABASE_SECRET_KEY) — không thể dọn kho", 503);
    }

    const bucketUsed = access.bucket;
    const execute = isPurgeExecutionRequested(body);
    const base = getSupabaseBaseUrl();
    const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

    // Liệt kê object trong ĐÚNG bucket đã được allowlist. Không dò, không fallback.
    const listObjects = async (name: string): Promise<string[] | null> => {
      const found: string[] = [];
      const walk = async (prefix: string): Promise<boolean> => {
        try {
          const r = await fetch(`${base}/storage/v1/object/list/${encodeURIComponent(name)}`, {
            method: "POST",
            headers: H,
            body: JSON.stringify({ prefix, limit: 1000 }),
            cache: "no-store",
          });
          if (!r.ok) return false;
          const items = await r.json().catch(() => null);
          if (!Array.isArray(items)) return false;
          for (const it of items) {
            const entry = typeof it?.name === "string" ? it.name.trim() : "";
            if (!entry) continue;
            const objectPath = prefix ? `${prefix}/${entry}` : entry;
            // Supabase Storage: thư mục con có id/metadata null → đệ quy.
            if (it?.id == null && it?.metadata == null) {
              if (!(await walk(objectPath))) return false;
            } else {
              found.push(objectPath);
            }
          }
          return true;
        } catch {
          return false;
        }
      };
      return (await walk("")) ? found : null;
    };

    const objects = await listObjects(bucketUsed);
    if (objects === null) {
      return jsonError(
        `Không truy cập được bucket "${bucketUsed}" — endpoint không tự chuyển sang bucket khác.`,
        502
      );
    }

    const auditBase = {
      actorId: user.id,
      resourceType: "Storage",
      resourceId: bucketUsed,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
    };

    let deleted = 0;
    const failed: string[] = [];

    if (!execute) {
      await recordAuditEvent({
        ...auditBase,
        action: "STORAGE_PURGE_DRYRUN",
        newData: { bucketUsed, objects: objects.length, deleted: 0, failed: 0 },
      });
    } else {
      // Audit TRƯỚC khi xoá: tiến trình chết giữa chừng vẫn còn dấu vết.
      await recordAuditEvent({
        ...auditBase,
        action: "STORAGE_PURGE_STARTED",
        newData: { bucketUsed, objects: objects.length, deleted: 0, failed: 0 },
      });

      for (const objectPath of objects) {
        const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
        const r = await fetch(
          `${base}/storage/v1/object/${encodeURIComponent(bucketUsed)}/${encodedPath}`,
          { method: "DELETE", headers: H }
        );
        if (r.ok) deleted++;
        else failed.push(objectPath);
      }

      await recordAuditEvent({
        ...auditBase,
        action: "STORAGE_PURGE_EXECUTED",
        newData: { bucketUsed, objects: objects.length, deleted, failed: failed.length },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        bucketUsed,
        mode: execute ? "ĐÃ XOÁ" : "DRY-RUN (chưa xoá)",
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
