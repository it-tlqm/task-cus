# ==============================================================================
# TALUNG-CUS-WORK — KỊCH BẢN POWERSHELL SAO LƯU CƠ SỞ DỮ LIỆU POSTGRESQL (WINDOWS)
# ==============================================================================

param (
    [string]$BackupDir = "D:\talung-backups",
    [string]$ContainerName = "talung_db",
    [string]$DbUser = "postgres",
    [string]$DbName = "talung_cus_work",
    [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupDir "talung_${DbName}_${Timestamp}.sql"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ">> [$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Bắt đầu sao lưu CSDL Hải quan Tà Lùng..." -ForegroundColor Green
Write-Host ">> Container: $ContainerName | Database: $DbName"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

try {
    # Thực hiện pg_dump từ docker container
    docker exec $ContainerName pg_dump -U $DbUser -d $DbName --clean --if-exists > $BackupFile
    
    $fileInfo = Get-Item $BackupFile
    if ($fileInfo.Length -gt 1024) {
        Write-Host ">> [THÀNH CÔNG] File sao lưu đã tạo: $BackupFile (Dung lượng: $($fileInfo.Length) bytes)" -ForegroundColor Green
    } else {
        Write-Warning ">> File sao lưu có kích thước quá nhỏ ($($fileInfo.Length) bytes). Vui lòng kiểm tra lại!"
    }

    # Dọn dẹp bản sao lưu cũ
    $limitDate = (Get-Date).AddDays(-$RetentionDays)
    $oldFiles = Get-ChildItem -Path $BackupDir -Filter "talung_${DbName}_*.sql" | Where-Object { $_.LastWriteTime -lt $limitDate }
    foreach ($file in $oldFiles) {
        Remove-Item $file.FullName -Force
        Write-Host ">> Đã xóa file sao lưu hết hạn: $($file.Name)" -ForegroundColor Yellow
    }
} catch {
    Write-Error ">> Lỗi trong quá trình sao lưu: $_"
}

Write-Host ">> [$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Hoàn tất sao lưu." -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
