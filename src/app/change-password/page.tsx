"use client";

/**
 * /change-password — trang BẮT BUỘC đổi mật khẩu lần đầu cho tài khoản
 * quản trị kỹ thuật khởi tạo (middleware chặn mọi API/trang khác).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md p-8 flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
            Bắt buộc — lần đăng nhập đầu tiên
          </span>
          <h1 className="text-xl font-bold text-white">Đổi mật khẩu tài khoản quản trị</h1>
          <p className="text-sm text-white/70">
            Mật khẩu khởi tạo chỉ dùng một lần. Hãy đặt mật khẩu mới (tối thiểu 8 ký tự) trước khi sử dụng hệ thống.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-white/80">
            Mật khẩu hiện tại
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="rounded-lg bg-white/10 border border-white/15 px-3 py-2 text-white outline-none focus:border-amber-400"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-white/80">
            Mật khẩu mới
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="rounded-lg bg-white/10 border border-white/15 px-3 py-2 text-white outline-none focus:border-amber-400"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-white/80">
            Xác nhận mật khẩu mới
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="rounded-lg bg-white/10 border border-white/15 px-3 py-2 text-white outline-none focus:border-amber-400"
            />
          </label>

          {error ? (
            <p className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 px-4 py-2.5 font-semibold text-slate-950 transition-colors"
          >
            {loading ? "Đang lưu..." : "Đổi mật khẩu và đăng nhập lại"}
          </button>
        </form>
      </div>
    </main>
  );
}
