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
    console.log(`[AUTH] Login status: ${res.status}`);
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
  console.log('=== BẮT ĐẦU NGHIỆM THU THAO TÁC TRÊN GIAO DIỆN /plans ===');

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. Đăng nhập vai trò canbo_a
  const officerSession = await loginAs('canbo_a');
  console.log(`[1] Đăng nhập thành công cán bộ: ${officerSession.user.fullName} (${officerSession.user.role})`);

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

  // 2. Mở trang /plans
  console.log('[2] Điều hướng tới /plans...');
  await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle0', timeout: 8000 });
  await new Promise((r) => setTimeout(r, 1000));

  // 3. Quét dropdown kế hoạch trên giao diện để tìm Kế hoạch DRAFT Tuần 41
  console.log('[3] Tìm kiếm kế hoạch DRAFT Tuần 41 trong dropdown giao diện...');
  const options = await page.$$eval('select', (selects) => {
    // Select kế hoạch là select đầu tiên hoặc có chứa thông tin kế hoạch
    for (const sel of selects) {
      const opts = Array.from(sel.options).map((o) => ({
        value: o.value,
        text: o.text,
      }));
      if (opts.some((o) => o.text.includes('Kế hoạch') || o.text.includes('DRAFT'))) {
        return opts;
      }
    }
    return [];
  });

  console.log(`    Tìm thấy ${options.length} lựa chọn kế hoạch trong dropdown UI.`);
  const draftW41Option = options.find(
    (o) =>
      (o.text.includes('Tuần 41') || o.text.includes('W41') || o.text.includes('tuần 41')) &&
      o.text.includes('DRAFT')
  );

  if (!draftW41Option) {
    console.error('❌ BLOCKED: Không tìm thấy kế hoạch DRAFT Tuần 41 trên dropdown giao diện!');
    const errorPic = path.join(OUTPUT_DIR, 'plan_error_not_found.png');
    await page.screenshot({ path: errorPic, fullPage: true });
    await browser.close();
    process.exit(1);
  }

  console.log(`✓ Tìm thấy kế hoạch phù hợp: "${draftW41Option.text}" (value: ${draftW41Option.value})`);

  // Chọn kế hoạch này trên giao diện
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
  }, draftW41Option.value);

  await new Promise((r) => setTimeout(r, 1500));

  // Chụp ảnh trước khi thêm đầu việc
  const beforePic = path.join(OUTPUT_DIR, 'plan_step1_before_add.png');
  await page.screenshot({ path: beforePic, fullPage: true });
  fs.copyFileSync(beforePic, path.join(ARTIFACT_DIR, 'plan_step1_before_add.png'));
  console.log(`✓ Đã lưu ảnh TRƯỚC KHI THÊM: ${beforePic}`);

  // 4. Thao tác Thêm Đầu Việc 1: Mẫu "Tiếp nhận hồ sơ" (Thực hiện thủ tục hải quan)
  console.log('\n[4] Thêm Đầu việc 1 (Mẫu: "Tiếp nhận hồ sơ")...');
  // Click nút "+ Thêm đầu việc mới"
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const addBtn = buttons.find((b) => b.innerText.includes('+ Thêm đầu việc'));
    if (addBtn) addBtn.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  // Chọn mẫu "Tiếp nhận hồ sơ" trong modal
  await page.evaluate(() => {
    const modalSelects = Array.from(document.querySelectorAll('select'));
    const tplSelect = modalSelects.find((s) =>
      Array.from(s.options).some((o) => o.text.includes('Tiếp nhận hồ sơ'))
    );
    if (tplSelect) {
      const opt = Array.from(tplSelect.options).find((o) => o.text.includes('Tiếp nhận hồ sơ'));
      if (opt) {
        tplSelect.value = opt.value;
        tplSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
  await new Promise((r) => setTimeout(r, 300));

  // Submit modal
  await page.evaluate(() => {
    const submitBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.innerText.includes('Lưu vào kế hoạch')
    );
    if (submitBtn) submitBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  console.log('✓ Đã submit Đầu việc 1!');

  // 5. Thao tác Thêm Đầu Việc 2: Mẫu "Theo dõi trạng thái seal GPS" (Kiểm tra giám sát hải quan)
  console.log('\n[5] Thêm Đầu việc 2 (Mẫu: "Theo dõi trạng thái seal GPS")...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const addBtn = buttons.find((b) => b.innerText.includes('+ Thêm đầu việc'));
    if (addBtn) addBtn.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  await page.evaluate(() => {
    const modalSelects = Array.from(document.querySelectorAll('select'));
    const tplSelect = modalSelects.find((s) =>
      Array.from(s.options).some((o) => o.text.includes('seal GPS') || o.text.includes('GPS'))
    );
    if (tplSelect) {
      const opt = Array.from(tplSelect.options).find((o) => o.text.includes('seal GPS') || o.text.includes('GPS'));
      if (opt) {
        tplSelect.value = opt.value;
        tplSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
  await new Promise((r) => setTimeout(r, 300));

  await page.evaluate(() => {
    const submitBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.innerText.includes('Lưu vào kế hoạch')
    );
    if (submitBtn) submitBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  console.log('✓ Đã submit Đầu việc 2!');

  // 6. Thao tác Thêm Đầu Việc 3: Đầu việc tự do DEMO
  console.log('\n[6] Thêm Đầu việc 3 (Tự do: "Kiểm tra thực tế hàng tạm nhập tái xuất DEMO")...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const addBtn = buttons.find((b) => b.innerText.includes('+ Thêm đầu việc'));
    if (addBtn) addBtn.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  await page.evaluate(() => {
    // Không chọn mẫu (để trống)
    const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
    const titleInput = inputs.find((i) => i.placeholder.includes('tên nhiệm vụ'));
    if (titleInput) {
      titleInput.value = 'Kiểm tra thực tế hàng tạm nhập tái xuất DEMO';
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await new Promise((r) => setTimeout(r, 300));

  await page.evaluate(() => {
    const submitBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.innerText.includes('Lưu vào kế hoạch')
    );
    if (submitBtn) submitBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  console.log('✓ Đã submit Đầu việc 3!');

  // Chụp ảnh SAU KHI THÊM 3 ĐẦU VIỆC
  const afterAddPic = path.join(OUTPUT_DIR, 'plan_step2_after_add.png');
  await page.screenshot({ path: afterAddPic, fullPage: true });
  fs.copyFileSync(afterAddPic, path.join(ARTIFACT_DIR, 'plan_step2_after_add.png'));
  console.log(`✓ Đã lưu ảnh SAU KHI THÊM: ${afterAddPic}`);

  // 7. Nhấn F5 (Reload toàn trang)
  console.log('\n[7] Thực hiện F5 Reload toàn trang...');
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1500));

  // Re-select kế hoạch Tuần 41 DRAFT nếu dropdown bị reset về index 0
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
  }, draftW41Option.value);
  await new Promise((r) => setTimeout(r, 1500));

  // Chụp ảnh SAU KHI F5
  const afterF5Pic = path.join(OUTPUT_DIR, 'plan_step3_after_f5.png');
  await page.screenshot({ path: afterF5Pic, fullPage: true });
  fs.copyFileSync(afterF5Pic, path.join(ARTIFACT_DIR, 'plan_step3_after_f5.png'));
  console.log(`✓ Đã lưu ảnh SAU KHI F5: ${afterF5Pic}`);

  // 8. Đọc dữ liệu từ DOM để kiểm chứng
  const renderedRows = await page.$$eval('tbody tr', (rows) => {
    return rows.map((r) => {
      const cells = Array.from(r.querySelectorAll('td')).map((c) => c.innerText.trim());
      return cells;
    });
  });
  console.log(`\n[8] Số dòng dữ liệu hiển thị trên bảng sau F5: ${renderedRows.length}`);
  renderedRows.forEach((r, idx) => {
    console.log(`    Dòng [${idx + 1}]: ${r.slice(0, 4).join(' | ')}`);
  });

  await browser.close();

  // 9. Kiểm tra trực tiếp cơ sở dữ liệu PostgreSQL
  console.log('\n[9] Đối soát cơ sở dữ liệu PostgreSQL...');
  const user = await prisma.userAccount.findUnique({
    where: { username: 'canbo_a' },
    include: { person: true },
  });

  const dbWorkItems = await prisma.personalWorkItem.findMany({
    where: { personId: user!.personId },
    include: { template: { include: { activityGroup: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  console.log(`✓ 5 đầu việc mới nhất của cán bộ ${user?.person?.fullName} trong PostgreSQL:`);
  dbWorkItems.forEach((wi, i) => {
    console.log(`   ${i + 1}. Tiêu đề: "${wi.title}" | Nhóm: "${wi.template?.activityGroup?.name || 'Tự do'}" | Mẫu: "${wi.template?.title || 'Không dùng mẫu'}" | Trạng thái: "${wi.status}"`);
  });

  console.log('\n=== HOÀN TẤT KIỂM THỬ THAO TÁC GIAO DIỆN /plans ===');
}

run().catch((err) => {
  console.error('Lỗi kiểm thử UI:', err);
  process.exit(1);
});
