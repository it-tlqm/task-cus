"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Lock,
  User,
  ArrowRight,
  AlertCircle,
  Building2,
  KeyRound,
  CheckCircle2,
} from "lucide-react";

const DEMO_ACCOUNTS = [
  {
    username: "lanhdao",
    name: "Đ/c Hoàng Văn Định",
    role: "UNIT_LEADER",
    position: "Chi cục trưởng",
    description: "Toàn quyền điều hành, phê duyệt kế hoạch, xem toàn bộ đơn vị",
  },
  {
    username: "truongnhom_a",
    name: "Đ/c Nguyễn Văn An",
    role: "DEPARTMENT_LEADER",
    position: "Trưởng nhóm BP Nghiệp vụ A",
    description: "Lập và trình kế hoạch bộ phận A, phân công công việc nội bộ",
  },
  {
    username: "canbo_a",
    name: "Đ/c Trần Thị Mai",
    role: "STAFF",
    position: "Cán bộ BP Nghiệp vụ A",
    description: "Thực hiện nhiệm vụ được giao, cập nhật tiến độ, báo vướng mắc",
  },
  {
    username: "canbo_b",
    name: "Đ/c Lê Hoàng Quân",
    role: "STAFF",
    position: "Cán bộ BP Giám sát B",
    description: "Giám sát cổng barie, kiểm tra thực địa phương tiện vận tải",
  },
  {
    username: "admin",
    name: "Đ/c Đặng Quốc Bảo",
    role: "SYSTEM_ADMIN",
    position: "Quản trị viên CNTT",
    description: "Quản trị cơ cấu tổ chức, nhân sự, danh mục (không đọc task nghiệp vụ)",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("lanhdao");
  const [password, setPassword] = useState("demo123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Môi trường demo chỉ cho phép khi có cờ tường minh VÀ không phải là production
  const isDemoAllowed =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_ENABLE_DEMO_SWITCHER === "true";

  const handleLogin = async (customUser?: string, customPass?: string) => {
    const userToLogin = customUser || username;
    const passToLogin = customPass || password;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: userToLogin, password: passToLogin }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Đăng nhập thất bại");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Lỗi kết nối máy chủ");
    } finally {
      setLoading(false);
    }
  };

  const selectDemoAccount = (u: string) => {
    setUsername(u);
    setPassword("demo123");
    handleLogin(u, "demo123");
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8">
      {/* Mobile-aligned Brand Header (Stitch Mobile 390px Screen 6de0e0a4a10f) */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500 text-blue-950 shadow-lg font-bold">
          <Building2 className="w-7 h-7" />
        </div>
        <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          HẢI QUAN CỬA KHẨU QUỐC TẾ TÀ LÙNG
        </h1>
        <p className="text-[11px] sm:text-xs text-slate-400 font-medium uppercase tracking-wider">
          Hệ thống Quản lý Kế hoạch & Điều hành Tác nghiệp
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
        {/* Form Login */}
        <div className="md:col-span-5 bg-white py-6 sm:py-8 px-5 sm:px-6 shadow-xl rounded-2xl border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
              <Shield className="w-5 h-5 text-blue-900" />
              <h2 className="text-base font-bold text-slate-900">Đăng nhập tài khoản</h2>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
              className="mt-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700">Tên đăng nhập</label>
                <div className="mt-1 relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
                    placeholder="lanhdao, truongnhom_a..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Mật khẩu</label>
                <div className="mt-1 relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                    placeholder="Mật khẩu của bạn"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg shadow-sm text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 focus:outline-none disabled:opacity-50 transition-colors"
                >
                  {loading ? "Đang xác thực..." : "Đăng nhập hệ thống"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center text-[11px] text-slate-500">
            Môi trường: <span className="font-semibold text-amber-600">GIẢ LẬP NỘI BỘ (DEMO)</span>
            <br />
            Mật khẩu demo: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold text-slate-800">demo123</code>
          </div>
        </div>

        {/* Demo Role Selector (Chỉ hiển thị khi ở môi trường cách ly / phát triển) */}
        {isDemoAllowed && (
          <div className="md:col-span-7 bg-slate-800/80 backdrop-blur p-5 sm:p-6 rounded-2xl border border-slate-700 text-white space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-700">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-200">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  Chọn vai trò kiểm thử nhanh (1-Click Switch)
                </div>
                <span className="text-[10px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded font-mono">
                  RBAC DEMO
                </span>
              </div>

              <p className="text-xs text-slate-400 mt-2">
                Bấm vào một trong các tài khoản bên dưới để tự động đăng nhập và trải nghiệm phân quyền thực tế:
              </p>

              <div className="mt-3 space-y-2">
                {DEMO_ACCOUNTS.map((acc) => (
                  <div
                    key={acc.username}
                    onClick={() => selectDemoAccount(acc.username)}
                    className="p-2.5 sm:p-3 rounded-xl bg-slate-900/80 border border-slate-700/80 hover:border-amber-400/60 cursor-pointer transition-all hover:bg-slate-900 group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-950 border border-blue-800 flex items-center justify-center font-bold text-xs text-amber-400 font-mono">
                          {acc.username[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">
                            {acc.name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {acc.position} • <span className="font-mono text-slate-300">{acc.username}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-slate-800 border border-slate-700 text-slate-300">
                          {acc.role}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition-transform group-hover:translate-x-1" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-slate-500 pt-3 border-t border-slate-700/60 flex items-center justify-between">
              <span>Được bảo vệ bởi Scope Guard & Anti-IDOR</span>
              <span>Môi trường cách ly</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
