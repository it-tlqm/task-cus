/**
 * YC-24 PHƯƠNG ÁN B — GÁN DANH MỤC 8 NHÓM NHIỆM VỤ MẪU CHO ĐÚNG MỘT BỘ PHẬN ĐƯỢC CHỈ ĐỊNH.
 *
 * Bối cảnh: mẫu gốc "so phan cong nhiem vu.xls" có tiêu đề "PHÂN CÔNG NHIỆM VỤ BỘ PHẬN NGHIỆP VỤ".
 * Script này CHỈ gán/khởi tạo 8 nhóm cho bộ phận do người vận hành CHỈ ĐỊNH ĐÍCH DANH bằng --unit-code.
 * KHÔNG tự áp dụng cho các bộ phận khác. KHÔNG ghi đè nội dung đã sửa (chỉ gán unit_id khi còn trống;
 * tạo mới khi thiếu; bỏ qua khi mã đã thuộc bộ phận khác).
 *
 * Cách dùng (mặc định chỉ XEM TRƯỚC, thêm --apply mới ghi):
 *   Local:  $env:DATABASE_URL="postgresql://postgres:postgres@localhost:54329/talung_dev"; $env:DIRECT_URL=$env:DATABASE_URL;
 *           npx tsx scripts/seed-yc24-catalog.ts --unit-code=BP_NGHIEPVU_A
 *           npx tsx scripts/seed-yc24-catalog.ts --unit-code=BP_NGHIEPVU_A --apply
 *   Production: npx tsx scripts/seed-yc24-catalog.ts --unit-code=BP_NGHIEPVU_A --apply
 *   (Đọc DIRECT_URL từ .env nếu chưa có biến môi trường; chỉ chạy sau khi DDL đã áp và điều kiện deploy đạt.)
 */
import { PrismaClient } from "@prisma/client";
import { DUTY_POSITION_SEEDS } from "../src/server/duty-catalog";
import fs from "fs";
import crypto from "crypto";

function loadDirectUrl(): string {
  const env = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (env) return env;
  const raw = fs.readFileSync(".env", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*DIRECT_URL\s*=\s*"?([^"]+)"?\s*$/);
    if (m) return m[1];
  }
  throw new Error("Không tìm thấy DIRECT_URL (biến môi trường hoặc .env)");
}

function masked(url: string): string {
  const u = new URL(url);
  return `${u.hostname} | db=${u.pathname.replace(/^\//, "")}`;
}

const args = process.argv.slice(2);
function argVal(name: string): string | null {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
const unitCode = argVal("unit-code");
const apply = args.includes("--apply");

async function main() {
  if (!unitCode) {
    console.error("Thiếu --unit-code=<mã bộ phận> (VD: --unit-code=BP_NGHIEPVU_A). Script DỪNG để tránh gán nhầm.");
    process.exit(1);
  }
  const url = loadDirectUrl();
  console.log(`DB dich: ${masked(url)}`);
  console.log(`Che do: ${apply ? "GHI (--apply)" : "XEM TRUOC (không ghi)"} — bộ phận: ${unitCode}`);
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const unit = await prisma.orgUnit.findUnique({ where: { code: unitCode }, select: { id: true, code: true, name: true, status: true } });
    if (!unit) {
      console.error(`Không tìm thấy bộ phận mã ${unitCode}. DỪNG — kiểm tra lại, không tự đoán.`);
      process.exit(1);
    }
    if (unit.status !== "ACTIVE") {
      console.error(`Bộ phận ${unit.code} không ACTIVE (${unit.status}). DỪNG.`);
      process.exit(1);
    }
    console.log(`Bộ phận đích: ${unit.code} — ${unit.name} (id=${unit.id})`);

    // Chế độ xem trước: chỉ đọc
    const rows = await prisma.dutyPosition.findMany({ select: { id: true, code: true, unitId: true, title: true } });
    const plan: Array<{ code: string; action: string; detail: string }> = [];
    for (const seed of DUTY_POSITION_SEEDS) {
      const existing = rows.find((r) => r.code === seed.code);
      if (!existing) plan.push({ code: seed.code, action: "CREATE", detail: `${seed.title} (gán ${unit.code})` });
      else if (existing.unitId === unit.id) plan.push({ code: seed.code, action: "KEEP", detail: "đã thuộc bộ phận này" });
      else if (existing.unitId === null) plan.push({ code: seed.code, action: "ADOPT", detail: "gán bộ phận cho vị trí chưa thuộc bộ phận nào" });
      else plan.push({ code: seed.code, action: "SKIP", detail: `mã đã thuộc bộ phận khác (${existing.unitId}) — không đụng tới` });
    }
    for (const p of plan) console.log(`  ${p.action.padEnd(7)} ${p.code}: ${p.detail}`);

    if (!apply) {
      console.log("\n(Xem trước — chưa ghi gì. Thêm --apply để thực hiện.)");
      return;
    }

    let created = 0, adopted = 0, kept = 0, skipped = 0;
    for (const seed of DUTY_POSITION_SEEDS) {
      const existing = await prisma.dutyPosition.findUnique({ where: { code: seed.code } });
      if (!existing) {
        await prisma.dutyPosition.create({
          data: {
            id: crypto.randomUUID(),
            code: seed.code,
            unitId: unit.id,
            title: seed.title,
            detail: seed.detail,
            slots: seed.slots as any,
            sortOrder: seed.sortOrder,
            status: "ACTIVE",
          },
        });
        created++;
      } else if (existing.unitId === unit.id) {
        kept++;
      } else if (existing.unitId === null) {
        await prisma.dutyPosition.update({ where: { id: existing.id }, data: { unitId: unit.id } });
        adopted++;
      } else {
        skipped++;
      }
    }
    console.log(`\nKẾT QUẢ: tạo mới ${created}, gán bộ phận ${adopted}, giữ nguyên ${kept}, bỏ qua ${skipped} (mã thuộc bộ phận khác).`);
    // Xác minh sau khi ghi
    const count = await prisma.dutyPosition.count({ where: { unitId: unit.id } });
    console.log(`Danh mục hiện có của ${unit.code}: ${count} vị trí.`);
  } finally {
    await (prisma as any).$disconnect?.();
  }
}

main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
