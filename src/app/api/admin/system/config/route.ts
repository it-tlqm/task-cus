import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";
import {
  getAllSystemConfigs,
  updateSystemConfig,
  getSystemConfig,
} from "@/server/system-config";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để truy cập cấu hình hệ thống", 401);
    }

    const canView =
      checkPermission(user, "system.config") ||
      user.role === "SYSTEM_ADMIN" ||
      user.role === "UNIT_LEADER";

    if (!canView) {
      return jsonError("Bạn không có quyền xem cấu hình hệ thống", 403);
    }

    const configs = await getAllSystemConfigs();
    return NextResponse.json({ success: true, data: configs });
  } catch (error: any) {
    return jsonError("Lỗi khi tải cấu hình hệ thống: " + error.message, 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để cập nhật cấu hình hệ thống", 401);
    }

    const canEdit =
      checkPermission(user, "system.config") ||
      user.role === "SYSTEM_ADMIN" ||
      user.role === "UNIT_LEADER";

    if (!canEdit) {
      return jsonError("Bạn không có quyền chỉnh sửa tham số cấu hình hệ thống", 403);
    }

    const body = await req.json().catch(() => ({}));
    const { key, value } = body;

    if (!key || typeof key !== "string" || value === undefined) {
      return jsonError("Khóa cấu hình (key) và giá trị mới (value) là bắt buộc", 400);
    }

    const result = await updateSystemConfig(key, String(value), user);
    if (!result.success) {
      return jsonError(result.error || "Cập nhật tham số cấu hình thất bại", 400);
    }

    return NextResponse.json({
      success: true,
      data: result.config,
      message: `Đã cập nhật thành công tham số "${result.config?.description || key}" thành "${result.config?.value}"`,
    });
  } catch (error: any) {
    return jsonError("Lỗi khi cập nhật cấu hình hệ thống: " + error.message, 500);
  }
}
