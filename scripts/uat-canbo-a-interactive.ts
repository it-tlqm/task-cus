import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = 'C:\\Users\\private\\.gemini\\antigravity\\brain\\d2dd3eea-aae2-40d6-8038-c98f26ab3346';
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'docs', 'screenshots');
const EXPORT_DIR = path.resolve(process.cwd(), 'docs', 'exports');

async function main() {
  console.log('=== BẮT ĐẦU NGHIỆM THU TRỰC TIẾP TRÊN GIAO DIỆN CANBO_A ===');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. ĐĂNG NHẬP canbo_a TRÊN GIAO DIỆN /login
  console.log('\n--- BƯỚC 1: Đăng nhập canbo_a tại http://localhost:3000/login ---');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0', timeout: 15000 });
  
  await page.type('input[type="text"], input[name="username"]', 'canbo_a');
  await page.type('input[type="password"], input[name="password"]', 'demo123');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);

  console.log('Đăng nhập thành công, URL hiện tại:', page.url());

  // 2. MỞ KẾ HOẠCH -> TUẦN 41 -> KẾ HOẠCH CÁ NHÂN
  console.log('\n--- BƯỚC 2: Điều hướng tới /plans và chọn Tuần 41 (Kế hoạch cá nhân) ---');
  await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1000));

  await page.waitForSelector('[data-testid="plan-select"]', { timeout: 10000 });
  
  // Tìm option Tuần 41
  const planInfo = await page.evaluate(() => {
    const sel = document.querySelector('[data-testid="plan-select"]') as HTMLSelectElement;
    if (!sel) return null;
    const opt = Array.from(sel.options).find((o) => o.text.includes('Tuần 41'));
    if (!opt) return null;
    return { value: opt.value, text: opt.text };
  });

  console.log('Kế hoạch Tuần 41 tìm thấy:', planInfo);
  if (planInfo) {
    await page.select('[data-testid="plan-select"]', planInfo.value);
    await new Promise((r) => setTimeout(r, 1200));
  }

  // Nhấn nút "Kế hoạch cá nhân"
  console.log('Chuyển phạm vi sang "Kế hoạch cá nhân"...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find((b) => b.innerText.includes('Kế hoạch cá nhân'));
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));

  // 3. KIỂM TRA 8 CỘT VÀ CÁC ĐẦU VIỆC HIỂN THỊ
  console.log('\n--- BƯỚC 3: Kiểm tra cấu trúc 8 cột và đầu việc của canbo_a ---');
  const tableData = await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent?.trim().replace(/\s+/g, ' '));
    const rows = Array.from(document.querySelectorAll('tbody tr')).map((tr) => {
      const cells = Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim().replace(/\s+/g, ' '));
      return cells;
    });
    return { headers, rows };
  });

  console.log('Tiêu đề các cột phát hiện trên bảng:', tableData.headers);
  console.log(`Số dòng dữ liệu đang hiển thị: ${tableData.rows.length}`);
  tableData.rows.forEach((r, idx) => {
    console.log(` Dòng ${idx + 1}:`, r.slice(0, 8));
  });

  // Chụp ảnh giao diện bước 1
  const initialShot = path.join(SCREENSHOT_DIR, 'uat_step1_canbo_a_personal_view.png');
  await page.screenshot({ path: initialShot, fullPage: true });
  fs.copyFileSync(initialShot, path.join(ARTIFACT_DIR, 'uat_step1_canbo_a_personal_view.png'));
  console.log('Đã lưu ảnh màn hình:', initialShot);

  // 4. THỬ MỞ MỘT ĐẦU VIỆC ĐỂ SỬA RỒI F5
  console.log('\n--- BƯỚC 4: Chỉnh sửa một đầu việc và tải lại trang (F5) ---');
  // Tìm nút edit đầu tiên
  const hasEditBtn = await page.$('button[title="Chỉnh sửa đầu việc"]');
  if (!hasEditBtn) {
    throw new Error('Không tìm thấy nút Chỉnh sửa đầu việc trên giao diện!');
  }

  console.log('Bấm mở modal Chỉnh sửa đầu việc...');
  await page.click('button[title="Chỉnh sửa đầu việc"]');
  await page.waitForSelector('[data-testid="modal-expected-result-input"]', { timeout: 5000 });

  const currentResult = await page.$eval('[data-testid="modal-expected-result-input"]', (el) => (el as HTMLInputElement).value);
  console.log('Kết quả dự kiến hiện tại:', currentResult);

  const newResultText = '100% hoàn thành theo quy định (UAT Đã Kiểm Chứng F5)';
  console.log('Cập nhật kết quả dự kiến thành:', newResultText);

  await page.click('[data-testid="modal-expected-result-input"]', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('[data-testid="modal-expected-result-input"]', newResultText);

  // Cập nhật thêm đơn vị phối hợp để kiểm tra Cột E
  await page.click('[data-testid="modal-coordination-input"]', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('[data-testid="modal-coordination-input"]', 'Chi cục Hải quan CK Tà Lùng, Biên phòng');

  // Bấm nút Lưu thay đổi
  console.log('Bấm Lưu cập nhật...');
  await page.evaluate(() => {
    const form = document.querySelector('form');
    if (form) {
      const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      if (submitBtn) submitBtn.click();
    }
  });

  await new Promise((r) => setTimeout(r, 2000));

  // Tải lại trang (F5)
  console.log('Thực hiện tải lại trang (F5 / page.reload)...');
  await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1000));

  // Chọn lại Tuần 41 và Kế hoạch cá nhân nếu cần
  if (planInfo) {
    await page.waitForSelector('[data-testid="plan-select"]');
    await page.select('[data-testid="plan-select"]', planInfo.value);
    await new Promise((r) => setTimeout(r, 1000));
  }

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find((b) => b.innerText.includes('Kế hoạch cá nhân'));
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));

  // Đọc lại dữ liệu trên bảng sau F5
  const tableDataAfterF5 = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('tbody tr')).map((tr) => {
      return Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim().replace(/\s+/g, ' '));
    });
  });

  console.log('\nDữ liệu trên bảng sau F5:');
  let isFoundModified = false;
  tableDataAfterF5.forEach((r, idx) => {
    console.log(` Dòng ${idx + 1}:`, r.slice(0, 8));
    if (r.some((cell) => cell.includes('UAT Đã Kiểm Chứng F5'))) {
      isFoundModified = true;
    }
  });

  if (isFoundModified) {
    console.log('=> XÁC NHẬN: Dữ liệu sửa đổi đã được lưu bền vững vào CSDL và tải lại chính xác sau F5!');
  } else {
    console.warn('=> CẢNH BÁO: Chưa tìm thấy chuỗi cập nhật sau F5.');
  }

  // Chụp ảnh giao diện sau F5
  const afterF5Shot = path.join(SCREENSHOT_DIR, 'uat_step2_canbo_a_after_edit_f5.png');
  await page.screenshot({ path: afterF5Shot, fullPage: true });
  fs.copyFileSync(afterF5Shot, path.join(ARTIFACT_DIR, 'uat_step2_canbo_a_after_edit_f5.png'));
  console.log('Đã lưu ảnh màn hình sau F5:', afterF5Shot);

  // 5. XUẤT EXCEL MẪU A VÀ KIỂM TRA ĐỐI SOÁT
  console.log('\n--- BƯỚC 5: Xuất Excel Mẫu A cho canbo_a và đối soát nội dung ---');
  
  // Lấy link export trực tiếp từ nút bấm trên giao diện
  const exportHref = await page.$eval('[data-testid="export-xlsx-btn"]', (el) => (el as HTMLAnchorElement).getAttribute('href'));
  console.log('Link xuất Excel lấy từ nút giao diện:', exportHref);

  if (!exportHref) {
    throw new Error('Không tìm thấy link xuất Excel trên nút data-testid="export-xlsx-btn"!');
  }

  const exportUrl = `${BASE_URL}${exportHref}`;
  console.log('Gọi URL xuất Excel:', exportUrl);

  const cookies = await page.cookies();
  const tokenCookie = cookies.find((c) => c.name === 'token');
  if (!tokenCookie) {
    throw new Error('Không tìm thấy cookie token sau đăng nhập!');
  }

  const excelRes = await fetch(exportUrl, {
    headers: { Cookie: `token=${tokenCookie.value}` },
  });

  if (!excelRes.ok) {
    throw new Error(`Xuất Excel thất bại với mã HTTP ${excelRes.status}`);
  }

  const excelBuffer = Buffer.from(await excelRes.arrayBuffer());
  const excelFilePath = path.join(EXPORT_DIR, 'BaoCao_UAT_CanBoA_Tuan41.xlsx');
  fs.writeFileSync(excelFilePath, excelBuffer);
  fs.copyFileSync(excelFilePath, path.join(ARTIFACT_DIR, 'BaoCao_UAT_CanBoA_Tuan41.xlsx'));
  console.log('Đã lưu file Excel:', excelFilePath);

  // Đọc nội dung file Excel bằng ExcelJS
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(excelBuffer);

  const worksheet = workbook.getWorksheet('Biểu Kế Hoạch Tuần') || workbook.worksheets[0];
  console.log('Đã đọc sheet:', worksheet.name);

  console.log('\n--- NỘI DUNG CHI TIẾT CÁC DÒNG DỮ LIỆU TRONG FILE EXCEL ---');
  let dataRowCount = 0;
  worksheet.eachRow((row, rowNumber) => {
    // Bỏ qua header
    if (rowNumber <= 9) return;
    const colA = String(row.getCell(1).value || '').trim();
    const colB = String(row.getCell(2).value || '').trim();
    const colC = String(row.getCell(3).value || '').trim();
    const colD = String(row.getCell(4).value || '').trim();
    const colE = String(row.getCell(5).value || '').trim();
    const colF = String(row.getCell(6).value || '').trim();
    const colG = String(row.getCell(7).value || '').trim();
    const colH = String(row.getCell(8).value || '').trim();

    if (colA || colB || colC || colD) {
      dataRowCount++;
      console.log(`[Dòng ${dataRowCount}] Cột A: "${colA}" | Cột B: "${colB}" | Cột C: "${colC}" | Cột D: "${colD}" | Cột E: "${colE}" | Cột F: "${colF}" | Cột G: "${colG}" | Cột H: "${colH}"`);
    }
  });

  console.log(`\n=> TỔNG SỐ DÒNG DỮ LIỆU ĐƯỢC XUẤT RA: ${dataRowCount} dòng.`);
  console.log('=== HOÀN TẤT KIỂM THỬ UAT GIAO DIỆN VÀ BÁO CÁO ===');

  await browser.close();
}

main().catch((err) => {
  console.error('LỖI KIỂM THỬ:', err);
  process.exit(1);
});
