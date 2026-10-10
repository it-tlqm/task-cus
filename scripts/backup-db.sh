#!/usr/bin/env bash
# ==============================================================================
# TALUNG-CUS-WORK — KỊCH BẢN TỰ ĐỘNG SAO LƯU CƠ SỞ DỮ LIỆU POSTGRESQL (CRON)
# Tự động nén gzip, kiểm tra tính toàn vẹn và dọn dẹp các bản ghi cũ quá 30 ngày
# ==============================================================================

set -euo pipefail

# Thư mục lưu trữ backup trên máy chủ
BACKUP_DIR="${BACKUP_DIR:-/opt/talung/backups}"
CONTAINER_NAME="${CONTAINER_NAME:-talung_db}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-talung_cus_work}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/talung_${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "=================================================================="
echo ">> [$(date +"%Y-%m-%d %H:%M:%S")] Bắt đầu tiến trình sao lưu CSDL Hải quan Tà Lùng..."
echo ">> Container mục tiêu: ${CONTAINER_NAME} | Database: ${DB_NAME}"

# Tạo thư mục lưu trữ nếu chưa tồn tại
mkdir -p "${BACKUP_DIR}"

# Kiểm tra container đang chạy
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo ">> [LỖI] Container ${CONTAINER_NAME} không hoạt động! Hủy tiến trình." >&2
    exit 1
fi

# Thực thi pg_dump và nén trực tiếp bằng gzip
docker exec -t "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists | gzip -9 > "${BACKUP_FILE}"

# Kiểm tra kích thước file sao lưu
FILE_SIZE=$(stat -c%s "${BACKUP_FILE}" 2>/dev/null || stat -f%z "${BACKUP_FILE}" 2>/dev/null || echo 0)

if [ "${FILE_SIZE}" -gt 1024 ]; then
    echo ">> [THÀNH CÔNG] Bản sao lưu đã tạo: ${BACKUP_FILE} (Dung lượng: ${FILE_SIZE} bytes)"
else
    echo ">> [CẢNH BÁO] File sao lưu có kích thước bất thường (${FILE_SIZE} bytes)! Kiểm tra lại CSDL." >&2
    exit 1
fi

# Dọn dẹp các bản sao lưu cũ hơn RETENTION_DAYS ngày
echo ">> Tiến hành dọn dẹp các bản sao lưu cũ hơn ${RETENTION_DAYS} ngày..."
DELETED_COUNT=$(find "${BACKUP_DIR}" -name "talung_${DB_NAME}_*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -exec rm -f {} + -print | wc -l || true)
echo ">> Đã giải phóng ${DELETED_COUNT} bản sao lưu hết hạn lưu trữ."

echo ">> [$(date +"%Y-%m-%d %H:%M:%S")] Hoàn tất quy trình sao lưu an toàn."
echo "=================================================================="
