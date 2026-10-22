/**
 * CẤP TÀI KHOẢN NGƯỜI DÙNG CHO NHÂN SỰ (công chức hải quan + HĐLĐ 111)
 *
 * Quy tắc tài khoản (chủ dự án chốt 22/10/2026):
 *   - Công chức hải quan  : hqtl001, hqtl002, ... theo thứ tự lãnh đạo → các vị trí khác
 *   - Hợp đồng lao động 111: hdld001, hdld002, ...
 *   - Mật khẩu mặc định   : tham số --default-password (mặc định Talung@2026)
 *   - BẮT BUỘC đổi mật khẩu ở lần đăng nhập đầu tiên (must_change_password = true)
 *
 * Vai trò:
 *   - Lãnh đạo đơn vị              -> UNIT_LEADER      (xem toàn đơn vị, duyệt kế hoạch)
 *   - Trưởng nhóm / Phó nhóm       -> DEPARTMENT_LEADER (duyệt kế hoạch trong bộ phận)
 *   - Công chức, HĐLĐ              -> STAFF
 *
 * An toàn:
 *   - KHÔNG đụng tài khoản đã có (admin.tk, cccntt...) — bỏ qua, in cảnh báo.
 *   - Idempotent: chạy lại không tạo trùng.
 *   - Mặc định DRY-RUN; chỉ ghi khi có --confirm=CREATE-ACCOUNTS-2026-10-22.
 *   - Không in mật khẩu ra log.
 *
 * Cấu hình:
 *   node scripts/create-staff-accounts.mjs --db=<url> [--confirm=...] [--default-password=...]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const creq = createRequire(path.join(REPO, "package.json"));
const { PrismaClient } = creq("@prisma/client");
const bcrypt = creq("bcryptjs");
const ExcelJS = creq("exceljs");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf("=");
    return i < 0 ? [a.replace(/^--/, ""), true] : [a.slice(2, i), a.slice(i + 1)];
  })
);
const DB_URL = args.db || process.env.DATABASE_URL;
const CONFIRM = String(args.confirm || "");
const CONFIRM_TOKEN = "CREATE-ACCOUNTS-2026-10-22";
const DEFAULT_PASSWORD = String(args["default-password"] || "Talung@2026");
const XLSX = args.xlsx || path.join(REPO, "docs", "Dữ liệu-file-hai-quan-gui", "Danh sách.xlsx");
const OUT_CSV = args.out || path.join(REPO, "demo-ops", "reset", "staff-accounts-2026-10-22.csv");
const APPLY = CONFIRM === CONFIRM_TOKEN;

if (!DB_URL) {
  console.error("Thiếu --db=<DATABASE_URL>");
  process.exit(2);
}

/* ---------- 1. Đọc danh sách Excel (nguồn thứ tự & chức danh) ---------- */
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const cellv = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    return "";
  }
  return String(v).trim();
};

// Thứ tự lãnh đạo do chủ dự án chốt (22/10/2026): Bằng, Đán, Ánh
const LEADER_ORDER = ["Hoàng Văn Bằng", "Trần Nguyên Đán", "Nông Xuân Ánh"];
// Không cấp tài khoản (cấp khu vực, không thuộc đơn vị Tà Lùng) — chủ dự án chốt
const EXCLUDE = ["Lê Văn Hậu"];
// Gán phạm vi đơn vị thủ công khi bản ghi không có cờ "chính"
const SCOPE_OVERRIDE = { "Trần Minh Hoàng": "Bộ phận TH & Báo cáo" };

async function readExcel() {
  if (!fs.existsSync(XLSX)) throw new Error("Thiếu file Excel: " + XLSX);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const ws = wb.getWorksheet("Danh sách");
  if (!ws) throw new Error("Không có sheet 'Danh sách'");
  const rows = [];
  let curGroup = null;
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const stt = cellv(row.getCell(1).value);
    const name = cellv(row.getCell(2).value);
    const role = cellv(row.getCell(3).value);
    const phone = cellv(row.getCell(4).value).replace(/\s+/g, " ");
    const email = cellv(row.getCell(5).value);
    if (!stt && name) {
      curGroup = name;
      continue;
    }
    if (!name) continue;
    // Chuẩn hoá khi so khớp tiếng Việt (cửa khẩu / khu vực / hợp đồng lao động)
    const nRole = norm(role);
    const isLeaderRow = !curGroup && /cua khau/.test(nRole) && !/khu vuc/.test(nRole);
    rows.push({
      name,
      role,
      phone,
      email,
      group: isLeaderRow ? "Lãnh đạo đơn vị" : curGroup,
      isLeader: isLeaderRow,
    });
  }
  return rows;
}

