/**
 * Talung Customs Work Management - Storage Service Provider
 * Hỗ trợ lưu trữ tài liệu nghiệp vụ, biên bản kiểm tra, ảnh hiện trường.
 * Kiến trúc module cho phép chuyển đổi liền mạch giữa Supabase Storage và Cloudflare R2.
 *
 * YC-32: thêm kênh tải có kiểm soát (download) cho minh chứng công việc.
 * - Minh chứng KHÔNG dùng URL công khai; mọi lượt tải đi qua route kiểm tra quyền.
 * - Driver "local" chỉ dùng cho môi trường phát triển/kiểm thử (không chạm Supabase).
 */

import fs from "node:fs/promises";
import path from "node:path";

export interface StorageUploadResult {
  url: string;
  key: string;
  size: number;
  mimeType: string;
  fileName: string;
}

export interface IStorageProvider {
  upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    subfolder?: string
  ): Promise<StorageUploadResult>;
  delete(key: string): Promise<boolean>;
  getPublicUrl(key: string): string;
  /** Tải nội dung tệp về server (dùng cho route có kiểm tra quyền). */
  download(key: string): Promise<Buffer | null>;
  /** Kiểm tra cấu hình kho lưu trữ trước khi dùng (fail-closed). */
  assertReady?(): Promise<void>;
}

/** Cấu hình Storage chưa đạt yêu cầu an toàn → route trả 503, không ghi metadata. */
export class StorageConfigError extends Error {
  statusCode = 503;
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigError";
  }
}

/** Lỗi cấu hình riêng cho kho minh chứng (giữ tên cũ để không phá nơi đang dùng). */
export class EvidenceStorageConfigError extends StorageConfigError {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceStorageConfigError";
  }
}

interface StorageProviderOptions {
  /** Dùng cho minh chứng: bắt buộc khóa server, bucket private, không URL công khai. */
  forEvidence?: boolean;
}

/**
 * Chế độ kho tệp đính kèm PRIVATE (bucket `task-attachments`).
 * Bật bằng biến môi trường `SUPABASE_STORAGE_PRIVATE=1` trên máy chủ.
 * Khi bật: bắt buộc có khóa service-role và bucket phải PRIVATE (fail-closed).
 */
export function isPrivateStorageMode(): boolean {
  return String(process.env.SUPABASE_STORAGE_PRIVATE || "").trim() === "1";
}

function getSupabaseServerKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ""
  ).trim();
}

/** URL gốc của project Supabase (có fallback mặc định — dùng chung mọi nơi). */
export function getSupabaseBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ekswvjbpqblssxcdwagi.supabase.co"
  ).replace(/\/$/, "");
}

function buildStorageKey(
  originalName: string,
  subfolder: string
): { storageKey: string; ext: string } {
  const ext = originalName.includes(".") ? originalName.split(".").pop() || "bin" : "bin";
  const cleanBase = originalName
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF-]/g, "_")
    .slice(0, 50);
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  return {
    storageKey: `${subfolder}/${cleanBase || "tep"}-${uniqueSuffix}.${ext.toLowerCase()}`,
    ext: ext.toLowerCase(),
  };
}

/**
 * 1. Supabase Storage Provider (Đang hoạt động)
 */
class SupabaseStorageProvider implements IStorageProvider {
  private baseUrl: string;
  private apiKey: string;
  private bucket: string;
  private forEvidence: boolean;
  private bucketVerified = false;
  private privateMode: boolean;
  private serverKey: string;

  constructor(bucket?: string, options: StorageProviderOptions = {}) {
    this.baseUrl = getSupabaseBaseUrl();
    this.forEvidence = !!options.forEvidence;
    this.privateMode = isPrivateStorageMode();
    this.serverKey = getSupabaseServerKey();
    const serverKey = this.serverKey;
    if (this.forEvidence && !serverKey) {
      // Không bao giờ fallback sang publishable key cho minh chứng:
      // khóa công khai không đủ quyền và sẽ khiến bucket private không hoạt động.
      throw new EvidenceStorageConfigError(
        "Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY (hoặc SUPABASE_SECRET_KEY) trên máy chủ — không thể dùng kho minh chứng riêng tư"
      );
    }
    this.apiKey = this.forEvidence
      ? serverKey
      : serverKey ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        "sb_publishable_bAl9A-fstt1SijvD8HrVmg_fEiY_4mf";
    this.bucket = bucket || process.env.SUPABASE_STORAGE_BUCKET || "task-attachments";
  }

