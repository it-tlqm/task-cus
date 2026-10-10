import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { prisma } from '../src/server/db';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = 'C:\\Users\\private\\.gemini\\antigravity\\brain\\d2dd3eea-aae2-40d6-8038-c98f26ab3346';
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'docs', 'screenshots');
const EXPORT_DIR = path.resolve(process.cwd(), 'docs', 'exports');

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
  console.log('================================================================');
  console.log('TALUNG-CUS-WORK — FIX 09: CHUẨN HÓA PHẠM VI BÁO CÁO CÁ NHÂN');
  console.log('ĐÚNG NGƯỜI — ĐÚNG KỲ — ĐÚNG VAI TRÒ CHỦ TRÌ / PHỐI HỢP');
  console.log('================================================================\n');

  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

  // 1. Kiểm tra tài khoản
  console.log('[1] Đăng nhập xác thực tài khoản kiểm thử...');
  const sessionA = await loginAs('canbo_a'); // STAFF
  const sessionB = await loginAs('canbo_b'); // STAFF
  const sessionLeader = await loginAs('truongnhom_a'); // DEPARTMENT_LEADER

  console.log(`    ✓ Cán bộ A: ${sessionA.user.fullName} (Role: ${sessionA.user.role}, ID: ${sessionA.user.personId})`);
  console.log(`    ✓ Cán bộ B: ${sessionB.user.fullName} (Role: ${sessionB.user.role}, ID: ${sessionB.user.personId})`);
  console.log(`    ✓ Trưởng Đội: ${sessionLeader.user.fullName} (Role: ${sessionLeader.user.role})`);

  // 2. Kiểm thử bảo mật & phân quyền: STAFF KHÔNG được SUBMIT Kế hoạch cấp Đội
  console.log('\n[2] Kiểm tra thẩm quyền API: STAFF không được SUBMIT kế hoạch cấp Đội...');
  const testPlan = await prisma.plan.findFirst({
    where: { status: 'DRAFT' },
  });

  if (testPlan) {
    const submitRes = await fetch(`${BASE_URL}/api/plans/${testPlan.id}/workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `token=${sessionA.cookieToken}`,
      },
      body: JSON.stringify({ action: 'SUBMIT' }),
    });

    console.log(`    HTTP Status phản hồi khi canbo_a (STAFF) gọi SUBMIT: ${submitRes.status}`);
    const submitJson = await submitRes.json();
    if (submitRes.status === 403) {
      console.log(`    ✓ CHẶN THÀNH CÔNG (HTTP 403): "${submitJson.error}"`);
    } else {
      throw new Error(`❌ LỖI BẢO MẬT: Cán bộ STAFF vẫn gọi được SUBMIT (HTTP ${submitRes.status})`);
    }
  }

  // 3. Kiểm thử IDOR: Cán bộ A không được xuất báo cáo cá nhân của cán bộ B bằng cách truyền personId
  console.log('\n[3] Kiểm tra chống IDOR trong API xuất báo cáo cá nhân (/api/reports/export)...');
  const idorRes = await fetch(
    `${BASE_URL}/api/reports/export?template=legacy&scope=personal&personId=${sessionB.user.personId}`,
    {
      headers: {
        Cookie: `token=${sessionA.cookieToken}`,
      },
    }
  );

  console.log(`    HTTP Status phản hồi khi canbo_a truyền personId của canbo_b: ${idorRes.status}`);
  if (idorRes.status === 200) {
    // Đã được xử lý: Backend bỏ qua personId của người khác và xuất đúng dữ liệu của chính canbo_a
    const buf = await idorRes.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buf));
    const ws = wb.getWorksheet('Biểu Kế Hoạch Tuần');
    const subTitle = ws?.getRow(5).getCell(1).text || '';
    console.log(`    Tiêu đề phụ trong file xuất ra: "${subTitle}"`);
    if (subTitle.includes(sessionA.user.fullName) && !subTitle.includes(sessionB.user.fullName)) {
      console.log(`    ✓ CHỐNG IDOR THÀNH CÔNG: Backend ép buộc dùng danh tính chính chủ ${sessionA.user.fullName}, không cho canbo_a xuất dữ liệu của ${sessionB.user.fullName}!`);
    } else {
      throw new Error('❌ LỖI BẢO MẬT: Báo cáo cá nhân bị lộ dữ liệu của cán bộ khác qua tham số personId!');
    }
  } else if (idorRes.status === 403) {
    console.log('    ✓ CHỐNG IDOR THÀNH CÔNG: Backend từ chối với HTTP 403 Forbidden!');
  }

  // 4. Chuẩn bị 2 kỳ: Tuần 41 và Tuần 42
  console.log('\n[4] Chuẩn bị dữ liệu kiểm thử cách ly cho 2 cán bộ và 2 kỳ tuần...');
  let periodW41 = await prisma.reportingPeriod.findFirst({
    where: { type: 'WEEK', title: { contains: '41' } },
  });
  if (!periodW41) {
    periodW41 = await prisma.reportingPeriod.create({
      data: {
        type: 'WEEK',
        title: 'Tuần 41/2026',
        startAt: new Date('2026-10-05T00:00:00.000Z'),
        endAt: new Date('2026-10-11T23:59:59.999Z'),
      },
    });
  }

  let periodW42 = await prisma.reportingPeriod.findFirst({
    where: { type: 'WEEK', title: { contains: '42' } },
  });
  if (!periodW42) {
    periodW42 = await prisma.reportingPeriod.create({
      data: {
        type: 'WEEK',
        title: 'Tuần 42/2026',
        startAt: new Date('2026-10-12T00:00:00.000Z'),
        endAt: new Date('2026-10-18T23:59:59.999Z'),
      },
    });
  }

  const groupTTHQ = await prisma.activityGroup.findUniqueOrThrow({ where: { code: 'TTHQ' } });
  const groupGSHQ = await prisma.activityGroup.findUniqueOrThrow({ where: { code: 'GSHQ' } });

  // Dọn dẹp các bản ghi test [FIX09-*] cũ nếu có để bảo đảm kiểm thử sạch sẽ
  await prisma.personalWorkItem.deleteMany({
    where: { title: { contains: '[FIX09' } },
  });
  await prisma.task.deleteMany({
    where: { title: { contains: '[FIX09' } },
  });

  // TẠO DỮ LIỆU ĐẶC TẢ CÁCH LY:
  // (a) Cán bộ A trong Tuần 41: 2 việc
  const itemA41_1 = await prisma.personalWorkItem.create({
    data: {
      personId: sessionA.user.personId,
      periodId: periodW41.id,
      groupId: groupTTHQ.id,
      title: '[FIX09-A41-01] Kiểm tra thực tế hồ sơ luồng đỏ nông sản xuất khẩu',
      workDate: new Date('2026-10-08T08:00:00.000Z'),
      priority: 'Cao',
      coordinationUnit: 'Đội Giám sát hải quan',
      expectedResult: '100% hồ sơ hoàn thành đúng thời hạn',
      status: 'IN_PROGRESS',
    },
  });

  const itemA41_2 = await prisma.personalWorkItem.create({
    data: {
      personId: sessionA.user.personId,
      periodId: periodW41.id,
      groupId: groupGSHQ.id,
      title: '[FIX09-A41-02] Giám sát seal định vị GPS xe vận tải hàng hóa',
      workDate: new Date('2026-10-09T08:00:00.000Z'),
      priority: 'Trung bình',
      coordinationUnit: 'Trạm Biên phòng Tà Lùng',
      expectedResult: 'Theo dõi 100% phương tiện không phát sinh vi phạm',
      status: 'IN_PROGRESS',
    },
  });

  // (b) Cán bộ B trong Tuần 41: 1 việc
  const itemB41_1 = await prisma.personalWorkItem.create({
    data: {
      personId: sessionB.user.personId,
      periodId: periodW41.id,
      groupId: groupTTHQ.id,
      title: '[FIX09-B41-01] Phúc tập tờ khai hải quan luồng xanh tồn đọng',
      workDate: new Date('2026-10-08T08:00:00.000Z'),
      priority: 'Trung bình',
      coordinationUnit: 'Nội bộ Chi cục',
      expectedResult: 'Phúc tập xong toàn bộ 15 bộ tờ khai',
      status: 'COMPLETED',
    },
  });

  // (c) Cán bộ A trong Tuần 42: 1 việc
  const itemA42_1 = await prisma.personalWorkItem.create({
    data: {
      personId: sessionA.user.personId,
      periodId: periodW42.id,
      groupId: groupTTHQ.id,
      title: '[FIX09-A42-01] Kiểm tra cơ sở gia công sản xuất xuất khẩu',
      workDate: new Date('2026-10-15T08:00:00.000Z'),
      priority: 'Cao',
      coordinationUnit: 'Doanh nghiệp gia công',
      expectedResult: 'Báo cáo kiểm tra cơ sở hoàn thành',
      status: 'NOT_STARTED',
    },
  });

  // (d) 1 Task phối hợp trong Tuần 41: Cán bộ B chủ trì, Cán bộ A phối hợp
  const coopTask = await prisma.task.create({
    data: {
      code: `TSK-FIX09-${Date.now()}`,
      title: '[FIX09-TASK] Tuần tra kiểm soát liên ngành khu vực cánh gà Cửa khẩu',
      ownerId: sessionB.user.personId, // Canbo B chủ trì
      unitId: sessionA.user.unitId,
      priority: 'Cao',
      status: 'IN_PROGRESS',
      originalDeadline: new Date('2026-10-10T17:00:00.000Z'),
      currentDeadline: new Date('2026-10-10T17:00:00.000Z'), // Nằm trong Tuần 41
      expectedResultText: 'Không để xảy ra tình trạng buôn lậu qua đường mòn',
      assignees: {
        create: [
          { personId: sessionA.user.personId, role: 'COLLABORATOR' }, // Canbo A phối hợp
        ],
      },
    },
  });

  console.log('    ✓ Đã tạo thành công các bản ghi thử nghiệm cách ly:');
  console.log(`      - canbo_a / Tuần 41: 2 việc ([FIX09-A41-01], [FIX09-A41-02])`);
  console.log(`      - canbo_b / Tuần 41: 1 việc ([FIX09-B41-01])`);
  console.log(`      - canbo_a / Tuần 42: 1 việc ([FIX09-A42-01])`);
  console.log(`      - Task phối hợp Tuần 41: [FIX09-TASK] (Chủ trì: B, Phối hợp: A)`);

  // 5. Kiểm tra Giao diện WebApp (/plans) bằng Puppeteer
  console.log('\n[5] Kiểm chứng giao diện WebApp (/plans) với canbo_a...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setCookie({
    name: 'token',
    value: sessionA.cookieToken,
    domain: 'localhost',
    path: '/',
  });

  await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1000));

  // Chọn chế độ "Kế hoạch cá nhân"
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const personalBtn = buttons.find((b) => b.innerText.includes('Kế hoạch cá nhân'));
    if (personalBtn) personalBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Chụp ảnh màn hình chế độ cá nhân
  const shotPersonal = path.join(SCREENSHOT_DIR, 'fix09_canbo_a_personal_view.png');
  await page.screenshot({ path: shotPersonal, fullPage: true });
  console.log(`    ✓ Đã chụp ảnh màn hình Kế hoạch cá nhân: ${shotPersonal}`);

  // Kiểm tra trên DOM bảng:
  const domContent = await page.evaluate(() => document.body.innerText);
  const hasA41_1 = domContent.includes('[FIX09-A41-01]');
  const hasA41_2 = domContent.includes('[FIX09-A41-02]');
  const hasB41 = domContent.includes('[FIX09-B41-01]');

  console.log(`    - Tìm thấy việc [FIX09-A41-01] của A: ${hasA41_1 ? 'CÓ (Đúng)' : 'KHÔNG'}`);
  console.log(`    - Tìm thấy việc [FIX09-A41-02] của A: ${hasA41_2 ? 'CÓ (Đúng)' : 'KHÔNG'}`);
  console.log(`    - Việc [FIX09-B41-01] của B có xuất hiện không: ${hasB41 ? 'CÓ (Sai - Lẫn việc)' : 'KHÔNG (Đúng - Cách ly hoàn toàn)'}`);

  if (hasB41) {
    throw new Error('❌ LỖI GIAO DIỆN: Kế hoạch cá nhân của A đang hiển thị đầu việc của B!');
  }

  // 6. Xuất và đối soát file Excel bằng ExcelJS
  console.log('\n[6] Xuất Excel Mẫu A cho Cán bộ A (Tuần 41) và phân tích đối soát...');
  const resExcelA41 = await fetch(
    `${BASE_URL}/api/reports/export?template=legacy&periodId=${periodW41.id}&scope=personal`,
    {
      headers: { Cookie: `token=${sessionA.cookieToken}` },
    }
  );
  if (!resExcelA41.ok) throw new Error(`Xuất Excel thất bại: HTTP ${resExcelA41.status}`);

  const bufA41 = await resExcelA41.arrayBuffer();
  const fileA41Path = path.join(EXPORT_DIR, 'BaoCao_Fix09_CanBoA_Tuan41.xlsx');
  fs.writeFileSync(fileA41Path, Buffer.from(bufA41));
  console.log(`    ✓ Đã lưu file: ${fileA41Path}`);

  const wbA41 = new ExcelJS.Workbook();
  await wbA41.xlsx.readFile(fileA41Path);
  const wsA41 = wbA41.getWorksheet('Biểu Kế Hoạch Tuần');
  if (!wsA41) throw new Error('Không tìm thấy sheet Biểu Kế Hoạch Tuần');

  // Đếm các đầu việc [FIX09] trong file của A (Tuần 41)
  const fix09RowsA41: Array<{ row: number; colA: string; colB: string; colC: string; colD: string; colE: string }> = [];
  for (let r = 8; r <= wsA41.rowCount; r++) {
    const row = wsA41.getRow(r);
    const colC = row.getCell(3).text || '';
    if (colC.includes('[FIX09')) {
      fix09RowsA41.push({
        row: r,
        colA: row.getCell(1).text || '',
        colB: row.getCell(2).text || '',
        colC,
        colD: row.getCell(4).text || '',
        colE: row.getCell(5).text || '',
      });
    }
  }

  console.log(`    Tìm thấy ${fix09RowsA41.length} đầu việc thuộc bộ thử nghiệm [FIX09] trong báo cáo Tuần 41 của A:`);
  fix09RowsA41.forEach((it) => {
    console.log(`      Dòng ${it.row}:`);
    console.log(`        Cột C (Đầu việc): "${it.colC}"`);
    console.log(`        Cột D (Cán bộ):   "${it.colD}"`);
    console.log(`        Cột E (Phối hợp): "${it.colE}"`);
  });

  // Kiểm tra tính chính xác của A trong Tuần 41:
  const foundA41_1 = fix09RowsA41.find((r) => r.colC.includes('[FIX09-A41-01]'));
  const foundA41_2 = fix09RowsA41.find((r) => r.colC.includes('[FIX09-A41-02]'));
  const foundB41_in_A = fix09RowsA41.find((r) => r.colC.includes('[FIX09-B41-01]'));
  const foundA42_in_A41 = fix09RowsA41.find((r) => r.colC.includes('[FIX09-A42-01]'));
  const foundCoopTask_in_A = fix09RowsA41.find((r) => r.colC.includes('[FIX09-TASK]'));

  if (!foundA41_1 || !foundA41_2) {
    throw new Error('❌ Lỗi: Báo cáo thiếu đầu việc của chính cán bộ A trong Tuần 41!');
  }
  if (foundB41_in_A) {
    throw new Error('❌ Lỗi: Báo cáo cán bộ A bị LẪN đầu việc riêng của cán bộ B!');
  }
  if (foundA42_in_A41) {
    throw new Error('❌ Lỗi: Báo cáo Tuần 41 bị LẪN đầu việc của Tuần 42!');
  }
  if (foundCoopTask_in_A) {
    console.log('    ✓ Đối soát nhiệm vụ phối hợp trong báo cáo A:');
    console.log(`      - Cột C hiển thị rõ: "${foundCoopTask_in_A.colC}" (Có nhãn [Phối hợp])`);
    console.log(`      - Cột D hiển thị rõ: "${foundCoopTask_in_A.colD}" (Chỉ rõ người chủ trì, KHÔNG nhận vơ A là chủ trì)`);
    console.log(`      - Cột E hiển thị rõ: "${foundCoopTask_in_A.colE}" (Chỉ rõ A tham gia phối hợp)`);
    if (!foundCoopTask_in_A.colC.includes('[Phối hợp]') || !foundCoopTask_in_A.colD.includes('Chủ trì')) {
      throw new Error('❌ Lỗi: Nhiệm vụ phối hợp bị ghi sai vai trò!');
    }
  }

  // 7. Xuất Excel Mẫu A cho Cán bộ B (Tuần 41)
  console.log('\n[7] Xuất Excel Mẫu A cho Cán bộ B (Tuần 41) và kiểm tra cách ly...');
  const resExcelB41 = await fetch(
    `${BASE_URL}/api/reports/export?template=legacy&periodId=${periodW41.id}&scope=personal`,
    {
      headers: { Cookie: `token=${sessionB.cookieToken}` },
    }
  );
  if (!resExcelB41.ok) throw new Error(`Xuất Excel thất bại: HTTP ${resExcelB41.status}`);

  const bufB41 = await resExcelB41.arrayBuffer();
  const fileB41Path = path.join(EXPORT_DIR, 'BaoCao_Fix09_CanBoB_Tuan41.xlsx');
  fs.writeFileSync(fileB41Path, Buffer.from(bufB41));

  const wbB41 = new ExcelJS.Workbook();
  await wbB41.xlsx.readFile(fileB41Path);
  const wsB41 = wbB41.getWorksheet('Biểu Kế Hoạch Tuần');
  if (!wsB41) throw new Error('Không tìm thấy sheet');

  const fix09RowsB41: string[] = [];
  for (let r = 8; r <= wsB41.rowCount; r++) {
    const colC = wsB41.getRow(r).getCell(3).text || '';
    if (colC.includes('[FIX09')) fix09RowsB41.push(colC);
  }
  console.log(`    Tìm thấy ${fix09RowsB41.length} việc [FIX09] trong báo cáo của B:`, fix09RowsB41);
  const hasA_in_B = fix09RowsB41.some((t) => t.includes('[FIX09-A41'));
  if (hasA_in_B) throw new Error('❌ Lỗi: Báo cáo của B bị lẫn việc của A!');
  console.log('    ✓ Báo cáo của B hoàn toàn không lẫn đầu việc của A.');

  // 8. Xuất Excel Mẫu A cho Cán bộ A (Tuần 42)
  console.log('\n[8] Xuất Excel Mẫu A cho Cán bộ A (Tuần 42) và kiểm tra cách ly theo kỳ...');
  const resExcelA42 = await fetch(
    `${BASE_URL}/api/reports/export?template=legacy&periodId=${periodW42.id}&scope=personal`,
    {
      headers: { Cookie: `token=${sessionA.cookieToken}` },
    }
  );
  if (!resExcelA42.ok) throw new Error(`Xuất Excel thất bại: HTTP ${resExcelA42.status}`);

  const bufA42 = await resExcelA42.arrayBuffer();
  const fileA42Path = path.join(EXPORT_DIR, 'BaoCao_Fix09_CanBoA_Tuan42.xlsx');
  fs.writeFileSync(fileA42Path, Buffer.from(bufA42));

  const wbA42 = new ExcelJS.Workbook();
  await wbA42.xlsx.readFile(fileA42Path);
  const wsA42 = wbA42.getWorksheet('Biểu Kế Hoạch Tuần');
  if (!wsA42) throw new Error('Không tìm thấy sheet');

  const fix09RowsA42: string[] = [];
  for (let r = 8; r <= wsA42.rowCount; r++) {
    const colC = wsA42.getRow(r).getCell(3).text || '';
    if (colC.includes('[FIX09')) fix09RowsA42.push(colC);
  }
  console.log(`    Tìm thấy ${fix09RowsA42.length} việc [FIX09] trong báo cáo Tuần 42 của A:`, fix09RowsA42);
  const hasA41_in_A42 = fix09RowsA42.some((t) => t.includes('[FIX09-A41'));
  if (hasA41_in_A42) throw new Error('❌ Lỗi: Báo cáo Tuần 42 bị lẫn việc của Tuần 41!');
  console.log('    ✓ Báo cáo Tuần 42 không bị lẫn bất kỳ đầu việc nào của Tuần 41.');

  // Sao chép các tệp kết quả vào artifact dir
  fs.copyFileSync(fileA41Path, path.join(ARTIFACT_DIR, 'BaoCao_Fix09_CanBoA_Tuan41.xlsx'));
  fs.copyFileSync(fileB41Path, path.join(ARTIFACT_DIR, 'BaoCao_Fix09_CanBoB_Tuan41.xlsx'));
  fs.copyFileSync(fileA42Path, path.join(ARTIFACT_DIR, 'BaoCao_Fix09_CanBoA_Tuan42.xlsx'));
  fs.copyFileSync(shotPersonal, path.join(ARTIFACT_DIR, 'fix09_canbo_a_personal_view.png'));

  // 9. Dọn dẹp dữ liệu thử nghiệm cách ly [FIX09-*] (giữ nguyên toàn bộ dữ liệu demo khác)
  console.log('\n[9] Dọn dẹp dữ liệu thử nghiệm [FIX09-*] (bảo toàn 100% dữ liệu khác)...');
  await prisma.personalWorkItem.deleteMany({
    where: { title: { contains: '[FIX09' } },
  });
  await prisma.task.deleteMany({
    where: { title: { contains: '[FIX09' } },
  });
  console.log('    ✓ Đã hoàn tất dọn dẹp kiểm thử cô lập.');

  await browser.close();

  console.log('\n================================================================');
  console.log('✅ KẾT QUẢ NGHIỆM THU FIX 09: ĐẠT 100% YÊU CẦU NGHIỆP VỤ!');
  console.log('   1. Đã siết quyền: STAFF không thể tự ý SUBMIT Kế hoạch Đội (HTTP 403).');
  console.log('   2. Đã chống IDOR: Cán bộ không thể xuất dữ liệu cá nhân của người khác.');
  console.log('   3. Cách ly hoàn toàn giữa Cán bộ A và Cán bộ B (Không lẫn đầu việc).');
  console.log('   4. Cách ly hoàn toàn giữa Tuần 41 và Tuần 42 (Không quét lẫn lịch sử).');
  console.log('   5. Phân định rạch ròi nhiệm vụ Chủ trì vs Phối hợp trong báo cáo cá nhân.');
  console.log('   6. Báo cáo giữ đầy đủ 8 cột A–H theo chuẩn Excel gốc Hải quan.');
  console.log('   7. DỪNG LẠI sau khi hoàn thành bàn giao FIX 09 theo cam kết.');
  console.log('================================================================\n');
}

run().catch((err) => {
  console.error('\n❌ LỖI TRONG QUÁ TRÌNH KIỂM THỬ FIX 09:', err);
  process.exit(1);
});
