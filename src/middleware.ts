import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_FALLBACK_SECRET = "talung_cus_work_demo_jwt_secret_2026";

function requireJwtSecret(): Uint8Array {
  const configured = process.env.JWT_SECRET;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("SECURITY: JWT_SECRET chưa được cấu hình trong môi trường production");
  }
  if (!configured) {
    console.warn("[middleware] JWT_SECRET chưa cấu hình — dùng secret demo, CHỈ cho môi trường phát triển");
  }
  return new TextEncoder().encode(configured || JWT_FALLBACK_SECRET);
}

// Danh sách các đường dẫn công khai không cần session — so khớp CHÍNH XÁC.
// Danh sách ĐÓNG: không dùng regex đuôi file chung (mọi path có dấu chấm từng bị bỏ qua auth).
// Chỉ các tệp gốc thật sự tồn tại trong public/ mới được liệt kê; `/login-abc`,
// `/manifest.webmanifest.bak`, `/sw.js.map`... vẫn phải qua auth.
const PUBLIC_EXACT_PATHS = new Set([
  "/login",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/sw.js",
]);

// Chỉ các thư mục tài nguyên tĩnh mới dùng prefix (so khớp theo segment, không theo chuỗi thô).
const PUBLIC_PREFIXES = ["/_next", "/images", "/fonts"];

// Danh sách API công khai hoặc tự xử lý kiểm tra — cũng so khớp CHÍNH XÁC.
const PUBLIC_API_PATHS = new Set(["/api/auth/login", "/api/auth/me", "/api/health"]);

/** `/login/` tương đương `/login`; không nới rộng sang `/login-abc`. */
function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const publicPath = normalizePath(pathname);

  // 1. Cho phép tài nguyên tĩnh và trang login (exact path hoặc prefix thư mục).
  // KHÔNG bypass theo dấu chấm: `/admin/system/foo.bar` và `/api/tasks/foo.json` vẫn phải qua auth.
  if (
    PUBLIC_EXACT_PATHS.has(publicPath) ||
    PUBLIC_PREFIXES.some((prefix) => matchesPrefix(publicPath, prefix))
  ) {
    return NextResponse.next();
  }

  // 2. Trích xuất token từ Authorization Header hoặc Cookie
  let token: string | undefined;
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else {
    token = req.cookies.get("token")?.value;
  }

  let isAuthenticated = false;
  let mustChangePassword = false;

  if (token) {
    // Fail-fast khi thiếu JWT_SECRET ở production (throw ra ngoài try để không bị nuốt)
    const secretKey = requireJwtSecret();
    try {
      const { payload } = await jwtVerify(token, secretKey);
      isAuthenticated = true;
      // Tài khoản khởi tạo: bắt buộc đổi mật khẩu trước khi dùng hệ thống.
      mustChangePassword = payload?.mustChangePassword === true;
    } catch {
      isAuthenticated = false;
    }
  }

  // 3.1 Bắt buộc đổi mật khẩu (tài khoản quản trị khởi tạo) — chỉ mở trang/API đổi mật khẩu
  if (isAuthenticated && mustChangePassword) {
    const allowed =
      pathname.startsWith("/api/auth/change-password") ||
      pathname.startsWith("/api/auth/logout") ||
      pathname.startsWith("/api/auth/me") ||
      pathname === "/change-password" ||
      pathname.startsWith("/_next");
    if (!allowed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            success: false,
            error: "PHẢI ĐỔI MẬT KHẨU",
            message: "Tài khoản này phải đổi mật khẩu ở lần đăng nhập đầu tiên.",
          },
          { status: 403 }
        );
      }
      const cpUrl = new URL("/change-password", req.url);
      return NextResponse.redirect(cpUrl);
    }
    return NextResponse.next();
  }

  // 3. Nếu chưa xác thực
  if (!isAuthenticated) {
    // Nếu là API route (không nằm trong danh sách public) -> Trả về HTTP 401 Unauthorized
    if (pathname.startsWith("/api/")) {
      if (PUBLIC_API_PATHS.has(publicPath)) {
        return NextResponse.next();
      }
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          message: "Yêu cầu đăng nhập tài khoản để truy cập tài nguyên bảo vệ",
        },
        { status: 401 }
      );
    }

    // Nếu là Page nghiệp vụ -> Chuyển hướng về /login (HTTP 307 Temporary Redirect)
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    const response = NextResponse.redirect(loginUrl);
    // Xóa cookie token không hợp lệ nếu có
    if (token) {
      response.cookies.delete("token");
    }
    return response;
  }

  // 4. Đã xác thực -> Tiếp tục yêu cầu
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images/ (public brand assets like the customs logo)
     */
    "/((?!_next/static|_next/image|favicon.ico|images/).*)",
  ],
};
