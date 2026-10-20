/**
 * test-yc30-navigation.ts — Kiểm thử tự động cấu trúc điều hướng YC-30.
 *
 * Chạy KHÔNG cần DB / server:
 *   npx tsx scripts/test-yc30-navigation.ts
 *
 * Phạm vi kiểm tra:
 *  1. Mọi href trong menu đều có route thật trong src/app (không menu trỏ trang giả).
 *  2. Mọi route nghiệp vụ trong src/app đều được menu bao phủ (không mất khả năng truy cập).
 *  3. Không có href trùng lặp; cấu trúc nhóm hợp lệ.
 *  4. Lọc theo vai trò đúng: STAFF / DEPARTMENT_LEADER / UNIT_LEADER / SYSTEM_ADMIN.
 *  5. Active state khớp chính xác route (route cha không "nuốt" route con).
 *  6. Breadcrumb sinh đúng cho các route đại diện.
 */
import fs from "fs";
import path from "path";

import {
  NAVIGATION_SECTIONS,
  filterNavigation,
  findActiveNavigation,
  getBreadcrumbTrail,
  isItemActive,
  type NavigationAccessContext,
} from "../src/config/navigation";

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

const APP_DIR = path.resolve("src/app");

function collectPageRoutes(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith("(") || entry.name.startsWith("@")) continue;
      out.push(...collectPageRoutes(path.join(dir, entry.name), `${base}/${entry.name}`));
    } else if (entry.name === "page.tsx" || entry.name === "page.ts" || entry.name === "page.jsx") {
      out.push(base || "/");
    }
  }
  return out;
}

const pageRoutes = collectPageRoutes(APP_DIR)
  .map((r) => (r === "" ? "/" : r))
  .sort();

// Route không phải mục menu chính — vẫn truy cập được từ vị trí khác trên giao diện.
const NON_MENU_ROUTES: Record<string, string> = {
  "/": "Trang chủ → render Bảng điều hành (alias của /dashboard)",
  "/login": "Trang đăng nhập",
  "/admin": "Chuyển hướng tới /admin/system",
  "/reports/excel": "Chuyển hướng tới /reports?tab=builder (route cũ giữ nguyên)",
  "/reports/snapshots": "Chuyển hướng tới /reports?tab=snapshots (route cũ giữ nguyên)",
  "/huong-dan": "Link cố định ở chân sidebar + chân menu mobile",
  "/notifications": "Nút Thông báo trên đầu trang (desktop & mobile)",
};

// Định tuyến động (danh sách con của route cha) — không cần mục menu riêng.
const DYNAMIC_ROUTES = ["/tasks/[id]", "/meetings/[id]"];

const menuHrefs = NAVIGATION_SECTIONS.flatMap((s) => s.items.map((i) => i.href));

// ---------------------------------------------------------------- 1. href có route thật
const routeSet = new Set(pageRoutes);
for (const href of menuHrefs) {
  const exists = routeSet.has(href);
  check(`Menu có route thật: ${href}`, exists);
}

// ---------------------------------------------------------------- 2. route thật được menu bao phủ
for (const route of pageRoutes) {
  if (route in NON_MENU_ROUTES) continue;
  if (DYNAMIC_ROUTES.includes(route)) continue;
  const covered = menuHrefs.some((href) => route === href);
  check(`Route được menu bao phủ: ${route}`, covered);
}

// ---------------------------------------------------------------- 2b. route phụ vẫn có đường vào từ giao diện
const layoutSources = [
  "src/components/layout/Sidebar.tsx",
  "src/components/layout/Header.tsx",
  "src/components/layout/MobileNavDrawer.tsx",
  "src/components/layout/BottomNav.tsx",
].map((f) => ({ file: f, text: fs.readFileSync(path.resolve(f), "utf8") }));

for (const route of ["/huong-dan", "/notifications"]) {
  const linked = layoutSources.filter((s) => s.text.includes(`"${route}"`));
  check(
    `Route phụ ${route} vẫn có link trên giao diện`,
    linked.length > 0,
    linked.map((s) => s.file).join(", ")
  );
}