  /**
   * KHÔNG phát URL công khai cho bất kỳ tệp nào (đính kèm hay minh chứng).
   * Mọi lượt xem/tải đều đi qua route có xác thực + kiểm tra quyền.
   */
  getPublicUrl(key: string): string {
    throw new StorageConfigError(
      "Tệp lưu trữ không được phát URL công khai — phải tải qua route có xác thực."
    );
  }

  /** Đọc thông tin bucket qua khoá server (null nếu không truy cập được). */
  private async bucketInfo(name: string): Promise<{ ok: boolean; status: number; info?: any }> {
    try {
      const res = await fetch(
        `${this.baseUrl}/storage/v1/bucket/${encodeURIComponent(name)}`,
        {
          headers: { apikey: this.apiKey, Authorization: `Bearer ${this.apiKey}` },
          cache: "no-store",
        }
      );
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, status: res.status, info: await res.json().catch(() => null) };
    } catch {
      return { ok: false, status: 0 };
    }
  }

  async assertReady(): Promise<void> {
    if (this.bucketVerified) return;
    // - Minh chứng: LUÔN bắt buộc bucket private + khóa server.
    // - Tệp đính kèm: kiểm tra khi bật chế độ PRIVATE (SUPABASE_STORAGE_PRIVATE=1).
    if (!this.forEvidence && !this.privateMode) return;
    const what = this.forEvidence ? "minh chứng" : "tệp đính kèm";
    if (!this.serverKey) {
      throw new StorageConfigError(
        `Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY (hoặc SUPABASE_SECRET_KEY) trên máy chủ — không thể dùng kho ${what} ở chế độ private.`
      );
    }

    let info = await this.bucketInfo(this.bucket);
    // Tên bucket trong cấu hình có thể lệch với project (biến môi trường đặt sai tên):
    // thử các tên chuẩn trước khi kết luận cấu hình sai.
    if (!info.ok) {
      for (const cand of ["task-attachments", "work-evidence"]) {
        if (cand === this.bucket) continue;
        const alt = await this.bucketInfo(cand);
        if (alt.ok && alt.info) {
          console.warn(
            `[Storage] Bucket "${this.bucket}" không truy cập được (HTTP ${info.status}) — dùng "${cand}".`
          );
          this.bucket = cand;
          info = alt;
          break;
        }
      }
    }

    if (!info.ok) {
      // KHÔNG chặn dịch vụ: khoá server vẫn dùng được cho upload/download; chỉ ghi cảnh báo.
      console.warn(
        `[Storage] Không xác minh được trạng thái bucket "${this.bucket}" (HTTP ${info.status}) — tiếp tục dùng khoá server.`
      );
      this.bucketVerified = true;
      return;
    }
    if (!info.info || info.info.public !== false) {
      throw new StorageConfigError(
        `Bucket "${this.bucket}" phải ở chế độ PRIVATE. Hệ thống từ chối dùng bucket public cho ${what}.`
      );
    }
    this.bucketVerified = true;
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    subfolder: string = "tasks"
  ): Promise<StorageUploadResult> {
    await this.assertReady();
    const { storageKey } = buildStorageKey(originalName, subfolder);

    const endpoint = `${this.baseUrl}/storage/v1/object/${this.bucket}/${storageKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: this.apiKey,
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": mimeType || "application/octet-stream",
        "x-upsert": "true",
      },
      body: buffer as unknown as BodyInit,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[Storage] Supabase upload failed:", response.status, errText);
      throw new Error(`Tải tệp lên Supabase Storage thất bại (${response.status}): ${errText}`);
    }

    return {
      // Kho private: KHÔNG tạo / KHÔNG trả URL công khai.
      // Giao diện tải qua route có xác thực: /api/tasks/{taskId}/attachments/{id}/file
      url: "",
      key: storageKey,
      size: buffer.length,
      mimeType,
      fileName: originalName,
    };
  }

  async delete(key: string): Promise<boolean> {
    try {
      const endpoint = `${this.baseUrl}/storage/v1/object/${this.bucket}/${key}`;
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: {
          apikey: this.apiKey,
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      return response.ok;
    } catch (err) {
      console.error("[Storage] Supabase delete error:", err);
      return false;
    }
  }

  async download(key: string): Promise<Buffer | null> {
    try {
      await this.assertReady();
    } catch (err) {
      if (err instanceof StorageConfigError) throw err;
      throw err;
    }
    try {
      const endpoint = `${this.baseUrl}/storage/v1/object/${this.bucket}/${key}`;
      const response = await fetch(endpoint, {
        headers: {
          apikey: this.apiKey,
          Authorization: `Bearer ${this.apiKey}`,
        },
        cache: "no-store",
      });
      if (!response.ok) {
        console.error("[Storage] Supabase download failed:", response.status, key);
        return null;
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (err) {
      console.error("[Storage] Supabase download error:", err);
      return null;
    }
  }
}

/**
 * 2. Cloudflare R2 Storage Provider (Sẵn sàng kích hoạt khi chuyển đổi)
 * Sử dụng giao thức S3 tương thích của Cloudflare R2.
 */
class CloudflareR2StorageProvider implements IStorageProvider {
  private accountId: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private bucket: string;
  private publicDomain: string;

  constructor(bucket?: string) {
    this.accountId = process.env.R2_ACCOUNT_ID || "";
    this.accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
    this.secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
    this.bucket = bucket || process.env.R2_BUCKET_NAME || "talung-attachments";
    this.publicDomain = (process.env.R2_PUBLIC_DOMAIN || "").replace(/\/$/, "");
  }

  getPublicUrl(key: string): string {
    if (this.publicDomain) {
      return `${this.publicDomain}/${key}`;
    }
    return `https://${this.accountId}.r2.cloudflarestorage.com/${this.bucket}/${key}`;
  }

  async upload(): Promise<StorageUploadResult> {
    if (!this.accountId || !this.accessKeyId || !this.secretAccessKey) {
      throw new Error(
        "Chưa thiết lập biến môi trường R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY để sử dụng Cloudflare R2."
      );
    }
    throw new Error("Cloudflare R2 driver: Vui lòng cấu hình API credentials trong .env để kích hoạt.");
  }

  async delete(): Promise<boolean> {
    return true;
  }

  async download(): Promise<Buffer | null> {
    throw new Error("Cloudflare R2 driver chưa hỗ trợ tải tệp trong phiên bản hiện tại.");
  }
}

