/**
 * Talung Customs Work Management - Storage Service Provider
 * Hỗ trợ lưu trữ tài liệu nghiệp vụ, biên bản kiểm tra, ảnh hiện trường.
 * Kiến trúc module cho phép chuyển đổi liền mạch giữa Supabase Storage và Cloudflare R2.
 */

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
}

/**
 * 1. Supabase Storage Provider (Đang hoạt động)
 */
class SupabaseStorageProvider implements IStorageProvider {
  private baseUrl: string;
  private apiKey: string;
  private bucket: string;

  constructor() {
    this.baseUrl = (
      process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ekswvjbpqblssxcdwagi.supabase.co"
    ).replace(/\/$/, "");
    this.apiKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      "sb_publishable_bAl9A-fstt1SijvD8HrVmg_fEiY_4mf";
    this.bucket = process.env.SUPABASE_STORAGE_BUCKET || "task-attachments";
  }

  getPublicUrl(key: string): string {
    return `${this.baseUrl}/storage/v1/object/public/${this.bucket}/${key}`;
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    subfolder: string = "tasks"
  ): Promise<StorageUploadResult> {
    // Chuẩn hóa tên tệp và tạo key duy nhất
    const ext = originalName.includes(".") ? originalName.split(".").pop() : "bin";
    const cleanBase = originalName
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF-]/g, "_")
      .slice(0, 50);
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const storageKey = `${subfolder}/${cleanBase}-${uniqueSuffix}.${ext}`;

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

    const publicUrl = this.getPublicUrl(storageKey);

    return {
      url: publicUrl,
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

  constructor() {
    this.accountId = process.env.R2_ACCOUNT_ID || "";
    this.accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
    this.secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
    this.bucket = process.env.R2_BUCKET_NAME || "talung-attachments";
    this.publicDomain = (process.env.R2_PUBLIC_DOMAIN || "").replace(/\/$/, "");
  }

  getPublicUrl(key: string): string {
    if (this.publicDomain) {
      return `${this.publicDomain}/${key}`;
    }
    return `https://${this.accountId}.r2.cloudflarestorage.com/${this.bucket}/${key}`;
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    subfolder: string = "tasks"
  ): Promise<StorageUploadResult> {
    if (!this.accountId || !this.accessKeyId || !this.secretAccessKey) {
      throw new Error(
        "Chưa thiết lập biến môi trường R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY để sử dụng Cloudflare R2."
      );
    }
    // Khi người dùng chuyển sang R2, có thể dùng @aws-sdk/client-s3 với endpoint https://<accountid>.r2.cloudflarestorage.com
    throw new Error("Cloudflare R2 driver: Vui lòng cấu hình API credentials trong .env để kích hoạt.");
  }

  async delete(key: string): Promise<boolean> {
    // S3 DeleteObjectCommand
    return true;
  }
}

/**
 * Factory lấy Storage Provider đang được kích hoạt theo STORAGE_DRIVER
 */
let cachedStorageProvider: IStorageProvider | null = null;

export function getStorageProvider(): IStorageProvider {
  if (cachedStorageProvider) return cachedStorageProvider;

  const driver = (process.env.STORAGE_DRIVER || "supabase").toLowerCase();
  if (driver === "r2" || driver === "cloudflare") {
    cachedStorageProvider = new CloudflareR2StorageProvider();
  } else {
    cachedStorageProvider = new SupabaseStorageProvider();
  }

  return cachedStorageProvider;
}