// ---------------------------------------------------------------- 3. cấu trúc & trùng lặp
const seen = new Set<string>();
for (const section of NAVIGATION_SECTIONS) {
  check(`Nhóm có id hợp lệ: ${section.id}`, !!section.id && !!section.label && !!section.icon);
  check(`Nhóm không rỗng: ${section.id}`, section.items.length > 0);
  for (const item of section.items) {
    check(`Href không trùng: ${item.href}`, !seen.has(item.href), seen.has(item.href) ? "bị trùng" : "");
    seen.add(item.href);
    check(`Href bắt đầu bằng "/": ${item.href}`, item.href.startsWith("/"));
  }
}

// ---------------------------------------------------------------- 4. lọc theo vai trò
function ctx(
  role: string,
  permissions: string[],
  extra: Partial<NavigationAccessContext> = {}
): NavigationAccessContext {
  return {
    role,
    permissions,
    can: (p: string) => permissions.includes(p),
    isLeader: role === "UNIT_LEADER" || role === "DEPARTMENT_LEADER",
    isAdmin: role === "UNIT_LEADER" || role === "SYSTEM_ADMIN",
    canExport: false,
    canLock: false,
    ...extra,
  };
}

const STAFF_PERMS = ["plans.view", "tasks.update_own", "reports.view"];
const DEPT_PERMS = [
  "plans.view",
  "plans.create",
  "plans.approve",
  "tasks.assign",
  "tasks.update_own",
  "reports.view",
  "reports.export",
];
const LEADER_PERMS = [
  "plans.view",
  "plans.create",
  "plans.approve",
  "tasks.assign",
  "tasks.update_own",
  "reports.view",
  "reports.export",
  "catalog.manage",
  "org.manage",
  "audit.view",
  "system.config",
];
const ADMIN_PERMS = ["org.manage", "catalog.manage", "audit.view", "system.config", "form.manage", "users.manage"];

const staff = filterNavigation(ctx("STAFF", STAFF_PERMS));
const dept = filterNavigation(ctx("DEPARTMENT_LEADER", DEPT_PERMS));
const leader = filterNavigation(ctx("UNIT_LEADER", LEADER_PERMS));
const admin = filterNavigation(ctx("SYSTEM_ADMIN", ADMIN_PERMS));

const hrefsOf = (sections: typeof NAVIGATION_SECTIONS) => sections.flatMap((s) => s.items.map((i) => i.href));

const staffHrefs = hrefsOf(staff);
const deptHrefs = hrefsOf(dept);
const leaderHrefs = hrefsOf(leader);
const adminHrefs = hrefsOf(admin);

check("STAFF không thấy Phê duyệt", !staffHrefs.includes("/approvals"));
check("STAFF không thấy nhóm Quản trị hệ thống", !staffHrefs.some((h) => h.startsWith("/admin")));
check("STAFF không thấy Cấu hình số liệu giao ban", !staffHrefs.includes("/giao-ban/cau-hinh"));
check("STAFF vẫn thấy Nhật ký công việc", staffHrefs.includes("/my-work"));
check("STAFF vẫn thấy Lập kế hoạch", staffHrefs.includes("/plans"));
check("STAFF vẫn thấy Công việc phát sinh", staffHrefs.includes("/tasks"));
check("STAFF vẫn thấy Nhật ký tác nghiệp", staffHrefs.includes("/routine"));
check("STAFF vẫn thấy Sản phẩm QĐ1277", staffHrefs.includes("/products"));

check("Trưởng bộ phận thấy Phê duyệt", deptHrefs.includes("/approvals"));
check("Trưởng bộ phận không thấy nhóm Quản trị", !deptHrefs.some((h) => h.startsWith("/admin")));
check("Trưởng bộ phận không thấy Cấu hình số liệu giao ban", !deptHrefs.includes("/giao-ban/cau-hinh"));

