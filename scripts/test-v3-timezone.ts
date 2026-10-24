/**
 * V3.2 remediation Task 1.2 — ngày nghiệp vụ phía server phải theo giờ Việt Nam.
 *
 * Lỗi: Vercel chạy UTC. Lúc 06:00 sáng VN (23:00Z ngày hôm trước),
 * `new Date().getDate()` / `toLocaleDateString("vi-VN")` vẫn trả ngày cũ.
 *
 * Chạy bắt buộc (gate P0):
 *   $env:TZ="UTC"; npx tsx scripts/test-v3-timezone.ts
 *
 * Kiểm tra API dashboard (tuỳ chọn, cần fixture server + DB local):
 *   $env:TEST_BASE_URL="http://localhost:3117"
 *   $env:TEST_USERNAME="lanhdao"; $env:TEST_PASSWORD="demo123"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as workDates from "../src/server/work-dates";
import { formatVnDate, vnDateOnly } from "../src/lib/datetime";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXED_NOW = new Date("2026-10-24T23:00:00.000Z");
const VN_DAY = "2026-10-25";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  [PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? " - " + detail : ""}`);
    console.log(`  [FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Cắt một nhánh `targetPeriodKey === "<key>"` cho tới `else if` kế tiếp. */
function branch(source: string, key: string): string {
  const start = source.indexOf(`targetPeriodKey === "${key}"`);
  if (start < 0) return "";
  const next = source.indexOf("} else if", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

function main() {
  console.log("=== V3.2 TASK 1.2 — VIETNAM TIMEZONE ===\n");

  // 0. Test phải chạy dưới TZ=UTC để mô phỏng Vercel.
  check("Chạy với TZ=UTC", process.env.TZ === "UTC", process.env.TZ || "(chưa đặt)");

  // 1. Helper thuần: mốc 06:00 VN ngày 25/10/2026 = 23:00Z ngày 24/10/2026.
  const today = workDates.todayInVietnam(FIXED_NOW);
  check(`todayInVietnam(fixed) = ${VN_DAY}`, today === VN_DAY, today);

  if (typeof workDates.vietnamDayRange !== "function") {
    check("vietnamDayRange tồn tại", false, "chưa implement helper");
  } else {
    const range = workDates.vietnamDayRange(FIXED_NOW);
    check(`vietnamDayRange(fixed).date = ${VN_DAY}`, range.date === VN_DAY, range.date);
    check(
      "vietnamDayRange(fixed).start = 2026-10-24T17:00:00.000Z",
      range.start.toISOString() === "2026-10-24T17:00:00.000Z",
      range.start.toISOString()
    );
    check(
      "vietnamDayRange(fixed).end = 2026-10-25T16:59:59.999Z",
      range.end.toISOString() === "2026-10-25T16:59:59.999Z",
      range.end.toISOString()
    );

    const beforeMidnight = workDates.vietnamDayRange(new Date("2026-10-24T16:59:59.999Z"));
    const atMidnight = workDates.vietnamDayRange(new Date("2026-10-24T17:00:00.000Z"));
    check("23:59:59.999 VN ngày 24/10 vẫn là ngày 24", beforeMidnight.date === "2026-10-24", beforeMidnight.date);
    check("00:00 VN ngày 25/10 chuyển sang ngày 25", atMidnight.date === VN_DAY, atMidnight.date);
  }

  // 1b. Task 1.2b — tuần/tháng theo lịch Việt Nam tại đúng mốc lỗi.
  if (typeof workDates.vietnamWeekRange !== "function") {
    check("vietnamWeekRange tồn tại", false, "chưa implement helper");
  } else {
    const week = workDates.vietnamWeekRange(FIXED_NOW);
    check("vietnamWeekRange(fixed).date = 2026-10-25", week.date === VN_DAY, week.date);
    check(
      "vietnamWeekRange(fixed).start = 2026-10-18T17:00:00.000Z",
      week.start.toISOString() === "2026-10-18T17:00:00.000Z",
      week.start.toISOString()
    );
    check(
      "vietnamWeekRange(fixed).end = 2026-10-25T16:59:59.999Z",
      week.end.toISOString() === "2026-10-25T16:59:59.999Z",
      week.end.toISOString()
    );
    check("vietnamWeekRange(fixed).weekNumber = 43", week.weekNumber === 43, String(week.weekNumber));
    check("vietnamWeekRange(fixed).year = 2026", week.year === 2026, String(week.year));

    const weekBefore = workDates.vietnamWeekRange(new Date("2026-10-18T16:59:59.999Z"));
    check(
      "23:59:59.999 VN Chủ nhật 18/10 vẫn thuộc tuần trước (kết thúc 2026-10-18T16:59:59.999Z)",
      weekBefore.end.toISOString() === "2026-10-18T16:59:59.999Z",
      weekBefore.end.toISOString()
    );
  }

  if (typeof workDates.vietnamMonthRange !== "function") {
    check("vietnamMonthRange tồn tại", false, "chưa implement helper");
  } else {
    const month = workDates.vietnamMonthRange(FIXED_NOW);
    check("vietnamMonthRange(fixed).date = 2026-10-25", month.date === VN_DAY, month.date);
    check(
      "vietnamMonthRange(fixed).start = 2026-09-30T17:00:00.000Z",
      month.start.toISOString() === "2026-09-30T17:00:00.000Z",
      month.start.toISOString()
    );
    check(
      "vietnamMonthRange(fixed).end = 2026-10-31T16:59:59.999Z",
      month.end.toISOString() === "2026-10-31T16:59:59.999Z",
      month.end.toISOString()
    );
    check("vietnamMonthRange(fixed).month = 10", month.month === 10, String(month.month));
    check("vietnamMonthRange(fixed).year = 2026", month.year === 2026, String(month.year));

    const monthStart = workDates.vietnamMonthRange(new Date("2026-09-30T17:00:00.000Z"));
    check(
      "00:00 VN 01/10 chuyển sang tháng 10",
      monthStart.date === "2026-10-01" && monthStart.month === 10,
      `${monthStart.date}/${monthStart.month}`
    );
  }

  // 2. Hiển thị ngày theo VN tại đúng mốc lỗi (06:00 sáng VN).
  check("formatVnDate(fixed) = 25/10/2026", formatVnDate(FIXED_NOW) === "25/10/2026", formatVnDate(FIXED_NOW));
  check("formatVnDate(date-only) = 25/10/2026", formatVnDate(VN_DAY) === "25/10/2026", formatVnDate(VN_DAY));
  check("vnDateOnly(fixed) = 2026-10-25", vnDateOnly(FIXED_NOW) === VN_DAY, vnDateOnly(FIXED_NOW));

  // 3. Dashboard period=today phải dùng đúng khoảng ngày VN.
  const dashboard = read("src/app/api/dashboard/kpi/route.ts");
  const todayBranch = branch(dashboard, "today");
  check("Dashboard today dùng vietnamDayRange()", /vietnamDayRange\(\)/.test(todayBranch), todayBranch ? "" : "không thấy nhánh");
  check("Dashboard today start = range.start", /periodStart\s*=\s*range\.start/.test(todayBranch));
  check("Dashboard today end = range.end", /periodEnd\s*=\s*range\.end/.test(todayBranch));
  check("Dashboard title dùng formatVnDate(range.date)", /formatVnDate\(range\.date\)/.test(todayBranch));
  check(
    "Dashboard không còn toLocaleDateString('vi-VN') thiếu timeZone",
    !/toLocaleDateString\(\s*["']vi-VN["']\s*\)/.test(dashboard)
  );

  const weekBranch = branch(dashboard, "week");
  check("Dashboard week dùng vietnamWeekRange()", /vietnamWeekRange\(/.test(weekBranch), weekBranch ? "" : "không thấy nhánh");
  check(
    "Dashboard week không còn getDay/getFullYear/getMonth trên server-local",
    !/getDay\(|getFullYear\(|getMonth\(/.test(weekBranch)
  );
  check(
    "Dashboard week vẫn ưu tiên kỳ WEEK trong DB",
    /p\.type === "WEEK"/.test(weekBranch) && /containing/.test(weekBranch)
  );

  const monthBranch = branch(dashboard, "month");
  check("Dashboard month dùng vietnamMonthRange()", /vietnamMonthRange\(/.test(monthBranch), monthBranch ? "" : "không thấy nhánh");
  check(
    "Dashboard month không còn getDay/getFullYear/getMonth trên server-local",
    !/getDay\(|getFullYear\(|getMonth\(/.test(monthBranch)
  );
  check(
    "Dashboard month vẫn ưu tiên kỳ MONTH trong DB",
    /p\.type === "MONTH"/.test(monthBranch) && /containingM/.test(monthBranch)
  );

  // 3b. Notification list + header Excel dùng ngày VN.
  const notificationList = read("src/app/api/notifications/route.ts");
  check("Notification list dùng formatVnDate(d)", /return formatVnDate\(d\)/.test(notificationList));
  check("Notification list không còn toLocaleDateString", !/toLocaleDateString/.test(notificationList));

  const detailedExporter = read("src/lib/excel/detailed-exporter.ts");
  check("Excel header dùng formatVnDate(new Date())", /formatVnDate\(new Date\(\)\)/.test(detailedExporter));
  check("Excel header không còn toLocaleDateString", !/toLocaleDateString/.test(detailedExporter));

  // 4. AI: quota theo ngày VN, nhãn summary theo ngày VN.
  const ai = read("src/app/api/ai/route.ts");
  const quotaStart = ai.indexOf("async function checkQuota");
  const quotaEnd = ai.indexOf("export async function GET", quotaStart);
  const quotaBlock = quotaStart >= 0 ? ai.slice(quotaStart, quotaEnd) : "";
  check("AI checkQuota dùng vietnamDayRange()", /vietnamDayRange\(\)/.test(quotaBlock));
  check("AI checkQuota start = range.start", /range\.start/.test(quotaBlock));
  check(
    "AI label dùng formatVnDate(now)",
    /label\s*=\s*`tuần \$\{formatVnDate\(now\)\}`/.test(ai)
  );
  check("AI không còn toLocaleDateString thiếu timeZone", !/toLocaleDateString\(\s*["']vi-VN["']\s*\)/.test(ai));

  // 5. Notification: idempotency + nội dung dùng ngày VN.
  const notifications = read("src/server/notifications.ts");
  check("Notification todayStr = todayInVietnam(now)", /const todayStr = todayInVietnam\(now\)/.test(notifications));
  check(
    "Notification deadlineDateStr = vnDateOnly(currentDeadline)",
    /const deadlineDateStr = vnDateOnly\(t\.currentDeadline\)/.test(notifications)
  );
  check(
    "Notification nội dung dùng formatVnDate(currentDeadline)",
    /formatVnDate\(t\.currentDeadline\)/.test(notifications)
  );
  check(
    "Notification không dùng toISOString().slice(0,10)",
    !/toISOString\(\)\.slice\(0,\s*10\)/.test(notifications)
  );
  check(
    "Notification không còn toLocaleDateString/TimeString thiếu timeZone",
    !/toLocaleDateString|toLocaleTimeString/.test(notifications)
  );

  // 6. Remind: idempotency + nội dung dùng ngày VN.
  const remind = read("src/app/api/tasks/[id]/remind/route.ts");
  check("Remind todayStr = todayInVietnam()", /const todayStr = todayInVietnam\(\)/.test(remind));
  check("Remind nội dung dùng formatVnDate(currentDeadline)", /formatVnDate\(task\.currentDeadline\)/.test(remind));
  check("Remind không dùng toISOString().slice(0,10)", !/toISOString\(\)\.slice\(0,\s*10\)/.test(remind));

  // 7. Báo cáo Excel: tên file + ngày hạn hiển thị theo VN.
  const report = read("src/app/api/reports/export/route.ts");
  check("Report filename dùng todayInVietnam()", /todayInVietnam\(\)/.test(report));
  check("Report không dùng new Date().toISOString().slice(0,10)", !/new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/.test(report));
  check("Report deadline dùng formatVnDate()", /formatVnDate\(t\.currentDeadline\)/.test(report));
  check(
    "Report không còn toLocaleDateString('vi-VN') thiếu timeZone",
    !/toLocaleDateString\(\s*["']vi-VN["']\s*\)/.test(report)
  );

  return { dashboardExpectedDate: today };
}

async function checkDashboardApi() {
  const base = process.env.TEST_BASE_URL;
  if (!base) {
    console.log("  [SKIP] Dashboard API — chưa đặt TEST_BASE_URL (fixture server không bắt buộc cho gate).");
    return;
  }

  const username = process.env.TEST_USERNAME || "lanhdao";
  const password = process.env.TEST_PASSWORD || "demo123";
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const loginJson: any = await login.json().catch(() => ({}));
  if (!loginJson.token) {
    check("Dashboard API đăng nhập được", false, `HTTP ${login.status}: ${loginJson.error || ""}`);
    return;
  }

  const before = workDates.vietnamDayRange();
  const res = await fetch(`${base}/api/dashboard/kpi?period=today`, {
    headers: { Authorization: `Bearer ${loginJson.token}` },
  });
  const json: any = await res.json().catch(() => ({}));
  const after = workDates.vietnamDayRange();
  check("Dashboard API period=today HTTP 200", res.status === 200, `HTTP ${res.status}`);

  const expected = before.date === after.date ? before : after;
  check(
    `Dashboard API startAt = ${expected.start.toISOString()}`,
    json.selectedPeriod?.startAt === expected.start.toISOString(),
    String(json.selectedPeriod?.startAt)
  );
  check(
    `Dashboard API endAt = ${expected.end.toISOString()}`,
    json.selectedPeriod?.endAt === expected.end.toISOString(),
    String(json.selectedPeriod?.endAt)
  );
  check(
    `Dashboard API title = Hôm nay (${formatVnDate(expected.date)})`,
    json.selectedPeriod?.title === `Hôm nay (${formatVnDate(expected.date)})`,
    String(json.selectedPeriod?.title)
  );

  // week/month: ưu tiên kỳ trong DB, nếu không có thì dùng helper VN.
  const weekNow = new Date();
  const weekRes = await fetch(`${base}/api/dashboard/kpi?period=week`, {
    headers: { Authorization: `Bearer ${loginJson.token}` },
  });
  const weekJson: any = await weekRes.json().catch(() => ({}));
  const weekHelper = workDates.vietnamWeekRange(weekNow);
  const weekDb = (weekJson.availablePeriods || []).find(
    (p: any) => p.type === "WEEK" && new Date(p.startAt) <= weekNow && weekNow <= new Date(p.endAt)
  );
  check("Dashboard API period=week HTTP 200", weekRes.status === 200, `HTTP ${weekRes.status}`);
  check(
    "Dashboard API week startAt = kỳ DB hoặc vietnamWeekRange().start",
    weekJson.selectedPeriod?.startAt === (weekDb?.startAt ?? weekHelper.start.toISOString()),
    String(weekJson.selectedPeriod?.startAt)
  );
  check(
    "Dashboard API week endAt = kỳ DB hoặc vietnamWeekRange().end",
    weekJson.selectedPeriod?.endAt === (weekDb?.endAt ?? weekHelper.end.toISOString()),
    String(weekJson.selectedPeriod?.endAt)
  );
  check(
    "Dashboard API week title = kỳ DB hoặc Tuần WW/YYYY",
    weekJson.selectedPeriod?.title === (weekDb?.title ?? `Tuần ${weekHelper.weekNumber}/${weekHelper.year}`),
    String(weekJson.selectedPeriod?.title)
  );

  const monthNow = new Date();
  const monthRes = await fetch(`${base}/api/dashboard/kpi?period=month`, {
    headers: { Authorization: `Bearer ${loginJson.token}` },
  });
  const monthJson: any = await monthRes.json().catch(() => ({}));
  const monthHelper = workDates.vietnamMonthRange(monthNow);
  const monthDb = (monthJson.availablePeriods || []).find(
    (p: any) => p.type === "MONTH" && new Date(p.startAt) <= monthNow && monthNow <= new Date(p.endAt)
  );
  check("Dashboard API period=month HTTP 200", monthRes.status === 200, `HTTP ${monthRes.status}`);
  check(
    "Dashboard API month startAt = kỳ DB hoặc vietnamMonthRange().start",
    monthJson.selectedPeriod?.startAt === (monthDb?.startAt ?? monthHelper.start.toISOString()),
    String(monthJson.selectedPeriod?.startAt)
  );
  check(
    "Dashboard API month endAt = kỳ DB hoặc vietnamMonthRange().end",
    monthJson.selectedPeriod?.endAt === (monthDb?.endAt ?? monthHelper.end.toISOString()),
    String(monthJson.selectedPeriod?.endAt)
  );
  check(
    "Dashboard API month title = kỳ DB hoặc Tháng M/YYYY",
    monthJson.selectedPeriod?.title === (monthDb?.title ?? `Tháng ${monthHelper.month}/${monthHelper.year}`),
    String(monthJson.selectedPeriod?.title)
  );
}

main();
checkDashboardApi()
  .catch((err) => check("Dashboard API chạy được", false, String(err?.message || err).slice(0, 200)))
  .finally(() => {
    console.log(`\n=== KẾT QUẢ: ${pass} pass / ${fail} fail ===`);
    if (failures.length) failures.forEach((f) => console.log("  - " + f));
    process.exit(fail === 0 ? 0 : 1);
  });
