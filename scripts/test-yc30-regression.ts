/**
 * test-yc30-regression.ts — Hồi quy YC-23 → YC-32 sau khi tái cấu trúc điều hướng (YC-30).
 *
 * Mục đích: chứng minh việc đổi sidebar/navigation KHÔNG làm hỏng chức năng nghiệp vụ đã có.
 *
 * Phạm vi (read-only, không sửa dữ liệu nghiệp vụ):
 *  A. Truy cập được tất cả route trong menu (HTTP 200, không lỗi 5xx).
 *  B. Route cũ (deep-link/bookmark) vẫn truy cập được.
 *  C. API nghiệp vụ cốt lõi trả dữ liệu đúng: công việc cá nhân (YC-31/32),
 *     kế hoạch, nhiệm vụ, danh mục TX, danh mục mẫu cũ, sản phẩm QĐ1277,
 *     kết quả tháng, báo cáo, số liệu giao ban, lịch trực, nghỉ phép, văn bản,
 *     biên bản, thông báo, minh chứng (YC-32).
 *  D. Xuất Excel (YC-24) vẫn trả file XLSX hợp lệ.
 *  E. Quyền: cán bộ không thấy/phân quyền admin; quản trị hệ thống bị chặn nghiệp vụ.
 *
 * Chạy LOCAL (dev server + DB local):
 *   $env:DATABASE_URL="<chuỗi kết nối DB local>"; $env:DIRECT_URL=$env:DATABASE_URL
 *   $env:TEST_BASE_URL="http://localhost:3100"
 *   $env:TEST_LEADER_USER="<tài khoản lãnh đạo local>"; $env:TEST_LEADER_PASS="<mật khẩu>"
 *   $env:TEST_STAFF_USER="<tài khoản cán bộ local>";  $env:TEST_STAFF_PASS="<mật khẩu>"
 *   npx tsx scripts/test-yc30-regression.ts
 *
 * Chạy PRODUCTION (chỉ đọc; đăng nhập ghi 1 dòng nhật ký như thiết kế):
 *   $env:TEST_BASE_URL="https://task-cus.vercel.app"
 *   $env:TEST_LEADER_USER="demold01"; $env:TEST_LEADER_PASS="<lấy từ demo-ops/demo-secrets.json>"
 *   npx tsx scripts/test-yc30-regression.ts
 */
import fs from "fs";
import path from "path";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3100";

interface Creds {
  leader: { user: string; pass: string };
  staff: { user: string; pass: string };
  admin?: { user: string; pass: string };
}

/** Đọc mật khẩu từ demo-ops/demo-secrets.json (KHÔNG in ra log, KHÔNG commit). */
function secretFromFile(username: string): string | null {
  try {
    const p = path.resolve("demo-ops/demo-secrets.json");
    if (!fs.existsSync(p)) return null;
    const json = JSON.parse(fs.readFileSync(p, "utf8"));
    const acc = (json.accounts || []).find((a: any) => a.username === username);
    return acc?.password || null;
  } catch {
    return null;
  }
}

