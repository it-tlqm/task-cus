/**
 * CHUYỂN DANH MỤC VỊ TRÍ/NHIỆM VỤ YC-24 VỀ ĐÚNG BỘ PHẬN (22/10/2026)
 *
 * Bối cảnh: 8 vị trí mẫu YC24-01..08 (theo mẫu "Sổ phân công nhiệm vụ công tác giám sát
 * quản lý" của BỘ PHẬN NGHIỆP VỤ) đang bị gắn nhầm vào "Bộ phận Công tác Đảng" do lần
 * seed trước chọn sai --unit-code. Hệ quả: mọi bộ phận khác mở /roster đều trống.
 *
 * An toàn:
 *   - Mặc định DRY-RUN; chỉ ghi khi có --confirm=REASSIGN-DUTY-CATALOG-2026-10-22.
 *   - Chỉ chạy khi bộ phận NGUỒN chưa có dữ liệu lịch trực (duty_rosters = 0,
 *     duty_day_infos = 0) — không làm sai lệch lịch sử phân công.
 *   - Chỉ chuyển đúng 8 mã YC24-01..08; không đụng vị trí khác.
 *   - Idempotent: nếu đã ở bộ phận đích thì báo "đã đúng" và không ghi.
 *
 * Dùng:
 *   node scripts/fix-duty-catalog-unit.mjs --db=<url>
 *   node scripts/fix-duty-catalog-unit.mjs --db=<url> --confirm=REASSIGN-DUTY-CATALOG-2026-10-22
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
const APPLY = CONFIRM === "REASSIGN-DUTY-CATALOG-2026-10-22";
const FROM_CODE = String(args.from || "HQCB-BO-PHAN-CONG-TAC-DANG");
const TO_CODE = String(args.to || "HQCB-BO-PHAN-NGHIEP-VU-HAI-QUAN");
const CODES = Array.from({ length: 8 }, (_, i) => `YC24-0${i + 1}`);

if (!DB_URL) {
  console.error("Thieu --db=<DATABASE_URL>");
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

(async () => {
  console.log(`\n=== CHUYEN DANH MUC VI TRI YC-24 (${APPLY ? "THUC THI" : "DRY-RUN"}) ===`);
  console.log(`Nguon: ${FROM_CODE}  ->  Dich: ${TO_CODE}`);

  const from = await prisma.orgUnit.findUnique({ where: { code: FROM_CODE }, select: { id: true, name: true } });
  const to = await prisma.orgUnit.findUnique({ where: { code: TO_CODE }, select: { id: true, name: true } });
  if (!from) throw new Error(`Khong tim thay bo phan nguon ${FROM_CODE}`);
  if (!to) throw new Error(`Khong tim thay bo phan dich ${TO_CODE}`);

  const positions = await prisma.dutyPosition.findMany({
    where: { code: { in: CODES } },
    select: { id: true, code: true, title: true, unitId: true, status: true },
    orderBy: { sortOrder: "asc" },
  });
  console.log(`\nTim thay ${positions.length}/${CODES.length} vi tri YC24:`);
  for (const p of positions) {
    const owner = p.unitId === from.id ? from.name : p.unitId === to.id ? to.name : p.unitId || "(khong co)";
    console.log(`  ${p.code} | ${p.title} | ${owner} | ${p.status}`);
  }

  const toMove = positions.filter((p) => p.unitId === from.id);
  const already = positions.filter((p) => p.unitId === to.id);
  const unknown = positions.filter((p) => p.unitId !== from.id && p.unitId !== to.id);

  if (positions.length !== CODES.length) {
    throw new Error(`Thieu vi tri chuan (${positions.length}/${CODES.length}) — dung de tranh chuyen mot phan danh muc.`);
  }
  if (unknown.length > 0) {
    throw new Error(`Co ${unknown.length} vi tri dang thuoc bo phan khac — can ra soat thu cong.`);
  }

  const [rosterCount, dayInfoCount] = await Promise.all([
    prisma.dutyRoster.count({ where: { unitId: from.id } }),
    prisma.dutyDayInfo.count({ where: { unitId: from.id } }),
  ]);
  console.log(`\nDu lieu lich truc cua bo phan nguon: duty_rosters=${rosterCount}, duty_day_infos=${dayInfoCount}`);
  if (rosterCount > 0 || dayInfoCount > 0) {
    throw new Error("Bo phan nguon da co du lieu lich truc — KHONG tu dong chuyen. Can ra soat thu cong.");
  }

  if (already.length === CODES.length) {
    console.log("\n[OK] 8 vi tri da nam dung bo phan dich — khong can chuyen.");
    return;
  }

  console.log(`\nSe chuyen ${toMove.length} vi tri sang "${to.name}".`);
  if (!APPLY) {
    console.log(">>> DRY-RUN: chua ghi gi. Them --confirm=REASSIGN-DUTY-CATALOG-2026-10-22 de thuc thi.");
    return;
  }

  const result = await prisma.dutyPosition.updateMany({
    where: { id: { in: toMove.map((p) => p.id) } },
    data: { unitId: to.id },
  });

  await prisma.auditEvent.create({
    data: {
      actorId: null,
      action: "DUTY_CATALOG_REASSIGNED",
      resourceType: "DutyPosition",
      resourceId: to.id,
      oldData: { unitId: from.id, unitName: from.name, codes: toMove.map((p) => p.code) },
      newData: {
        unitId: to.id,
        unitName: to.name,
        codes: toMove.map((p) => p.code),
        moved: result.count,
        by: "fix-duty-catalog-unit.mjs",
        at: new Date().toISOString(),
      },
    },
  });

  console.log(`\n[OK] Da chuyen ${result.count} vi tri sang "${to.name}" va ghi audit DUTY_CATALOG_REASSIGNED.`);
})()
  .catch((err) => {
    console.error("\n[LOI]", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
