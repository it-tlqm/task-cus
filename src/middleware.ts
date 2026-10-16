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

// Danh sách các đường dẫn công khai không cần session
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/_next",
  "/favicon.ico",
  "/images",
  "/fonts",
];

// Danh sách các API công khai hoặc tự xử lý kiểm tra
const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/me",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Cho phép tài nguyên tĩnh và trang login
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
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

  if (token) {
    // Fail-fast khi thiếu JWT_SECRET ở production (throw ra ngoài try để không bị nuốt)
    const secretKey = requireJwtSecret();
    try {
      await jwtVerify(token, secretKey);
      isAuthenticated = true;
    } catch {
      isAuthenticated = false;
    }
  }

  // 3. Nếu chưa xác thực
  if (!isAuthenticated) {
    // Nếu là API route (không nằm trong danh sách public) -> Trả về HTTP 401 Unauthorized
    if (pathname.startsWith("/api/")) {
      if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
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
