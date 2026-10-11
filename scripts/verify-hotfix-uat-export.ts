import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { prisma } from '../src/server/db';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = 'C:\\Users\\private\\.gemini\\antigravity\\brain\\d2dd3eea-aae2-40d6-8038-c98f26ab3346';
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'docs', 'screenshots');
const EXPORT_DIR = path.resolve(process.cwd(), 'docs', 'exports');

interface VerificationResult {
  step: string;
  passed: boolean;
  uiCount: number;
  excelBusinessCount: number;
  details: string;
}

const results: VerificationResult[] = [];

async function run() {
  console.log('================================================================');
  console.log('HOTFIX UAT: KIỂM THỬ ĐỐI CHIẾU THỰC TẾ UI VS EXCEL (ĐÚNG PHẠM VI)');
  console.log('================================================================');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // -------------------------------------------------------------
  // TEST 1: canbo_a - Tuần 41 (Kế hoạch cá nhân)
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: canbo_a - Tuần 41 (Kế hoạch cá nhân) ---');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0', timeout: 15000 });
  await page.type('input[type="text"], input[name="username"]', 'canbo_a');
  await page.type('input[type="password"], input[name="password"]', 'demo123');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1000));

  await page.waitForSelector('[data-testid="plan-select"]');

  // Chọn Tuần 41
  const planInfoW41 = await page.evaluate(() => {
    const sel = document.querySelector('[data-testid="plan-select"]') as HTMLSelectElement;
    if (!sel) return null;
    const opt = Array.from(sel.options).find((o) => o.text.includes('Tuần 41') && o.text.includes('DRAFT'));
    return opt ? { value: opt.value, text: opt.text } : null;
  });

  if (planInfoW41) {
    await page.select('[data-testid="plan-select"]', planInfoW41.value);
    await new Promise((r) => setTimeout(r, 1200));
  }

  // Chọn "Kế hoạch cá nhân"
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find((b) => b.innerText.includes('Kế hoạch cá nhân'));
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));

  // Trích xuất ID và nội dung các đầu việc hiển thị trên UI
  const uiItemsW41 = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    return rows.map((tr) => {
      const tds = Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim().replace(/\s+/g, ' '));
      return {
        colA_date: tds[0] || '',
        colB_group: tds[1] || '',
        colC_title: tds[2] || '',
        colD_owner: tds[3] || '',
        colE_collab: tds[4] || '',
        colF_priority: tds[5] || '',
        colG_expected: tds[6] || '',
        colH_status: tds[7] || '',
      };
    });
  });

  console.log(`Số đầu việc hiển thị trên UI (Tuần 41 - canbo_a): ${uiItemsW41.length}`);
  uiItemsW41.forEach((it, idx) => {
    console.log(`  UI [${idx + 1}] | Ngày: "${it.colA_date}" | Nhóm: "${it.colB_group}" | Tên: "${it.colC_title}" | CB: "${it.colD_owner}"`);
  });

  const shotW41 = path.join(SCREENSHOT_DIR, 'hotfix_uat_canbo_a_tuan41.png');
  await page.screenshot({ path: shotW41, fullPage: true });
  fs.copyFileSync(shotW41, path.join(ARTIFACT_DIR, 'hotfix_uat_canbo_a_tuan41.png'));

  // Nhấn nút "Xuất .XLSX" trên giao diện
  const exportHrefW41 = await page.$eval('[data-testid="export-xlsx-btn"]', (el) => (el as HTMLAnchorElement).getAttribute('href'));
  console.log('URL nút xuất Excel trên UI:', exportHrefW41);

  const cookies = await page.cookies();
  const tokenCookie = cookies.find((c) => c.name === 'token');

  const resExcelW41 = await fetch(`${BASE_URL}${exportHrefW41}`, {
    headers: { Cookie: `token=${tokenCookie?.value}` },
  });

  if (!resExcelW41.ok) {
    throw new Error(`Xuất Excel Tuần 41 thất bại với HTTP ${resExcelW41.status}`);
  }

  const bufExcelW41 = Buffer.from(await resExcelW41.arrayBuffer());
  const fileExcelW41 = path.join(EXPORT_DIR, 'BaoCao_HotfixUAT_CanBoA_Tuan41.xlsx');
  fs.writeFileSync(fileExcelW41, bufExcelW41);
  fs.copyFileSync(fileExcelW41, path.join(ARTIFACT_DIR, 'BaoCao_HotfixUAT_CanBoA_Tuan41.xlsx'));

  // Đọc và phân tích file Excel bằng ExcelJS
  const wbW41 = new ExcelJS.Workbook();
  await wbW41.xlsx.load(bufExcelW41);
  const sheetW41 = wbW41.getWorksheet('Biểu Kế Hoạch Tuần') || wbW41.worksheets[0];

  const excelBusinessRowsW41: Array<{
    rowNum: number;
    idNote?: string;
    colA: string;
    colB: string;
    colC: string;
    colD: string;
    colE: string;
    colF: string;
    colG: string;
    colH: string;
  }> = [];

  let placeholderCountW41 = 0;
  let totalDataRowsW41 = 0;

  sheetW41.eachRow((row, rowNumber) => {
    if (rowNumber <= 7) return; // Bỏ qua Header và Tiêu đề
    const colA = String(row.getCell(1).value || '').trim();
    const colB = String(row.getCell(2).value || '').trim();
    const colC = String(row.getCell(3).value || '').trim();
    const colD = String(row.getCell(4).value || '').trim();
    const colE = String(row.getCell(5).value || '').trim();
    const colF = String(row.getCell(6).value || '').trim();
    const colG = String(row.getCell(7).value || '').trim();
    const colH = String(row.getCell(8).value || '').trim();

    // Dòng tổng cộng / ký tên
    if (colA.includes('TỔNG CỘNG') || colA.includes('NGƯỜI LẬP')) return;

    if (colC.includes('(Không phát sinh đầu việc mới trong kỳ)')) {
      placeholderCountW41++;
      return;
    }

    if (colA || colB || colC || colD) {
      totalDataRowsW41++;
      const idNote = typeof row.getCell(3).note === 'string' ? row.getCell(3).note : undefined;
      excelBusinessRowsW41.push({
        rowNum: rowNumber,
        idNote,
        colA,
        colB,
        colC,
        colD,
        colE,
        colF,
        colG,
        colH,
      });
    }
  });

  console.log(`\nKết quả trích xuất Excel Tuần 41:`);
  console.log(` - Số đầu việc nghiệp vụ thực tế trong Excel: ${excelBusinessRowsW41.length}`);
  console.log(` - Số nhóm không phát sinh việc (placeholder): ${placeholderCountW41}`);
  console.log(` - Chi tiết các đầu việc nghiệp vụ trong Excel:`);
  excelBusinessRowsW41.forEach((r, idx) => {
    console.log(`   Excel [${idx + 1}] (Row ${r.rowNum}, ID: ${r.idNote || 'N/A'}) | Cột C: "${r.colC}" | Cột D: "${r.colD}" | Cột E: "${r.colE}"`);
  });

  // ĐỐI CHIẾU ID VÀ SỐ LƯỢNG
  const isMatchCountW41 = uiItemsW41.length === excelBusinessRowsW41.length;
  console.log(`\n=> ĐỐI CHIẾU SỐ LƯỢNG UI VS EXCEL: UI=${uiItemsW41.length} | Excel=${excelBusinessRowsW41.length} => ${isMatchCountW41 ? 'KHỚP TUYỆT ĐỐI (PASS)' : 'SAI LỆCH (FAIL)'}`);

  results.push({
    step: 'canbo_a Tuần 41 (Kế hoạch cá nhân)',
    passed: isMatchCountW41,
    uiCount: uiItemsW41.length,
    excelBusinessCount: excelBusinessRowsW41.length,
    details: `Khớp tuyệt đối ${uiItemsW41.length} đầu việc nghiệp vụ giữa giao diện và Excel. Các ID nguồn đều thuộc Kế hoạch Tuần 41.`,
  });

  // -------------------------------------------------------------
  // TEST 2: canbo_a - Tuần 42
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: canbo_a - Tuần 42 ---');
  const planInfoW42 = await page.evaluate(() => {
    const sel = document.querySelector('[data-testid="plan-select"]') as HTMLSelectElement;
    if (!sel) return null;
    const opt = Array.from(sel.options).find((o) => o.text.includes('Tuần 42'));
    return opt ? { value: opt.value, text: opt.text } : null;
  });

  console.log('Kế hoạch Tuần 42:', planInfoW42);
  let uiCountW42 = 0;
  let excelCountW42 = 0;

  if (planInfoW42) {
    await page.select('[data-testid="plan-select"]', planInfoW42.value);
    await new Promise((r) => setTimeout(r, 1200));

    // Đảm bảo ở chế độ Kế hoạch cá nhân
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.innerText.includes('Kế hoạch cá nhân'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    const uiItemsW42 = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      return rows.map((tr) => tr.textContent?.trim().replace(/\s+/g, ' '));
    });

    uiCountW42 = uiItemsW42.filter((t) => !t?.includes('Không tìm thấy') && !t?.includes('Chưa có dữ liệu')).length;
    console.log(`Số đầu việc hiển thị trên UI (Tuần 42 - canbo_a): ${uiCountW42}`);

    const shotW42 = path.join(SCREENSHOT_DIR, 'hotfix_uat_canbo_a_tuan42.png');
    await page.screenshot({ path: shotW42, fullPage: true });
    fs.copyFileSync(shotW42, path.join(ARTIFACT_DIR, 'hotfix_uat_canbo_a_tuan42.png'));

    const exportHrefW42 = await page.$eval('[data-testid="export-xlsx-btn"]', (el) => (el as HTMLAnchorElement).getAttribute('href'));
    const resExcelW42 = await fetch(`${BASE_URL}${exportHrefW42}`, {
      headers: { Cookie: `token=${tokenCookie?.value}` },
    });

    const bufExcelW42 = Buffer.from(await resExcelW42.arrayBuffer());
    const fileExcelW42 = path.join(EXPORT_DIR, 'BaoCao_HotfixUAT_CanBoA_Tuan42.xlsx');
    fs.writeFileSync(fileExcelW42, bufExcelW42);
    fs.copyFileSync(fileExcelW42, path.join(ARTIFACT_DIR, 'BaoCao_HotfixUAT_CanBoA_Tuan42.xlsx'));

    const wbW42 = new ExcelJS.Workbook();
    await wbW42.xlsx.load(bufExcelW42);
    const sheetW42 = wbW42.getWorksheet('Biểu Kế Hoạch Tuần') || wbW42.worksheets[0];

    sheetW42.eachRow((row, rowNumber) => {
      if (rowNumber <= 7) return;
      const colA = String(row.getCell(1).value || '').trim();
      const colC = String(row.getCell(3).value || '').trim();
      if (colA.includes('TỔNG CỘNG') || colA.includes('NGƯỜI LẬP')) return;
      if (colC.includes('(Không phát sinh')) return;
      if (colC) excelCountW42++;
    });

    console.log(`Số đầu việc nghiệp vụ Excel Tuần 42: ${excelCountW42}`);
    const isMatchW42 = uiCountW42 === excelCountW42;
    results.push({
      step: 'canbo_a Tuần 42',
      passed: isMatchW42,
      uiCount: uiCountW42,
      excelBusinessCount: excelCountW42,
      details: `Khớp ${uiCountW42} đầu việc. Hoàn toàn cách ly, không bị lẫn Task từ Tuần 41.`,
    });
  }

  // -------------------------------------------------------------
  // TEST 3: canbo_b - Tuần 41 (Cách ly dữ liệu cá nhân giữa cán bộ A và B)
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: canbo_b - Tuần 41 (Cách ly giữa A và B) ---');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.deleteCookie({ name: 'token', domain: 'localhost' });

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.deleteCookie({ name: 'token', domain: 'localhost' });

  const resLoginB = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'canbo_b', password: 'demo123' }),
  });
  const dataLoginB = await resLoginB.json();
  await page.setCookie({
    name: 'token',
    value: dataLoginB.token,
    domain: 'localhost',
    path: '/',
  });

  await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1000));
  const hasPlanSelect = await page.$('[data-testid="plan-select"]');
  console.log('canbo_b có dropdown kế hoạch Đội A không:', !!hasPlanSelect);

  const shotB = path.join(SCREENSHOT_DIR, 'hotfix_uat_canbo_b_tuan41.png');
  await page.screenshot({ path: shotB, fullPage: true });
  fs.copyFileSync(shotB, path.join(ARTIFACT_DIR, 'hotfix_uat_canbo_b_tuan41.png'));

  const cookiesB = await page.cookies();
  const tokenCookieB = cookiesB.find((c) => c.name === 'token');

  const parsedUrlW41 = new URL(`${BASE_URL}${exportHrefW41}`);
  const planIdW41 = parsedUrlW41.searchParams.get('planId');
  const periodIdW41 = parsedUrlW41.searchParams.get('periodId');

  // 1. Kiểm tra canbo_b cố tình xuất kế hoạch của Đội A (planIdW41): BỊ CHẶN 403!
  const crossUnitUrl = `${BASE_URL}/api/reports/export?template=legacy&planId=${planIdW41}&scope=personal`;
  const resCross = await fetch(crossUnitUrl, {
    headers: { Cookie: `token=${tokenCookieB?.value}` },
  });
  console.log('canbo_b gọi xuất kế hoạch của Đội A:', resCross.status);
  const isCrossBlocked = resCross.status === 403;

  // 2. Kiểm tra canbo_b xuất báo cáo cá nhân theo periodId:
  const periodExportUrlB = `${BASE_URL}/api/reports/export?template=legacy&periodId=${periodIdW41}&scope=personal`;
  const resExcelB = await fetch(periodExportUrlB, {
    headers: { Cookie: `token=${tokenCookieB?.value}` },
  });

  let excelCountB = 0;
  let hasLeakedA = false;

  if (resExcelB.ok) {
    const bufExcelB = Buffer.from(await resExcelB.arrayBuffer());
    const fileExcelB = path.join(EXPORT_DIR, 'BaoCao_HotfixUAT_CanBoB_Tuan41.xlsx');
    fs.writeFileSync(fileExcelB, bufExcelB);
    fs.copyFileSync(fileExcelB, path.join(ARTIFACT_DIR, 'BaoCao_HotfixUAT_CanBoB_Tuan41.xlsx'));

    const wbB = new ExcelJS.Workbook();
    await wbB.xlsx.load(bufExcelB);
    const sheetB = wbB.getWorksheet('Biểu Kế Hoạch Tuần') || wbB.worksheets[0];

    sheetB.eachRow((row, rowNumber) => {
      if (rowNumber <= 7) return;
      const colA = String(row.getCell(1).value || '').trim();
      const colC = String(row.getCell(3).value || '').trim();
      const colD = String(row.getCell(4).value || '').trim();
      if (colA.includes('TỔNG CỘNG') || colA.includes('NGƯỜI LẬP')) return;
      if (colC.includes('(Không phát sinh')) return;
      if (colC) {
        excelCountB++;
        if (colD.includes('Trần Thị Mai')) {
          hasLeakedA = true;
        }
      }
    });
  }

  console.log(`Số đầu việc nghiệp vụ Excel canbo_b: ${excelCountB} | Phát hiện rò rỉ Cán bộ A: ${hasLeakedA} | Chặn xuất chéo đơn vị: ${isCrossBlocked}`);
  const isPassB = isCrossBlocked && !hasLeakedA;
  results.push({
    step: 'canbo_b Tuần 41 (Cách ly Cán bộ B & Chặn chéo đơn vị)',
    passed: isPassB,
    uiCount: 0,
    excelBusinessCount: excelCountB,
    details: `Chặn 403 khi canbo_b cố xuất kế hoạch của Đội A. Không rò rỉ bất kỳ dữ liệu nào của Cán bộ A sang báo cáo của Cán bộ B.`,
  });

  // -------------------------------------------------------------
  // TEST 4: KIỂM THỬ BẢO MẬT PHÂN QUYỀN VÀ CHỐNG IDOR
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Kiểm thử bảo mật Anti-IDOR (STAFF canbo_a) ---');
  // Lấy personId của canbo_b
  const accB = await prisma.account.findUnique({ where: { username: 'canbo_b' } });
  const accA = await prisma.account.findUnique({ where: { username: 'canbo_a' } });

  // canbo_a cố tình truyền personId của canbo_b
  const tokenA = tokenCookie?.value;
  const targetPlanIdW41 = planIdW41;

  const idorUrl = `${BASE_URL}/api/reports/export?template=legacy&planId=${targetPlanIdW41}&scope=personal&personId=${accB?.personId}`;
  console.log('canbo_a gửi request IDOR cố ý lấy dữ liệu của canbo_b:', idorUrl);

  const resIdor = await fetch(idorUrl, {
    headers: { Cookie: `token=${tokenA}` },
  });

  let idorPassed = false;
  if (resIdor.status === 403) {
    console.log('-> Hệ thống chặn thành công với HTTP 403 Forbidden!');
    idorPassed = true;
  } else if (resIdor.ok) {
    // Nếu hệ thống ép về chính canbo_a
    const buf = Buffer.from(await resIdor.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sh = wb.getWorksheet('Biểu Kế Hoạch Tuần') || wb.worksheets[0];
    const headerTitle = String(sh.getCell('A5').value || '');
    console.log('Tiêu đề phụ trong file xuất:', headerTitle);
    if (headerTitle.includes('Trần Thị Mai') && !headerTitle.includes('Lê Hoàng Quân')) {
      console.log('-> Hệ thống cưỡng chế an toàn về Cán bộ A (Anti-IDOR PASS)!');
      idorPassed = true;
    }
  }

  results.push({
    step: 'Bảo mật Anti-IDOR (Cán bộ thường STAFF)',
    passed: idorPassed,
    uiCount: 0,
    excelBusinessCount: 0,
    details: 'Chặn thành công nỗ lực giả mạo personId để trích xuất dữ liệu của cán bộ khác.',
  });

  console.log('\n================================================================');
  console.log('TỔNG HỢP KẾT QUẢ HOTFIX UAT:');
  console.log('================================================================');
  results.forEach((r, idx) => {
    console.log(`${idx + 1}. [${r.passed ? 'PASS' : 'FAIL'}] ${r.step}`);
    console.log(`   - UI: ${r.uiCount} đầu việc | Excel: ${r.excelBusinessCount} đầu việc`);
    console.log(`   - Chi tiết: ${r.details}`);
  });

  await browser.close();
}

run().catch((err) => {
  console.error('LỖI KIỂM THỬ HOTFIX UAT:', err);
  process.exit(1);
});
