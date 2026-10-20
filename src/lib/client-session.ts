import { clearPermissionsCache } from "@/hooks/usePermissions";

/**
 * Xóa phiên ở client sau khi server đã xóa cookie.
 * Dùng chung cho header desktop, drawer mobile và các nút đăng xuất khác.
 */
export async function clearClientSession(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Vẫn tiếp tục xóa dữ liệu cục bộ nếu mất mạng.
  }

  clearPermissionsCache();

  if (typeof window !== "undefined") {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
  }
}