/* ---------- 2. Lập danh sách tài khoản ---------- */
function buildPlan(rows) {
  // Gộp theo người (một người có thể xuất hiện ở nhiều bộ phận)
  const map = new Map();
  for (const r of rows) {
    const k = norm(r.name);
    if (!map.has(k)) map.set(k, { name: r.name, role: r.role, groups: [], isLeader: r.isLeader });
    const p = map.get(k);
    if (r.group) p.groups.push(r.group);
    if (r.isLeader) p.isLeader = true;
  }
  const people = [...map.values()];

  const leaders = LEADER_ORDER.map((n) => people.find((p) => norm(p.name) === norm(n))).filter(Boolean);
  const hdld = people.filter((p) => p.groups.some((g) => /hop dong lao dong/.test(norm(g))));
  const excluded = people.filter((p) => EXCLUDE.some((e) => norm(e) === norm(p.name)));
  const staff = people.filter(
    (p) => !hdld.includes(p) && !leaders.includes(p) && !excluded.includes(p) && !p.isLeader
  );
  const otherLeaders = people.filter(
    (p) => p.isLeader && !leaders.includes(p) && !excluded.includes(p) && !hdld.includes(p)
  );

  const plan = [];
  let i = 0;
  for (const p of leaders) plan.push({ ...p, isLeader: true, username: "hqtl" + String(++i).padStart(3, "0") });
  for (const p of [...staff, ...otherLeaders])
    plan.push({ ...p, isLeader: p.isLeader, username: "hqtl" + String(++i).padStart(3, "0") });
  let j = 0;
  for (const p of hdld) plan.push({ ...p, isLeader: false, username: "hdld" + String(++j).padStart(3, "0") });
  return { plan, excluded, leaders, hdld, staff, otherLeaders };
}

function roleFor(p) {
  if (p.isLeader) return "UNIT_LEADER";
  const nRole = norm(p.role);
  if (/truong nhom|pho nhom|truong bo phan|pho doi truong/.test(nRole)) return "DEPARTMENT_LEADER";
  return "STAFF";
}

/* ---------- 3. Chạy ---------- */
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

