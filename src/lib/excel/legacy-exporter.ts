import ExcelJS from 'exceljs';
import { sanitizeFormula } from '../formula-sanitizer';

export interface LegacyReportGroupData {
  groupCode: string;
  groupName: string;
  sourceRow: number;
  workItems: Array<{
    id?: string;
    title: string;
    ownerName: string;
    collaboratorName?: string;
    priority: string;
    expectedResult?: string;
    actualResult?: string;
    status: string;
    dateText?: string;
  }>;
}

export interface LegacyReportOptions {
  periodTitle: string; // e.g. "Tuần 41 (05/10/2026 - 11/10/2026)"
  unitName: string;   // e.g. "Chi cục Hải quan CKQT Tà Lùng"
  departmentName?: string;
  officerName?: string;
  groups: LegacyReportGroupData[];
  unassignedItems?: Array<{
    id?: string;
    title: string;
    ownerName: string;
    collaboratorName?: string;
    priority: string;
    expectedResult?: string;
    actualResult?: string;
    status: string;
    dateText?: string;
  }>;
  generatedAt?: Date;
}

/**
 * Xuất báo cáo Kế hoạch Tuần theo Mẫu A (Legacy / Biểu Kế Hoạch Tuần)
 * Tái hiện chính xác mẫu 8 cột A-H từ file gốc Kế hoạch công tác.xlsx
 */