function resolveCreds(): Creds {
  const fileUser = process.env.TEST_LEADER_USER || "demold01";
  const leaderPass = process.env.TEST_LEADER_PASS || secretFromFile(fileUser);
  const staffUser = process.env.TEST_STAFF_USER || "democb01";
  const staffPass = process.env.TEST_STAFF_PASS || secretFromFile(staffUser);
  if (!leaderPass) throw new Error("Thiếu mật khẩu lãnh đạo: đặt TEST_LEADER_PASS hoặc dùng demo-ops/demo-secrets.json");
  if (!staffPass) throw new Error("Thiếu mật khẩu cán bộ: đặt TEST_STAFF_PASS hoặc dùng demo-ops/demo-secrets.json");
  const creds: Creds = {
    leader: { user: fileUser, pass: leaderPass },
    staff: { user: staffUser, pass: staffPass },
  };
  const adminUser = process.env.TEST_ADMIN_USER;
  const adminPass = process.env.TEST_ADMIN_PASS || (adminUser ? secretFromFile(adminUser) : null);
  if (adminUser && adminPass) creds.admin = { user: adminUser, pass: adminPass };
  return creds;
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " - " + detail : ""}`);
    console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

async function login(user: string, pass: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password: pass }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.token) throw new Error(`Đăng nhập ${user} thất bại (HTTP ${res.status})`);
  return json.token;
}

async function api(token: string, pathname: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const ct = res.headers.get("content-type") || "";
  const json = ct.includes("json") ? await res.json().catch(() => null) : null;
  return { status: res.status, ok: res.ok, json, ct };
}

/** Các route trong menu — mỗi route phải trả 200 (không 5xx) khi đã đăng nhập. */
const MENU_ROUTES = [
  "/dashboard",
  "/giao-ban",
  "/giao-ban/nhap",
  "/giao-ban/bao-cao",
  "/meetings",
  "/my-work",
  "/plans",
  "/tasks",
  "/routine",
  "/roster",
  "/calendar",
  "/leaves",
  "/docs",
  "/monthly-results",
  "/reports",
  "/products",
  "/approvals",
  "/huong-dan",
  "/notifications",
  "/admin/catalog",
  "/admin/organization",
  "/admin/forms",
  "/admin/system",
  "/admin/audit",
  "/admin/feedback",
  "/giao-ban/cau-hinh",
];

/** Route cũ — bookmark/deep-link phải không hỏng. */
const LEGACY_ROUTES = [
  "/",
  "/reports/excel",
  "/reports/snapshots",
  "/admin",
];

async function main() {
  console.log("=================================================================");
  console.log("YC-30 — HỒI QUY YC-23 → YC-32");
  console.log(`Đích: ${BASE_URL}`);
  console.log("=================================================================\n");

  const creds = resolveCreds();
  const leaderToken = await login(creds.leader.user, creds.leader.pass);
  const staffToken = await login(creds.staff.user, creds.staff.pass);
  const adminToken = creds.admin ? await login(creds.admin.user, creds.admin.pass) : null;
  console.log(`• Đã đăng nhập: ${creds.leader.user}, ${creds.staff.user}${creds.admin ? `, ${creds.admin.user}` : ""}\n`);

  // ---------------------------------------------------------------- A. route menu
  console.log("— A. Truy cập các route trong menu (lãnh đạo đơn vị) —");
  for (const route of MENU_ROUTES) {
    const res = await fetch(`${BASE_URL}${route}`, {
      headers: { Authorization: `Bearer ${leaderToken}` },
      redirect: "manual",
    });
    const ok = res.status < 500;
    check(`Route ${route} tải được`, ok, `HTTP ${res.status}`);
  }

  // ---------------------------------------------------------------- B. route cũ
  console.log("\n— B. Route cũ (deep-link/bookmark) —");
  for (const route of LEGACY_ROUTES) {
    const res = await fetch(`${BASE_URL}${route}`, {
      headers: { Authorization: `Bearer ${leaderToken}` },
      redirect: "manual",
    });
    const ok = res.status < 500;
    check(`Route cũ ${route} không lỗi 5xx`, ok, `HTTP ${res.status}`);
  }

  // ---------------------------------------------------------------- C. API nghiệp vụ
  console.log("\n— C. API nghiệp vụ cốt lõi (YC-23 → YC-32) —");

  const myWork = await api(staffToken, "/api/personal-work-items");
  check(
    "YC-31/32 — API công việc cá nhân trả dữ liệu",
    myWork.status === 200 && Array.isArray(myWork.json?.data),
    `HTTP ${myWork.status}`
  );

  const myWorkList = await api(staffToken, "/api/personal-work-items?page=1&pageSize=5");
  check(
    "YC-31/32 — Công việc cá nhân phân trang OK",
    myWorkList.status === 200 && Array.isArray(myWorkList.json?.data),
    `HTTP ${myWorkList.status}`
  );

  // Minh chứng (YC-32) là API theo đầu việc → lấy 1 đầu việc cá nhân rồi hỏi danh sách minh chứng.
  const myWorkItems = await api(staffToken, "/api/personal-work-items");
  const firstItemId = Array.isArray(myWorkItems.json?.data) ? myWorkItems.json.data[0]?.id : null;
  if (firstItemId) {
    const evidence = await api(staffToken, `/api/work-evidence?workItemId=${firstItemId}`);
    check(
      "YC-32 — API minh chứng trả dữ liệu",
      evidence.status === 200 && Array.isArray(evidence.json?.data),
      `HTTP ${evidence.status}`
    );
  } else {
    const evidence = await api(staffToken, "/api/work-evidence");
    check(
      "YC-32 — API minh chứng yêu cầu đúng tham số",
      evidence.status === 400,
      `HTTP ${evidence.status} (chưa có đầu việc cá nhân trong DB test)`
    );
  }

  const plans = await api(leaderToken, "/api/plans");
  check("YC-23 — API kế hoạch trả dữ liệu", plans.status === 200, `HTTP ${plans.status}`);

  const tasks = await api(leaderToken, "/api/tasks?pageSize=5");
  check("YC-04 — API nhiệm vụ trả dữ liệu", tasks.status === 200, `HTTP ${tasks.status}`);

  const catalog = await api(leaderToken, "/api/catalog/templates?page=1&pageSize=5");
  check("YC-05 — API danh mục mẫu cũ trả dữ liệu", catalog.status === 200, `HTTP ${catalog.status}`);

  const txCatalog = await api(leaderToken, "/api/work-catalog");
  check("YC-31 — API danh mục TX trả dữ liệu", txCatalog.status === 200, `HTTP ${txCatalog.status}`);

  const txAdmin = await api(leaderToken, "/api/work-catalog?includeInactive=1");
  check("YC-31 — API danh mục TX chế độ quản trị", txAdmin.status === 200, `HTTP ${txAdmin.status}`);

  // Sản phẩm QĐ1277: DB test có thể chưa nạp danh mục (404 "chưa có phiên bản") — vẫn là hành vi đúng.
  const products = await api(staffToken, "/api/products?page=1&pageSize=5");
  const productsOk = products.status === 200 || products.status === 404;
  check(
    "YC-11 — API sản phẩm QĐ1277 phản hồi hợp lệ",
    productsOk,
    `HTTP ${products.status}${products.status === 404 ? " (DB test chưa nạp danh mục SP)" : ""}`
  );

  const monthly = await api(staffToken, "/api/monthly-results");
  check("YC-14 — API kết quả công tác tháng trả dữ liệu", monthly.status === 200, `HTTP ${monthly.status}`);

  const reportSummary = await api(staffToken, "/api/reports/summary");
  check("YC-24 — API tổng hợp báo cáo trả dữ liệu", reportSummary.status === 200, `HTTP ${reportSummary.status}`);

  const metrics = await api(staffToken, "/api/metrics/summary");
  check("YC-26 — API số liệu giao ban trả dữ liệu", metrics.status === 200, `HTTP ${metrics.status}`);

  const metricEntries = await api(leaderToken, "/api/metrics/entries");
  check("YC-28 — API nhập số liệu giao ban trả dữ liệu", metricEntries.status === 200, `HTTP ${metricEntries.status}`);

  const roster = await api(staffToken, "/api/rosters");
  check("YC-24 — API lịch trực trả dữ liệu", roster.status === 200, `HTTP ${roster.status}`);

  const leaves = await api(staffToken, "/api/leaves");
  check("YC-09 — API nghỉ phép trả dữ liệu", leaves.status === 200, `HTTP ${leaves.status}`);

  const docs = await api(staffToken, "/api/docs");
  check("YC-12 — API sổ văn bản trả dữ liệu", docs.status === 200, `HTTP ${docs.status}`);

  const meetings = await api(staffToken, "/api/meetings");
  check("YC-18 — API biên bản giao ban trả dữ liệu", meetings.status === 200, `HTTP ${meetings.status}`);

  const notifications = await api(staffToken, "/api/notifications");
  check("API thông báo trả dữ liệu", notifications.status === 200, `HTTP ${notifications.status}`);

  const routine = await api(staffToken, "/api/routine");
  check("YC-16 — API nhật ký tác nghiệp trả dữ liệu", routine.status === 200, `HTTP ${routine.status}`);

  const deptItems = await api(leaderToken, "/api/department-work-items?status=ALL");
  check(
    "YC-25 — API danh mục đầu việc bộ phận trả dữ liệu",
    deptItems.status === 200 && Array.isArray(deptItems.json?.data),
    `HTTP ${deptItems.status}`
  );

  const dashboard = await api(leaderToken, "/api/dashboard/kpi");
  check("YC-29 — API KPI bảng điều hành trả dữ liệu", dashboard.status === 200, `HTTP ${dashboard.status}`);

  // ---------------------------------------------------------------- D. Xuất Excel
  console.log("\n— D. Xuất Excel (YC-24) —");
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  for (const template of ["bang1", "02c"]) {
    const res = await fetch(`${BASE_URL}/api/monthly-export`, {
      method: "POST",
      headers: { Authorization: `Bearer ${staffToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, template }),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const isXlsx = buf.length > 1000 && buf[0] === 0x50 && buf[1] === 0x4b; // "PK" zip
    check(
      `Xuất Excel ${template} trả file XLSX hợp lệ`,
      res.status === 200 && isXlsx,
      `HTTP ${res.status}, ${buf.length} bytes`
    );
  }

  // ---------------------------------------------------------------- E. Quyền
  console.log("\n— E. Quyền theo vai trò —");
  const staffApprovals = await api(staffToken, "/api/tasks?status=WAITING_REVIEW");
  check(
    "Cán bộ vẫn đọc được nhiệm vụ của mình (không bị chặn)",
    staffApprovals.status === 200,
    `HTTP ${staffApprovals.status}`
  );

  const staffAdminApi = await api(staffToken, "/api/admin/audit");
  check(
    "Cán bộ bị chặn API nhật ký hệ thống (403)",
    staffAdminApi.status === 403,
    `HTTP ${staffAdminApi.status}`
  );

  const staffOrgApi = await api(staffToken, "/api/org-units/tree");
  check(
    "API cây đơn vị vẫn cho cán bộ đọc (dùng bộ lọc đơn vị ở header)",
    staffOrgApi.status === 200,
    `HTTP ${staffOrgApi.status}`
  );

  if (adminToken) {
    const adminTasks = await api(adminToken, "/api/tasks");
    check(
      "Quản trị hệ thống bị chặn API nhiệm vụ nghiệp vụ (403)",
      adminTasks.status === 403,
      `HTTP ${adminTasks.status}`
    );
    // YC-31: quản trị hệ thống (kỹ thuật) bị chặn danh mục TX nghiệp vụ — hành vi có sẵn, không đổi.
    const adminTxCatalog = await api(adminToken, "/api/work-catalog?includeInactive=1");
    check(
      "Quản trị hệ thống bị chặn danh mục TX nghiệp vụ (403, giữ nguyên YC-31)",
      adminTxCatalog.status === 403,
      `HTTP ${adminTxCatalog.status}`
    );
    const adminLegacyCatalog = await api(adminToken, "/api/catalog/templates");
    check(
      "Quản trị hệ thống vẫn xem được danh mục mẫu cũ",
      adminLegacyCatalog.status === 200,
      `HTTP ${adminLegacyCatalog.status}`
    );
    const adminOverview = await api(adminToken, "/api/admin/system/overview");
    check(
      "Quản trị hệ thống xem được trung tâm quản trị",
      adminOverview.status === 200,
      `HTTP ${adminOverview.status}`
    );
  } else {
    console.log("• Bỏ qua kiểm tra quản trị hệ thống (chưa cấu hình TEST_ADMIN_USER/TEST_ADMIN_PASS)");
  }

  console.log("\n========================================");
  console.log(`KẾT QUẢ HỒI QUY: ${passed} pass / ${failed} fail`);
  console.log("========================================");
  if (failed > 0) {
    console.log("\nCác mục lỗi:");
    for (const f of failures) console.log(" - " + f);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("LỖI HỒI QUY:", err);
  process.exit(1);
});