/**
 * 3. Local Filesystem Provider — CHỈ dùng cho phát triển/kiểm thử.
 * Không bao giờ dùng cho dữ liệu nghiệp vụ thật trên Production.
 */
class LocalFileStorageProvider implements IStorageProvider {
  private baseDir: string;
  private bucket: string;

  constructor(bucket?: string) {
    this.baseDir = path.resolve(process.env.LOCAL_STORAGE_DIR || path.join(process.cwd(), ".local-storage"));
    this.bucket = bucket || "task-attachments";
  }

  private resolvePath(key: string): string {
    const root = path.resolve(this.baseDir, this.bucket);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep) && full !== root) {
      throw new Error("Đường dẫn tệp không hợp lệ");
    }
    return full;
  }

  getPublicUrl(key: string): string {
    // Chỉ dùng nội bộ — minh chứng luôn tải qua route kiểm tra quyền.
    return `/local-storage/${this.bucket}/${key}`;
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    subfolder: string = "tasks"
  ): Promise<StorageUploadResult> {
    const { storageKey } = buildStorageKey(originalName, subfolder);
    const full = this.resolvePath(storageKey);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
    return {
      url: this.getPublicUrl(storageKey),
      key: storageKey,
      size: buffer.length,
      mimeType,
      fileName: originalName,
    };
  }

  async delete(key: string): Promise<boolean> {
    try {
      await fs.unlink(this.resolvePath(key));
      return true;
    } catch (err: any) {
      if (err?.code === "ENOENT") return true;
      console.error("[Storage] Local delete error:", err);
      return false;
    }
  }

  async download(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.resolvePath(key));
    } catch (err: any) {
      if (err?.code !== "ENOENT") console.error("[Storage] Local download error:", err);
      return null;
    }
  }
}

/**
 * Factory lấy Storage Provider đang được kích hoạt theo STORAGE_DRIVER.
 * - "supabase" (mặc định): bucket đính kèm nhiệm vụ; minh chứng dùng bucket riêng.
 * - "r2"/"cloudflare": Cloudflare R2 (stub hiện tại).
 * - "local": thư mục cục bộ — CHỈ dùng khi phát triển/kiểm thử.
 */
