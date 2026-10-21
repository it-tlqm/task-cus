/**
 * test-yc38-f12-date-mapping.ts — YC-38 D6-F12: ánh xạ ngày lịch trong biểu mẫu kết quả tháng.
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_yc38_restore"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   npx next start -p 3100          # chạy song song (bản build production)
 *   npx tsx scripts/test-yc38-f12-date-mapping.ts
 *
 * Nội dung kiểm thử:
 *  1. Ngày hợp lệ  → "YYYY-MM-DD" đúng ngày lịch (không lệch).
 *  2. Ngày NULL/rỗng → "" (không dựng chuỗi rác).
 *  3. Múi giờ khác nhau (UTC, America/New_York, Asia/Tokyo, Pacific/Kiritimati) → kết quả **giống nhau**.
 *  4. Luồng tạo kết quả tháng: hạn 23/10/2026 + ngày xong 21/10/2026 được lưu đúng, **không NULL**.
 *  5. Luồng sửa kết quả đã lưu: cập nhật hạn đúng.
 *  6. Chống lưu hạn NULL: không gửi dueDate ⇒ server kế thừa/giữ hạn (không ghi NULL).
 *
 * Tài khoản test riêng trên DB LOCAL, mật khẩu ngẫu nhiên. Không đụng Production.
 */
import crypto from "node:crypto";
import fs from "fs";
import os from "node:os";
import path from "path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire("D:/thanhnx/OpenCode/talung-cus-work/package.json");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
import { toCalendarDate, calendarDateToIso } from "../src/lib/datetime";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const REPO = "D:/thanhnx/OpenCode/talung-cus-work";
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

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

const TMP = "[YC38-F12]";
const tempPersonIds: string[] = [];
const tempAccountIds: string[] = [];
const tempWorkItemIds: string[] = [];
const tempResultIds: string[] = [];

