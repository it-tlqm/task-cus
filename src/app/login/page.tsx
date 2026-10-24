"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import { clearPermissionsCache } from "@/hooks/usePermissions";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (customUser?: string, customPass?: string) => {
    const userToLogin = customUser || username;
    const passToLogin = customPass || password;

    if (!userToLogin.trim()) {
      setError("Vui lòng nhập mã cán bộ hoặc tên đăng nhập");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: userToLogin.trim(), password: passToLogin, remember: rememberSession }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Thông tin tài khoản hoặc mật khẩu không chính xác");
      }

      // Phiên đăng nhập chỉ dùng cookie HttpOnly do API đặt — KHÔNG lưu JWT/người dùng
      // vào localStorage (tránh lộ token qua XSS). Chỉ xóa cache quyền của tài khoản cũ.
      clearPermissionsCache();
      // Dọn khoá phiên do bản cũ để lại (nếu người dùng chưa tải lại trang).
      localStorage.removeItem("token");
      localStorage.removeItem("currentUser");

      toast.success("Đăng nhập thành công! Đang chuyển hướng...");
      // Tài khoản khởi tạo: bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên.
      if (data.mustChangePassword) {
        router.push("/change-password");
        router.refresh();
        return;
      }
      // Quay lại đúng trang đã yêu cầu trước khi bị chặn (middleware ?redirect=), chống open-redirect
      let dest = "/dashboard";
      try {
        const sp = new URLSearchParams(window.location.search);
        const r = sp.get("redirect") || "";
        if (r.startsWith("/") && !r.startsWith("//") && !r.startsWith("/login")) dest = r;
      } catch {}
      if (data.user?.role === "SYSTEM_ADMIN" && dest === "/dashboard") {
        dest = "/admin/system";
      }
      router.push(dest);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Lỗi kết nối máy chủ");
      toast.error(err.message || "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-app-bg text-on-surface flex flex-col lg:flex-row antialiased">
      {/* =========================================================================
          LEFT HERO PANEL (DESKTOP ONLY — Split-screen Enterprise Layout)
          ========================================================================= */}
      <section className="hidden lg:flex lg:w-1/2 xl:w-[54%] bg-gradient-to-br from-primary-container via-[#10243a] to-primary text-on-primary flex-col justify-between p-10 xl:p-14 relative overflow-hidden shadow-2xl">
        {/* Subtle decorative background ambient elements */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-secondary/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-primary-fixed/10 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none opacity-40" />

        {/* Top Header & Official Insignia */}
        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <img
              src="/images/logo-haiquan.png"
              alt="Logo Hải quan Việt Nam"
              className="w-14 h-14 rounded-full object-cover shadow-lg ring-4 ring-white/10 shrink-0 bg-white"
            />
            <div className="flex flex-col">
              <h2 className="text-lg xl:text-xl font-bold tracking-tight text-white leading-snug">
                HẢI QUAN CỬA KHẨU QUỐC TẾ TÀ LÙNG
              </h2>
              <span className="text-xs text-white/70">
                Bộ phận Công nghệ thông tin &amp; Điều hành tác nghiệp
              </span>
            </div>
          </div>
        </div>

        {/* Center Main Showcase & Bento Operational Highlights */}
        <div className="relative z-10 my-auto py-8 flex flex-col gap-6">
          <div className="flex flex-col gap-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 w-fit">
              <span className="w-2 h-2 rounded-full bg-status-success animate-pulse" />
              <span className="text-xs font-semibold tracking-wide uppercase text-secondary-fixed">
                HỆ THỐNG ĐIỀU HÀNH SỐ HÓA TALUNG-CUS-WORK v1.2.4
              </span>
            </div>
            <h1 className="text-2xl xl:text-3xl font-extrabold text-white tracking-tight leading-tight mt-1">
              Quản Lý Kế Hoạch &amp; Điều Hành Tác Nghiệp Hải Quan
            </h1>
            <p className="text-sm xl:text-base text-white/80 leading-relaxed">
              Nền tảng số hóa 6 nhóm nghiệp vụ và 348 đầu công việc thường xuyên; hỗ trợ phân công nhiệm vụ, ghi nhận nhật ký hằng ngày và xuất biểu mẫu Excel Mẫu A &amp; Mẫu B tự động.
            </p>
          </div>

          {/* 4 Feature Highlights Grid */}
          <div className="grid grid-cols-2 gap-3.5 max-w-xl">
            <div className="p-3.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 flex flex-col gap-1.5 hover:bg-white/10 transition-colors">
              <div className="flex items-center gap-2 text-secondary-fixed">
                <span className="material-symbols-outlined text-[20px]">calendar_month</span>
                <span className="text-xs font-bold uppercase tracking-wider">Kế hoạch tuần &amp; tháng</span>
              </div>
              <p className="text-xs text-white/75 leading-normal">
                Lập, trình duyệt và phân rã đầu việc theo 6 nhóm nghiệp vụ chuẩn theo cơ cấu tổ chức.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 flex flex-col gap-1.5 hover:bg-white/10 transition-colors">
              <div className="flex items-center gap-2 text-secondary-fixed">
                <span className="material-symbols-outlined text-[20px]">touch_app</span>
                <span className="text-xs font-bold uppercase tracking-wider">1-Chạm không phát sinh</span>
              </div>
              <p className="text-xs text-white/75 leading-normal">
                Xác nhận nhật ký công tác linh hoạt, bảo toàn KPI khi không phát sinh vụ việc.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 flex flex-col gap-1.5 hover:bg-white/10 transition-colors">
              <div className="flex items-center gap-2 text-secondary-fixed">
                <span className="material-symbols-outlined text-[20px]">table_view</span>
                <span className="text-xs font-bold uppercase tracking-wider">Xuất Excel Mẫu A &amp; B</span>
              </div>
              <p className="text-xs text-white/75 leading-normal">
                Xuất biểu tổng hợp 8 cột và báo cáo chi tiết 13 cột đúng biểu mẫu quy định.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 flex flex-col gap-1.5 hover:bg-white/10 transition-colors">
              <div className="flex items-center gap-2 text-secondary-fixed">
                <span className="material-symbols-outlined text-[20px]">verified_user</span>
                <span className="text-xs font-bold uppercase tracking-wider">Bảo mật &amp; Chốt số liệu</span>
              </div>
              <p className="text-xs text-white/75 leading-normal">
                Phân quyền chặt chẽ theo đơn vị, số liệu chốt kỳ được khóa và bảo toàn nguyên vẹn.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Operational Status */}
        <div className="relative z-10 pt-4 border-t border-white/15 flex items-center justify-between text-xs text-white/70">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-fixed text-[16px]">lock</span>
            <span>Xác thực an toàn nội bộ • Kết nối cơ sở dữ liệu PostgreSQL</span>
          </div>
          <span className="font-mono text-white/50">Mã đơn vị: HQTL-2026</span>
        </div>
      </section>

      {/* =========================================================================
          RIGHT AUTHENTICATION PANEL (Responsive for both Mobile & Desktop)
          ========================================================================= */}
      <section className="w-full lg:w-1/2 xl:w-[46%] flex flex-col justify-center items-center p-6 sm:p-10 lg:p-12 xl:p-14 min-h-screen bg-app-bg overflow-y-auto">
        <div className="w-full max-w-[420px] flex flex-col gap-space-md py-4">
          {/* Mobile Top Brand Header (Shown only on small screens) */}
          <div className="lg:hidden flex flex-col items-center text-center pb-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-status-warning-bg shadow-sm mb-3">
              <span className="material-symbols-outlined text-status-warning text-[14px]">
                verified_user
              </span>
              <span className="font-label-sm text-[11px] text-status-warning uppercase tracking-wider font-semibold">
                CỔNG ĐĂNG NHẬP NỘI BỘ
              </span>
            </div>
            <img
              src="/images/logo-haiquan.png"
              alt="Logo Hải quan Việt Nam"
              className="w-12 h-12 rounded-full object-cover bg-white shadow-md mb-2"
            />
            <p className="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-widest font-semibold">
              HẢI QUAN CỬA KHẨU QUỐC TẾ TÀ LÙNG
            </p>
            <h1 className="font-headline-md text-primary mt-0.5 leading-snug font-bold">
              HỆ THỐNG QUẢN LÝ KẾ HOẠCH &amp; CÔNG VIỆC
            </h1>
          </div>

          {/* Desktop Form Header Banner */}
          <div className="hidden lg:flex flex-col gap-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-status-warning-bg border border-status-warning/30 w-fit mb-1">
              <span className="material-symbols-outlined text-status-warning text-[13px]">verified_user</span>
              <span className="font-label-sm text-[11px] text-status-warning uppercase font-semibold">
                CỔNG ĐĂNG NHẬP NỘI BỘ CHI CỤC
              </span>
            </div>
            <h2 className="font-headline-lg text-primary font-bold tracking-tight text-2xl">
              Đăng Nhập Cổng Tác Nghiệp
            </h2>
            <p className="text-on-surface-variant text-sm">
              Nhập mã định danh công chức và mật khẩu được cấp để truy cập:
            </p>
          </div>

          {/* Authentication Alert Box (Error) */}
          {error && (
            <div className="w-full bg-status-danger-bg rounded-lg p-3 flex items-start gap-2 shadow-sm border border-status-danger/20 transition-panel">
              <span className="material-symbols-outlined text-status-danger text-[18px] shrink-0 mt-0.5">error</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-body-semibold text-xs text-status-danger font-bold">Đăng nhập không thành công</span>
                  <button
                    className="text-status-danger/70 hover:text-status-danger p-0.5"
                    onClick={() => setError(null)}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[15px]">close</span>
                  </button>
                </div>
                <p className="text-xs text-on-surface-variant mt-0.5 leading-normal">
                  {error}
                </p>
              </div>
            </div>
          )}

          {/* Main Login Card Container */}
          <div className="w-full bg-surface-container-lowest rounded-2xl p-6 shadow-md border border-border-default/60">
            <form
              className="flex flex-col gap-4"
              id="loginForm"
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
            >
              {/* Username Field */}
              <div className="flex flex-col gap-1">
                <label className="font-body-semibold text-xs text-on-surface flex items-center justify-between" htmlFor="usernameInput">
                  <span className="font-bold">Mã cán bộ / Tên đăng nhập</span>
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
                    badge
                  </span>
                  <input
                    id="usernameInput"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Nhập tên đăng nhập hoặc mã cán bộ..."
                    className="w-full h-11 pl-10 pr-3 rounded-lg bg-surface-subtle font-body-md text-sm text-on-surface placeholder:text-outline/70 outline-none border border-border-subtle focus:border-secondary focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary transition-fast"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="font-body-semibold text-xs text-on-surface font-bold" htmlFor="passwordInput">
                    Mật khẩu bảo mật
                  </label>
                </div>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
                    key
                  </span>
                  <input
                    id="passwordInput"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu..."
                    className="w-full h-11 pl-10 pr-10 rounded-lg bg-surface-subtle font-body-md text-sm text-on-surface placeholder:text-outline/70 outline-none border border-border-subtle focus:border-secondary focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary transition-fast"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Hiển thị mật khẩu"
                    className="absolute right-2.5 p-1 text-outline hover:text-on-surface flex items-center justify-center rounded"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Checkbox: Remember Session */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberSession}
                  onChange={(e) => setRememberSession(e.target.checked)}
                  className="w-4 h-4 rounded text-secondary focus:ring-0 cursor-pointer accent-[#006a62]"
                />
                <span className="text-xs text-on-surface-variant">
                  Ghi nhớ phiên làm việc trên thiết bị công vụ này
                </span>
              </label>

              {/* Primary Action Button */}
              <button
                type="submit"
                id="submitBtn"
                disabled={loading}
                className="w-full h-11 bg-primary hover:bg-primary-container text-on-primary rounded-lg font-body-semibold text-sm flex items-center justify-center gap-2 shadow-md active-press transition-fast font-bold disabled:opacity-60 cursor-pointer"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    <span>Đang xác thực bảo mật...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">login</span>
                    <span>Đăng nhập hệ thống</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Compliance & Security Footer */}
          <footer className="text-center flex flex-col items-center gap-1 pt-1">
            <div className="inline-flex items-center gap-1.5 text-outline">
              <span className="material-symbols-outlined text-[13px]">terminal</span>
              <span className="text-[11px] font-mono">Bản dựng: v1.2.4-TL (Enterprise Build)</span>
            </div>
            <p className="text-[11px] text-on-surface-variant">
              Hải quan cửa khẩu Quốc tế Tà Lùng • Tỉnh Cao Bằng
            </p>
          </footer>
        </div>
      </section>
    </div>
  );
}
