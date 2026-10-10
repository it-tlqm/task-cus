#!/usr/bin/env bash
# ==============================================================================
# TALUNG-CUS-WORK — KỊCH BẢN PHỤC HỒI CƠ SỞ DỮ LIỆU TỪ BẢN SAO LƯU
# Khôi phục an toàn cơ sở dữ liệu PostgreSQL từ tệp .sql.gz hoặc .sql
# ==============================================================================

set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-talung_db}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-talung_cus_work}"

if [ "$#" -lt 1 ]; then
    echo "Sử dụng: $0 <duong-dan-file-backup.sql.gz>"
    echo "Ví dụ: $0 /opt/talung/backups/talung_talung_cus_work_20261010_000000.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo ">> [LỖI] Không tìm thấy tệp sao lưu: ${BACKUP_FILE}" >&2
    exit 1
fi

echo "=================================================================="
echo ">> CẢNH BÁO QUAN TRỌNG: Thao tác này sẽ ghi đè toàn bộ dữ liệu hiện tại của"
echo ">> Database '${DB_NAME}' trên container '${CONTAINER_NAME}'!"
echo ">> Tệp khôi phục: ${BACKUP_FILE}"
echo "=================================================================="
read -r -p "Bạn có chắc chắn muốn tiếp tục khôi phục? (nhập 'DONG_Y' để xác nhận): " CONFIRM

if [ "${CONFIRM}" != "DONG_Y" ]; then
    echo ">> Thao tác bị hủy bởi người dùng."
    exit 0
fi

echo ">> [$(date +"%Y-%m-%d %H:%M:%S")] Đang tiến hành khôi phục cơ sở dữ liệu..."

if [[ "${BACKUP_FILE}" == *.gz ]]; then
    gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}"
else
    docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" < "${BACKUP_FILE}"
fi

echo ">> [THÀNH CÔNG] Đã khôi phục hoàn tất cơ sở dữ liệu từ ${BACKUP_FILE}!"
echo "=================================================================="
