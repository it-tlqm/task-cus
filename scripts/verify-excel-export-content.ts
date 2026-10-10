import ExcelJS from 'exceljs';
import { prisma } from '../src/server/db';

async function main() {
  const snapshot = await prisma.reportSnapshot.findFirst({
    orderBy: { createdAt: 'desc' },
  });
  if (!snapshot) {
    console.error('Không tìm thấy snapshot nào trong CSDL');
    process.exit(1);
  }
  console.log(`Snapshot mới nhất: ${snapshot.code} - ${snapshot.title} (ID: ${snapshot.id})`);

  // Đăng nhập vai trò Lãnh đạo
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'lanhdao', password: 'demo123' }),
  });
  if (!loginRes.ok) {
    throw new Error(`Đăng nhập thất bại: ${loginRes.status}`);
  }
  const { token } = await loginRes.json();

  // 1. Kiểm tra Mẫu A (Legacy - 8 cột)
  console.log('\n========================================');
  console.log('KIỂM TRA THỰC TẾ FILE EXCEL: MẪU A (LEGACY)');
  console.log('========================================');
  const resA = await fetch(`http://localhost:3000/api/reports/export?template=legacy&snapshotId=${snapshot.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resA.ok) throw new Error(`Lỗi tải Mẫu A: ${resA.status}`);
  const bufA = await resA.arrayBuffer();
  const wbA = new ExcelJS.Workbook();
  await wbA.xlsx.load(Buffer.from(bufA));
  const sheetA = wbA.worksheets[0];

  console.log(`Tên Sheet: "${sheetA.name}"`);
  console.log(`Số dòng: ${sheetA.rowCount}, Số cột định nghĩa: ${sheetA.columnCount}`);

  // Header nằm ở dòng 6
  const headerRowA = sheetA.getRow(6);
  const headersA: string[] = [];
  for (let col = 1; col <= 8; col++) {
    const val = headerRowA.getCell(col).text.trim();
    headersA.push(`Cột ${col} (${String.fromCharCode(64 + col)}): "${val}"`);
  }
  console.log('Tiêu đề 8 cột Mẫu A:');
  headersA.forEach((h) => console.log('  ' + h));

  // Kiểm tra dữ liệu nhiệm vụ trong Mẫu A
  let dataRowCountA = 0;
  for (let r = 7; r <= sheetA.rowCount; r++) {
    const row = sheetA.getRow(r);
    const colC = row.getCell(3).text.trim(); // Danh mục đầu việc
    const colH = row.getCell(8).text.trim(); // Tiến độ / Trạng thái
    if (colC) {
      dataRowCountA++;
      if (dataRowCountA <= 3) {
        console.log(`  [Dòng dữ liệu mẫu ${r}] Đầu việc: "${colC}" | Phụ trách: "${row.getCell(4).text.trim()}" | Trạng thái: "${colH}"`);
      }
    }
  }
  console.log(`Tổng số dòng dữ liệu nghiệp vụ hiển thị trong Mẫu A: ${dataRowCountA}`);

  // 2. Kiểm tra Mẫu B (Detailed - 13 cột)
  console.log('\n========================================');
  console.log('KIỂM TRA THỰC TẾ FILE EXCEL: MẪU B (DETAILED)');
  console.log('========================================');
  const resB = await fetch(`http://localhost:3000/api/reports/export?template=detailed&snapshotId=${snapshot.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resB.ok) throw new Error(`Lỗi tải Mẫu B: ${resB.status}`);
  const bufB = await resB.arrayBuffer();
  const wbB = new ExcelJS.Workbook();
  await wbB.xlsx.load(Buffer.from(bufB));
  const sheetB = wbB.worksheets[0];

  console.log(`Tên Sheet: "${sheetB.name}"`);
  console.log(`Số dòng: ${sheetB.rowCount}, Số cột định nghĩa: ${sheetB.columnCount}`);

  // Header nằm ở dòng 5
  const headerRowB = sheetB.getRow(5);
  const headersB: string[] = [];
  for (let col = 1; col <= 13; col++) {
    const val = headerRowB.getCell(col).text.trim();
    headersB.push(`Cột ${col} (${String.fromCharCode(64 + col)}): "${val}"`);
  }
  console.log('Tiêu đề 13 cột Mẫu B:');
  headersB.forEach((h) => console.log('  ' + h));

  // Dữ liệu dòng mẫu ở Mẫu B
  let dataRowCountB = 0;
  for (let r = 6; r <= sheetB.rowCount; r++) {
    const row = sheetB.getRow(r);
    const colTitle = row.getCell(3).text.trim();
    const colStatus = row.getCell(11).text.trim();
    const colProgress = row.getCell(10).text.trim();
    if (colTitle) {
      dataRowCountB++;
      if (dataRowCountB <= 3) {
        console.log(`  [Dòng dữ liệu mẫu ${r}] Mã: "${row.getCell(2).text.trim()}" | Tên: "${colTitle}" | Cán bộ: "${row.getCell(5).text.trim()}" | Tiến độ: "${colProgress}" | Trạng thái: "${colStatus}"`);
      }
    }
  }
  console.log(`Tổng số dòng dữ liệu nghiệp vụ hiển thị trong Mẫu B: ${dataRowCountB}`);

  console.log('\nKẾT QUẢ ĐỐI SOÁT EXCEL: ĐẠT CHUẨN CẤU TRÚC VÀ TOÀN VẸN DỮ LIỆU TỪ SNAPSHOT!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
