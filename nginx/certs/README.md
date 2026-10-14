# Hướng Dẫn Cài Đặt Chứng Chỉ SSL/TLS (HTTPS)

Khi đơn vị kích hoạt giao thức HTTPS trên mạng nội bộ hoặc internet:
1. Đặt file chứng chỉ SSL tại thư mục này với tên:
   - `talung.crt`: Chứng chỉ công khai (Certificate).
   - `talung.key`: Khóa bí mật (Private Key).
2. Trong `nginx/conf.d/talung.conf`, bổ sung khối cấu hình:
   ```nginx
   listen 443 ssl http2;
   ssl_certificate /etc/nginx/certs/talung.crt;
   ssl_certificate_key /etc/nginx/certs/talung.key;
   ssl_protocols TLSv1.2 TLSv1.3;
   ssl_ciphers HIGH:!aNULL:!MD5;
   ```
3. Khởi động lại dịch vụ:
   ```bash
   docker compose -f docker-compose.prod.yml restart proxy
   ```
