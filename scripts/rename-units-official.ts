/**
 * Đổi tên hiển thị đơn vị/chức danh theo phản hồi Hải quan Tà Lùng (10/2026).
 * Chỉ đổi NAME/TITLE theo CODE ổn định — không đổi id/code/parentId/quan hệ.
 * Mặc định DRY-RUN (chỉ in dự kiến). Ghi thật: npx tsx scripts/rename-units-official.ts --apply
 * Khôi phục: chạy lại với tên cũ trong RENAME_MAP (đã in trong log dry-run).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const ORG_UNIT_RENAMES: Array<[string, string]> = [
  ["HQCK_TALUNG", "Hải quan cửa khẩu Quốc tế Tà Lùng"],
  ["BAN_LANH_DAO", "Lãnh đạo đơn vị"],
  ["BP_GIAMSAT_B", "Bộ phận Kiểm tra giám sát B (Barie & kho, bãi)"],
  ["BP_TONGHOP_D", "Bộ phận Tổng hợp & Báo cáo D"],
];
const ORG_RENAME: [string, string] = [
  "HQ_TA_LUNG",
  "Chi cục Hải quan khu vực XVI - Hải quan cửa khẩu Quốc tế Tà Lùng",
];
const POSITION_RENAMES: Array<[string, string]> = [
  ["CHI_CUC_TRUONG", "Trưởng hải quan cửa khẩu"],
  ["CHIEF", "Trưởng hải quan cửa khẩu"],
  ["DEPUTY_CHIEF", "Phó Trưởng hải quan cửa khẩu"],
];
const ROLE_RENAMES: Array<[string, string]> = [
  ["UNIT_LEADER", "Trưởng hải quan cửa khẩu"],
  ["STAFF", "Công chức"],
];
const CONFIG_VALUE = "Chi cục Hải quan khu vực XVI - Hải quan cửa khẩu Quốc tế Tà Lùng";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "== APPLY MODE: ghi thay đổi ==" : "== DRY-RUN: không ghi gì ==");

  const org = await prisma.organization.findUnique({ where: { code: ORG_RENAME[0] } });
  if (org) {
    console.log(`[Organization] "${org.name}" -> "${ORG_RENAME[1]}"`);
    if (apply && org.name !== ORG_RENAME[1]) {
      await prisma.organization.update({ where: { id: org.id }, data: { name: ORG_RENAME[1] } });
    }
  } else {
    console.log(`[Organization] không tìm thấy code ${ORG_RENAME[0]} — bỏ qua`);
  }

  for (const [code, next] of ORG_UNIT_RENAMES) {
    const u = await prisma.orgUnit.findUnique({ where: { code } });
    if (!u) {
      console.log(`[OrgUnit:${code}] không tồn tại — bỏ qua`);
      continue;
    }
    console.log(`[OrgUnit:${code}] "${u.name}" -> "${next}"`);
    if (apply && u.name !== next) {
      await prisma.orgUnit.update({ where: { id: u.id }, data: { name: next } });
    }
  }

  for (const [code, next] of POSITION_RENAMES) {
    const p = await prisma.position.findUnique({ where: { code } });
    if (!p) {
      console.log(`[Position:${code}] không tồn tại — bỏ qua`);
      continue;
    }
    console.log(`[Position:${code}] "${p.title}" -> "${next}"`);
    if (apply && p.title !== next) {
      await prisma.position.update({ where: { id: p.id }, data: { title: next } });
    }
  }

  for (const [code, next] of ROLE_RENAMES) {
    const r = await prisma.role.findUnique({ where: { code } });
    if (!r) {
      console.log(`[Role:${code}] không tồn tại — bỏ qua`);
      continue;
    }
    console.log(`[Role:${code}] "${r.name}" -> "${next}"`);
    if (apply && r.name !== next) {
      await prisma.role.update({ where: { id: r.id }, data: { name: next } });
    }
  }

  const cfg = await prisma.systemConfig.findUnique({ where: { key: "unitDisplayName" } });
  if (cfg) {
    console.log(`[SystemConfig:unitDisplayName] "${cfg.value}" -> "${CONFIG_VALUE}"`);
    if (apply && cfg.value !== CONFIG_VALUE) {
      await prisma.systemConfig.update({ where: { key: "unitDisplayName" }, data: { value: CONFIG_VALUE } });
    }
  }

  console.log(apply ? "== HOÀN TẤT APPLY ==" : "== KẾT THÚC DRY-RUN (thêm --apply để ghi) ==");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
