/**
 * Task 2.4 — Middleware KHÔNG còn bỏ qua auth cho path có dấu chấm.
 *
 * Unit test trực tiếp `middleware()` (không cần server, không cần DB):
 *   npx tsx scripts/test-v3-middleware-paths.ts
 *
 * Bối cảnh lỗi: `pathname.includes(".")` từng cho phép mọi path có dấu chấm
 * (`/admin/system/foo.bar`, `/api/tasks/<id>.json`) đi qua mà không xác thực.
 *
 * Các case bắt buộc:
 *   1. Chưa đăng nhập, GET /admin/system/foo.bar  -> 307 về /login (không phải next()).
 *   2. Chưa đăng nhập, GET /api/tasks/foo.json    -> 401 JSON.
 *   3. GET /images/logo-haiquan.png               -> next() (file public có thật).
 *   4. GET /_next/static/chunks/main.js           -> next().
 *   5. GET /login                                 -> next().
 *   6. GET /manifest.webmanifest, /sw.js          -> next() (file public có thật).
 *   7. Có JWT hợp lệ, GET /dashboard              -> next() (không chặn nhầm).
 *   8. GET /templates/<file>.xlsx (không đăng nhập) -> 307 (asset nghiệp vụ, không public).
 *   9. Public path/API so khớp CHÍNH XÁC: /api/auth/me, /api/health đi qua;
 *      /login-abc, /api/auth/login-extra, /api/healthz, /manifest.webmanifest.bak
 *      KHÔNG được bypass.
 *
 * Fail-closed: file public thiếu, import lỗi hay case không chạy được đều tính FAIL
 * và script thoát mã 1. Không chạm Production, không gọi HTTP ra ngoài.
 */
import fs from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";

const ROOT = process.cwd();
const BASE = "http://localhost:3000";
const TEST_JWT_SECRET = "task-2.4-middleware-unit-test-secret";

// middleware đọc JWT_SECRET tại thời điểm gọi; đặt trước mọi request.
// Không ghi đè biến đã có để không vô tình dùng secret thật của môi trường.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`[PASS] ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    failures.push(name);
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function makeRequest(pathname: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(pathname, BASE), { headers });
}

function isNext(res: Response): boolean {
  return res.status === 200 && res.headers.get("x-middleware-next") === "1";
}

async function expectNext(name: string, pathname: string, headers: Record<string, string> = {}) {
  try {
    const res = await middleware(makeRequest(pathname, headers));
    check(name, isNext(res), `status=${res.status} x-middleware-next=${res.headers.get("x-middleware-next")}`);
  } catch (err) {
    check(name, false, `middleware threw: ${(err as Error)?.message ?? err}`);
  }
}

async function expectRedirectToLogin(name: string, pathname: string) {
  try {
    const res = await middleware(makeRequest(pathname));
    const location = res.headers.get("location") || "";
    let locationPath = "";
    try {
      locationPath = new URL(location).pathname;
    } catch {
      locationPath = location;
    }
    check(
      name,
      res.status === 307 && locationPath === "/login",
      `status=${res.status} location=${location || "(none)"}`,
    );
  } catch (err) {
    check(name, false, `middleware threw: ${(err as Error)?.message ?? err}`);
  }
}

