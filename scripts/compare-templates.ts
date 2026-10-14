import ExcelJS from 'exceljs';
import { prisma } from '../src/server/db';

async function check() {
  const targetPath = 'C:\\Users\\private\\Downloads\\Kế hoạch công tác.xlsx';
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(targetPath);
  const sheet = wb.worksheets[0];

  const groupRows = [8, 9, 10, 11, 12];
  let totalExcelItems = 0;

  console.log('=== CHI TIẾT TỪNG DÒNG TRONG EXCEL GỐC ===');
  for (const r of groupRows) {
    const groupName = sheet.getRow(r).getCell(2).text.trim();
    const cellText = sheet.getRow(r).getCell(3).text.trim();
    const lines = cellText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    totalExcelItems += lines.length;
    console.log(`\nRow ${r} [${groupName}]: ${lines.length} dòng gạch đầu dòng`);
    lines.forEach((l, i) => console.log(`   ${i + 1}. ${l}`));
  }
  console.log(`\n>>> TỔNG CỘNG DÒNG TÁCH ĐƯỢC TỪ CỘT C EXCEL: ${totalExcelItems}`);

  // So sánh với ActivityTemplate trong DB
  const dbTemplates = await prisma.activityTemplate.findMany({
    include: { activityGroup: true },
    orderBy: { sortOrder: 'asc' },
  });
  console.log(`\n=== TỔNG SỐ ACTIVITY TEMPLATES TRONG DB: ${dbTemplates.length} ===`);
  const byGroup: Record<string, number> = {};
  dbTemplates.forEach((t) => {
    const gName = t.activityGroup.name;
    byGroup[gName] = (byGroup[gName] || 0) + 1;
  });
  for (const [k, v] of Object.entries(byGroup)) {
    console.log(`   - ${k}: ${v} mẫu`);
  }
}

check().catch(console.error);