let cachedStorageProvider: IStorageProvider | null = null;
let cachedEvidenceProvider: IStorageProvider | null = null;

function createStorageProvider(
  bucket?: string,
  options: StorageProviderOptions = {}
): IStorageProvider {
  const driver = (process.env.STORAGE_DRIVER || "supabase").toLowerCase();
  if (driver === "r2" || driver === "cloudflare") {
    if (options.forEvidence) {
      throw new EvidenceStorageConfigError(
        "Cloudflare R2 chưa được cấu hình cho kho minh chứng riêng tư — chưa thể bật tính năng minh chứng"
      );
    }
    return new CloudflareR2StorageProvider(bucket);
  }
  if (driver === "local") {
    // Minh chứng chỉ được dùng kho private thật. Không cho driver local trong
    // production trừ khi có cờ kiểm thử rõ ràng; tránh ghi tệp vào FS tạm của Vercel.
    if (
      options.forEvidence &&
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_LOCAL_EVIDENCE !== "1"
    ) {
      throw new EvidenceStorageConfigError(
        "Không được dùng STORAGE_DRIVER=local cho minh chứng trong production — cần bucket private work-evidence"
      );
    }
    return new LocalFileStorageProvider(bucket);
  }
  return new SupabaseStorageProvider(bucket, options);
}

/**
 * Bọc provider minh chứng để chặn tuyệt đối URL công khai, kể cả khi
 * provider bên trong vô tình trả về URL.
 */
class PrivateEvidenceStorageProvider implements IStorageProvider {
  constructor(private inner: IStorageProvider) {}

  getPublicUrl(): string {
    throw new Error("Minh chứng công việc không được phát URL công khai");
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    subfolder?: string
  ): Promise<StorageUploadResult> {
    const result = await this.inner.upload(buffer, originalName, mimeType, subfolder);
    return { ...result, url: "" };
  }

  delete(key: string): Promise<boolean> {
    return this.inner.delete(key);
  }

  download(key: string): Promise<Buffer | null> {
    return this.inner.download(key);
  }

  assertReady(): Promise<void> {
    return this.inner.assertReady ? this.inner.assertReady() : Promise.resolve();
  }
}

export function getStorageProvider(): IStorageProvider {
  if (cachedStorageProvider) return cachedStorageProvider;
  cachedStorageProvider = createStorageProvider();
  return cachedStorageProvider;
}

/**
 * Provider dành riêng cho minh chứng công việc (YC-32).
 * Production: bucket private SUPABASE_EVIDENCE_BUCKET (mặc định "work-evidence").
 * Không dùng getPublicUrl cho minh chứng.
 */
export function getEvidenceStorageProvider(): IStorageProvider {
  if (cachedEvidenceProvider) return cachedEvidenceProvider;
  const evidenceBucket = process.env.SUPABASE_EVIDENCE_BUCKET || "work-evidence";
  cachedEvidenceProvider = new PrivateEvidenceStorageProvider(
    createStorageProvider(evidenceBucket, { forEvidence: true })
  );
  return cachedEvidenceProvider;
}

/**
 * Kiểm tra kho minh chứng sẵn sàng: có khóa server + bucket tồn tại + private.
 * Route phải gọi hàm này TRƯỚC khi upload/download/delete; lỗi cấu hình → 503.
 */
export async function ensureEvidenceStorageReady(): Promise<IStorageProvider> {
  const provider = getEvidenceStorageProvider();
  if (provider.assertReady) await provider.assertReady();
  return provider;
}

/**
 * Kiểm tra kho TỆP ĐÍNH KÈM sẵn sàng trước khi đọc/ghi (fail-closed).
 * - Chế độ private (`SUPABASE_STORAGE_PRIVATE=1`): bắt buộc có khóa service-role
 *   trên máy chủ và bucket phải PRIVATE ⇒ nếu chưa cấu hình thì route trả 503
 *   thay vì đọc/ghi bằng khoá công khai.
 * - Ngoài ra: không phát URL công khai (xem `SupabaseStorageProvider.getPublicUrl`).
 */
export async function ensureAttachmentStorageReady(): Promise<IStorageProvider> {
  const provider = getStorageProvider();
  if (provider.assertReady) await provider.assertReady();
  return provider;
}
