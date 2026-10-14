import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

async function inspectFile() {
  // Tìm đường dẫn file thực tế trong Downloads
  const downloadDir = 'C:\\Users\\private\\Downloads';
  const files = fs.readdirSync(downloadDir);
  const matched = files.filter(f => f.toLowerCase().includes('kế hoạch') || f.toLowerCase().includes('kế hoạch') || f.endsWith('.xlsx'));
  console.log('Các file xlsx trong Downloads:', matched);

  let targetPath = path.join(downloadDir, 'Kế hoạch công tác.xlsx');
  if (!fs.existsSync(targetPath)) {
    // thử NFC
    const nfcName = matched.find(f => f.includes('hoạch') || f.includes('hoạch'));
    if (nfcName) targetPath = path.join(downloadDir, nfcName);
  }

  console.log('Đang đọc file:', targetPath);
  if (!fs.existsSync(targetPath)) {
    console.error('Không tìm thấy file tại đường dẫn');
    return;
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(targetPath);

  console.log('\n--- THÔNG TIN WORKBOOK ---');
  console.log('Số lượng Sheets:', wb.worksheets.length);
  wb.worksheets.forEach((ws, idx) => {
    console.log(`Sheet [${idx + 1}]: "${ws.name}", Số dòng: ${ws.rowCount}, Số cột: ${ws.columnCount}`);
  });

  const sheet = wb.worksheets[0];
  console.log(`\n--- CHI TIẾT TỪNG DÒNG SHEET "${sheet.name}" ---`);
  for (let r = 1; r <= Math.min(sheet.rowCount, 25); r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      let val = cell.value;
      if (val && typeof val === 'object' && 'richText' in val) {
        val = (val as any).richText.map((t: any) => t.text).join('');
      } else if (val && typeof val === 'object' && 'result' in val) {
        val = `Formula: ${(val as any).formula} => ${(val as any).result}`;
      }
      cells.push(`[${String.fromCharCode(64 + col)}${r}]: ${JSON.stringify(val)}`);
    });
    if (cells.length > 0) {
      console.log(`Row ${r}: ${cells.slice(0, 8).join(' | ')}`);
    }
  }
}

inspectFile().catch(console.error);
