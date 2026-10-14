import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = 'C:\\Users\\private\\.gemini\\antigravity\\brain\\d2dd3eea-aae2-40d6-8038-c98f26ab3346';
const OUTPUT_DIR = path.resolve(process.cwd(), 'docs', 'screenshots');

async function loginAs(username: string, password = 'demo123') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Đăng nhập thất bại: HTTP ${res.status}`);
    const data = await res.json();
    const setCookie = res.headers.get('set-cookie') || '';
    const tokenMatch = setCookie.match(/token=([^;]+)/);
    return {
      token: data.token,
      cookieToken: tokenMatch ? tokenMatch[1] : data.token,
      user: data.user,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function run() {
  console.log('Thêm đúng mẫu GSHQ-03 và chụp ảnh đối soát...');

  const officerSession = await loginAs('canbo_a');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.setCookie({
    name: 'token',
    value: officerSession.cookieToken,
    domain: 'localhost',
    path: '/',
  });

  await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle0', timeout: 8000 });
  await new Promise((r) => setTimeout(r, 1000));

  // Chọn kế hoạch Tuần 41 DRAFT
  const options = await page.$$eval('select', (selects) => {
    for (const sel of selects) {
      const opts = Array.from(sel.options).map((o) => ({ value: o.value, text: o.text }));
      if (opts.some((o) => o.text.includes('DRAFT'))) return opts;
    }
    return [];
  });
  const draftOpt = options.find((o) => o.text.includes('Tuần 41') && o.text.includes('DRAFT'));
  if (!draftOpt) throw new Error('Không tìm thấy kế hoạch Tuần 41 DRAFT');

  await page.evaluate((val) => {
    const selects = Array.from(document.querySelectorAll('select'));
    for (const sel of selects) {
      const hasOpt = Array.from(sel.options).some((o) => o.value === val);
      if (hasOpt) {
        sel.value = val;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  }, draftOpt.value);
  await new Promise((r) => setTimeout(r, 1500));

  // Mở modal thêm đầu việc
  const addBtn = await page.waitForSelector('button ::-p-text("+ Thêm đầu việc mới")');
  await addBtn?.click();
  await new Promise((r) => setTimeout(r, 500));

  // Chọn CHÍNH XÁC mẫu GSHQ-03: Theo dõi trạng thái seal GPS
  await page.evaluate(() => {
    const modalSelects = Array.from(document.querySelectorAll('select'));
    const tplSelect = modalSelects.find((s) =>
      Array.from(s.options).some((o) => o.text.includes('seal GPS'))
    );
    if (tplSelect) {
      const opt = Array.from(tplSelect.options).find((o) => o.text.includes('Theo dõi trạng thái seal GPS'));
      if (opt) {
        tplSelect.value = opt.value;
        tplSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
  await new Promise((r) => setTimeout(r, 500));

  // Submit modal
  const submitBtn = await page.waitForSelector('button ::-p-text("Lưu vào kế hoạch")');
  await submitBtn?.click();
  await new Promise((r) => setTimeout(r, 2000));

  // F5 Reload toàn trang
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1000));

  // Re-select kế hoạch Tuần 41
  await page.evaluate((val) => {
    const selects = Array.from(document.querySelectorAll('select'));
    for (const sel of selects) {
      const hasOpt = Array.from(sel.options).some((o) => o.value === val);
      if (hasOpt) {
        sel.value = val;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  }, draftOpt.value);
  await new Promise((r) => setTimeout(r, 1500));

  // Chụp ảnh bằng chứng
  const finalPic = path.join(OUTPUT_DIR, 'plan_verified_exact_items.png');
  await page.screenshot({ path: finalPic, fullPage: true });
  fs.copyFileSync(finalPic, path.join(ARTIFACT_DIR, 'plan_verified_exact_items.png'));
  console.log(`✓ Đã lưu ảnh đối soát: ${finalPic}`);

  // In các dòng trên bảng
  const tableRows = await page.$$eval('tbody tr', (rows) => {
    return rows.map((r) => {
      const cells = Array.from(r.querySelectorAll('td')).map((c) => c.innerText.trim());
      return cells;
    });
  });

  console.log(`\n=== DANH SÁCH DÒNG HIỂN THỊ SAU KHI THÊM ĐÚNG GSHQ-03 (${tableRows.length} dòng): ===`);
  tableRows.forEach((r, idx) => {
    console.log(`[Dòng ${idx + 1}] Thứ/Ngày: ${r[0]?.replace(/\n/g, ' ')} | Nhóm: ${r[1]?.replace(/\n/g, ' ')} | Cột C: ${r[2]?.replace(/\n/g, ' ')}`);
  });

  await browser.close();
}

run().catch((err) => {
  console.error('Lỗi:', err);
  process.exit(1);
});
