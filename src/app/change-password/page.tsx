"use client";

import { V5Icon } from "@/components/v5/ui/lucide-icon";

/**
 * /change-password — trang BẮT BUỘC đổi mật khẩu lần đầu cho tài khoản
 * quản trị kỹ thuật khởi tạo (middleware chặn mọi API/trang khác).
 *
 * Giao diện dùng đúng design system (token màu/chữ của Stitch export),
 * đồng bộ với trang /login: nền app-bg, card surface-container-lowest,
 * input surface-subtle + focus secondary, nút primary.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  autoFocus?: boolean;
  show: boolean;
  minLength?: number;
};

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
  show,
  minLength,
}: PasswordFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold text-xs text-v5-ink flex items-center justify-between">
        <span className="font-bold">{label}</span>
        <span className="text-v5-danger" aria-hidden="true">
          *
        </span>
      </label>
      <div className="relative flex items-center">
        <V5Icon name="lock" className="absolute left-3 text-v5-muted text-[18px] pointer-events-none" />
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
          minLength={minLength}
          className="w-full h-11 pl-10 pr-3 rounded-lg bg-v5-bg text-sm text-v5-ink placeholder:text-v5-muted/70 outline-none border border-v5-line focus:border-v5-accent focus:bg-v5-surface focus:ring-1 focus:ring-v5-accent transition-fast"
        />
      </div>
    </div>
  );
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("Mật khẩu mới phải có tối thiểu 8 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Xác nhận mật khẩu mới không trùng khớp.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Không đổi được mật khẩu.");
      // Đã đổi mật khẩu → phiên cũ không còn giá trị: đăng nhập lại.
      // Dọn khoá phiên do bản cũ để lại trước khi rời trang.
      localStorage.removeItem("token");
      localStorage.removeItem("currentUser");
      router.push("/login?changed=1");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Lỗi khi đổi mật khẩu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-transparent text-v5-ink flex flex-col items-center justify-center px-4 py-10 antialiased">
      <div className="w-full max-w-[440px] flex flex-col gap-space-md">
        {/* Thương hiệu + tiêu đề (đồng bộ trang đăng nhập) */}
        <div className="flex flex-col items-center text-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-v5-gold-soft border border-v5-gold/30">
            <V5Icon name="verified_user" className="text-v5-gold-ink text-[14px]" />
            <span className="text-[11px] text-v5-gold-ink uppercase tracking-wider font-semibold">
              Bắt buộc — lần đăng nhập đầu tiên
            </span>
          </div>
          <img
            src="/images/logo-haiquan.png"
            alt="Logo Hải quan Việt Nam"
            className="w-14 h-14 rounded-full object-cover bg-v5-surface shadow-md ring-4 ring-v5-accent/10"
          />
          <p className="text-[11px] text-v5-muted uppercase tracking-widest font-semibold">
            Hải quan cửa khẩu Quốc tế Tà Lùng
          </p>
          <h1 className="font-headline-lg text-v5-ink font-bold">Đổi mật khẩu tài khoản quản trị</h1>
          <p className="text-sm text-v5-muted">
            Mật khẩu khởi tạo chỉ dùng một lần. Hãy đặt mật khẩu mới (tối thiểu 8 ký tự) trước khi sử dụng hệ thống.
          </p>
        </div>

        {/* Card biểu mẫu */}
        <div className="w-full bg-v5-surface rounded-2xl border border-v5-line/60 shadow-md p-6 flex flex-col gap-4">
          <div className="flex items-start gap-2 rounded-lg bg-v5-gold-soft border border-v5-gold/20 p-3">
            <V5Icon name="info" className="text-v5-gold-ink text-[18px] shrink-0 mt-0.5" />
            <p className="text-xs text-v5-muted leading-relaxed">
              Đây là tài khoản quản trị kỹ thuật. Sau khi đổi mật khẩu, hệ thống sẽ đăng xuất và yêu cầu
              đăng nhập lại bằng mật khẩu mới.
            </p>
          </div>

          {error ? (
            <div className="w-full bg-v5-danger-soft rounded-lg p-3 flex items-start gap-2 border border-v5-danger/20">
              <V5Icon name="error" className="text-v5-danger text-[18px] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-v5-danger font-bold">Không đổi được mật khẩu</span>
                  <button
                    type="button"
                    onClick={() => setError("")}
                    className="text-v5-danger/70 hover:text-v5-danger p-0.5 transition-fast"
                    aria-label="Đóng thông báo"
                  >
                    <V5Icon name="close" className="text-[15px]" />
                  </button>
                </div>
                <p className="text-xs text-v5-muted mt-0.5 leading-normal">{error}</p>
              </div>
            </div>
          ) : null}

          <form onSubmit={submit} className="flex flex-col gap-4">
            <PasswordField
              id="currentPassword"
              label="Mật khẩu hiện tại"
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="Nhập mật khẩu khởi tạo được cấp..."
              autoComplete="current-password"
              autoFocus
              show={showPassword}
            />
            <PasswordField
              id="newPassword"
              label="Mật khẩu mới"
              value={newPassword}
              onChange={setNewPassword}
              placeholder="Tối thiểu 8 ký tự..."
              autoComplete="new-password"
              minLength={8}
              show={showPassword}
            />
            <PasswordField
              id="confirmPassword"
              label="Xác nhận mật khẩu mới"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Nhập lại mật khẩu mới..."
              autoComplete="new-password"
              minLength={8}
              show={showPassword}
            />

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="w-4 h-4 rounded text-v5-accent focus:ring-0 cursor-pointer accent-v5-accent"
              />
              <span className="text-xs text-v5-muted">Hiển thị ký tự mật khẩu</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-v5-accent hover:bg-v5-accent-soft text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2 shadow-md active-press transition-fast font-bold disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <>
                  <V5Icon name="progress_activity" className="animate-spin text-[18px]" />
                  <span>Đang cập nhật...</span>
                </>
              ) : (
                <>
                  <V5Icon name="password" className="text-[18px]" />
                  <span>Đổi mật khẩu và đăng nhập lại</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => router.push("/login")}
              disabled={loading}
              className="text-xs font-semibold text-v5-muted hover:text-v5-ink transition-fast text-center disabled:opacity-60"
            >
              Quay lại trang đăng nhập
            </button>
          </form>
        </div>

        {/* Chân trang tuân thủ (đồng bộ trang đăng nhập) */}
        <footer className="text-center flex flex-col items-center gap-1 pt-1">
          <div className="inline-flex items-center gap-1.5 text-v5-muted">
            <V5Icon name="lock" className="text-[13px]" />
            <span className="text-[11px] font-mono">Kết nối an toàn nội bộ</span>
          </div>
          <p className="text-[11px] text-v5-muted">
            Hải quan cửa khẩu Quốc tế Tà Lùng • Tỉnh Cao Bằng
          </p>
        </footer>
      </div>
    </main>
  );
}
