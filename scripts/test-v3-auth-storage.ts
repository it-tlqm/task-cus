/**
 * Task 2.1 — Regression: không lưu JWT/currentUser vào localStorage + CSP/HSTS.
 *
 * Luôn chạy kiểm tra tĩnh (source-level):
 *   npx tsx scripts/test-v3-auth-storage.ts
 *
 * Chạy thêm kiểm tra header và E2E bằng trình duyệt thật (Puppeteer + Brave/Chrome)
 * khi có server đang chạy và tài khoản test local:
 *   TEST_BASE_URL=http://127.0.0.1:3100 TEST_USERNAME=<local-test-user> \
 *     TEST_PASSWORD=<local-test-password> npx tsx scripts/test-v3-auth-storage.ts
 *
 * Lưu ý: script chỉ đọc/đăng nhập bằng tài khoản test do người chạy truyền vào,
 * không ghi hay đổi thông tin đăng nhập.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = process.cwd();
const BASE_URL = (process.env.TEST_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const TEST_USERNAME = process.env.TEST_USERNAME || "";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "";

let passed = 0;
let failed = 0;
let skipped = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${name}`);
  } else {
    failed++;
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function skip(name: string, reason: string) {
  skipped++;
  console.warn(`[SKIP] ${name} — ${reason}`);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git", "scripts", "demo-ops"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const WRITE_TOKEN = /localStorage\s*\.\s*setItem\s*\(\s*["'`]token["'`]/;
const WRITE_CURRENT_USER = /localStorage\s*\.\s*setItem\s*\(\s*["'`]currentUser["'`]/;

function sourceLevelChecks() {
  console.log("\n== Static checks ==");
  const login = read("src/app/login/page.tsx");
  const changePassword = read("src/app/change-password/page.tsx");
  const config = read("next.config.mjs");

  check("login page does not set localStorage.token", !WRITE_TOKEN.test(login));
  check("login page does not set localStorage.currentUser", !WRITE_CURRENT_USER.test(login));
  check("login page still clears permissions cache after login", login.includes("clearPermissionsCache();"));
  check(
    "login page imports clearPermissionsCache",
    /import\s*\{[^}]*clearPermissionsCache[^}]*\}\s*from\s*["']@\/hooks\/usePermissions["']/.test(login)
  );

  check("change-password page does not use localStorage", !/localStorage\s*[.\[]/.test(changePassword));
  check("change-password page does not set localStorage.token", !WRITE_TOKEN.test(changePassword));
  check("change-password page does not set localStorage.currentUser", !WRITE_CURRENT_USER.test(changePassword));

  const offenders: string[] = [];
  for (const file of walk(path.join(ROOT, "src"))) {
    const source = fs.readFileSync(file, "utf8");
    if (WRITE_TOKEN.test(source) || WRITE_CURRENT_USER.test(source)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
  check(
    "no source file writes token/currentUser to localStorage",
    offenders.length === 0,
    offenders.join(", ")
  );

  check("next.config.mjs configures Content-Security-Policy", config.includes('"Content-Security-Policy"'));
  check("next.config.mjs configures Strict-Transport-Security", config.includes('"Strict-Transport-Security"'));
  check("CSP keeps default-src 'self'", config.includes('"default-src \'self\'"'));
  check("CSP keeps frame-ancestors 'none'", config.includes('"frame-ancestors \'none\'"'));
  check("CSP keeps base-uri 'self'", config.includes('"base-uri \'self\'"'));
  check("CSP keeps form-action 'self'", config.includes('"form-action \'self\'"'));
  check("CSP allows Supabase Storage images", config.includes("https://*.supabase.co"));
  check("CSP allows Google Fonts stylesheet", config.includes("https://fonts.googleapis.com"));
  check("CSP allows Google Fonts files", config.includes("https://fonts.gstatic.com"));
  check("CSP allows AI API origin", config.includes("https://generativelanguage.googleapis.com"));
  check("existing security headers are preserved", ["X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy"].every((h) => config.includes(`"${h}"`)));
  check(
    "CSP only relaxes unsafe-eval in development",
    /isDev\s*\?\s*"\s*'unsafe-eval'"/.test(config) || config.includes(`isDev ? " 'unsafe-eval'"`)
  );
}

async function fetchServer(pathname: string, init: RequestInit = {}) {
  return fetch(`${BASE_URL}${pathname}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
    ...init,
  });
}

async function headerChecks(): Promise<boolean> {
  console.log("\n== Runtime header checks ==");
  let res: Response;
  try {
    res = await fetchServer("/login");
  } catch (error: any) {
    skip("runtime header checks", `server ${BASE_URL} unreachable: ${error?.message || error}`);
    return false;
  }

  const csp = res.headers.get("content-security-policy") || "";
  const hsts = res.headers.get("strict-transport-security") || "";
  check("/login responds successfully", res.status === 200, `status ${res.status}`);
  check("/login has Content-Security-Policy", csp.length > 0);
  check("CSP has default-src 'self'", csp.includes("default-src 'self'"));
  check("CSP has script-src 'self' 'unsafe-inline'", /script-src[^;]*'self'[^;]*'unsafe-inline'/.test(csp));
  check("CSP has frame-ancestors 'none'", csp.includes("frame-ancestors 'none'"));
  check("CSP has base-uri 'self'", csp.includes("base-uri 'self'"));
  check("CSP has form-action 'self'", csp.includes("form-action 'self'"));
  check("CSP allows Supabase images", /img-src[^;]*https:\/\/\*\.supabase\.co/.test(csp));
  check("CSP allows Google Fonts", /font-src[^;]*https:\/\/fonts\.gstatic\.com/.test(csp) && /style-src[^;]*https:\/\/fonts\.googleapis\.com/.test(csp));
  check("CSP allows AI + Supabase connect", /connect-src[^;]*https:\/\/\*\.supabase\.co/.test(csp) && csp.includes("https://generativelanguage.googleapis.com"));
  check("/login has Strict-Transport-Security", hsts.includes("max-age="));
  check("X-Frame-Options is preserved", res.headers.get("x-frame-options") === "DENY");
  check("X-Content-Type-Options is preserved", res.headers.get("x-content-type-options") === "nosniff");
  check("Referrer-Policy is preserved", !!res.headers.get("referrer-policy"));

  const me = await fetchServer("/api/auth/me");
  check("/api/auth/me responds 401 without cookie", me.status === 401, `status ${me.status}`);

  console.log(`[INFO] CSP: ${csp}`);
  return true;
}

function findBrowser(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function browserChecks(serverAvailable: boolean) {
  if (!serverAvailable) {
    skip("browser E2E", "server is not running");
    return;
  }

  const executablePath = findBrowser();
  if (!executablePath) {
    skip("browser E2E", "no Brave/Chrome/Edge executable found (set CHROME_PATH)");
    return;
  }

  console.log(`\n== Browser E2E (${executablePath}) ==`);
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedResponses: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });
  await page.evaluateOnNewDocument(() => {
    (window as any).__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event: any) => {
      (window as any).__cspViolations.push({
        blockedURI: event.blockedURI,
        violatedDirective: event.violatedDirective,
        sourceFile: event.sourceFile,
        lineNumber: event.lineNumber,
      });
    });
  });

  const readViolations = () =>
    page.evaluate(() => (window as any).__cspViolations || []);

  try {
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForSelector("#usernameInput", { timeout: 30_000 });

    const loginStorage = await page.evaluate(() => Object.keys(localStorage));
    check("plain /login load stores no token/currentUser", !loginStorage.includes("token") && !loginStorage.includes("currentUser"));

    const logo = await page.evaluate(() => {
      const img = Array.from(document.images).find((i) => i.src.includes("logo-haiquan"));
      return img ? { complete: img.complete, width: img.naturalWidth } : null;
    });
    check("logo loads under CSP", !!logo && logo.complete && logo.width > 0, JSON.stringify(logo));

    const fontAvailable = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('24px "Material Symbols Outlined"');
    });
    console.log(`[INFO] Material Symbols font available: ${fontAvailable}`);

    let violations = await readViolations();
    check("no CSP violation on /login", violations.length === 0, JSON.stringify(violations));

    if (!TEST_USERNAME || !TEST_PASSWORD) {
      skip("login flow", "set TEST_USERNAME/TEST_PASSWORD (local test account) to enable");
    } else {
      await page.type("#usernameInput", TEST_USERNAME);
      await page.type("#passwordInput", TEST_PASSWORD);
      await page.click("#submitBtn");

      let navigated = true;
      try {
        await page.waitForFunction(() => location.pathname !== "/login", { timeout: 45_000 });
      } catch {
        navigated = false;
      }
      if (!navigated) {
        const errorText = await page.evaluate(() => document.body.innerText.slice(0, 500));
        check("login succeeds", false, `still on /login. Page text: ${errorText.replace(/\s+/g, " ")}`);
      } else {
        check("login succeeds", true);
        await page.waitForNetworkIdle({ idleTime: 1000, timeout: 30_000 }).catch(() => {});

        const pathname = await page.evaluate(() => location.pathname);
        check("login redirects away from /login", pathname !== "/login", pathname);

        const storage = await page.evaluate(() => {
          const out: Record<string, string> = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)!;
            out[key] = String(localStorage.getItem(key)).slice(0, 200);
          }
          return out;
        });
        check("localStorage has no token after login", !("token" in storage), JSON.stringify(Object.keys(storage)));
        check("localStorage has no currentUser after login", !("currentUser" in storage), JSON.stringify(Object.keys(storage)));

        const cookies = await page.cookies();
        const tokenCookie = cookies.find((c) => c.name === "token");
        check("auth cookie token exists", !!tokenCookie);
        check("auth cookie token is HttpOnly", tokenCookie?.httpOnly === true);
        check("auth cookie token is SameSite=Lax", (tokenCookie?.sameSite || "").toLowerCase() === "lax", tokenCookie?.sameSite);

        const me = await page.evaluate(async () => {
          const res = await fetch("/api/auth/me", { cache: "no-store" });
          return { status: res.status, body: await res.json().catch(() => null) };
        });
        check("/api/auth/me works via cookie after login", me.status === 200 && me.body?.success === true, JSON.stringify(me));
        check("/api/auth/me returns the logged-in user", me.body?.user?.username === TEST_USERNAME, JSON.stringify(me.body?.user?.username));

        violations = await readViolations();
        check("no CSP violation after login", violations.length === 0, JSON.stringify(violations));

        const beforeReload = await page.evaluate(() => location.pathname);
        await page.reload({ waitUntil: "networkidle2", timeout: 60_000 });
        const afterReload = await page.evaluate(() => location.pathname);
        check("refresh keeps the authenticated page (cookie session)", afterReload === beforeReload, `${beforeReload} -> ${afterReload}`);

        const meAfterReload = await page.evaluate(async () => {
          const res = await fetch("/api/auth/me", { cache: "no-store" });
          return res.status;
        });
        check("/api/auth/me still works after refresh", meAfterReload === 200, `status ${meAfterReload}`);

        violations = await readViolations();
        check("no CSP violation after refresh", violations.length === 0, JSON.stringify(violations));
      }
    }

    const cspMessages = [...consoleErrors, ...pageErrors].filter(
      (m) => /content security policy|refused to/i.test(m)
    );
    check("no CSP console errors", cspMessages.length === 0, cspMessages.join(" | "));
    if (consoleErrors.length > 0) {
      console.log(`[INFO] console errors (non-CSP): ${consoleErrors.length}`);
      for (const msg of consoleErrors.slice(0, 5)) console.log(`  - ${msg}`);
    }
    if (failedResponses.length > 0) {
      console.log(`[INFO] HTTP responses >= 400: ${failedResponses.length}`);
      for (const msg of failedResponses.slice(0, 10)) console.log(`  - ${msg}`);
    }
    if (pageErrors.length > 0) {
      console.log(`[INFO] page errors: ${pageErrors.length}`);
      for (const msg of pageErrors.slice(0, 5)) console.log(`  - ${msg}`);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("================================================================================");
  console.log("Task 2.1 — auth storage (localStorage) + CSP/HSTS regression");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("================================================================================");

  sourceLevelChecks();
  const serverAvailable = await headerChecks();
  await browserChecks(serverAvailable);

  console.log("\n================================================================================");
  console.log(`RESULT: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log("================================================================================");
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
