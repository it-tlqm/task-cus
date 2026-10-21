/**
 * test-yc38-datetime-tz.mjs — Kiểm thử múi giờ (YC-38 UAT fix — lỗi lệch +7 giờ).
 *
 *   npx tsx scripts/test-yc38-datetime-tz.mjs
 *
 * Mục tiêu:
 *  1. Ngày giờ người dùng nhập (giờ VN) → lưu đúng thời điểm UTC.
 *     30/10/2026 17:00 (VN) ⇒ 2026-10-30T10:00:00.000Z
 *  2. Hiển thị lại luôn là 30/10/2026 17:00, KHÔNG phụ thuộc múi giờ thiết bị.
 *  3. Chạy lại với nhiều TZ (Asia/Ho_Chi_Minh, UTC, America/New_York, Asia/Tokyo)
 *     ⇒ kết quả PHẢI giống hệt nhau.
 *  4. Trường DATE-ONLY giữ nguyên ngày, không quy đổi múi giờ.
 *  5. Payload cũ (gắn "Z") không còn được dùng.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const REPO = "D:/thanhnx/OpenCode/talung-cus-work";
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

const TZS = ["Asia/Ho_Chi_Minh", "UTC", "America/New_York", "Asia/Tokyo"];

const SNIPPET = `
import { vnLocalToUtcIso, formatVnDateTime, formatVnDate, parseDateOnly, vnDateToDeadlineIso, utcIsoToVnInputValue, formatVnDateTimeParts } from "${pathToFileURL(REPO + "/src/lib/datetime.ts").href}";
const out = {
  toUtc: vnLocalToUtcIso("2026-10-30", "17:00"),
  toUtc2: vnLocalToUtcIso("2026-10-30T17:00"),
  toUtc9: vnLocalToUtcIso("2026-10-30", "09:00"),
  back: formatVnDateTime("2026-10-30T10:00:00.000Z"),
  backFromOld: formatVnDateTime("2026-10-30T17:00:00.000Z"),
  dateOnly: formatVnDate("2026-10-30"),
  parsed: parseDateOnly("2026-10-30"),
  parsedIso: parseDateOnly("2026-10-30T10:00:00.000Z"),
  dateToDeadline: vnDateToDeadlineIso("2026-10-30"),
  inputValue: utcIsoToVnInputValue("2026-10-30T10:00:00.000Z"),
  parts: formatVnDateTimeParts("2026-10-30T10:00:00.000Z"),
  tz: process.env.TZ,
};
console.log(JSON.stringify(out));
`;

const SNIPPET_FILE = path.join(os.tmpdir(), "yc38-tz-snippet.ts");
fs.writeFileSync(SNIPPET_FILE, SNIPPET, "utf8");
const TSX = path.join(REPO, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");

function runWithTz(tz: string): any {
  const res = execFileSync(TSX, [SNIPPET_FILE], {
    env: { ...process.env, TZ: tz },
    encoding: "utf8",
    cwd: REPO,
    shell: process.platform === "win32",
  });
  const line = res.split(/\r?\n/).find((l) => l.trim().startsWith("{"));
  return JSON.parse(line || "{}");
}

console.log("=== YC-38 — Kiểm thử múi giờ nghiệp vụ ===\n");

const results = TZS.map((tz) => {
  try {
    return { tz, data: runWithTz(tz), err: null };
  } catch (e: any) {
    return { tz, data: null, err: String(e.message).slice(0, 200) };
  }
});

for (const r of results) {
  if (r.err) {
    check(`Chạy được với TZ=${r.tz}`, false, r.err);
    continue;
  }
  check(`TZ=${r.tz}: 17:00 VN → 10:00:00.000Z`, r.data.toUtc === "2026-10-30T10:00:00.000Z", r.data.toUtc);
}

const ok = results.filter((r) => r.data);
const base = ok[0]?.data;
if (base) {
  const same = (key: string) => ok.every((r) => r.data[key] === base[key]);
  check("Kết quả giống nhau trên mọi múi giờ (toUtc)", same("toUtc"), base.toUtc);
  check("Kết quả giống nhau trên mọi múi giờ (hiển thị lại)", same("back"), base.back);
  check("Kết quả giống nhau trên mọi múi giờ (date-only)", same("dateOnly"), base.dateOnly);
}

const b = base || {};
check("Nhập 30/10/2026 17:00 → lưu 2026-10-30T10:00:00.000Z", b.toUtc === "2026-10-30T10:00:00.000Z", b.toUtc);
check("Nhập datetime-local (30/10T17:00) → cùng kết quả", b.toUtc2 === "2026-10-30T10:00:00.000Z", b.toUtc2);
check("Nhập 09:00 VN → 02:00:00.000Z", b.toUtc9 === "2026-10-30T02:00:00.000Z", b.toUtc9);
check("Đọc lại 10:00:00Z → 30/10/2026 17:00", b.back === "30/10/2026 17:00", b.back);
check("Giá trị cũ (17:00Z) hiển thị 00:00 ngày 31/10 (đúng quy đổi)", b.backFromOld === "31/10/2026 00:00", b.backFromOld);
check("DATE-ONLY: giữ nguyên ngày 30/10/2026", b.dateOnly === "30/10/2026", b.dateOnly);
check("DATE-ONLY: parseDateOnly không đổi ngày", b.parsed === "2026-10-30", b.parsed);
check("DATE-ONLY: parseDateOnly từ ISO lấy ngày theo giờ VN", b.parsedIso === "2026-10-30", b.parsedIso);
check("Ngày (date-only) → thời điểm 17:00 VN", b.dateToDeadline === "2026-10-30T10:00:00.000Z", b.dateToDeadline);
check("Giá trị cho ô datetime-local = 30/10/2026 17:00", b.inputValue === "2026-10-30T17:00", b.inputValue);
check("Tách thời điểm theo giờ VN", b.parts?.date === "2026-10-30" && b.parts?.time === "17:00", JSON.stringify(b.parts));

// Kiểm tra mã nguồn không còn payload gắn "Z" thủ công
import fs from "node:fs";
const myWork = fs.readFileSync(path.join(REPO, "src/app/my-work/page.tsx"), "utf8");
check(
  "Không còn payload gắn hậu tố 'Z' cho ngày giờ địa phương",
  !/T\$\{newTaskDeadline\}T\$\{newTaskTime\}:00Z/.test(myWork) &&
    /vnLocalToUtcIso\(newTaskDeadline, newTaskTime\)/.test(myWork)
);

console.log(`\n=== KẾT QUẢ: ${passed} pass / ${failed} fail ===`);
if (failures.length) failures.forEach((f) => console.log("  - " + f));
process.exit(failed === 0 ? 0 : 1);
