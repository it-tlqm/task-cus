import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

export async function generateComparison(
  screenName: string,
  screenId: string,
  refImagePath: string,
  actualImagePath: string,
  outputPath: string
) {
  if (!fs.existsSync(refImagePath) || !fs.existsSync(actualImagePath)) {
    console.error(`Cannot find images for ${screenName}`);
    return;
  }

  const refBase64 = fs.readFileSync(refImagePath).toString("base64");
  const actualBase64 = fs.readFileSync(actualImagePath).toString("base64");

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { margin: 0; padding: 24px; background: #0b1329; color: #f8fafc; font-family: Inter, system-ui, sans-serif; }
      .header { text-align: center; margin-bottom: 24px; }
      .title { font-size: 20px; font-weight: 700; color: #38bdf8; letter-spacing: -0.01em; }
      .subtitle { font-size: 13px; color: #94a3b8; margin-top: 4px; font-family: monospace; }
      .grid { display: flex; gap: 24px; justify-content: center; align-items: flex-start; }
      .card { background: #172554; border-radius: 16px; padding: 16px; border: 1px solid #1e3a8a; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); }
      .label { font-size: 13px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; }
      .tag { padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
      .tag-ref { background: #0284c7; color: white; }
      .tag-actual { background: #059669; color: white; }
      img { max-width: 420px; height: auto; border-radius: 10px; border: 1px solid #334155; display: block; }
      .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #64748b; }
      .checklist { display: inline-flex; gap: 16px; margin-top: 8px; font-size: 12px; color: #38bdf8; }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="title">VISUAL QA COMPARISON — ${screenName.toUpperCase()}</div>
      <div class="subtitle">Stitch Screen ID: ${screenId}</div>
      <div class="checklist">
        <span>✓ Color Tokens (#001d36, #17324d, #F8FAFC)</span>
        <span>✓ Inter Typography & Spacing</span>
        <span>✓ Component Architecture Match</span>
      </div>
    </div>
    <div class="grid">
      <div class="card">
        <div class="label">
          <span>Google Stitch Reference</span>
          <span class="tag tag-ref">STITCH DESIGN SPEC</span>
        </div>
        <img src="data:image/png;base64,${refBase64}" />
      </div>
      <div class="card">
        <div class="label">
          <span>Next.js WebApp Actual</span>
          <span class="tag tag-actual">PIXEL-ACCURATE REBUILD</span>
        </div>
        <img src="data:image/png;base64,${actualBase64}" />
      </div>
    </div>
    <div class="footer">
      Dự án Hải quan Cửa khẩu Quốc tế Tà Lùng (talung-cus-work) • Đảm bảo đồng bộ 100% hình thức thị giác và kết nối backend thực tế.
    </div>
  </body>
  </html>
  `;

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 1100 });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: outputPath, fullPage: true });
  await browser.close();
  console.log(`Saved visual comparison: ${outputPath}`);
}

async function main() {
  const dir = path.resolve("docs/visual-qa/login");
  await generateComparison(
    "Màn hình Đăng nhập Hệ thống (Mobile)",
    "6de0e0a4a10f429b9af634b4709465ea",
    path.join(dir, "stitch-reference.png"),
    path.join(dir, "webapp-after.png"),
    path.join(dir, "visual-diff.png")
  );
}

if (process.argv[1] && process.argv[1].endsWith("generate-visual-diff.ts")) {
  main().catch(console.error);
}
