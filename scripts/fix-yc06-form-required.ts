/**
 * YC-06 — Bỏ bắt buộc 2 chỉ tiêu hồ sơ (total_files, handled_files) trong
 * "Biểu mẫu kết quả Thủ tục Hải quan (v2)".
 * Chỉ sửa cấu hình trường (schemaJson.required), KHÔNG chạm dữ liệu báo cáo lịch sử.
 * Mặc định dry-run; thêm --apply để ghi thật.
 */
import { prisma } from "../src/server/db";

const TARGET_KEYS = ["total_files", "handled_files"];

async function main() {
  const apply = process.argv.includes("--apply");
  const versions = await prisma.formTemplateVersion.findMany({
    where: { status: { in: ["ACTIVE", "PUBLISHED"] } },
    include: { formTemplate: { select: { code: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  let touched = 0;
  for (const v of versions) {
    const schema: any = v.schemaJson;
    const fields = Array.isArray(schema?.fields) ? schema.fields : [];
    const hits = fields.filter((f: any) => TARGET_KEYS.includes(f.key) && f.required === true);
    if (hits.length === 0) continue;
    console.log(`FOUND ${v.formTemplate.code} v${v.version} [${v.status}]: ${hits.map((h: any) => h.key).join(",")}`);
    if (apply) {
      const next = {
        ...schema,
        fields: fields.map((f: any) =>
          TARGET_KEYS.includes(f.key) ? { ...f, required: false } : f
        ),
      };
      await prisma.formTemplateVersion.update({ where: { id: v.id }, data: { schemaJson: next } });
      await prisma.auditEvent.create({
        data: {
          action: "FORM_REQUIRED_RELAXED_YC06",
          resourceType: "FormTemplateVersion",
          resourceId: v.id,
          newData: { template: v.formTemplate.code, version: v.version, relaxed: TARGET_KEYS },
        },
      });
      touched++;
    }
  }
  console.log(apply ? `APPLIED: ${touched} version(s)` : "DRY-RUN (them --apply de ghi that)");
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); }).finally(() => process.exit(0));