export async function generateLegacyReportWorkbook(options: LegacyReportOptions): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TALUNG-CUS-WORK Core System';
  workbook.created = options.generatedAt || new Date();

  const sheet = workbook.addWorksheet('Biểu Kế Hoạch Tuần', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
    views: [{ showGridLines: true }],
  });

  // 1. Set column definitions and widths (8 columns A -> H)
  sheet.columns = [
    { key: 'colA', width: 14 }, // Thứ / Ngày
    { key: 'colB', width: 28 }, // Nhiệm vụ thường xuyên
    { key: 'colC', width: 48 }, // Danh mục đầu việc (Chi tiết hoạt động...)
    { key: 'colD', width: 24 }, // Bộ phận / Cán bộ phụ trách
    { key: 'colE', width: 22 }, // Đơn vị phối hợp
    { key: 'colF', width: 14 }, // Mức độ ưu tiên
    { key: 'colG', width: 32 }, // Kết quả dự kiến
    { key: 'colH', width: 22 }, // Tiến độ / Trạng thái
  ];

  // 2. Title Block: Cơ quan cấp trên & Đơn vị
  const row1 = sheet.addRow([
    'TỔNG CỤC HẢI QUAN - CỤC HẢI QUAN CAO BẰNG',
    '',
    '',
    '',
    'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
    '',
    '',
    '',
  ]);
  row1.font = { name: 'Times New Roman', size: 10, bold: true };
  sheet.mergeCells('A1:D1');
  sheet.mergeCells('E1:H1');
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell('E1').alignment = { horizontal: 'center', vertical: 'middle' };

  const row2 = sheet.addRow([
    `HẢI QUAN CỬA KHẨU QUỐC TẾ TÀ LÙNG`,
    '',
    '',
    '',
    'Độc lập - Tự do - Hạnh phúc',
    '',
    '',
    '',
  ]);
  row2.font = { name: 'Times New Roman', size: 10, bold: true };
  sheet.mergeCells('A2:D2');
  sheet.mergeCells('E2:H2');
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell('E2').alignment = { horizontal: 'center', vertical: 'middle' };

  // Empty row
  sheet.addRow([]);

  // Main Report Title (Row 4)
  const titleRow = sheet.addRow([
    'BÁO CÁO CÔNG TÁC THỰC HIỆN KẾ HOẠCH TUẦN CỦA CÁ NHÂN BỘ PHẬN NGHIỆP VỤ',
  ]);
  titleRow.height = 26;
  sheet.mergeCells('A4:H4');
  const titleCell = sheet.getCell('A4');
  titleCell.font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: 'FF001D36' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Period & Subtitle (Row 5)
  const subTitleText = `Kỳ báo cáo: ${options.periodTitle} | Đơn vị: ${options.departmentName || options.unitName}${
    options.officerName ? ` | Cán bộ: ${options.officerName}` : ''
  }`;
  const subRow = sheet.addRow([subTitleText]);
  sheet.mergeCells('A5:H5');
  const subCell = sheet.getCell('A5');
  subCell.font = { name: 'Times New Roman', size: 11, italic: true };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Empty row
  sheet.addRow([]);

  // Table Headers (Row 7)
  const headerRow = sheet.addRow([
    'Thứ / Ngày',
    'Nhiệm vụ thường xuyên',
    'Danh mục đầu việc\n(Chi tiết hoạt động & Biện pháp thực hiện)',
    'Bộ phận / Cán bộ\nphụ trách',
    'Đơn vị\nphối hợp',
    'Mức độ\nưu tiên',
    'Kết quả dự kiến',
    'Tiến độ / Trạng thái',
  ]);
  headerRow.height = 36;

  // Header styling (Navy background, bold white text)
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

  // Table Body: 5 Activity Groups with rows
  let totalTasksCount = 0;
  let completedCount = 0;

  for (const group of options.groups) {
    if (group.workItems.length === 0) {
      // Nhóm không có đầu việc phát sinh -> 1 dòng thể hiện nhóm và ghi chú
      const row = sheet.addRow([
        'Thứ 2 - Thứ 6',
        sanitizeFormula(group.groupName),
        '(Không phát sinh đầu việc mới trong kỳ)',
        sanitizeFormula(options.officerName || options.departmentName || 'Bộ phận chuyên trách'),
        'Các bộ phận phối hợp',
        'Bình thường',
        'Theo dõi thực tế',
        'Không phát sinh',
      ]);
      row.alignment = { vertical: 'top', wrapText: true };
      row.font = { name: 'Times New Roman', size: 10 };
      row.eachCell((cell, colNum) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
        if (colNum === 1 || colNum === 6 || colNum === 8) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
    } else {
      // Có danh sách đầu việc thực tế
      const startRowIdx = sheet.rowCount + 1;

      for (let i = 0; i < group.workItems.length; i++) {
        const item = group.workItems[i];
        totalTasksCount++;
        if (item.status === 'COMPLETED' || item.status === 'Hoàn thành') {
          completedCount++;
        }

        const dateStr = item.dateText || (i === 0 ? 'Thứ 2 - Thứ 6' : '');
        const groupLabel = i === 0 ? group.groupName : '';

        const row = sheet.addRow([
          dateStr,
          groupLabel,
          sanitizeFormula(`• ${item.title}`),
          sanitizeFormula(item.ownerName),
          sanitizeFormula(item.collaboratorName || 'Đội Giám sát / BP liên quan'),
          sanitizeFormula(item.priority || 'Bình thường'),
          sanitizeFormula(item.expectedResult || item.actualResult || 'Hoàn thành đúng quy trình'),
          sanitizeFormula(item.status),
        ]);

        row.font = { name: 'Times New Roman', size: 10 };
        row.alignment = { vertical: 'top', wrapText: true };

        if (item.id) {
          row.getCell(3).note = item.id;
        }

        row.eachCell((cell, colNum) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
          if (colNum === 1 || colNum === 6 || colNum === 8) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
        });
      }

      // Merge cột nhóm B nếu có nhiều dòng trong cùng một nhóm
      if (group.workItems.length > 1) {
        const endRowIdx = sheet.rowCount;
        sheet.mergeCells(`B${startRowIdx}:B${endRowIdx}`);
        const mergedGroupCell = sheet.getCell(`B${startRowIdx}`);
        mergedGroupCell.value = sanitizeFormula(group.groupName);
        mergedGroupCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        mergedGroupCell.font = { name: 'Times New Roman', size: 10, bold: true };
      }
    }
  }

  // Khối rà soát cho các đầu việc chưa phân nhóm nghiệp vụ (Nếu có)
  if (options.unassignedItems && options.unassignedItems.length > 0) {
    const alertHeaderRow = sheet.addRow([
      'LƯU Ý',
      'Chưa phân nhóm nghiệp vụ',
      'DANH MỤC CHỜ RÀ SOÁT: CÁC ĐẦU VIỆC CHƯA PHÂN NHÓM NGHIỆP VỤ (Yêu cầu Lãnh đạo xác định nhóm trước khi ký ban hành)',
      options.officerName || options.departmentName || '',
      'Lãnh đạo Chi cục / Đội',
      'Cần xử lý',
      'Chờ phân loại nhóm nghiệp vụ',
      'Chưa phân nhóm',
    ]);
    alertHeaderRow.height = 28;
    alertHeaderRow.font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FF9A3412' } };
    alertHeaderRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFEDD5' }, // Amber light
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFF97316' } },
        left: { style: 'thin', color: { argb: 'FFF97316' } },
        bottom: { style: 'thin', color: { argb: 'FFF97316' } },
        right: { style: 'thin', color: { argb: 'FFF97316' } },
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });

    for (const item of options.unassignedItems) {
      totalTasksCount++;
      if (item.status === 'COMPLETED' || item.status === 'Hoàn thành') {
        completedCount++;
      }
      const row = sheet.addRow([
        item.dateText || 'Trong tuần',
        'Chưa phân nhóm nghiệp vụ',
        sanitizeFormula(`• ${item.title}`),
        sanitizeFormula(item.ownerName),
        sanitizeFormula(item.collaboratorName || 'Đội Giám sát / BP liên quan'),
        sanitizeFormula(item.priority || 'Trung bình'),
        sanitizeFormula(item.expectedResult || item.actualResult || 'Hoàn thành đúng quy trình'),
        sanitizeFormula(item.status),
      ]);
      row.font = { name: 'Times New Roman', size: 10 };
      row.alignment = { vertical: 'top', wrapText: true };
      if (item.id) {
        row.getCell(3).note = item.id;
      }
      row.eachCell((cell, colNum) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
        if (colNum === 1 || colNum === 6 || colNum === 8) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
    }
  }

  // Summary Row at the bottom
  const summaryRow = sheet.addRow([
    'TỔNG CỘNG',
    `5 Nhóm nghiệp vụ`,
    `Tổng số: ${totalTasksCount} đầu việc ghi nhận trong kỳ`,
    '',
    '',
    '',
    `Tỷ lệ hoàn thành: ${totalTasksCount > 0 ? Math.round((completedCount / totalTasksCount) * 100) : 100}%`,
    `Đã xong: ${completedCount}/${totalTasksCount}`,
  ]);
  summaryRow.font = { name: 'Times New Roman', size: 10, bold: true };
  summaryRow.height = 24;
  sheet.mergeCells(`A${sheet.rowCount}:A${sheet.rowCount}`);
  summaryRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };
    cell.alignment = { vertical: 'middle' };
  });

  // Signature Block (Row + 2)
  sheet.addRow([]);
  const dateSignRow = sheet.addRow([
    '',
    '',
    '',
    '',
    '',
    '',
    'Tà Lùng, ngày .... tháng .... năm 2026',
    '',
  ]);
  dateSignRow.font = { name: 'Times New Roman', size: 10, italic: true };
  sheet.mergeCells(`G${dateSignRow.number}:H${dateSignRow.number}`);
  sheet.getCell(`G${dateSignRow.number}`).alignment = { horizontal: 'center' };

  const signTitleRow = sheet.addRow([
    'NGƯỜI LẬP BÁO CÁO',
    '',
    '',
    'TRƯỞNG BỘ PHẬN',
    '',
    '',
    'LÃNH ĐẠO ĐƠN VỊ DUYỆT',
    '',
  ]);
  signTitleRow.font = { name: 'Times New Roman', size: 10, bold: true };
  sheet.mergeCells(`A${signTitleRow.number}:B${signTitleRow.number}`);
  sheet.mergeCells(`D${signTitleRow.number}:E${signTitleRow.number}`);
  sheet.mergeCells(`G${signTitleRow.number}:H${signTitleRow.number}`);
  sheet.getCell(`A${signTitleRow.number}`).alignment = { horizontal: 'center' };
  sheet.getCell(`D${signTitleRow.number}`).alignment = { horizontal: 'center' };
  sheet.getCell(`G${signTitleRow.number}`).alignment = { horizontal: 'center' };

  // Add spacing for physical or digital signatures
  sheet.addRow([]);
  sheet.addRow([]);
  sheet.addRow([]);

  return workbook;
}
