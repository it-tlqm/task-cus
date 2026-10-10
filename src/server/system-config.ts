import { prisma } from "./db";
import { recordAuditEvent } from "./audit";

export interface SystemConfigItem {
  id: string;
  key: string;
  value: string;
  dataType: "NUMBER" | "BOOLEAN" | "STRING";
  category: "TASK_MANAGEMENT" | "NOTIFICATION" | "DISPLAY" | "SECURITY";
  description: string;
  updatedBy?: string | null;
  updatedAt: Date;
  createdAt: Date;
}

export const DEFAULT_CONFIGS: Array<{
  key: string;
  value: string;
  dataType: "NUMBER" | "BOOLEAN" | "STRING";
  category: "TASK_MANAGEMENT" | "NOTIFICATION" | "DISPLAY" | "SECURITY";
  description: string;
  min?: number;
  max?: number;
}> = [
  {
    key: "taskDueSoonHours",
    value: "24",
    dataType: "NUMBER",
    category: "NOTIFICATION",
    description: "Khoảng thời gian cảnh báo nhiệm vụ sắp đến hạn (giờ)",
    min: 1,
    max: 168,
  },
  {
    key: "taskMaxWarningItems",
    value: "10",
    dataType: "NUMBER",
    category: "NOTIFICATION",
    description: "Số lượng nhiệm vụ cảnh báo tối đa được tạo trong mỗi đợt quét",
    min: 1,
    max: 50,
  },
  {
    key: "deadlineRequireReason",
    value: "true",
    dataType: "BOOLEAN",
    category: "TASK_MANAGEMENT",
    description: "Bắt buộc giải trình lý do khi cán bộ đề xuất lùi hạn nhiệm vụ",
  },
  {
    key: "notifyOnTaskAssign",
    value: "true",
    dataType: "BOOLEAN",
    category: "NOTIFICATION",
    description: "Tự động gửi thông báo điều hành khi cán bộ được giao nhiệm vụ mới",
  },
  {
    key: "unitDisplayName",
    value: "Chi cục Hải quan Cửa khẩu Quốc tế Tà Lùng",
    dataType: "STRING",
    category: "DISPLAY",
    description: "Tên chính thức của Chi cục hiển thị trên tiêu đề báo cáo và giao diện",
  },
];

/**
 * Đảm bảo các tham số cấu hình mặc định được khởi tạo trong PostgreSQL
 */
export async function ensureDefaultSystemConfigs(): Promise<void> {
  try {
    for (const def of DEFAULT_CONFIGS) {
      const existing = await prisma.systemConfig.findUnique({
        where: { key: def.key },
      });
      if (!existing) {
        await prisma.systemConfig.create({
          data: {
            key: def.key,
            value: def.value,
            dataType: def.dataType,
            category: def.category,
            description: def.description,
          },
        });
      }
    }
  } catch (err: any) {
    console.error("[SYSTEM CONFIG INIT ERROR]:", err.message);
  }
}

/**
 * Lấy toàn bộ danh sách cấu hình hệ thống từ PostgreSQL
 */
export async function getAllSystemConfigs(): Promise<SystemConfigItem[]> {
  await ensureDefaultSystemConfigs();
  const configs = await prisma.systemConfig.findMany({
    orderBy: [{ category: "asc" }, { key: "asc" }],
  });
  return configs as SystemConfigItem[];
}

/**
 * Lấy giá trị của một tham số theo key
 */
export async function getSystemConfig(key: string, defaultValue?: string): Promise<string> {
  const item = await prisma.systemConfig.findUnique({
    where: { key },
  });
  if (item) return item.value;
  const def = DEFAULT_CONFIGS.find((d) => d.key === key);
  return def ? def.value : defaultValue || "";
}

/**
 * Lấy giá trị kiểu số
 */
export async function getSystemConfigNumber(key: string, defaultValue: number = 24): Promise<number> {
  const val = await getSystemConfig(key);
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Lấy giá trị kiểu boolean
 */
export async function getSystemConfigBoolean(key: string, defaultValue: boolean = true): Promise<boolean> {
  const val = await getSystemConfig(key);
  if (!val) return defaultValue;
  return val === "true" || val === "1";
}

/**
 * Cập nhật một tham số cấu hình với validation chặt chẽ và ghi kiểm toán
 */
export async function updateSystemConfig(
  key: string,
  value: string,
  user: { id: string; fullName?: string; username: string; role: string }
): Promise<{ success: boolean; config?: SystemConfigItem; error?: string }> {
  const def = DEFAULT_CONFIGS.find((d) => d.key === key);
  if (!def) {
    return { success: false, error: `Tham số cấu hình "${key}" không nằm trong danh mục quản lý hợp lệ` };
  }

  // Validate value theo dataType
  let validatedValue = value.trim();

  if (def.dataType === "NUMBER") {
    const num = parseInt(validatedValue, 10);
    if (isNaN(num)) {
      return { success: false, error: `Giá trị của "${def.description}" phải là số nguyên hợp lệ` };
    }
    if (def.min !== undefined && num < def.min) {
      return { success: false, error: `Giá trị của "${def.description}" không được nhỏ hơn ${def.min}` };
    }
    if (def.max !== undefined && num > def.max) {
      return { success: false, error: `Giá trị của "${def.description}" không được vượt quá ${def.max}` };
    }
    validatedValue = num.toString();
  } else if (def.dataType === "BOOLEAN") {
    if (validatedValue !== "true" && validatedValue !== "false") {
      return { success: false, error: `Giá trị của "${def.description}" phải là "true" hoặc "false"` };
    }
  } else if (def.dataType === "STRING") {
    if (!validatedValue) {
      return { success: false, error: `Giá trị của "${def.description}" không được để trống` };
    }
    if (validatedValue.length > 255) {
      return { success: false, error: `Giá trị của "${def.description}" không được vượt quá 255 ký tự` };
    }
  }

  const existing = await prisma.systemConfig.findUnique({
    where: { key },
  });

  const updated = await prisma.systemConfig.upsert({
    where: { key },
    update: {
      value: validatedValue,
      updatedBy: user.fullName || user.username,
    },
    create: {
      key,
      value: validatedValue,
      dataType: def.dataType,
      category: def.category,
      description: def.description,
      updatedBy: user.fullName || user.username,
    },
  });

  // Ghi AuditEvent
  await recordAuditEvent({
    actorId: user.id,
    action: "SYSTEM_CONFIG_UPDATE",
    resourceType: "SystemConfig",
    resourceId: updated.id,
    oldData: existing ? { key, value: existing.value } : null,
    newData: {
      actorName: user.fullName || user.username,
      actorRole: user.role,
      key,
      value: updated.value,
      description: def.description,
    },
  });

  return { success: true, config: updated as SystemConfigItem };
}