async function main() {
  console.log("=== YC-38 D6-F12 — Ánh xạ ngày lịch trong kết quả tháng ===\n");

  // ================================================================ 1. Ngày hợp lệ
  check(
    "1. dueDate ISO datetime → ngày lịch 10 ký tự",
    toCalendarDate("2026-10-23T00:00:00.000Z") === "2026-10-23",
    toCalendarDate("2026-10-23T00:00:00.000Z")
  );
  check(
    "1. completedDate ISO datetime → ngày lịch",
    toCalendarDate("2026-10-21T00:00:00.000Z") === "2026-10-21",
    toCalendarDate("2026-10-21T00:00:00.000Z")
  );
  check(
    "1. Chuỗi date-only giữ nguyên",
    toCalendarDate("2026-10-23") === "2026-10-23",
    toCalendarDate("2026-10-23")
  );
  check(
    "1. Chuỗi có múi giờ lệch vẫn lấy ngày đã khai (không dịch)",
    toCalendarDate("2026-10-23T00:00:00.000+07:00") === "2026-10-23",
    toCalendarDate("2026-10-23T00:00:00.000+07:00")
  );
  check(
    "1. Date object → ngày lịch theo UTC (cột date-only)",
    toCalendarDate(new Date("2026-10-23T00:00:00.000Z")) === "2026-10-23",
    toCalendarDate(new Date("2026-10-23T00:00:00.000Z"))
  );

  // ================================================================ 2. Ngày NULL / rác
  check("2. null → chuỗi rỗng", toCalendarDate(null) === "");
  check("2. undefined → chuỗi rỗng", toCalendarDate(undefined) === "");
  check("2. chuỗi rỗng → chuỗi rỗng", toCalendarDate("") === "");
  check("2. chuỗi không hợp lệ → chuỗi rỗng", toCalendarDate("không-phải-ngày") === "");

  // ================================================================ 3. Không phụ thuộc múi giờ
  const snippet = path.join(os.tmpdir(), "yc38-f12-tz.ts");
  fs.writeFileSync(
    snippet,
    `import { toCalendarDate, calendarDateToIso } from "${REPO}/src/lib/datetime";
console.log(JSON.stringify({
  d: toCalendarDate("2026-10-23T00:00:00.000Z"),
  c: toCalendarDate("2026-10-21T00:00:00.000Z"),
  iso: calendarDateToIso("2026-10-23"),
}));`,
    "utf8"
  );
  const TZS = ["Asia/Ho_Chi_Minh", "UTC", "America/New_York", "Asia/Tokyo", "Pacific/Kiritimati"];
  const tzOut: any[] = [];
  for (const tz of TZS) {
    try {
      const out = execFileSync(path.join(REPO, "node_modules", ".bin", "tsx.cmd"), [snippet], {
        env: { ...process.env, TZ: tz },
        encoding: "utf8",
        shell: true,
      });
      const line = out.split(/\r?\n/).find((l) => l.trim().startsWith("{"));
      tzOut.push({ tz, data: JSON.parse(line || "{}") });
    } catch (e: any) {
      tzOut.push({ tz, data: null, err: String(e.message).slice(0, 90) });
    }
  }
  for (const r of tzOut) {
    check(
      `3. TZ=${r.tz}: ánh xạ + tạo ISO giống nhau`,
      r.data?.d === "2026-10-23" && r.data?.c === "2026-10-21" && r.data?.iso === "2026-10-23T00:00:00.000Z",
      r.data ? `${r.data.d} / ${r.data.iso}` : r.err
    );
  }
  check(
    "3. Kết quả giống nhau trên mọi múi giờ",
    new Set(tzOut.map((r) => JSON.stringify(r.data))).size === 1
  );

  // ================================================================ 4. Kiểm tra mã nguồn form
  const pageSrc = fs.readFileSync(path.join(REPO, "src/app/monthly-results/page.tsx"), "utf8");
  check(
    "4. Form KHÔNG còn cắt 16 ký tự cho <input type=\"date\">",
    !/slice\(0, 16\)/.test(pageSrc),
    pageSrc.match(/slice\(0, 16\)/) ? "còn slice(0,16)" : "đã loại bỏ"
  );
  check(
    "4. Cả 3 điểm ánh xạ dùng helper toCalendarDate",
    (pageSrc.match(/toCalendarDate\(/g) || []).length >= 3,
    `${(pageSrc.match(/toCalendarDate\(/g) || []).length} chỗ`
  );
  check(
    "4. Payload KHÔNG gửi dueDate/completedDate = null (để server kế thừa/giữ hạn)",
    /\.\.\.\(fDue \? \{ dueDate: calendarDateToIso\(fDue\) \} : \{\}\)/.test(pageSrc) &&
      /\.\.\.\(fDoneDate \? \{ completedDate: calendarDateToIso\(fDoneDate\) \} : \{\}\)/.test(pageSrc)
  );
  check(
    "4. Hai ô nhập vẫn là type=\"date\" (10 ký tự)",
    (pageSrc.match(/type="date"/g) || []).length >= 2
  );

  // ================================================================ 5-6. E2E local/scratch
  const pw = crypto.randomBytes(12).toString("base64url");
  const hash = await bcrypt.hash(pw, 10);
  await prisma.account.deleteMany({ where: { person: { code: { startsWith: "YC38-F12" } } } });
  await prisma.person.deleteMany({ where: { code: { startsWith: "YC38-F12" } } });
  await prisma.personalWorkItem.deleteMany({ where: { title: { startsWith: TMP } } });

  const staffRole = await prisma.role.findUnique({ where: { code: "STAFF" } });
  const period = await prisma.reportingPeriod.findFirst({ orderBy: { startAt: "asc" } });
  const person = await prisma.person.create({
    data: { code: "YC38-F12-CB", fullName: "YC38 F12 cán bộ", status: "ACTIVE" },
  });
  tempPersonIds.push(person.id);
  const acc = await prisma.account.create({
    data: {
      username: `yc38f12_${Date.now().toString(36)}`,
      passwordHash: hash,
      personId: person.id,
      status: "ACTIVE",
      roleGrants: { create: [{ roleId: staffRole!.id, scopeType: "DEPARTMENT" }] },
    },
  });
  tempAccountIds.push(acc.id);

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: acc.username, password: pw }),
  });
  const loginJson = await loginRes.json().catch(() => ({}));
  check("5. Đăng nhập tài khoản test (local)", !!loginJson.token, `HTTP ${loginRes.status}`);
  if (!loginJson.token) return;
  const H = { Authorization: `Bearer ${loginJson.token}`, "Content-Type": "application/json" };

  // Đầu việc nguồn: hạn 23/10/2026, ngày xong 21/10/2026 (mô phỏng NV-2026-0020)
  const wi = await prisma.personalWorkItem.create({
    data: {
      personId: person.id,
      periodId: period!.id,
      title: `${TMP} đầu việc nguồn`,
      status: "COMPLETED",
      dueDate: new Date("2026-10-23T00:00:00.000Z"),
      completedDate: new Date("2026-10-21T00:00:00.000Z"),
    },
  });
  tempWorkItemIds.push(wi.id);

  // (a) Ánh xạ như form: đọc danh sách đầu việc qua API rồi áp helper
  const listRes = await fetch(
    `${BASE}/api/personal-work-items?personId=${person.id}&year=2026&month=10`,
    { headers: H }
  );
  const listJson = await listRes.json().catch(() => ({}));
  const item = (listJson.data || []).find((x: any) => x.id === wi.id);
  check("5. API trả đầu việc nguồn trong danh sách", !!item, `HTTP ${listRes.status}`);
  if (item) {
    const fDue = toCalendarDate(item.dueDate);
    const fDone = toCalendarDate(item.completedDate);
    check(
      "5. Hạn nguồn ánh xạ → 23/10/2026 (10 ký tự hợp lệ)",
      fDue === "2026-10-23",
      `raw=${String(item.dueDate).slice(0, 24)} → "${fDue}"`
    );
    check("5. Ngày hoàn thành thực tế → 21/10/2026", fDone === "2026-10-21", `"${fDone}"`);

    // (b) Tạo kết quả tháng với ngày đã ánh xạ
    const createRes = await fetch(`${BASE}/api/monthly-results`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        personId: person.id,
        periodYear: 2026,
        periodMonth: 10,
        title: `${TMP} kết quả tháng`,
        workItemId: wi.id,
        dueDate: calendarDateToIso(fDue),
        completedDate: calendarDateToIso(fDone),
        outputText: "kết quả thử nghiệm D6-F12",
      }),
    });
    const createJson = await createRes.json().catch(() => ({}));
    check("6. Tạo kết quả tháng → HTTP 201/200", createRes.status === 200 || createRes.status === 201, `HTTP ${createRes.status} ${String(createJson.error || "")}`);
    const row = await prisma.monthlyWorkResult.findFirst({
      where: { personId: person.id, workItemId: wi.id },
    });
    if (row) {
      tempResultIds.push(row.id);
      check(
        "6. due_date lưu đúng 23/10/2026 (KHÔNG NULL)",
        row.dueDate !== null && row.dueDate.toISOString().slice(0, 10) === "2026-10-23",
        row.dueDate ? row.dueDate.toISOString() : "NULL"
      );
      check(
        "6. completed_date lưu đúng 21/10/2026",
        row.completedDate !== null && row.completedDate.toISOString().slice(0, 10) === "2026-10-21",
        row.completedDate ? row.completedDate.toISOString() : "NULL"
      );
      check(
        "6. Hạn nguồn của đầu việc KHÔNG bị thay đổi",
        (await prisma.personalWorkItem.findUnique({ where: { id: wi.id } }))?.dueDate?.toISOString().slice(0, 10) === "2026-10-23"
      );

      // (c) Sửa kết quả đã lưu (luồng openEdit → lưu lại)
      const patchRes = await fetch(`${BASE}/api/monthly-results`, {
        method: "PATCH",
        headers: H,
        body: JSON.stringify({ id: row.id, dueDate: calendarDateToIso("2026-10-25") }),
      });
      const row2 = await prisma.monthlyWorkResult.findUnique({ where: { id: row.id } });
      check(
        "7. Luồng sửa kết quả đã lưu → hạn cập nhật đúng 25/10/2026",
        patchRes.status === 200 && row2?.dueDate?.toISOString().slice(0, 10) === "2026-10-25",
        `HTTP ${patchRes.status} → ${row2?.dueDate?.toISOString() ?? "NULL"}`
      );

      // (d) Chống lưu NULL: KHÔNG gửi dueDate ⇒ server giữ/kế thừa hạn
      await fetch(`${BASE}/api/monthly-results`, {
        method: "PATCH",
        headers: H,
        body: JSON.stringify({ id: row.id, notes: "cập nhật ghi chú, không gửi dueDate" }),
      });
      const row3 = await prisma.monthlyWorkResult.findUnique({ where: { id: row.id } });
      check(
        "8. Không gửi dueDate ⇒ hạn KHÔNG bị ghi NULL (giữ 25/10/2026)",
        row3?.dueDate !== null && row3?.dueDate.toISOString().slice(0, 10) === "2026-10-25",
        row3?.dueDate ? row3.dueDate.toISOString() : "NULL"
      );
      await prisma.monthlyWorkResult.deleteMany({ where: { id: row.id } });
      tempResultIds.length = 0;

      // (e) Tạo bản ghi mà KHÔNG gửi dueDate ⇒ server kế thừa hạn từ đầu việc
      const createRes2 = await fetch(`${BASE}/api/monthly-results`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({
          personId: person.id,
          periodYear: 2026,
          periodMonth: 10,
          title: `${TMP} không gửi dueDate`,
          workItemId: wi.id,
          outputText: "kiểm tra kế thừa hạn",
        }),
      });
      const row4 = await prisma.monthlyWorkResult.findFirst({
        where: { personId: person.id, workItemId: wi.id },
      });
      check(
        "9. Tạo bản ghi không gửi dueDate ⇒ kế thừa hạn từ đầu việc (23/10/2026), KHÔNG NULL",
        createRes2.status < 300 && row4?.dueDate?.toISOString().slice(0, 10) === "2026-10-23",
        `HTTP ${createRes2.status} → ${row4?.dueDate?.toISOString() ?? "NULL"}`
      );
    }
  }

  console.log(`\n=== KẾT QUẢ: ${passed} pass / ${failed} fail ===`);
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  // KHÔNG gọi process.exit() ở đây: exit ngay sẽ chạy qua .finally() và BỎ SÓT
  // cleanup() ⇒ rò bản ghi test vào DB local, làm hỏng các bộ test khác
  // (vd test-yc38c-linkage T16, test-yc38-uat-origin-tx "mr === 15").
  process.exitCode = failed === 0 ? 0 : 1;
}

async function cleanup() {
  for (const id of tempResultIds) {
    try {
      await prisma.monthlyWorkResult.delete({ where: { id } });
    } catch {}
  }
  try {
    await prisma.monthlyWorkResult.deleteMany({ where: { title: { startsWith: TMP } } });
  } catch {}
  try {
    await prisma.personalWorkItem.deleteMany({ where: { title: { startsWith: TMP } } });
  } catch {}
  for (const id of tempAccountIds) {
    try {
      await prisma.account.delete({ where: { id } });
    } catch {}
  }
  try {
    await prisma.person.deleteMany({ where: { id: { in: tempPersonIds } } });
  } catch {}
}

main()
  .catch(async (e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
