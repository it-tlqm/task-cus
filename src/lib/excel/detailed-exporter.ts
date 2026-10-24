import ExcelJS from 'exceljs';
import { sanitizeFormula } from '../formula-sanitizer';
import { formatVnDate } from '../datetime';

export interface DetailedReportItem {
  id: string;
  code: string;
  title: string;
  groupName: string;
  ownerName: string;
  departmentName: string;
  collaborators?: string;
  priority: string;
  deadlineText: string;
  progressPercent: number;
  status: string;
  issueNotes?: string;
  actualResult?: string;
}

export interface DetailedReportOptions {
  periodTitle: string;
  unitName: string;
  departmentFilter?: string;
  statusFilter?: string;
  items: DetailedReportItem[];
  generatedAt?: Date;
}

/**
 * Xuất báo cáo Mẫu B (Chi tiết theo từng đầu việc và nhiệm vụ)
 * Bảng dữ liệu phẳng mở rộng cho quản trị, phân tích và thống kê số liệu
 */
export async function generateDetailedReportWorkbook(options: DetailedReportOptions): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TALUNG-CUS-WORK Core System';
  workbook.created = options.generatedAt || new Date();

  const sheet = workbook.addWorksheet('Chi Tiết Đầu Việc', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
    views: [{ showGridLines: true }],
  });

  // 1. Column definitions (13 columns)
  sheet.columns = [
    { key: 'stt', width: 8 },         // 1. STT
    { key: 'code', width: 16 },        // 2. Mã việc
    { key: 'title', width: 44 },       // 3. Tên nhiệm vụ / Đầu việc
    { key: 'group', width: 28 },       // 4. Nhóm nghiệp vụ
    { key: 'owner', width: 22 },       // 5. Cán bộ chủ trì
    { key: 'dept', width: 26 },        // 6. Bộ phận
    { key: 'collabs', width: 24 },     // 7. Phối hợp
    { key: 'prio', width: 14 },        // 8. Ưu tiên
    { key: 'deadline', width: 16 },    // 9. Hạn chót
    { key: 'progress', width: 14 },    // 10. Tiến độ %
    { key: 'status', width: 20 },      // 11. Trạng thái
    { key: 'issues', width: 34 },      // 12. Vướng mắc
    { key: 'result', width: 36 },      // 13. Kết quả thực tế
  ];

  // 2. Title Block
  const titleRow = sheet.addRow(['BÁO CÁO CHI TIẾT DANH MỤC ĐẦU VIỆC & NHIỆM VỤ TÁC NGHIỆP']);
  titleRow.height = 28;
  sheet.mergeCells('A1:M1');
  const titleCell = sheet.getCell('A1');
  titleCell.font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: 'FF001D36' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Subtitle / Filters info
  const subText = `Kỳ: ${options.periodTitle} | Đơn vị: ${options.unitName}${
    options.departmentFilter ? ` | Lọc bộ phận: ${options.departmentFilter}` : ''
  }${options.statusFilter ? ` | Lọc trạng thái: ${options.statusFilter}` : ''} | Xuất ngày: ${formatVnDate(new Date())}`;
  const subRow = sheet.addRow([subText]);
  sheet.mergeCells('A2:M2');
  const subCell = sheet.getCell('A2');
  subCell.font = { name: 'Times New Roman', size: 10, italic: true };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.addRow([]); // Blank row

  // 3. KPI Mini Summary Cards
  const total = options.items.length;
  const completed = options.items.filter((i) => i.progressPercent === 100 || i.status.includes('Hoàn thành') || i.status === 'COMPLETED').length;
  const inProgress = options.items.filter((i) => (i.progressPercent > 0 && i.progressPercent < 100) || i.status.includes('Đang') || i.status === 'IN_PROGRESS').length;
  const withIssues = options.items.filter((i) => i.issueNotes && i.issueNotes.trim().length > 0).length;

  const kpiRow = sheet.addRow([
    `Tổng số việc: ${total}`,
    '',
    `Đã hoàn thành: ${completed} (${total > 0 ? Math.round((completed / total) * 100) : 0}%)`,
    '',
    '',
    `Đang thực hiện: ${inProgress}`,
    '',
    '',
    `Có vướng mắc: ${withIssues}`,
    '',
    '',
    '',
    '',
  ]);
  kpiRow.height = 22;
  kpiRow.font = { name: 'Times New Roman', size: 10, bold: true };
  sheet.mergeCells('A4:B4');
  sheet.mergeCells('C4:E4');
  sheet.mergeCells('F4:H4');
  sheet.mergeCells('I4:M4');

  sheet.addRow([]); // Blank row

  // 4. Header Row (Row 6)
  const headers = [
    'STT',
    'Mã đầu việc',
    'Danh mục đầu việc & Tên nhiệm vụ',
    'Nhóm nghiệp vụ',
    'Cán bộ chủ trì',
    'Bộ phận / Đơn vị',
    'Đơn vị / Cán bộ phối hợp',
    'Ưu tiên',
    'Hạn hoàn thành',
    'Tiến độ',
    'Trạng thái',
    'Vấn đề vướng mắc',
    'Kết quả thực tế / Sản phẩm',
  ];

  const headerRow = sheet.addRow(headers);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF001D36' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  // 5. Data Rows
  options.items.forEach((item, index) => {
    const isEven = index % 2 === 0;
    const row = sheet.addRow([
      index + 1,
      sanitizeFormula(item.code),
      sanitizeFormula(item.title),
      sanitizeFormula(item.groupName),
      sanitizeFormula(item.ownerName),
      sanitizeFormula(item.departmentName),
      sanitizeFormula(item.collaborators || '—'),
      sanitizeFormula(item.priority),
      sanitizeFormula(item.deadlineText),
      `${item.progressPercent}%`,
      sanitizeFormula(item.status),
      sanitizeFormula(item.issueNotes || 'Không có'),
      sanitizeFormula(item.actualResult || 'Đang cập nhật'),
    ]);

    row.font = { name: 'Times New Roman', size: 10 };
    row.alignment = { vertical: 'top', wrapText: true };

    row.eachCell((cell, colNum) => {
      // Background zebra
      if (!isEven) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      // Alignment rules
      if (colNum === 1 || colNum === 2 || colNum === 8 || colNum === 9 || colNum === 10 || colNum === 11) {
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }
    });
  });

  return workbook;
}
