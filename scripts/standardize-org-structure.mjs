/**
 * CHUẨN HOÁ CƠ CẤU TỔ CHỨC (sau reset Production — 22/10/2026)
 *
 * Mục tiêu (chủ dự án yêu cầu 22/10/2026):
 *   1. Cây đơn vị 3 cấp đúng theo tổ chức thực tế:
 *        C1  Chi cục hải quan khu vực XVI
 *         └─ C2  Hải quan cửa khẩu Quốc tế Tà Lùng
 *              ├─ C3  Lãnh đạo đơn vị
 *              └─ C3  6 bộ phận nghiệp vụ
 *   2. Chuẩn hoá tên nhóm công việc TX về đúng tên bộ phận (bỏ lỗi "Bộ phân…").
 *   3. Bật mapping 6 nhóm nguồn TX → 6 bộ phận (1:1 theo tên) — bỏ blocker B-2.
 *
 * An toàn:
 *   - Mặc định DRY-RUN; chỉ ghi khi có --confirm=STANDARDIZE-ORG-2026-10-22.
 *   - Idempotent: chạy lại không sinh bản ghi trùng.
 *   - Không xoá người dùng/tài khoản/nghiệp vụ.
 *
 * Dùng:
 *   node scripts/standardize-org-structure.mjs --db=<url> [--confirm=STANDARDIZE-ORG-2026-10-22]
 */
import { createRequire } from "node:module";
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const creq = createRequire(path.join(REPO, "package.json"));
const { PrismaClient } = creq("@prisma/client");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf("=");
    return i < 0 ? [a.replace(/^--/, ""), true] : [a.slice(2, i), a.slice(i + 1)];
  })
);
const DB_URL = args.db || process.env.DATABASE_URL;
const CONFIRM = String(args.confirm || "");
const APPLY = CONFIRM === "STANDARDIZE-ORG-2026-10-22";
if (!DB_URL) {
  console.error("Thieu --db=<DATABASE_URL>");
  process.exit(2);
}

/* ---------- Cây đơn vị chuẩn ---------- */
const HQ = { code: "HQCB-HAI-QUAN-CUA-KHAU-QUOC-TE-TA-LUNG", name: "Hải quan cửa khẩu Quốc tế Tà Lùng", level: 1, sort: 0 };
// Đơn vị cấp 2 (thứ tự theo file Excel "Cơ cấu tổ chức")
const BO_PHAN = [
  { code: "HQCB-LANH-DAO-DON-VI", name: "Lãnh đạo đơn vị", level: 2, sort: 10 },
  { code: "HQCB-BO-PHAN-NGHIEP-VU-HAI-QUAN", name: "Bộ phận Nghiệp vụ Hải quan", level: 2, sort: 20 },
  { code: "HQCB-BO-PHAN-CNTT", name: "Bộ phận CNTT", level: 2, sort: 30 },
  { code: "HQCB-BO-PHAN-DIEU-TRA-CBL", name: "Bộ phận điều tra CBL", level: 2, sort: 40 },
  { code: "HQCB-BO-PHAN-PHUC-TAP-KT-STQ", name: "Bộ phận Phúc tập & KT STQ", level: 2, sort: 50 },
  { code: "HQCB-BO-PHAN-TH-BAO-CAO", name: "Bộ phận TH & Báo cáo", level: 2, sort: 60 },
  { code: "HQCB-BO-PHAN-CONG-TAC-DANG", name: "Bộ phận Công tác Đảng", level: 2, sort: 70 },
];
// Đơn vị cấp trên không dùng trong hệ thống này (chủ dự án yêu cầu bỏ 22/10/2026)
const REMOVE_UNITS = ["HQCB-CHI-CUC-HQKV-XVI"];

/* ---------- Chuẩn hoá tên nhóm TX (lỗi chính tả trong file nguồn) ---------- */
const TX_DEPT_FIX = [
  { from: "Bộ phân Nghiệp vụ Hải quan", to: "Bộ phận Nghiệp vụ Hải quan" },
  { from: "Bộ phận công tác Đảng", to: "Bộ phận Công tác Đảng" },
];