function csvCell(v) {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

(async () => {
  const rows = await readExcel();
  const { plan, excluded } = buildPlan(rows);
  console.log(`\n=== KE HOACH CAP TAI KHOAN (${APPLY ? "THUC THI" : "DRY-RUN"}) ===`);
  console.log(`  Excel: ${rows.length} luot | ${plan.length} tai khoan se cap | bo trong: ${excluded.map((e) => e.name).join(", ") || "-"}`);

  const dbPeople = await prisma.person.findMany({
    include: { assignments: { include: { unit: true, position: true } } },
  });
  const byName = new Map(dbPeople.map((p) => [norm(p.fullName), p]));
  const roles = await prisma.role.findMany();
  const roleByCode = new Map(roles.map((r) => [r.code, r]));

  const existingUsernames = new Set((await prisma.account.findMany({ select: { username: true } })).map((a) => a.username));
  const personWithAccount = new Set((await prisma.account.findMany({ select: { personId: true } })).map((a) => a.personId));

  const items = [];
  const skipped = [];
  for (const p of plan) {
    const person = byName.get(norm(p.name));
    if (!person) {
      skipped.push({ ...p, reason: "khong tim thay nguoi trong DB" });
      continue;
    }
    if (personWithAccount.has(person.id)) {
      skipped.push({ ...p, reason: "nguoi da co tai khoan" });
      continue;
    }
    if (existingUsernames.has(p.username)) {
      skipped.push({ ...p, reason: "ten dang nhap da ton tai" });
      continue;
    }
    // Đơn vị phạm vi: ưu tiên đơn vị chính; sau đó bản ghi định nghĩa; cuối cùng đơn vị đầu tiên
    const prim = person.assignments.find((a) => a.isPrimary);
    const override = SCOPE_OVERRIDE[p.name];
    let unit = null;
    if (override) {
      unit = person.assignments.map((a) => a.unit).find((u) => u && u.name === override) || null;
    }
    if (!unit) {
      unit =
        prim?.unit ||
        person.assignments.slice().sort((a, b) => a.unit.name.localeCompare(b.unit.name))[0]?.unit ||
        null;
    }
    const roleCode = roleFor(p);
    const role = roleByCode.get(roleCode);
    if (!role) throw new Error("Thiếu vai trò trong DB: " + roleCode);
    const scopeType = roleCode === "UNIT_LEADER" ? "ORGANIZATION" : unit ? "DEPARTMENT" : "OWN";
    items.push({
      person,
      username: p.username,
      roleCode,
      roleId: role.id,
      scopeType,
      unitId: unit?.id || null,
      unitName: unit?.name || "",
      chucDanh: p.role,
      groups: p.groups,
    });
  }

  console.log(`\n  STT | TAI KHOAN   | HO TEN                 | DON VI (pham vi)              | VAI TRO           | CHUC DANH`);
  items.forEach((it, i) => {
    console.log(
      `  ${String(i + 1).padStart(3)} | ${it.username.padEnd(11)} | ${it.person.fullName.padEnd(22)} | ${(it.unitName || "(chua gan don vi)").padEnd(28)} | ${it.roleCode.padEnd(17)} | ${it.chucDanh}`
    );
  });
  if (skipped.length) {
    console.log("\n  BO QUA:");
    for (const s of skipped) console.log(`    - ${s.name} (${s.username}): ${s.reason}`);
  }
  const byRole = items.reduce((m, it) => ((m[it.roleCode] = (m[it.roleCode] || 0) + 1), m), {});
  console.log("\n  Tong theo vai tro: " + Object.entries(byRole).map(([k, v]) => `${k}=${v}`).join(", "));
  console.log("  Mat khau mac dinh: (khong in ra log - xem file ban giao CSV)");

  if (!APPLY) {
    console.log("\n>>> DRY-RUN: chua tao tai khoan nao. Them --confirm=" + CONFIRM_TOKEN + " de thuc thi.");
    await prisma.$disconnect();
    return;
  }

  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const stamp = new Date().toISOString();
  let created = 0;
  for (const it of items) {
    const acc = await prisma.account.create({
      data: {
        personId: it.person.id,
        username: it.username,
        passwordHash: hash,
        status: "ACTIVE",
        mustChangePassword: true,
        roleGrants: {
          create: [{ roleId: it.roleId, scopeType: it.scopeType, scopeUnitId: it.unitId }],
        },
      },
    });
    await prisma.auditEvent.create({
      data: {
        actorId: null,
        action: "ACCOUNT_CREATE_BULK",
        resourceType: "Account",
        resourceId: acc.id,
        newData: {
          username: it.username,
          fullName: it.person.fullName,
          roleCode: it.roleCode,
          scopeType: it.scopeType,
          scopeUnit: it.unitName || null,
          mustChangePassword: true,
          source: "create-staff-accounts.mjs",
          at: stamp,
        },
      },
    });
    created++;
  }

  // File bàn giao (ngoài git: demo-ops/ bị .gitignore)
  fs.mkdirSync(path.dirname(OUT_CSV), { recursive: true });
  const lines = [
    ["Tai khoan", "Ho ten", "Don vi (pham vi)", "Chuc danh", "Vai tro", "Pham vi", "Mat khau mac dinh", "Bat buoc doi lan dau"].join(","),
    ...items.map((it) =>
      [
        it.username,
        it.person.fullName,
        it.unitName,
        it.chucDanh,
        it.roleCode,
        it.scopeType,
        DEFAULT_PASSWORD,
        "CO",
      ]
        .map(csvCell)
        .join(",")
    ),
  ];
  fs.writeFileSync(OUT_CSV, "﻿" + lines.join("\r\n") + "\r\n", "utf8");
  try {
    creq("node:child_process").execFileSync("icacls", [OUT_CSV, "/inheritance:r", "/grant:r", `${process.env.USERNAME}:(F)`], {
      stdio: "ignore",
    });
  } catch {}

  console.log(`\n>>> DA TAO ${created} TAI KHOAN.`);
  console.log(`  File ban giao: ${OUT_CSV}`);
  console.log(`  SHA256 file: ${crypto.createHash("sha256").update(fs.readFileSync(OUT_CSV)).digest("hex")}`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("LOI:", e?.stack || e?.message || e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