check("Lãnh đạo đơn vị thấy Phê duyệt", leaderHrefs.includes("/approvals"));
check("Lãnh đạo đơn vị thấy Danh mục công việc", leaderHrefs.includes("/admin/catalog"));
check("Lãnh đạo đơn vị thấy Tổ chức & nhân sự", leaderHrefs.includes("/admin/organization"));
check("Lãnh đạo đơn vị thấy Nhật ký hệ thống", leaderHrefs.includes("/admin/audit"));

check("Quản trị hệ thống thấy Cấu hình hệ thống", adminHrefs.includes("/admin/system"));
check("Quản trị hệ thống thấy Danh mục công việc", adminHrefs.includes("/admin/catalog"));
check("Quản trị hệ thống thấy Tổ chức & nhân sự", adminHrefs.includes("/admin/organization"));
check("Quản trị hệ thống thấy Nhật ký hệ thống", adminHrefs.includes("/admin/audit"));
check("Quản trị hệ thống thấy Biểu mẫu & quy trình", adminHrefs.includes("/admin/forms"));
check(
  "Quản trị hệ thống không thấy Phê duyệt (không có quyền nghiệp vụ)",
  !adminHrefs.includes("/approvals")
);

// Xuất báo cáo / chốt kỳ: chỉ hiện khi có quyền
const staffWithExport = filterNavigation(
  ctx("STAFF", STAFF_PERMS, { canExport: true, canLock: true })
);
const staffHrefsWithExport = hrefsOf(staffWithExport);
check("Có quyền xuất mới thấy Xuất Excel", staffHrefsWithExport.includes("/reports/excel"));
check("Có quyền chốt mới thấy Số liệu đã chốt", staffHrefsWithExport.includes("/reports/snapshots"));
check("Không có quyền xuất thì ẩn Xuất Excel", !staffHrefs.includes("/reports/excel"));
check("Không có quyền chốt thì ẩn Số liệu đã chốt", !staffHrefs.includes("/reports/snapshots"));

// ---------------------------------------------------------------- 5. active state
const giaoBan = NAVIGATION_SECTIONS.find((s) => s.id === "overview")!.items.find((i) => i.href === "/giao-ban")!;
check("/giao-ban không active khi ở /giao-ban/nhap", !isItemActive("/giao-ban/nhap", giaoBan));
check("/giao-ban active khi ở /giao-ban", isItemActive("/giao-ban", giaoBan));
check("/giao-ban/nhap active khi ở /giao-ban/nhap", isItemActive("/giao-ban/nhap", giaoBan) === false
  ? isItemActive("/giao-ban/nhap", NAVIGATION_SECTIONS.find((s) => s.id === "overview")!.items.find((i) => i.href === "/giao-ban/nhap")!)
  : false);

const tasksItem = NAVIGATION_SECTIONS.find((s) => s.id === "journal")!.items.find((i) => i.href === "/tasks")!;
check("/tasks active khi ở /tasks/abc", isItemActive("/tasks/abc", tasksItem));
check("/tasks không active khi ở /plans", !isItemActive("/plans", tasksItem));

const dashItem = NAVIGATION_SECTIONS.find((s) => s.id === "overview")!.items.find((i) => i.href === "/dashboard")!;
check("/dashboard active khi ở /", isItemActive("/", dashItem));
check("/dashboard active khi ở /dashboard", isItemActive("/dashboard", dashItem));
check("/dashboard không active khi ở /my-work", !isItemActive("/my-work", dashItem));

const reportsItem = NAVIGATION_SECTIONS.find((s) => s.id === "results")!.items.find((i) => i.href === "/reports")!;
check("/reports active khi ở /reports/excel (route cũ)", isItemActive("/reports/excel", reportsItem));

const activeTasks = findActiveNavigation("/tasks/123");
check("findActiveNavigation(/tasks/123) → Công việc phát sinh", activeTasks?.item.label === "Công việc phát sinh");
const activeGiaoBan = findActiveNavigation("/giao-ban/nhap");
check("findActiveNavigation(/giao-ban/nhap) → Nhập số liệu giao ban", activeGiaoBan?.item.label === "Nhập số liệu giao ban");

