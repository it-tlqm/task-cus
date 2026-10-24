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
import { ALL_TIME_JOURNAL_FILTER, DEFAULT_JOURNAL_FILTER } from "../src/components/work/JournalFilterBar";
import { isMyPendingAcceptance } from "../src/lib/task-acceptance";

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
const ME = "person-me";
const OTHER = "person-other";
const ownerPending = {
  status: "NOT_STARTED",
  originKind: "LEADER_ASSIGNED",
  owner: { id: ME },
  assignees: [],
  myPartStatus: null,
};
check("Chủ trì + NOT_STARTED + lãnh đạo giao → chờ nhận", isMyPendingAcceptance(ownerPending, ME));
check(
  "Chủ trì + NOT_STARTED + từ kế hoạch → chờ nhận",
  isMyPendingAcceptance({ ...ownerPending, originKind: "PLAN" }, ME)
);
check(
  "Chủ trì + NOT_STARTED + chưa xác định nguồn → chờ nhận (dữ liệu lịch sử)",
  isMyPendingAcceptance({ ...ownerPending, originKind: null }, ME)
);
check(
  "Chủ trì + tự khởi tạo → không chờ nhận",
  !isMyPendingAcceptance({ ...ownerPending, originKind: "SELF_INITIATED" }, ME)
);
check(
  "Chủ trì + tự ghi nhận chỉ đạo ngoài → không chờ nhận",
  !isMyPendingAcceptance({ ...ownerPending, originKind: "OUTSIDE_DIRECTIVE" }, ME)
);
check(
  "Chủ trì + IN_PROGRESS → không chờ nhận",
  !isMyPendingAcceptance({ ...ownerPending, status: "IN_PROGRESS" }, ME)
);
// Finding 1: lãnh đạo thấy việc toàn đơn vị nhưng không được hiện việc của người khác.
check(
  "Việc của người khác (không chủ trì/phối hợp) → không chờ nhận",
  !isMyPendingAcceptance(ownerPending, OTHER)
);
check(
  "Không có personId → không chờ nhận",
  !isMyPendingAcceptance(ownerPending, null)
);

// Finding 2: phối hợp nhận theo phần việc, không theo trạng thái chung của Task.
const collaboratorTask = {
  status: "NOT_STARTED",
  originKind: "LEADER_ASSIGNED",
  owner: { id: OTHER },
  assignees: [{ person: { id: ME } }, { person: { id: "person-3" } }],
  myPartStatus: "NOT_STARTED",
};
check("Phối hợp + phần việc NOT_STARTED → chờ nhận", isMyPendingAcceptance(collaboratorTask, ME));
check(
  "Phối hợp + phần việc IN_PROGRESS → không chờ nhận (đã nhận)",
  !isMyPendingAcceptance({ ...collaboratorTask, myPartStatus: "IN_PROGRESS" }, ME)
);
check(
  "Phối hợp + phần việc SUBMITTED → không chờ nhận",
  !isMyPendingAcceptance({ ...collaboratorTask, myPartStatus: "SUBMITTED" }, ME)
);
check(
  "Phối hợp + chưa có dòng phần việc (dữ liệu cũ) → không chờ nhận",
  !isMyPendingAcceptance({ ...collaboratorTask, myPartStatus: null }, ME)
);
check(
  "Phối hợp vẫn chờ nhận khi chủ trì đã nhận (Task IN_PROGRESS)",
  isMyPendingAcceptance({ ...collaboratorTask, status: "IN_PROGRESS" }, ME)
);

// ---------------------------------------------------------------- 3. /my-work + API
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
check(
  "Badge/tab đếm theo predicate của chính người dùng",
  /waitingAcceptCount[\s\S]{0,250}isMyPendingAcceptance\(t, currentUser\.personId\)/.test(myWork)
);
check(
  "Bộ lọc tab dùng cùng predicate",
  /activeTab === "WAITING_ACCEPT"[\s\S]{0,200}isMyPendingAcceptance\(task, currentUser\.personId\)/.test(myWork)
);
check(
  "Nút nhận trên bảng/mobile dùng cùng predicate",
  (myWork.match(/isMyPendingAcceptance\(/g) || []).length >= 4,
  String((myWork.match(/isMyPendingAcceptance\(/g) || []).length)
);
check("Không còn predicate cũ chỉ theo trạng thái Task", !myWork.includes("isAwaitingAcceptance"));
check(
  "Deep-link chờ nhận mở bộ lọc toàn thời gian",
  myWork.includes("setJournalFilter(ALL_TIME_JOURNAL_FILTER)")
);
check(
  "Mặc định thường vẫn là Hôm nay",
  DEFAULT_JOURNAL_FILTER.period === "today" &&
    ALL_TIME_JOURNAL_FILTER.period === "all" &&
    ALL_TIME_JOURNAL_FILTER.status === "all" &&
    ALL_TIME_JOURNAL_FILTER.source === "all" &&
    ALL_TIME_JOURNAL_FILTER.query === ""
);
check("Có type myPartStatus trên TaskItem", myWork.includes("myPartStatus?: string | null"));

const tasksApi = fs.readFileSync(path.resolve("src/app/api/tasks/route.ts"), "utf8");
check(
  "API list trả participantResults của chính người dùng",
  /participantResults:\s*\{\s*where:\s*\{\s*personId:\s*user\.personId\s*\}[\s\S]{0,150}partStatus:\s*true/.test(tasksApi)
);
check(
  "API trả cờ myPartStatus cho client",
  tasksApi.includes("myPartStatus:")
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
