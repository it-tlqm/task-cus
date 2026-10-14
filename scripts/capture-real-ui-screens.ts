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

async function capture() {
  console.log('Bắt đầu chụp ảnh giao diện thực tế...');
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Lấy phiên làm việc
  const leaderSession = await loginAs('lanhdao');
  const officerSession = await loginAs('canbo_a');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  // 1. Chụp Dashboard với vai trò Lãnh đạo
  console.log('Chụp Dashboard...');
  await page.setCookie({
    name: 'token',
    value: leaderSession.cookieToken,
    domain: 'localhost',
    path: '/',
  });
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000)); // Chờ các chart/cards render ổn định

  const dashboardPath = path.join(OUTPUT_DIR, 'current_dashboard.png');
  await page.screenshot({ path: dashboardPath, fullPage: false });
  console.log(`✓ Đã lưu Dashboard: ${dashboardPath}`);

  // 2. Chụp Kế hoạch (/plans) với vai trò Cán bộ
  console.log('Chụp Kế hoạch tuần (/plans)...');
  await page.setCookie({
    name: 'token',
    value: officerSession.cookieToken,
    domain: 'localhost',
    path: '/',
  });
  await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));

  const plansPath = path.join(OUTPUT_DIR, 'current_plans.png');
  await page.screenshot({ path: plansPath, fullPage: false });
  console.log(`✓ Đã lưu Kế hoạch: ${plansPath}`);

  // 3. Chụp Công việc của tôi (/my-work) với vai trò Cán bộ
  console.log('Chụp Công việc của tôi (/my-work)...');
  await page.goto(`${BASE_URL}/my-work`, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));

  const myWorkPath = path.join(OUTPUT_DIR, 'current_my_work.png');
  await page.screenshot({ path: myWorkPath, fullPage: false });
  console.log(`✓ Đã lưu Công việc của tôi: ${myWorkPath}`);

  await browser.close();

  // Sao chép sang thư mục artifacts để sẵn sàng nhúng
  try {
    fs.copyFileSync(dashboardPath, path.join(ARTIFACT_DIR, 'current_dashboard.png'));
    fs.copyFileSync(plansPath, path.join(ARTIFACT_DIR, 'current_plans.png'));
    fs.copyFileSync(myWorkPath, path.join(ARTIFACT_DIR, 'current_my_work.png'));
    console.log(`✓ Đã sao chép ảnh chụp sang thư mục Artifacts: ${ARTIFACT_DIR}`);
  } catch (err: any) {
    console.warn(`Lưu ý sao chép artifact: ${err.message}`);
  }

  console.log('Hoàn thành chụp ảnh giao diện thực tế!');
}

capture().catch((err) => {
  console.error('Lỗi chụp ảnh:', err);
  process.exit(1);
});
