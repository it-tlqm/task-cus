import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = 'C:\\Users\\private\\.gemini\\antigravity\\brain\\d2dd3eea-aae2-40d6-8038-c98f26ab3346';
const OUTPUT_DIR = path.resolve(process.cwd(), 'docs', 'screenshots');

async function loginAs(username: string, password = 'demo123') {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`Đăng nhập thất bại cho ${username} (${res.status})`);
  const data = await res.json();
  const setCookie = res.headers.get('set-cookie') || '';
  const tokenMatch = setCookie.match(/token=([^;]+)/);
  return {
    token: data.token,
    cookieToken: tokenMatch ? tokenMatch[1] : data.token,
    user: data.user,
  };
}

async function capturePlansFull() {
  console.log('Khởi chạy chụp ảnh toàn bộ màn hình Kế hoạch cho canbo_a...');
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const officerSession = await loginAs('canbo_a');
  console.log('✓ Đã đăng nhập vai trò cán bộ: canbo_a (Đ/c Trần Thị Mai)');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  // Nạp cookie token
  await page.setCookie({
    name: 'token',
    value: officerSession.cookieToken,
    domain: 'localhost',
    path: '/',
  });

  console.log('Điều hướng tới http://localhost:3000/plans...');
  await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));

  // 1. Ảnh toàn màn hình (Full Page)
  const fullPagePath = path.join(OUTPUT_DIR, 'plans_canbo_a_fullpage.png');
  await page.screenshot({ path: fullPagePath, fullPage: true });
  console.log(`✓ Đã lưu ảnh Full Page: ${fullPagePath}`);

  // 2. Ảnh Viewport chuẩn (1440x900)
  const viewportPath = path.join(OUTPUT_DIR, 'plans_canbo_a_viewport.png');
  await page.screenshot({ path: viewportPath, fullPage: false });
  console.log(`✓ Đã lưu ảnh Viewport: ${viewportPath}`);

  // Sao chép sang thư mục artifacts để sẵn sàng xem/nhúng
  fs.copyFileSync(fullPagePath, path.join(ARTIFACT_DIR, 'plans_canbo_a_fullpage.png'));
  fs.copyFileSync(viewportPath, path.join(ARTIFACT_DIR, 'plans_canbo_a_viewport.png'));
  console.log(`✓ Đã sao chép sang thư mục Artifacts: ${ARTIFACT_DIR}`);

  await browser.close();
  console.log('Hoàn tất!');
}

capturePlansFull().catch((err) => {
  console.error('Lỗi khi chụp màn hình Kế hoạch:', err);
  process.exit(1);
});
