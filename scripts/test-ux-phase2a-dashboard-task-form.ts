/**
 * test-ux-phase2a-dashboard-task-form.ts — Kiểm tra tĩnh Phase 2A / Task 2A3.
 *
 * Mục tiêu: Dashboard và "Công việc phát sinh" dùng CÙNG một form tạo task.
 *   npx tsx scripts/test-ux-phase2a-dashboard-task-form.ts
 *
 * Các kiểm tra bám vào source thật (không chạy server, không cần DB):
 *  1. Dashboard có đúng 2 lối vào /tasks?new=1 (desktop + mobile), cả hai trong khối canAssign.
 *  2. Dashboard không còn modal quick-assign, state/handler cũ hay POST /api/tasks trực tiếp.
 *  3. /tasks đọc query new=1 sau mount, chờ quyền nạp xong rồi mới mở modal.
 *  4. /tasks chỉ mở một lần và xóa query new (không mở lại khi F5/back/re-render).
 *  5. Form tạo đầy đủ trong /tasks còn nguyên (nguồn công việc, hạn, idempotency, đính kèm).
 */
import fs from "fs";
import path from "path";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    failed++;
    failures.push(name + (detail ? " - " + detail : ""));
    console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

function countMatches(source: string, re: RegExp): number {
  return (source.match(re) || []).length;
}

const root = process.cwd();
const dashboardPath = path.join(root, "src", "app", "dashboard", "page.tsx");
const tasksPath = path.join(root, "src", "app", "tasks", "page.tsx");

if (!fs.existsSync(dashboardPath) || !fs.existsSync(tasksPath)) {
  console.error("Không tìm thấy file nguồn dashboard/tasks — chạy từ thư mục repo.");
  process.exit(1);
}

const dashboard = fs.readFileSync(dashboardPath, "utf-8");
const tasks = fs.readFileSync(tasksPath, "utf-8");

// ---------------------------------------------------------------------------
// 1. Dashboard: hai lối vào đều chuyển sang form đầy đủ của /tasks, vẫn gate canAssign.
// ---------------------------------------------------------------------------
const gatedLinks = countMatches(
  dashboard,
  /\{canAssign && \(\s*<Link\s+href="\/tasks\?new=1"/g
);
check("Dashboard có đúng 2 nút giao việc chuyển /tasks?new=1 trong khối canAssign", gatedLinks === 2, `count=${gatedLinks}`);

check(
  "Dashboard không còn nút mở quick modal",
  !dashboard.includes("setShowAssignModal") && !dashboard.includes("handleQuickAssign"),
  "không còn setShowAssignModal/handleQuickAssign"
);

const quickAssignState = [
  "showAssignModal",
  "assignTitle",
  "assignUnit",
  "assignPriority",
  "assignDeadline",
  "assignOwner",
  "assignCollabs",
  "assignPeople",
  "assignFiles",
].filter((token) => dashboard.includes(token));
check(
  "Dashboard đã xóa state quick-assign chết",
  quickAssignState.length === 0,
  quickAssignState.length ? `còn: ${quickAssignState.join(", ")}` : "sạch"
);

check(
  "Dashboard không tự POST /api/tasks (một đường tạo duy nhất)",
  !dashboard.includes('fetch("/api/tasks"') && !dashboard.includes("uploadAssignAttachments"),
  "không còn fetch tạo task/đính kèm"
);

check(
  "Dashboard không còn import chết của quick modal",
  !dashboard.includes("CollaboratorPicker") && !dashboard.includes("vnLocalToUtcIso") && !dashboard.includes("vnNowLocalParts"),
  "không còn CollaboratorPicker/vnLocalToUtcIso/vnNowLocalParts"
);

// ---------------------------------------------------------------------------
// 2. /tasks: đọc query sau mount và mở modal đúng một lần khi có quyền.
// ---------------------------------------------------------------------------
check(
  "/tasks đọc query new=1 sau mount",
  /sp\.get\("new"\) === "1"[\s\S]{0,80}setPendingCreateFromQuery\(true\)/.test(tasks),
  "new=1 -> pendingCreateFromQuery"
);

check(
  "/tasks chờ quyền nạp xong trước khi mở modal",
  /if \(!pendingCreateFromQuery \|\| permissionsLoading\) return;/.test(tasks),
  "guard pending + permissionsLoading"
);

check(
  "/tasks chỉ mở modal tạo khi canAssign",
  /if \(canAssign\) \{\s*setShowCreateModal\(true\);/.test(tasks),
  "canAssign -> setShowCreateModal(true)"
);

check(
  "/tasks không mở modal khi thiếu quyền",
  /else \{\s*toast\.error\("Bạn không có quyền giao nhiệm vụ"\);/.test(tasks),
  "nhánh từ chối có thông báo"
);

check(
  "/tasks xóa query new sau khi mở",
  /url\.searchParams\.delete\("new"\)/.test(tasks) &&
    /history\.replaceState\(/.test(tasks),
  "replaceState giữ URL sạch"
);

check(
  "/tasks chống mở lại sau khi đã xử lý",
  /setPendingCreateFromQuery\(false\);/.test(tasks) &&
    countMatches(tasks, /setShowCreateModal\(true\)/g) === 2,
  "pending=false; setShowCreateModal(true) chỉ ở nút bấm + hiệu ứng query"
);

const effectDeps = /\[pendingCreateFromQuery, permissionsLoading, canAssign\]/.test(tasks);
check("/tasks effect phụ thuộc đúng quyền + cờ pending", effectDeps, "dependency array đúng");

// ---------------------------------------------------------------------------
// 3. Không thay đổi form/API tạo task của /tasks.
// ---------------------------------------------------------------------------
const requiredFormTokens = [
  "handleCreateTask",
  "WorkSourcePicker",
  "newExpectedResult",
  "newDeadline",
  "newAttachFiles",
  "newIdempotencyKey",
  "catalogEntryId: newCatalogEntry?.id || undefined",
  "productItemId: newProduct?.id || undefined",
  "idempotencyKey: newIdempotencyKey",
  "priority: newPriority",
];
const missingFormTokens = requiredFormTokens.filter((token) => !tasks.includes(token));
check(
  "/tasks giữ nguyên form tạo đầy đủ + idempotency/priority",
  missingFormTokens.length === 0,
  missingFormTokens.length ? `thiếu: ${missingFormTokens.join(", ")}` : "đủ token"
);

check(
  "/tasks chỉ có một modal tạo (không nhân đôi form)",
  countMatches(tasks, /\{showCreateModal && \(/g) === 1,
  `modal create count=${countMatches(tasks, /\{showCreateModal && \(/g)}`
);

console.log(`\n${passed} pass / ${failed} fail`);
if (failed > 0) {
  console.error("FAILURES:\n" + failures.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
