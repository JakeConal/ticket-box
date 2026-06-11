# TicketBox — Blueprint (Phần 1)

Thư mục này là **tài liệu nộp cho Phần 1 — Blueprint** của đồ án. Nội dung chi tiết kỹ thuật (ADR đầy đủ, đặc tả từng tính năng, danh sách task cài đặt) được quản lý theo quy trình spec-driven trong `openspec/changes/ticketbox-platform/`; thư mục này tổng hợp và trình bày theo đúng cấu trúc yêu cầu của đề bài.

## Bản đồ deliverable

| Yêu cầu đề bài | Tài liệu |
| :--- | :--- |
| 1. Tài liệu thiết kế hệ thống | [`design.md`](design.md) — kiến trúc tổng thể, giao tiếp giữa các thành phần, phân tích ảnh hưởng khi từng thành phần gặp sự cố |
| 2. C4 Diagram (Level 1 & 2) | [`design.md`](design.md) §2 + file nguồn [`diagrams/system-context.drawio`](diagrams/system-context.drawio), [`diagrams/c4-container.drawio`](diagrams/c4-container.drawio) |
| 3. High-Level Architecture Diagram | [`design.md`](design.md) §3 + [`diagrams/high-level.drawio`](diagrams/high-level.drawio) |
| 4. Thiết kế cơ sở dữ liệu | [`design.md`](design.md) §4 — lựa chọn database, lý do, ERD và schema các entity chính |
| 5. Luồng nghiệp vụ quan trọng (≥ 2) | [`design.md`](design.md) §5 — luồng mua vé end-to-end và luồng soát vé offline + đồng bộ |
| 6. Thiết kế kiểm soát truy cập | [`design.md`](design.md) §6 — RBAC ba vai trò + ownership check, điểm kiểm tra tại API / admin / mobile |
| 7. Cơ chế bảo vệ hệ thống | [`design.md`](design.md) §7 — waiting queue + rate limiting, circuit breaker, idempotency key, caching |
| Proposal (vấn đề, mục tiêu, phạm vi) | [`proposal.md`](proposal.md) |
| Đặc tả chi tiết từng tính năng (specs) | [`../openspec/changes/ticketbox-platform/specs/`](../openspec/changes/ticketbox-platform/specs/) — 10 capability với kịch bản chính / kịch bản lỗi / ràng buộc |
| ADR đầy đủ (16 quyết định D1–D16) | [`../openspec/changes/ticketbox-platform/design.md`](../openspec/changes/ticketbox-platform/design.md) |
| Kế hoạch cài đặt (Phần 2) | [`../openspec/changes/ticketbox-platform/tasks.md`](../openspec/changes/ticketbox-platform/tasks.md) |

## Sơ đồ

File `.drawio` trong [`diagrams/`](diagrams/) là nguồn chuẩn (mở bằng [draw.io](https://app.diagrams.net/) hoặc extension VS Code). Các sơ đồ Mermaid nhúng trong `design.md` render trực tiếp trên GitHub.