// ---------------------------------------------------------------- 6. breadcrumb
const bc = (p: string) => getBreadcrumbTrail(p).map((e) => e.label).join(" / ");
check("Breadcrumb /dashboard", bc("/dashboard") === "Trang chủ / Bảng điều hành", bc("/dashboard"));
check("Breadcrumb /my-work", bc("/my-work") === "Trang chủ / Nhật ký công việc", bc("/my-work"));
check(
  "Breadcrumb /plans",
  bc("/plans") === "Trang chủ / Nhật ký công việc / Lập kế hoạch",
  bc("/plans")
);
check(
  "Breadcrumb /tasks/123 có mục chi tiết",
  bc("/tasks/123") === "Trang chủ / Nhật ký công việc / Chi tiết nhiệm vụ",
  bc("/tasks/123")
);
check("Breadcrumb /admin/catalog", bc("/admin/catalog") === "Trang chủ / Quản trị hệ thống / Danh mục công việc", bc("/admin/catalog"));
check("Breadcrumb /notifications", bc("/notifications") === "Trang chủ / Thông báo", bc("/notifications"));
check(
  "Breadcrumb /reports/excel giữ tên route cũ",
  bc("/reports/excel") === "Trang chủ / Kết quả & báo cáo / Xuất báo cáo Excel",
  bc("/reports/excel")
);

// ---------------------------------------------------------------- 7. không dùng thuật ngữ kỹ thuật trên UI
const TECH_TERMS = ["Backend", "RPC", "RLS", "Storage", "Supabase", "API", "PostgreSQL", "Token"];
for (const section of NAVIGATION_SECTIONS) {
  for (const item of section.items) {
    const blob = `${section.label} ${item.label} ${item.description || ""}`;
    const hit = TECH_TERMS.filter((t) => blob.toLowerCase().includes(t.toLowerCase()));
    check(`Nhãn menu không chứa thuật ngữ kỹ thuật: ${item.label}`, hit.length === 0, hit.join(", "));
  }
}

// ---------------------------------------------------------------- 8. nhãn thống nhất (YC-30 + bổ sung 20/10)
check("Không còn nhãn 'Việc của tôi' trong menu", !NAVIGATION_SECTIONS.some((s) => s.items.some((i) => /việc của tôi/i.test(i.label))));
check("Không còn nhãn 'Việc cá nhân' trong menu (đổi thành Nhật ký công việc)", !NAVIGATION_SECTIONS.some((s) => s.items.some((i) => /việc cá nhân/i.test(i.label))));
check("Có mục 'Nhật ký công việc'", NAVIGATION_SECTIONS.some((s) => s.items.some((i) => i.label === "Nhật ký công việc")));
check("Có nhóm 'Nhật ký công việc'", NAVIGATION_SECTIONS.some((s) => s.label === "Nhật ký công việc"));
check(
  "Có mục 'Lập kế hoạch' (kế hoạch tuần ở dạng thành phần trong luồng nhật ký)",
  NAVIGATION_SECTIONS.some((s) => s.items.some((i) => i.href === "/plans" && i.label === "Lập kế hoạch"))
);
check(
  "Route /plans và /my-work vẫn tồn tại trong menu (không mất đường vào)",
  menuHrefs.includes("/plans") && menuHrefs.includes("/my-work")
);
check(
  "Số nhóm điều hướng = 6 (gộp Công việc cá nhân + Công việc bộ phận thành Nhật ký công việc)",
  NAVIGATION_SECTIONS.length === 6,
  String(NAVIGATION_SECTIONS.length)
);

console.log("\n========================================");
console.log(`KẾT QUẢ: ${passed} pass / ${failed} fail`);
console.log("========================================");
if (failed > 0) {
  console.log("\nCác mục lỗi:");
  for (const f of failures) console.log(" - " + f);
  process.exit(1);
}
process.exit(0);