async function main() {
  // --- Chưa đăng nhập: path có dấu chấm KHÔNG được bypass ---
  await expectRedirectToLogin("unauth page có dấu chấm -> 307 /login", "/admin/system/foo.bar");
  await expectRedirectToLogin("unauth page .html -> 307 /login", "/dashboard/report.html");

  try {
    const res = await middleware(makeRequest("/api/tasks/foo.json"));
    let body: { success?: boolean } = {};
    try {
      body = await res.clone().json();
    } catch {
      body = {};
    }
    check(
      "unauth API có dấu chấm -> 401",
      res.status === 401 && body.success === false,
      `status=${res.status} success=${String(body.success)}`,
    );
  } catch (err) {
    check("unauth API có dấu chấm -> 401", false, `middleware threw: ${(err as Error)?.message ?? err}`);
  }

  // Template Excel là tài nguyên nghiệp vụ: không nằm trong danh sách public.
  const templateDir = path.join(ROOT, "public", "templates");
  const templateFile = fs.existsSync(templateDir)
    ? fs.readdirSync(templateDir).find((f) => f.endsWith(".xlsx"))
    : undefined;
  if (templateFile) {
    await expectRedirectToLogin(
      "unauth template .xlsx -> 307 /login",
      `/templates/${templateFile}`,
    );
  } else {
    check("unauth template .xlsx -> 307 /login", false, "không tìm thấy file .xlsx trong public/templates");
  }

  // --- Tài nguyên public có thật vẫn phải đi qua ---
  const logoPath = path.join(ROOT, "public", "images", "logo-haiquan.png");
  if (fs.existsSync(logoPath)) {
    await expectNext("GET /images/logo-haiquan.png -> next", "/images/logo-haiquan.png");
  } else {
    check("GET /images/logo-haiquan.png -> next", false, "thiếu public/images/logo-haiquan.png");
  }

  await expectNext("GET /_next/static/chunks/main.js -> next", "/_next/static/chunks/main.js");

  const manifestPath = path.join(ROOT, "public", "manifest.webmanifest");
  if (fs.existsSync(manifestPath)) {
    await expectNext("GET /manifest.webmanifest -> next", "/manifest.webmanifest");
  } else {
    check("GET /manifest.webmanifest -> next", false, "thiếu public/manifest.webmanifest");
  }

  const swPath = path.join(ROOT, "public", "sw.js");
  if (fs.existsSync(swPath)) {
    await expectNext("GET /sw.js -> next", "/sw.js");
  } else {
    check("GET /sw.js -> next", false, "thiếu public/sw.js");
  }

  await expectNext("GET /login -> next", "/login");
  await expectNext("GET /login/ (trailing slash) -> next", "/login/");
  await expectNext("GET /api/auth/login (public API) -> next", "/api/auth/login");
  await expectNext("GET /api/auth/me (public API) -> next", "/api/auth/me");
  await expectNext("GET /api/health (public API) -> next", "/api/health");

  // --- So khớp CHÍNH XÁC: tiền tố giống tên nhưng khác path không được bypass ---
  await expectRedirectToLogin("unauth /login-abc -> 307 /login", "/login-abc");
  await expectRedirectToLogin(
    "unauth /manifest.webmanifest.bak -> 307 /login",
    "/manifest.webmanifest.bak",
  );

  for (const apiPath of ["/api/auth/login-extra", "/api/auth/me/extra", "/api/healthz"]) {
    try {
      const res = await middleware(makeRequest(apiPath));
      check(
        `unauth ${apiPath} -> 401 (không bypass theo prefix)`,
        res.status === 401,
        `status=${res.status}`,
      );
    } catch (err) {
      check(`unauth ${apiPath} -> 401 (không bypass theo prefix)`, false, `middleware threw: ${(err as Error)?.message ?? err}`);
    }
  }

  // --- Đã đăng nhập: trang nghiệp vụ vẫn vào được ---
  try {
    const token = await new SignJWT({ sub: "task-2.4-test", mustChangePassword: false })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET as string));
    const cookie = `token=${token}`;
    await expectNext("auth GET /dashboard -> next", "/dashboard", { cookie });
    await expectNext("auth GET /admin/system/foo.bar -> next", "/admin/system/foo.bar", { cookie });
  } catch (err) {
    check("auth GET /dashboard -> next", false, `không ký được JWT test: ${(err as Error)?.message ?? err}`);
  }

  console.log(`\nTổng: ${passed} pass, ${failed} fail`);
  if (failed > 0) {
    console.error("FAIL: " + failures.join(" | "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("LỖI KHÔNG MONG ĐỢI:", err);
  process.exit(1);
});
