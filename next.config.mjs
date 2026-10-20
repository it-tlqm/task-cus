/** @type {import('next').NextConfig} */
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
  // Gia cố bảo vệ cơ bản: chống nhúng khung (clickjacking), chặn đoán MIME, giới hạn Referer
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
