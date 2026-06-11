# TicketBox — Project Proposal

## Vấn đề

Các concert lớn tại Việt Nam (Anh Trai Say Hi, Anh Trai Vượt Ngàn Chông Gai, Em Xinh Say Hi, Chị Đẹp Đạp Gió Rẽ Sóng) hiện bán vé qua các kênh rời rạc — Zalo OA, Google Form, chuyển khoản thủ công. Hậu quả đã xảy ra lặp lại ở nhiều sự kiện:

- **Website sập trong vài phút đầu mở bán** vì hàng chục nghìn người truy cập đồng thời; hạ tầng không có cơ chế hấp thụ tải đột biến.
- **Khán giả bị trừ tiền nhưng không nhận được vé** khi cổng thanh toán timeout giữa chừng và hệ thống không có cơ chế đối soát.
- **Scalper dùng bot vét vé trong vài giây** rồi bán lại giá gấp nhiều lần; các kênh thủ công không có khả năng phân biệt người thật và bot, không đảm bảo công bằng theo thứ tự đến trước.
- **Gian lận tại cổng**: vé giả, vé dùng hai lần — không thể kiểm soát khi soát vé bằng danh sách giấy hoặc ảnh chụp màn hình.

## Mục tiêu

Xây dựng nền tảng TicketBox số hóa toàn bộ vòng đời bán vé, với các mục tiêu định lượng:

1. **Chịu được 80.000 người truy cập trong 5 phút đầu mở bán** (70% dồn vào phút đầu) mà không sập và không bán quá số vé — kể cả loại vé chỉ có 200 chỗ (SVIP).
2. **Không bao giờ trừ tiền hai lần và không bao giờ bán một ghế cho hai người**, kể cả khi client retry, mạng đứt giữa chừng, hoặc cổng thanh toán (VNPAY/MoMo) gặp sự cố kéo dài.
3. **Công bằng cho khán giả thật**: thứ tự được mua phản ánh thứ tự đến (FIFO waiting queue), bot và client spam bị chặn bởi rate limiting.
4. **Soát vé hoạt động cả khi mất mạng** tại sân vận động; dữ liệu không mất khi kết nối lại; một vé không được vào cổng hai lần (per-device luôn đúng, toàn cục hội tụ khi sync).
5. **Giới hạn vé per-user được enforce chính xác dưới tải cao** — không lách được bằng nhiều đơn nhỏ hoặc nhiều request đồng thời.
6. Trang danh sách / chi tiết concert phục vụ **hàng nghìn request/giây** qua cache mà số vé còn lại vẫn phản ánh gần đúng thực tế (trễ tối đa 10 giây).

## Người dùng và nhu cầu

| Nhóm | Nhu cầu chính | Điều quan trọng nhất |
| :--- | :--- | :--- |
| **Khán giả** (AUDIENCE) | Xem concert, sơ đồ chỗ ngồi SVG theo khu, số vé còn lại; mua vé qua VNPAY/MoMo; nhận e-ticket QR qua app + email; được nhắc trước 24h | Công bằng khi mở bán; không bị trừ tiền oan; nhận vé chắc chắn |
| **Ban tổ chức** (ORGANIZER) | Tạo/sửa/hủy concert; cấu hình loại vé (giá, số lượng, thời điểm mở bán, giới hạn per-user); xem doanh thu; upload press kit PDF để AI sinh bio; duyệt bio trước khi công khai; quản lý refund và conflict soát vé | Không oversell; số liệu doanh thu đúng; kiểm soát nội dung công khai |
| **Nhân sự soát vé** (CHECKER) | Quét QR tại cổng bằng mobile app, kể cả khi mất sóng; tra cứu khách mời VIP | Quyết định pass/fail tức thì; không cho vé vào hai lần |
| **Nhãn hàng tài trợ** (gián tiếp) | Gửi danh sách khách mời VIP qua file CSV hàng đêm (không có API) | Danh sách tại cổng đúng với file mới nhất đã gửi |

## Phạm vi

**Thuộc phạm vi:**
- Web app khán giả (React/Next.js), admin dashboard, mobile app soát vé (React Native), backend API (Java 25 / Spring Boot 4), PostgreSQL + Redis, chạy bằng Docker Compose.
- Toàn bộ tính năng nghiệp vụ: xem/mua vé, thanh toán VNPAY/MoMo (sandbox), thông báo email + in-app, quản trị RBAC, soát vé offline, AI artist bio (Google Gemini free tier), nhập CSV khách mời VIP.
- Toàn bộ cơ chế bảo vệ: FIFO waiting queue, Token Bucket rate limiting, Circuit Breaker, Idempotency Key (durable), cache-aside Redis.
- Seed data 4 concert mẫu đầy đủ loại vé, giá, sơ đồ chỗ ngồi.

**KHÔNG thuộc phạm vi:**
- Credentials production của VNPAY/MoMo (dùng sandbox/mock).
- Hoàn tiền tự động qua API gateway — đơn cần hoàn tiền được đánh dấu `REFUND_REQUIRED` và xử lý thủ công qua merchant portal, có audit trail.
- Auto-scaling / Kubernetes (chỉ Docker Compose); chọn ghế từng seat (chỉ theo khu GA/SVIP/VIP/CAT1/CAT2); chợ vé thứ cấp; i18n ngoài Việt/Anh.

## Rủi ro và ràng buộc

| Rủi ro / ràng buộc | Bản chất | Hướng xử lý (chi tiết trong design.md) |
| :--- | :--- | :--- |
| Tranh chấp vé (200 SVIP, hàng chục nghìn người mua) | Race condition trên một dòng inventory | Atomic conditional UPDATE + reservation lifecycle có expiry |
| Tải đột biến 80k/5 phút | Thundering herd đè sập API và DB | Waiting queue FIFO + Token Bucket + cache + virtual threads |
| Cổng thanh toán không ổn định | Timeout hai loại: trước khi user trả tiền và sau khi đã trả | Circuit Breaker; PENDING_CONFIRMATION + webhook + chủ động query gateway; idempotency key durable |
| Soát vé offline | Mất mạng tại sân vận động, nhiều thiết bị cùng quét | SQLite local-first + batch sync idempotent; chấp nhận ranh giới "per-device luôn, toàn cục khi sync" |
| Tích hợp một chiều CSV | Không có API, chỉ có file gửi theo lịch; file lỗi, dữ liệu trùng | Upsert idempotent theo (concert, SĐT chuẩn hóa) + snapshot reconciliation theo event_code + quarantine file lỗi |
| Nội dung AI công khai về người thật | Prompt injection từ press kit, hallucination | Bio chỉ là DRAFT, bắt buộc ORGANIZER duyệt trước khi công khai |
| Redis là điểm tựa của nhiều cơ chế | Mất Redis ảnh hưởng queue, rate limit, cache, idempotency fast-path | Guard bền trong PostgreSQL giữ tính đúng; queue fail-closed; rate limit fail-open có log |
