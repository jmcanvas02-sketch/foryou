# Reliable Order Intake

Mục tiêu của lớp này là giữ nguyên UX checkout hiện tại nhưng tránh thất lạc yêu cầu đặt hàng khi mạng, Cloudflare hoặc Supabase tạm thời lỗi.

## Binding bắt buộc trên Cloudflare Pages

- D1: `ORDER_INTAKE_DB`
- Queue producer: `ORDER_INTAKE_QUEUE`
- Secret có sẵn: `SUPABASE_SERVER_KEY`
- Biến có sẵn: `SUPABASE_URL`

## Tài nguyên

- D1 database: `foryou-order-intake`
- Queue: `foryou-order-intake`
- Dead Letter Queue: `foryou-order-intake-dlq`
- Consumer Worker: `foryou-order-intake-consumer`

## Nguyên tắc

1. Pages Function lưu payload vào D1 trước.
2. Pages Function gọi RPC idempotent của Supabase như luồng cũ.
3. Nếu Supabase lỗi tạm thời, yêu cầu được đưa vào Queue.
4. Consumer Worker và Cron tiếp tục thử lại.
5. `client_request_id` giữ nguyên nên retry không tạo đơn trùng.
6. Giá, tồn kho, biến thể và mã giảm giá vẫn do RPC Supabase xác thực.
7. Frontend vẫn chỉ chuyển sang trang thành công khi nhận được mã đơn như hiện tại.

Không đưa `SUPABASE_SERVER_KEY` vào source hoặc file cấu hình tracked.
