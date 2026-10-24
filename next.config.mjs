/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

// CSP: chỉ cho phép tài nguyên cùng nguồn + các nguồn tối thiểu đang dùng:
// - Google Fonts (Material Symbols nạp qua <link> trong layout.tsx)
// - Supabase Storage (ảnh minh chứng) và API AI (gọi từ server)
// 'unsafe-inline' cho script/style là bắt buộc với Next.js khi chưa cấu hình nonce.
// Chỉ thêm 'unsafe-eval'/WebSocket khi chạy dev để HMR hoạt động; bản production không có.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.supabase.co",
  `connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com${
    isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""
  }`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig = {
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // Cho phép minh chứng tối đa 20 MB khi tự vận hành; Vercel vẫn giới hạn request ~4,5 MB.
    middlewareClientMaxBodySize: "25mb",
  },
  // Vá lỗi xuất Excel 500 trên Vercel: hàm /api/monthly-export đọc template từ
  // public/templates/*.xlsx bằng fs (process.cwd()). Trên serverless, file trong
  // public/ không tự được đóng gói vào bundle hàm → fs.existsSync trả false.
  // Khai báo file tracing để Next.js copy kèm template khi đóng gói hàm này.
  outputFileTracingIncludes: {
    "/api/monthly-export": ["./public/templates/**"],
  },
  // Gia cố bảo vệ: chống nhúng khung (clickjacking), chặn đoán MIME, giới hạn Referer,
  // CSP chống XSS/chèn tài nguyên lạ và HSTS bắt buộc HTTPS trên production.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
