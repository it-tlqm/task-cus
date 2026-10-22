/**
 * GET /api/admin/system/env-status — KIỂM TRA CẤU HÌNH MÁY CHỦ (không lộ bí mật).
 *
 * Chỉ trả về:
 *  - TÊN biến môi trường + trạng thái CÓ/KHÔNG (boolean) — KHÔNG trả giá trị.
 *  - Driver kho lưu trữ đang dùng + cờ private của bucket (public: true/false).
 *
 * Yêu cầu quyền `system.config` (chỉ Super Admin kỹ thuật / lãnh đạo được cấu hình).
 * Mọi lượt gọi đều ghi audit.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { getSupabaseBaseUrl } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Biến cần kiểm tra (chỉ tên; giá trị KHÔNG bao giờ trả về). */
const CHECKED_VARS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "JWT_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "SUPABASE_EVIDENCE_BUCKET",
  "SUPABASE_STORAGE_PRIVATE",
  "STORAGE_DRIVER",
  "ALLOW_LOCAL_EVIDENCE",
  "NEXT_PUBLIC_APP_VERSION",
];

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!checkPermission(user, "system.config")) {
      return jsonError("Bạn không có quyền kiểm tra cấu hình hệ thống", 403);
    }

    const env: Record<string, boolean> = {};
    for (const k of CHECKED_VARS) {
      env[k] = !!process.env[k] && String(process.env[k]).trim() !== "";
    }

    const serverKey = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      ""
    ).trim();
    const baseUrl = getSupabaseBaseUrl();
    const urlFromEnv = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "task-attachments";
    const evidenceBucket = process.env.SUPABASE_EVIDENCE_BUCKET || "work-evidence";

    // Kiểm tra trạng thái bucket (chỉ đọc cờ public) — cần khóa server
    const bucketState = async (name: string) => {
      if (!baseUrl) return { name, checked: false, reason: "thiếu NEXT_PUBLIC_SUPABASE_URL" };
      if (!serverKey) return { name, checked: false, reason: "thiếu khóa service-role" };
      try {
        const r = await fetch(`${baseUrl}/storage/v1/bucket/${encodeURIComponent(name)}`, {
          headers: { apikey: serverKey, Authorization: `Bearer ${serverKey}` },
          cache: "no-store",
        });
        if (!r.ok) return { name, checked: true, exists: false, httpStatus: r.status };
        const j: any = await r.json().catch(() => ({}));
        return {
          name,
          checked: true,
          exists: true,
          public: j.public === true,
          note: urlFromEnv ? "" : "URL lấy từ giá trị mặc định (NEXT_PUBLIC_SUPABASE_URL chưa được đặt)",
        };
      } catch (e: any) {
        return { name, checked: false, reason: String(e?.message || e).slice(0, 80) };
      }
    };

    const buckets = await Promise.all([bucketState(bucket), bucketState(evidenceBucket)]);

    await recordAuditEvent({
      actorId: user.id,
      action: "SYSTEM_ENV_STATUS_VIEWED",
      resourceType: "System",
      resourceId: "env-status",
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      newData: { env, buckets },
    });

    return NextResponse.json({
      success: true,
      data: {
        env,
        storage: {
          driver: (process.env.STORAGE_DRIVER || "supabase").toLowerCase(),
          privateMode: String(process.env.SUPABASE_STORAGE_PRIVATE || "").trim() === "1",
          hasServerKey: !!serverKey,
          buckets,
        },
        // Host của project Supabase (thông tin CÔNG KHAI — biến NEXT_PUBLIC_*, không phải bí mật)
        supabase: {
          host: (() => {
            try {
              return new URL(baseUrl).host;
            } catch {
              return null;
            }
          })(),
          fromEnv: urlFromEnv,
          isExpectedProject: baseUrl === "https://ekswvjbpqblssxcdwagi.supabase.co",
        },
        checks: {
          "Có khóa service-role cho kho tệp": !!serverKey,
          "Chế độ PRIVATE bật (SUPABASE_STORAGE_PRIVATE=1)":
            String(process.env.SUPABASE_STORAGE_PRIVATE || "").trim() === "1",
          "Bucket tệp đính kèm PRIVATE":
            buckets.find((b) => b.name === bucket)?.public === false,
          "Kho minh chứng PRIVATE":
            buckets.find((b) => b.name === evidenceBucket)?.public === false,
          "Không dùng driver local cho minh chứng":
            !(
              (process.env.STORAGE_DRIVER || "").toLowerCase() === "local" &&
              process.env.NODE_ENV === "production" &&
              process.env.ALLOW_LOCAL_EVIDENCE !== "1"
            ),
        },
        note: "Chỉ trả về trạng thái CÓ/KHÔNG — không trả về giá trị bí mật.",
      },
    });
  } catch (err: any) {
    console.error("[EnvStatus] lỗi:", err?.message || err);
    return jsonError("Lỗi khi kiểm tra cấu hình", 500);
  }
}