/* ---------- Mapping nhóm TX → bộ phận (1:1 theo tên chuẩn) ---------- */
const MAPPING = [
  { department: "Bộ phận Nghiệp vụ Hải quan", unitCode: "HQCB-BO-PHAN-NGHIEP-VU-HAI-QUAN" },
  { department: "Bộ phận CNTT", unitCode: "HQCB-BO-PHAN-CNTT" },
  { department: "Bộ phận điều tra CBL", unitCode: "HQCB-BO-PHAN-DIEU-TRA-CBL" },
  { department: "Bộ phận Phúc tập & KT STQ", unitCode: "HQCB-BO-PHAN-PHUC-TAP-KT-STQ" },
  { department: "Bộ phận TH & Báo cáo", unitCode: "HQCB-BO-PHAN-TH-BAO-CAO" },
  { department: "Bộ phận Công tác Đảng", unitCode: "HQCB-BO-PHAN-CONG-TAC-DANG" },
];

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

(async () => {
  console.log(`\n=== CHUAN HOA CO CAU TO CHUC (${APPLY ? "THUC THI" : "DRY-RUN"}) ===`);
  const org = await prisma.organization.findFirst();
  if (!org) throw new Error("Khong tim thay organization nen tang");
  const units = await prisma.orgUnit.findMany();
  const byCode = new Map(units.map((u) => [u.code, u]));
  const byName = new Map(units.map((u) => [u.name, u]));

  console.log("\n  [1] CAY DON VI (muc tieu)");
  console.log(`      C1  ${HQ.name}  [${HQ.code}]`);
  for (const b of BO_PHAN) console.log(`      C2  ${b.name}  [${b.code}]`);
  for (const code of REMOVE_UNITS) {
    const u = byCode.get(code);
    if (u) console.log(`      (se XOA: ${u.name} [${code}])`);
  }

  // [2] Chuan hoa ten nhom TX
  console.log("\n  [2] CHUAN HOA TEN NHOM TX");
  for (const f of TX_DEPT_FIX) {
    const n = await prisma.workCatalogEntry.count({ where: { department: f.from } });
    const nTo = await prisma.workCatalogEntry.count({ where: { department: f.to } });
    console.log(`      "${f.from}" (${n} dong) -> "${f.to}" (${nTo} dong hien co)`);
  }

  // [3] Mapping
  console.log("\n  [3] MAPPING 6 NHOM TX -> 6 BO PHAN");
  const curMap = await prisma.workCatalogDepartmentMapping.findMany({ include: { unit: true } });
  if (curMap.length === 0) console.log("      (bang mapping dang rong -> se tao 6 dong isActive=true)");
  for (const m of curMap) console.log(`      hien tai: ${m.department} -> ${m.unit?.name || "(null)"} active=${m.isActive}`);
  for (const m of MAPPING) {
    const u = byCode.get(m.unitCode);
    console.log(`      se tao: ${m.department} -> ${u ? u.name : "KHONG TIM THAY " + m.unitCode} active=true`);
  }

  if (!APPLY) {
    console.log("\n>>> DRY-RUN: chua ghi gi. Them --confirm=STANDARDIZE-ORG-2026-10-22 de thuc thi.");
    await prisma.$disconnect();
    return;
  }

  /* ---------- Ghi ---------- */
  const upsertUnit = async (u, parentId) =>
    prisma.orgUnit.upsert({
      where: { code: u.code },
      create: { code: u.code, name: u.name, orgId: org.id, parentId, level: u.level, sortOrder: u.sort, status: "ACTIVE" },
      update: { name: u.name, parentId, level: u.level, sortOrder: u.sort, status: "ACTIVE" },
    });

  // 1) Gỡ đơn vị cấp trên không dùng: đưa con về gốc rồi xoá
  const hqId = (await prisma.orgUnit.findUnique({ where: { code: HQ.code } }))?.id || null;
  for (const code of REMOVE_UNITS) {
    const u = await prisma.orgUnit.findUnique({ where: { code } });
    if (!u) continue;
    const children = await prisma.orgUnit.findMany({ where: { parentId: u.id } });
    for (const c of children) {
      await prisma.orgUnit.update({ where: { id: c.id }, data: { parentId: hqId, level: 2 } });
      console.log(`  [OK] Chuyển "${c.name}" về dưới ${HQ.name}`);
    }
    const people = await prisma.personAssignment.count({ where: { unitId: u.id } });
    if (people > 0) {
      console.log(`  [!!] Đơn vị ${u.name} còn ${people} phân công — KHÔNG xoá, chuyển sang ${HQ.name}.`);
      for (const a of await prisma.personAssignment.findMany({ where: { unitId: u.id } })) {
        await prisma.personAssignment.update({ where: { id: a.id }, data: { unitId: hqId } });
      }
    }
    await prisma.orgUnit.delete({ where: { id: u.id } });
    console.log(`  [OK] Đã xoá đơn vị "${u.name}" [${code}]`);
  }

  const hq = await upsertUnit(HQ, null);
  for (const b of BO_PHAN) await upsertUnit(b, hq.id);
  console.log("  [OK] Cay don vi da chuan hoa (2 cap: HQ CKQT Ta Lung > 7 don vi cap 2)");

  for (const f of TX_DEPT_FIX) {
    const r = await prisma.workCatalogEntry.updateMany({
      where: { department: f.from },
      data: { department: f.to },
    });
    if (r.count) console.log(`  [OK] TX: ${r.count} dong "${f.from}" -> "${f.to}"`);
  }

  const now = new Date();
  for (const m of MAPPING) {
    const u = await prisma.orgUnit.findUnique({ where: { code: m.unitCode } });
    if (!u) {
      console.log(`  [!!] thieu don vi ${m.unitCode} - bo qua mapping ${m.department}`);
      continue;
    }
    await prisma.workCatalogDepartmentMapping.upsert({
      where: { department: m.department },
      create: {
        department: m.department,
        unitId: u.id,
        isActive: true,
        note: "Chuan hoa 22/10/2026: khop 1:1 ten nhom TX voi don vi to chuc",
        confirmedBy: "chu-danh-anh (22/10/2026)",
        confirmedAt: now,
      },
      update: { unitId: u.id, isActive: true, note: "Chuan hoa 22/10/2026", confirmedBy: "chu-danh-anh (22/10/2026)", confirmedAt: now },
    });
  }
  console.log("  [OK] Da bat mapping 6 nhom TX -> 6 bo phan");

  await prisma.auditEvent.create({
    data: {
      actorId: null,
      action: "ORG_STRUCTURE_STANDARDIZED",
      resourceType: "OrgUnit",
      resourceId: hq.id,
      newData: {
        root: HQ.name,
        unit: HQ.name,
        removedUnits: REMOVE_UNITS,
        departments: BO_PHAN.map((b) => b.name),
        mappings: MAPPING.map((m) => m.department),
        by: "standardize-org-structure.mjs",
        at: now.toISOString(),
      },
    },
  });

  console.log("\n=== KET QUA ===");
  const tree = await prisma.orgUnit.findMany({ orderBy: [{ level: "asc" }, { sortOrder: "asc" }] });
  for (const u of tree) {
    const parent = u.parentId ? tree.find((x) => x.id === u.parentId) : null;
    console.log(`  ${"  ".repeat((u.level || 1) - 1)}L${u.level} ${u.name}  [${u.code}]${parent ? "  (thuộc " + parent.name + ")" : ""}`);
  }
  const maps = await prisma.workCatalogDepartmentMapping.findMany({ include: { unit: true } });
  console.log(`\n  mapping dang active: ${maps.filter((m) => m.isActive).length}/${maps.length}`);
  for (const m of maps) console.log(`    ${m.department} -> ${m.unit?.name || "-"} (active=${m.isActive})`);
  const groups = await prisma.workCatalogEntry.groupBy({ by: ["department"], _count: { _all: true } });
  console.log(`\n  nhom TX trong DB: ${groups.length}`);
  for (const g of groups) console.log(`    ${g.department} = ${g._count._all}`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("LOI:", e?.stack || e?.message || e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
