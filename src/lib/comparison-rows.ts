/**
 * Chọn các dòng hiển thị trong khối "So sánh kết quả thu NSNN".
 *
 * Nghiệp vụ hiện tại: chỉ giữ dòng Thu NSNN; ẩn Mặt hàng phân bón và các
 * chỉ tiêu phụ khác khỏi khối so sánh. Bảng "Số liệu giao ban" phía trên
 * vẫn hiển thị đầy đủ.
 */
export function selectRevenueComparisonRows<
  T extends { code: string; name: string },
>(rows: T[]): T[] {
  const taxRows = rows.filter(
    (row) =>
      row.code.toUpperCase() === "THU_NSNN" ||
      row.name.toLocaleLowerCase("vi").includes("thu nsnn")
  );
  if (taxRows.length > 0) return taxRows;

  // Fallback an toàn: nếu chưa có mã/tên Thu NSNN, chỉ ẩn phân bón.
  return rows.filter(
    (row) =>
      row.code.toUpperCase() !== "PHAN_BON" &&
      !row.name.toLocaleLowerCase("vi").includes("phân bón")
  );
}
