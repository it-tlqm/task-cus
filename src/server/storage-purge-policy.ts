/**
 * Chính sách an toàn cho endpoint dọn kho Storage (Task 1.3).
 *
 * Nguyên tắc:
 *  - MẶC ĐỊNH TẮT: chỉ bật khi `STORAGE_PURGE_ENABLED` đúng bằng "true".
 *  - Token bí mật lấy từ `STORAGE_PURGE_TOKEN`, so sánh timing-safe; token rỗng
 *    không bao giờ hợp lệ.
 *  - Chỉ dọn bucket được liệt kê TƯỜNG MINH trong `STORAGE_PURGE_BUCKETS`
 *    (mặc định rỗng). Không có bucket mặc định.
 *  - `work-evidence` bị chặn CỨNG kể cả khi ops lỡ thêm vào allowlist: dọn minh
 *    chứng phải có quy trình riêng, backup và phê duyệt.
 *
 * Module thuần (không DB, không HTTP) để kiểm thử không chạm dữ liệu thật.
 */
import { createHash, timingSafeEqual } from "node:crypto";

/** Bucket không bao giờ được dọn qua endpoint này. */
export const STORAGE_PURGE_HARD_BLOCKED_BUCKETS = ["work-evidence"] as const;

export interface StoragePurgeConfig {
  enabled: boolean;
  token: string;
  buckets: string[];
}

export type StoragePurgeDenyStatus = 400 | 403 | 404;

export type StoragePurgeDenyReason =
  | "PURGE_DISABLED"
  | "PURGE_TOKEN_INVALID"
  | "PURGE_BUCKET_NOT_ALLOWED";

export interface StoragePurgeDenial {
  ok: false;
  status: StoragePurgeDenyStatus;
  reason: StoragePurgeDenyReason;
  error: string;
}

export interface StoragePurgeAccess {
  ok: true;
  bucket: string;
  config: StoragePurgeConfig;
}

export type StoragePurgeDecision = StoragePurgeAccess | StoragePurgeDenial;

/** Tên bucket chỉ trim; allowlist so khớp chính xác (phân biệt hoa/thường). */
export function normalizeBucketName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Đường dẫn object an toàn: không rỗng và không có segment rỗng, `.` hoặc `..`.
 *
 * `encodeURIComponent("..")` vẫn trả `..`, nên nếu không chặn trước khi ghép URL
 * thì `../work-evidence/foo` có thể bị chuẩn hoá ra ngoài bucket đã allowlist.
 * Tên thường có khoảng trắng hoặc dấu `/` (thư mục) vẫn được phép.
 */
export function isSafeStorageObjectPath(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  return value
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

/**
 * Đọc cấu hình từ env với mặc định an toàn:
 * disabled, token rỗng, allowlist rỗng.
 */
export function loadStoragePurgeConfig(env: NodeJS.ProcessEnv = process.env): StoragePurgeConfig {
  const enabled = String(env.STORAGE_PURGE_ENABLED ?? "").trim() === "true";
  const token = String(env.STORAGE_PURGE_TOKEN ?? "").trim();
  const buckets = String(env.STORAGE_PURGE_BUCKETS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return { enabled, token, buckets };
}

function tokenDigest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * So sánh token timing-safe. Băm trước để độ dài token không rò rỉ qua thời gian
 * và `timingSafeEqual` luôn nhận hai buffer cùng kích thước.
 * Token cấu hình rỗng ⇒ luôn từ chối (không có "token rỗng hợp lệ").
 */
export function isPurgeTokenValid(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string" || provided.length === 0) return false;
  if (typeof expected !== "string" || expected.length === 0) return false;
  return timingSafeEqual(tokenDigest(provided), tokenDigest(expected));
}

/** `work-evidence` (mọi biến thể hoa/thường/khoảng trắng) luôn bị chặn. */
export function isHardBlockedBucket(bucket: unknown): boolean {
  const name = normalizeBucketName(bucket).toLowerCase();
  return (STORAGE_PURGE_HARD_BLOCKED_BUCKETS as readonly string[]).includes(name);
}

/**
 * Bucket chỉ được phép khi nằm đúng trong allowlist và không bị chặn cứng.
 * Allowlist rỗng ⇒ từ chối tất cả.
 */
export function isBucketAllowed(bucket: unknown, config: StoragePurgeConfig): boolean {
  const name = normalizeBucketName(bucket);
  if (!name) return false;
  if (isHardBlockedBucket(name)) return false;
  return config.buckets.some((entry) => normalizeBucketName(entry) === name);
}

/**
 * Chỉ xoá khi client gửi `dryRun: false` đúng kiểu boolean.
 * Mọi giá trị khác (kể cả chuỗi "false", 0, undefined) đều là dry-run.
 */
export function isPurgeExecutionRequested(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return (body as { dryRun?: unknown }).dryRun === false;
}

/**
 * Quyết định truy cập cho một lượt gọi purge.
 * Thứ tự: tắt (404, ẩn endpoint) → token (403) → bucket (400).
 * Không có bucket mặc định và không bao giờ trả về bucket ngoài allowlist.
 */
export function resolveStoragePurgeRequest(input: {
  env?: NodeJS.ProcessEnv;
  token?: string | null;
  bucket?: unknown;
}): StoragePurgeDecision {
  const config = loadStoragePurgeConfig(input.env);

  if (!config.enabled) {
    return {
      ok: false,
      status: 404,
      reason: "PURGE_DISABLED",
      error: "Không tìm thấy",
    };
  }

  if (!isPurgeTokenValid(input.token, config.token)) {
    return {
      ok: false,
      status: 403,
      reason: "PURGE_TOKEN_INVALID",
      error: "Token dọn kho không hợp lệ",
    };
  }

  const bucket = normalizeBucketName(input.bucket);
  if (!bucket) {
    return {
      ok: false,
      status: 400,
      reason: "PURGE_BUCKET_NOT_ALLOWED",
      error: "Thiếu tên bucket cần dọn (endpoint không có bucket mặc định)",
    };
  }

  if (isHardBlockedBucket(bucket)) {
    return {
      ok: false,
      status: 400,
      reason: "PURGE_BUCKET_NOT_ALLOWED",
      error: `Bucket "${bucket}" không được phép dọn qua endpoint này — cần quy trình riêng có backup và phê duyệt`,
    };
  }

  if (!isBucketAllowed(bucket, config)) {
    return {
      ok: false,
      status: 400,
      reason: "PURGE_BUCKET_NOT_ALLOWED",
      error: `Bucket "${bucket}" không nằm trong danh sách cho phép (STORAGE_PURGE_BUCKETS)`,
    };
  }

  return { ok: true, bucket, config };
}
