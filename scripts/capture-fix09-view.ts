import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = 'C:\\Users\\private\\.gemini\\antigravity\\brain\\d2dd3eea-aae2-40d6-8038-c98f26ab3346';
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'docs', 'screenshots');

async function snap() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'canbo_a', password: 'demo123' }),
  });
  const data = await res.json();

  await page.setCookie({
    name: 'token',
    value: data.token,
    domain: 'localhost',
    path: '/',
  });

  await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1000));

  await page.waitForSelector('[data-testid="plan-select"]');
  const planVal = await page.evaluate(() => {
    const sel = document.querySelector('[data-testid="plan-select"]') as HTMLSelectElement;
    const match = Array.from(sel.options).find((o) => o.text.includes('DRAFT') && o.text.includes('Tuần 41'));
    return match ? match.value : null;
  });

  if (planVal) {
    await page.select('[data-testid="plan-select"]', planVal);
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Click nút "Kế hoạch cá nhân"
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find((b) => b.innerText.includes('Kế hoạch cá nhân'));
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 1000));

  const shotPath = path.join(SCREENSHOT_DIR, 'fix09_canbo_a_personal_view.png');
  await page.screenshot({ path: shotPath, fullPage: true });
  fs.copyFileSync(shotPath, path.join(ARTIFACT_DIR, 'fix09_canbo_a_personal_view.png'));
  console.log('Saved personal view screenshot successfully to', shotPath);

  await browser.close();
}

snap().catch(console.error);
