"use client";

import React, { useState } from "react";
import { toast } from "./Toast";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Vui lòng điền đầy đủ các trường thông tin");
      return;
    }

    if (newPassword.length < 8) {
      setError("Mật khẩu mới phải có độ dài tối thiểu 8 ký tự");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không trùng khớp");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Đổi mật khẩu thất bại");
      }

      toast.success(data.message || "Đã đổi mật khẩu thành công!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onClose();
    } catch (err: any) {
      setError(err.message || "Lỗi kết nối");
      toast.error(err.message || "Đổi mật khẩu thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-surface-container-lowest rounded-2xl max-w-md w-full p-6 shadow-2xl border border-border-default/60 flex flex-col gap-4 animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">password</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-primary font-bold text-base">
                Thay Đổi Mật Khẩu Cá Nhân
              </h3>
              <p className="font-label-sm text-[11px] text-on-surface-variant">
                Bảo vệ tài khoản tác nghiệp công vụ nội bộ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-outline hover:text-on-surface hover:bg-surface-subtle transition-fast"
            aria-label="Đóng modal"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-lg bg-status-danger-bg text-status-danger text-xs flex items-center gap-2 border border-status-danger/20">
            <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {/* Mật khẩu hiện tại */}
          <div className="flex flex-col gap-1">
            <label className="font-body-semibold text-xs text-on-surface">
              Mật khẩu hiện tại <span className="text-status-danger">*</span>
            </label>
            <input
              type={showPass ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Nhập mật khẩu đang sử dụng"
              required
              className="h-10 px-3 rounded-lg bg-surface border border-border-subtle text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-fast"
            />
          </div>

          {/* Mật khẩu mới */}
          <div className="flex flex-col gap-1">
            <label className="font-body-semibold text-xs text-on-surface">
              Mật khẩu mới (Tối thiểu 8 ký tự) <span className="text-status-danger">*</span>
            </label>
            <input
              type={showPass ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nhập mật khẩu mới an toàn"
              required
              minLength={8}
              className="h-10 px-3 rounded-lg bg-surface border border-border-subtle text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-fast"
            />
          </div>

          {/* Xác nhận mật khẩu mới */}
          <div className="flex flex-col gap-1">
            <label className="font-body-semibold text-xs text-on-surface">
              Xác nhận mật khẩu mới <span className="text-status-danger">*</span>
            </label>
            <input
              type={showPass ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
              required
              minLength={8}
              className="h-10 px-3 rounded-lg bg-surface border border-border-subtle text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-fast"
            />
          </div>

          {/* Toggle hiển thị mật khẩu */}
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-on-surface-variant">
            <input
              type="checkbox"
              checked={showPass}
              onChange={(e) => setShowPass(e.target.checked)}
              className="rounded border-border-subtle text-secondary focus:ring-secondary"
            />
            <span>Hiển thị ký tự mật khẩu</span>
          </label>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-surface-subtle text-on-surface-variant hover:bg-surface-container transition-fast"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-secondary text-on-secondary hover:bg-secondary/90 transition-fast shadow-sm flex items-center gap-1.5 active-press"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span>
                  <span>Đang cập nhật...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">check</span>
                  <span>Lưu mật khẩu mới</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
