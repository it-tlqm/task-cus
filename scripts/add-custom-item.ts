import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/server/db';

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

async function addCustomItem() {
  console.log('Thêm Đầu việc 3 (Tự do) bằng thao tác bàn phím thật (page.type)...');

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

  // Chọn kế hoạch DRAFT Tuần 41 trên dropdown UI
  const options = await page.$$eval('select', (selects) => {
    for (const sel of selects) {
      const opts = Array.from(sel.options).map((o) => ({ value: o.value, text: o.text }));
      if (opts.some((o) => o.text.includes('DRAFT'))) return opts;
    }
    return [];
  });
  const draftOpt = options.find((o) => o.text.includes('Tuần 41') && o.text.includes('DRAFT'));
  if (!draftOpt) throw new Error('Không tìm thấy kế hoạch DRAFT Tuần 41');

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

  // Click nút "+ Thêm đầu việc mới"
  const addBtn = await page.waitForSelector('button ::-p-text("+ Thêm đầu việc mới")');
  await addBtn?.click();
  await new Promise((r) => setTimeout(r, 500));

  // Gõ bằng bàn phím thật vào ô input
  const inputSelector = 'input[placeholder*="tên nhiệm vụ"]';
  await page.waitForSelector(inputSelector);
  await page.click(inputSelector);
  await page.type(inputSelector, 'Kiểm tra thực tế hàng tạm nhập tái xuất DEMO', { delay: 30 });
  await new Promise((r) => setTimeout(r, 500));

  // Click nút "Lưu vào kế hoạch"
  const submitBtn = await page.waitForSelector('button ::-p-text("Lưu vào kế hoạch")');
  await submitBtn?.click();
  await new Promise((r) => setTimeout(r, 2000));

  // Chụp ảnh SAU KHI THÊM ĐỦ 3 ĐẦU VIỆC
  const afterAddPic = path.join(OUTPUT_DIR, 'plan_step2_after_add.png');
  await page.screenshot({ path: afterAddPic, fullPage: true });
  fs.copyFileSync(afterAddPic, path.join(ARTIFACT_DIR, 'plan_step2_after_add.png'));
  console.log(`✓ Đã chụp và cập nhật: ${afterAddPic}`);

  // F5 Reload toàn trang
  console.log('Thực hiện F5 Reload toàn trang...');
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1000));

  // Re-select kế hoạch Tuần 41 trên UI
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

  // Chụp ảnh SAU KHI F5
  const afterF5Pic = path.join(OUTPUT_DIR, 'plan_step3_after_f5.png');
  await page.screenshot({ path: afterF5Pic, fullPage: true });
  fs.copyFileSync(afterF5Pic, path.join(ARTIFACT_DIR, 'plan_step3_after_f5.png'));
  console.log(`✓ Đã chụp và cập nhật: ${afterF5Pic}`);

  // Đọc danh sách các dòng hiển thị trên DOM
  const tableRows = await page.$$eval('tbody tr', (rows) => {
    return rows.map((r) => {
      const cells = Array.from(r.querySelectorAll('td')).map((c) => c.innerText.trim());
      return cells;
    });
  });

  console.log(`\n=== CÁC DÒNG HIỂN THỊ TRÊN GIAO DIỆN BẢNG SAU F5 (${tableRows.length} dòng): ===`);
  tableRows.forEach((r, idx) => {
    console.log(`[Dòng ${idx + 1}] Thứ/Ngày: ${r[0] || ''} | Nhóm: ${r[1] || ''} | Cột C: ${r[2] || ''} | Phụ trách: ${r[3] || ''}`);
  });

  await browser.close();

  // Đối soát cơ sở dữ liệu PostgreSQL
  const dbItems = await prisma.personalWorkItem.findMany({
    where: {
      person: { userAccount: { username: 'canbo_a' } },
      planItem: { planId: '3b07d2be-b1db-4a75-ac0f-a0b1257a46ee' },
    },
    include: { template: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\n=== ĐỐI SOÁT POSTGRESQL (CỦA KẾ HOẠCH NÀY): ${dbItems.length} đầu việc ===`);
  dbItems.forEach((it, i) => {
    console.log(`   ${i + 1}. [${it.templateId ? 'MẪU' : 'TỰ DO'}] Tiêu đề: "${it.title}" | Trạng thái: ${it.status} | Template: ${it.template?.code || 'null'}`);
  });
}

addCustomItem().catch((err) => {
  console.error('Lỗi:', err);
  process.exit(1);
});
