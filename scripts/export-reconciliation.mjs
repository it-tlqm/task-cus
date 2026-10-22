/**
 * export-reconciliation.mjs — PREPARE (khong ghi vao Production):
 *   #2) bang doi chieu 348 dong TX -> 320 ma (danh sach 28 dong bi loai + ly do)
 *   #3) snapshot doc lap 3.386 san pham QD1277 + 80 nhom (CSV + manifest + checksum)
 *   #4) archive tep dinh kem tu he thong cu (download + checksum + kha nang khoi phuc)
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "node:module";
const creq = createRequire("D:/thanhnx/OpenCode/talung-cus-work/package.json");
const ExcelJS = creq("exceljs");
const { PrismaClient } = creq("@prisma/client");
const jwt = creq("jsonwebtoken");

const REPO = "D:/thanhnx/OpenCode/talung-cus-work/";
const XLSX = path.join(REPO, "docs", "Dữ liệu-file-hai-quan-gui", "Danh sách.xlsx");
const OUT = path.join(REPO, "demo-ops", "reset", "reconciliation");
const arg = (k, d = null) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SRC_DB = arg("src-db");
const PROD = arg("prod-db");
const BASE = arg("base", "https://task-cus.vercel.app");
const norm = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cellv = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.text) return String(v.text).trim();
    if (v.richText) return v.richText.map((t) => t.text).join("").trim();
    if (v.result !== undefined) return String(v.result).trim();
    return "";
  }
  return String(v).trim();
};
const csv = (rows, cols) =>
  [cols.join(",")].concat(rows.map((r) => cols.map((c) => {
    const v = r[c] === null || r[c] === undefined ? "" : String(r[c]).replace(/"/g, '""');
    return /[",\n]/.test(v) ? `"${v}"` : v;
  }).join(","))).join("\n");

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const src = new PrismaClient({ datasources: { db: { url: SRC_DB } } });
  const prod = PROD ? new PrismaClient({ datasources: { db: { url: PROD } } }) : null;

  /* ================= #2 TX 348 -> 320 ================= */
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const wsW = wb.getWorksheet("Danh mục công việc ");
  const rows = [];
  let curDept = cellv(wsW.getRow(1).getCell(1).value) || null;
  for (let r = 2; r <= wsW.rowCount; r++) {
    const d = cellv(wsW.getRow(r).getCell(1).value);
    if (d) curDept = d;
    const title = cellv(wsW.getRow(r).getCell(2).value);
    if (!title) continue;
    const f = wsW.getRow(r).getCell(3).value;
    const factor = typeof f === "number" ? f : (f === null || f === undefined || String(f).trim() === "" ? null : Number(f));
    rows.push({ row: r, dept: curDept || "", title, factor: Number.isFinite(factor) ? factor : null });
  }
  const oldTx = await src.workCatalogEntry.findMany();
  const oldByKey = new Map(oldTx.map((t) => [norm(t.department) + "||" + norm(t.title), t]));
  const seen = new Map();
  const kept = [], dropped = [];
  for (const r of rows) {
    const key = norm(r.dept) + "||" + norm(r.title);
    const old = oldByKey.get(key);
    if (seen.has(key)) {
      const first = seen.get(key);
      dropped.push({
        excelRow: r.row, department: r.dept, title: r.title, factorExcel: r.factor,
        reason: "TRUNG voi dong Excel " + first.excelRow + " (cung bo phan + cung noi dung)",
        firstRow: first.excelRow, sourceCode: first.sourceCode || old?.code || "",
      });
      continue;
    }
    seen.set(key, { excelRow: r.row, sourceCode: old?.code || "" });
    kept.push({
      excelRow: r.row, department: r.dept, title: r.title, factorExcel: r.factor,
      sourceCode: old?.code || "", sourceFactorOld: old?.convertFactor ?? null,
      groupCode: old?.groupCode || "", status: old?.status || "",
    });
  }
  fs.writeFileSync(path.join(OUT, "tx-348-dong-320-ma.csv"), csv(kept, ["excelRow", "department", "title", "factorExcel", "sourceCode", "sourceFactorOld", "groupCode", "status"]), "utf8");
  fs.writeFileSync(path.join(OUT, "tx-28-dong-bi-loai.csv"), csv(dropped, ["excelRow", "department", "title", "factorExcel", "reason", "firstRow", "sourceCode"]), "utf8");
  const factorDiff = kept.filter((k) => k.sourceFactorOld !== null && k.factorExcel !== null && Number(k.sourceFactorOld) !== Number(k.factorExcel));
  fs.writeFileSync(path.join(OUT, "tx-4-ma-he-so-leh.csv"), csv(factorDiff, ["excelRow", "department", "title", "sourceCode", "sourceFactorOld", "factorExcel"]), "utf8");
  console.log(`#2 TX: ${rows.length} dong Excel -> ${kept.length} ma giu, ${dropped.length} dong bi loai (trung), ${factorDiff.length} ma lech he so`);
  console.log(`   -> reconciliation/tx-348-dong-320-ma.csv | tx-28-dong-bi-loai.csv | tx-4-ma-he-so-leh.csv`);

  /* ================= #3 snapshot QD1277 ================= */
  const version = await src.productCatalogVersion.findFirst({ where: { status: "ACTIVE" } });
  const groups = await src.productGroup.findMany();
  const items = await src.productItem.findMany();
  fs.writeFileSync(path.join(OUT, "qd1277-3386-san-pham.csv"),
    csv(items.map((p) => ({
      code: p.code, taskName: p.taskName, outputProduct: p.outputProduct,
      convertFactor: p.convertFactor, groupCode: p.group?.code ?? "", groupName: p.group?.name ?? "",
      unit: p.unit ?? "", status: p.status, versionCode: version?.code ?? "",
      sourceStt: p.sourceStt ?? "", note: p.note ?? "",
    })), ["code", "taskName", "outputProduct", "convertFactor", "groupCode", "groupName", "unit", "status", "versionCode", "sourceStt", "note"]), "utf8");
  fs.writeFileSync(path.join(OUT, "qd1277-80-nhom.csv"),
    csv(groups.map((g) => ({ code: g.code, name: g.name, unit: g.unit ?? "", status: g.status, versionCode: version?.code ?? "" })),
      ["code", "name", "unit", "status", "versionCode"]), "utf8");
  const spManifest = {
    generatedAt: new Date().toISOString(),
    source: "DB nguon da kiem chung (khong co file Excel QD1277 trong workspace)",
    officialSourceFile: null,
    note: "Hinh thuc chinh thuc CHUA CO. He so duoc giu NGUYEN TU DANH MUC, khong suy luan. Can ban giao file goc de doi chieu lan cuoi.",
    version: { code: version?.code, status: version?.status },
    counts: { products: items.length, groups: groups.length, withFactor: items.filter((p) => p.convertFactor !== null && p.convertFactor !== undefined).length, nullFactor: items.filter((p) => p.convertFactor === null || p.convertFactor === undefined).length },
    sha256: {
      products: crypto.createHash("sha256").update(fs.readFileSync(path.join(OUT, "qd1277-3386-san-pham.csv"))).digest("hex"),
      groups: crypto.createHash("sha256").update(fs.readFileSync(path.join(OUT, "qd1277-80-nhom.csv"))).digest("hex"),
    },
  };
  fs.writeFileSync(path.join(OUT, "qd1277-snapshot-manifest.json"), JSON.stringify(spManifest, null, 2));
  console.log(`#3 QD1277: ${items.length} SP (${spManifest.counts.withFactor} co he so, ${spManifest.counts.nullFactor} NULL) + ${groups.length} nhom -> CSV + manifest (sha256)`);

  /* ================= #4 archive tep dinh kem ================= */
  if (prod) {
    const fileDir = path.join(OUT, "prod-files");
    fs.mkdirSync(fileDir, { recursive: true });
    const acc = await prod.account.findFirst({ where: { username: "demold01" } });
    const grant = await prod.roleGrant.findFirst({ where: { accountId: acc.id }, include: { role: true } });
    const person = await prod.person.findUnique({ where: { id: acc.personId }, include: { assignments: { where: { isPrimary: true }, include: { unit: true, position: true } } } });
    const a = person.assignments[0];
    const token = jwt.sign({
      id: acc.id, personId: acc.personId, username: acc.username, fullName: person.fullName,
      personCode: person.code, positionTitle: a?.position?.title || "Lanh dao", unitId: a?.unitId, unitName: a?.unit?.name,
      role: grant?.role.code || "UNIT_LEADER", scopeType: grant?.scopeType || "ORGANIZATION", scopeUnitId: grant?.scopeUnitId || null,
      permissions: ["plans.view", "reports.view"],
    }, process.env.JWT_SECRET, { expiresIn: "2h" });

    const itemsFiles = [];
    for (const t of ["workEvidence", "taskAttachment"]) {
      const rowsF = await prod[t].findMany();
      for (const f of rowsF) {
        const urls = t === "workEvidence"
          ? [`${BASE}/api/work-evidence/${f.id}/file`]
          : [`${BASE}/api/tasks/${f.taskId}/attachments`];
        for (const u of urls) {
          try {
            // Tai truc tiep tu Supabase Storage bang storageKey (kho that)
            const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
            const bucket = process.env.SUPABASE_EVIDENCE_BUCKET || process.env.SUPABASE_STORAGE_BUCKET || "task-attachments";
            const res = f.storageKey && sbUrl && sbKey
              ? await fetch(`${sbUrl}/storage/v1/object/${bucket}/${f.storageKey}`, { headers: { apikey: sbKey, Authorization: "Bearer " + sbKey } })
              : await fetch(u, { headers: { Authorization: "Bearer " + token } });
            if (!res.ok) { itemsFiles.push({ type: t, id: f.id, url: u, status: res.status, ok: false }); continue; }
            const buf = Buffer.from(await res.arrayBuffer());
            const name = `${t}-${f.id}-${(f.fileName || "file").replace(/[^\w.\-]/g, "_")}`;
            fs.writeFileSync(path.join(fileDir, name), buf);
            itemsFiles.push({
              type: t, id: f.id, fileName: f.fileName, storageKey: f.storageKey, bytes: buf.length,
              sha256: crypto.createHash("sha256").update(buf).digest("hex"),
              dbChecksum: f.checksum ?? null, url: u, status: res.status, ok: true,
              checksumMatch: f.checksum ? crypto.createHash("sha256").update(buf).digest("hex") === f.checksum : "n/a",
            });
          } catch (e) {
            itemsFiles.push({ type: t, id: f.id, url: u, ok: false, error: String(e.message).slice(0, 90) });
          }
        }
      }
    }
    fs.writeFileSync(path.join(OUT, "prod-files-manifest.json"), JSON.stringify({
      generatedAt: new Date().toISOString(), source: "Production (API doc qua token doc) ", files: itemsFiles,
    }, null, 2));
    console.log(`#4 Tep dinh kem: ${itemsFiles.filter((f) => f.ok).length}/${itemsFiles.length} tai ve -> demo-ops/reset/reconciliation/prod-files/`);
    itemsFiles.forEach((f) => console.log(`   ${f.ok ? "OK " : "!! "} ${f.type} ${f.id} ${f.fileName || ""} ${f.bytes || 0}B checksum=${f.checksumMatch ?? "-"}`));
  }

  await src.$disconnect();
  if (prod) await prod.$disconnect();
})().catch((e) => { console.error("LOI:", String(e.stack || e.message).slice(0, 400)); process.exit(1); });
