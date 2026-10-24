/**
 * test-v3-ux-phase1.ts — Kiểm thử tĩnh cho UX Phase 1 / Task 2.
 *
 * Chạy KHÔNG cần DB / server:
 *   npx tsx scripts/test-v3-ux-phase1.ts
 *
 * Phạm vi:
 *  1. Navigation có mục "Công chức nhận việc" trong nhóm "Nhật ký công việc".
 *  2. Điều kiện "chờ nhận việc" dùng chung, không áp dụng cho việc tự khởi tạo.
 *  3. /my-work có tab WAITING_ACCEPT, deep-link sau mount và nút nhận việc nhanh.
 *  4. Thông báo nhắc ca trực đã rút gọn nhưng giữ nguyên phân loại/action/idempotency.
 */
import fs from "fs";
import path from "path";

import {
  NAVIGATION_SECTIONS,
  filterNavigation,
  type NavigationAccessContext,
} from "../src/config/navigation";
import { isAwaitingAcceptance } from "../src/lib/task-origin";

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

// ---------------------------------------------------------------- 1. navigation
const journal = NAVIGATION_SECTIONS.find((s) => s.id === "journal");
const receive = journal?.items.find((i) => i.id === "my-work-receive");
check("Có nhóm Nhật ký công việc", !!journal);
check("Có mục Công chức nhận việc", !!receive);
check("Nhãn mục đúng", receive?.label === "Công chức nhận việc", receive?.label || "");
check(
  "Href mở đúng tab chờ nhận",
  receive?.href === "/my-work?tab=WAITING_ACCEPT",
  receive?.href || ""
);
check("Icon how_to_reg", receive?.icon === "how_to_reg", receive?.icon || "");
check("Có mô tả ngắn", !!receive?.description);

const staffCtx: NavigationAccessContext = {
  role: "STAFF",
  can: () => false,
  isLeader: false,
  isAdmin: false,
  canExport: false,
  canLock: false,
};
const staffItems = filterNavigation(staffCtx).flatMap((s) => s.items);
check(
  "STAFF thấy mục Công chức nhận việc (việc của chính mình)",
  staffItems.some((i) => i.id === "my-work-receive")
);

// ---------------------------------------------------------------- 2. điều kiện chờ nhận
check("NOT_STARTED + lãnh đạo giao → chờ nhận", isAwaitingAcceptance("NOT_STARTED", "LEADER_ASSIGNED"));
check("NOT_STARTED + từ kế hoạch → chờ nhận", isAwaitingAcceptance("NOT_STARTED", "PLAN"));
check("NOT_STARTED + chưa xác định nguồn → chờ nhận (dữ liệu lịch sử)", isAwaitingAcceptance("NOT_STARTED", null));
check("NOT_STARTED + tự khởi tạo → không chờ nhận", !isAwaitingAcceptance("NOT_STARTED", "SELF_INITIATED"));
check("NOT_STARTED + tự ghi nhận chỉ đạo ngoài → không chờ nhận", !isAwaitingAcceptance("NOT_STARTED", "OUTSIDE_DIRECTIVE"));
check("IN_PROGRESS → không chờ nhận", !isAwaitingAcceptance("IN_PROGRESS", "LEADER_ASSIGNED"));

// ---------------------------------------------------------------- 3. /my-work
const myWork = fs.readFileSync(path.resolve("src/app/my-work/page.tsx"), "utf8");
check("Có tab WAITING_ACCEPT", myWork.includes('"WAITING_ACCEPT"'));
check("Hiển thị chip Chờ nhận việc", myWork.includes("Chờ nhận việc ({waitingAcceptCount})"));
check(
  "Đọc query tab sau khi mount",
  myWork.includes('new URLSearchParams(window.location.search).get("tab")')
);
check("Có nút Nhận việc nhanh trên bảng", myWork.includes("Nhận việc"));
check(
  "Nút nhận nhanh dùng handleAcceptTask",
  /isPendingAccept\s*\?\s*\([\s\S]{0,600}handleAcceptTask\(task\)/.test(myWork)
);
const acceptBranch = myWork.indexOf("isPendingAccept ?");
const oneTouch = myWork.indexOf("Tác nghiệp 1 chạm");
check(
  "Nhánh nhận việc đứng trước Tác nghiệp 1 chạm (không hiện trùng)",
  acceptBranch > 0 && oneTouch > 0 && acceptBranch < oneTouch,
  `accept=${acceptBranch} oneTouch=${oneTouch}`
);

// ---------------------------------------------------------------- 4. nhắc ca trực
const notifications = fs.readFileSync(path.resolve("src/server/notifications.ts"), "utf8");
const routineBlock = notifications.slice(
  notifications.indexOf("4. NHẮC NHỞ NHẬT KÝ CA TRỰC"),
  notifications.indexOf("catch (error)")
);
check("Title nhắc ca trực đã rút gọn", routineBlock.includes('title: "Nhắc ghi nhật ký ca trực"'));
check(
  "Content nhắc ca trực đã rút gọn",
  routineBlock.includes('content: "Bạn chưa ghi nhật ký ca trực hôm nay."')
);
check('Giữ category "deadline"', routineBlock.includes('category: "deadline"'));
check('Giữ type "ROUTINE_REMINDER"', routineBlock.includes('type: "ROUTINE_REMINDER"'));
check('Giữ tag "HẠN CA TRỰC"', routineBlock.includes('tag: "HẠN CA TRỰC"'));
check('Giữ actionUrl "/routine"', routineBlock.includes('actionUrl: "/routine"'));
check(
  "Giữ idempotency key ALERT_ROUTINE_",
  routineBlock.includes("ALERT_ROUTINE_${todayStr}_${personId}")
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
