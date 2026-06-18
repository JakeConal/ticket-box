## 1. Project Setup & Infrastructure

- [x] 1.1 Initialize Spring Boot 4 project with Gradle Groovy DSL (Java 25, Spring Web, Spring Security, Spring Data JPA, Spring Mail, Spring Scheduling)
- [x] 1.2 Create `docker-compose.yml` with services: `api`, `postgres`, `redis`, `nginx`
- [x] 1.3 Configure `application.yml` with profiles: `dev`, `test`; wire PostgreSQL and Redis connection properties
- [x] 1.4 Add core Gradle dependencies: Resilience4j, jjwt, Apache PDFBox, OpenCSV, Google Gen AI Java SDK (or HTTP client for the Gemini REST API)
- [x] 1.5 Initialize React/Next.js frontend project (`ticketbox-web`) with TypeScript and Tailwind CSS
- [x] 1.6 Initialize React Native project (`ticketbox-checker`) for the mobile check-in app
- [x] 1.7 Set up Nginx reverse proxy config: route `/api/**` → Spring Boot, `/` → Next.js
- [x] 1.8 Add `.env.example` documenting all required environment variables (DB URL, Redis URL, auth/queue JWT secret, QR private/public key material or file paths, VNPAY/MoMo keys, Gemini API key, SMTP config)

## 2. Database Schema & Migrations

- [x] 2.1 Create Flyway (or Liquibase) migration: `users` table (`id`, `email`, `password_hash`, `role`, `created_at`)
- [x] 2.2 Create migration: `refresh_tokens` table (`id`, `user_id`, `token_hash`, `expires_at`, `revoked`)
- [x] 2.3 Create migration: `concerts` table (`id`, `name`, `description`, `venue`, `event_date`, `status` [DRAFT/PUBLISHED/CANCELLED], `event_code` [unique, human-readable code shared with sponsors for CSV import], `artist_bio` [public/published text only], `artist_bio_draft` [organizer-only generated or edited draft], `bio_status` [GENERATING/DRAFT/PUBLISHED/FAILED/REJECTED], `bio_error`, `bio_generation_id` [version token for concurrent regeneration], `artist_pdf_uri`, `seat_map_svg`, `created_by`)
- [x] 2.4 Create migration: `ticket_types` table (`id`, `concert_id`, `name`, `zone`, `price`, `total_quantity`, `remaining_quantity`, `sale_opens_at`, `per_user_limit`)
- [x] 2.5 Create migration: `orders` table (`id`, `user_id`, `concert_id`, `status` [PENDING/PENDING_CONFIRMATION/PAID/FAILED/EXPIRED/REFUND_REQUIRED/REFUNDED], `idempotency_key`, `payment_provider`, `payment_ref`, `refund_reason`, `refunded_at`, `refunded_by`, `created_at`, `paid_at`) — `REFUND_REQUIRED`/`REFUNDED` are refund/audit states and do not mutate inventory
- [x] 2.6 Create migration: `order_items` table (`id`, `order_id`, `ticket_type_id`, `quantity`)
- [x] 2.7 Create migration: `tickets` table (`id`, `order_id`, `ticket_type_id`, `user_id`, `qr_token`) — issued only when an order becomes PAID; QR payload includes ticket zone for offline gate validation; check-in state is derived from `checkins`
- [x] 2.8 Create migration: `checkins` table (`id`, `client_scan_id` UNIQUE, `ticket_id`, `checker_id`, `checked_in_at` [server timestamp], `device_id`, `gate_id`, `lane_id` nullable, `zone`, `scanned_at_device` [nullable device timestamp for offline audit]); unique constraint on `ticket_id`
- [x] 2.9 Create migration: `vip_guests` table (`id`, `concert_id`, `name`, `phone_normalized`, `sponsor`, `zone`, `active` [default true; soft-delete flag for snapshot reconciliation], `entered`, `entered_at`)
- [x] 2.10 Add indexes: `orders(user_id, concert_id)`, `tickets(qr_token)` unique, `order_items(order_id, ticket_type_id)`, `vip_guests(concert_id, phone_normalized)` unique
- [x] 2.11 Create migration: `checkin_conflicts` table (`id`, `client_scan_id`, `ticket_id`, `attempted_by` (checker user_id), `attempted_at` [device scan timestamp], `device_id`, `gate_id`, `lane_id` nullable, `zone`, `winning_checked_in_at`); index on `ticket_id`, `attempted_by`, `gate_id`, `lane_id`, and `client_scan_id`
- [x] 2.12 Create migration: `idempotency_keys` table (`key` UNIQUE, `order_id`, `result` [serialized response], `created_at`) — durable first-writer-wins guard for purchase idempotency (D6); Redis is only the fast-path cache
- [x] 2.13 Create migration: `notification_outbox` table (`id`, `order_id`, `event_type`, `payload`, `status` [PENDING/SENT/FAILED], `attempts`, `created_at`, `sent_at`) — transactional outbox for must-arrive e-ticket delivery (D14); FAILED rows remain retryable/auditable until delivered or manually remediated
- [x] 2.14 Create migration: `import_files` table (`id`, `file_name`, `content_hash` UNIQUE, `processed_at`, `summary`) — content-hash registry so archived CSV files are skipped on future runs
- [x] 2.15 Create migration: `checker_gate_assignments` table (`id`, `concert_id`, `checker_id`, `device_id` nullable, `gate_id`, `lane_id` nullable, `allowed_zones`, `state` [ACTIVE/STANDBY/INACTIVE], `activation_mode` [ONLINE/EMERGENCY_LOCAL], `activated_at`, `created_at`) — scopes checker devices/accounts to gates and zones for offline conflict reduction
- [x] 2.16 Create migration: `checker_assignment_audit` table (`id`, `assignment_id`, `checker_id`, `device_id`, `action` [ASSIGNED/ACTIVATED/STANDBY/DEACTIVATED/EMERGENCY_LOCAL_ACTIVATED], `reason`, `created_at`) — preserves the audit trail for online reassignment and emergency local activation

## 3. Authentication & RBAC

- [x] 3.1 Implement `POST /api/auth/register` — create user with role AUDIENCE, hash password with BCrypt
- [x] 3.2 Implement `POST /api/auth/login` — validate credentials, issue JWT access token (15-min TTL) + refresh token (7-day TTL)
- [x] 3.3 Implement `POST /api/auth/refresh` — validate refresh token, rotate: issue new access + refresh token, invalidate old refresh token
- [x] 3.4 Implement refresh token reuse detection: if a revoked token is presented, revoke all tokens for that user
- [x] 3.5 Configure Spring Security 7 filter chain (lambda DSL): JWT validation filter, role-based `@PreAuthorize` on controllers
- [x] 3.6 Implement `AuthJwtUtil` service for access/refresh/admission tokens: generate signed JWTs (HMAC-SHA256), parse and validate, extract claims (userId, role); keep this separate from the asymmetric `QrTokenService` used for e-ticket QR codes
- [x] 3.7 Add seed script / SQL insert for initial ORGANIZER and CHECKER accounts (used for testing)
- [x] 3.8 Implement ownership enforcement for ORGANIZER actions: beyond the role check, verify server-side that the organizer owns the target concert (edit/cancel concert, ticket types, PDF upload, bio review/publish/reject, revenue/orders); return 403 on cross-organizer access
- [x] 3.9 Write integration tests: register → login → access protected endpoint → refresh → revoke; plus an ORGANIZER receiving 403 when acting on another organizer's concert

## 4. Concert Management

- [x] 4.1 Implement `GET /api/concerts` — paginated listing of PUBLISHED concerts only (DRAFT and CANCELLED excluded); serve from Redis cache (TTL 5 min), fall through to DB on miss
- [x] 4.2 Implement `GET /api/concerts/{id}` — concert detail with ticket types; PUBLISHED concerts only (404 for DRAFT unless requester is the owning ORGANIZER); Redis cache (TTL 60s), active invalidation on update
- [x] 4.3 Implement `POST /api/admin/concerts` — ORGANIZER only; create concert with metadata and SVG seat map; status starts at DRAFT (not publicly visible)
- [x] 4.4 Implement `PUT /api/admin/concerts/{id}` — ORGANIZER only; update concert metadata; invalidate detail + listing cache
- [x] 4.5 Implement `DELETE /api/admin/concerts/{id}` — ORGANIZER only; set concert status CANCELLED; transition existing PAID orders for that concert to REFUND_REQUIRED without restoring inventory; invalidate caches; trigger cancellation notification
- [x] 4.6 Implement `POST /api/admin/concerts/{id}/ticket-types` — ORGANIZER only; create ticket type with per-user limit validation
- [x] 4.7 Implement `PUT /api/admin/concerts/{id}/ticket-types/{typeId}` — ORGANIZER only; update ticket type config; after any committed `remaining_quantity` change, invalidate `tickets:available:{ticketTypeId}`
- [x] 4.8 Implement `GET /api/admin/concerts/{id}/stats` — ORGANIZER only; revenue total, tickets sold per type, check-in count
- [x] 4.9 Implement `POST /api/admin/concerts/{id}/publish` — ORGANIZER only (ownership-checked); validate the concert has at least one ticket type and required metadata, transition DRAFT → PUBLISHED, invalidate listing cache; return 409 if not in DRAFT status
- [x] 4.10 Implement `GET /api/concerts/{id}/availability` — public read endpoint for display-only availability by ticket type/zone; served from the short-TTL availability cache and never used by the purchase write path for correctness
- [x] 4.11 Write unit tests for concert validation (missing fields, past event date rejection, per-user limit > quantity rejection), lifecycle (DRAFT invisible publicly, publish makes it visible, publish of non-DRAFT returns 409), and availability route cache behavior

## 5. Ticket Purchase & Inventory

- [x] 5.1 Implement `POST /api/tickets/purchase` — authenticated users (AUDIENCE; ORGANIZER inherits AUDIENCE permissions); validate sale window, use client-supplied `Idempotency-Key` or generate one server-side when missing, require a valid waiting-queue admission token while a sale-open queue is active (see section 17)
- [x] 5.2 Implement conditional atomic inventory decrement (D3): single statement `UPDATE ticket_types SET remaining_quantity = remaining_quantity - :qty WHERE id = :id AND remaining_quantity >= :qty`; 0 rows affected → HTTP 409 sold out, no order created (no `SELECT FOR UPDATE` lock-read-write sequence); after the committed decrement, invalidate `tickets:available:{ticketTypeId}`
- [x] 5.3 Implement per-user limit gate: Redis `INCRBY` on `limit:{userId}:{concertId}:{ticketTypeId}`; reject if exceeds limit before DB transaction
- [x] 5.4 Implement DB-level guard (D4): inside the purchase transaction, count the user's `order_items` across orders with status IN (PENDING, PENDING_CONFIRMATION, PAID) for that ticket type; reject if count + new quantity exceeds limit (use a per-user advisory lock or serializable isolation on the count)
- [x] 5.5 On successful inventory decrement: create order (status PENDING), create order items, return `{orderId, paymentUrl}`
- [x] 5.6 Implement order expiry job (D3 lifecycle): scheduled job transitions PENDING orders older than 8 minutes and PENDING_CONFIRMATION orders older than 15 minutes to EXPIRED, restores inventory (`remaining_quantity += qty`), invalidates `tickets:available:{ticketTypeId}` after each committed restore, and decrements the Redis per-user limit counter for each released order item; use `SELECT ... FOR UPDATE SKIP LOCKED` to claim stale orders without contending with live purchases
- [x] 5.7 Decrement the Redis per-user limit counter on every order release path (FAILED via gateway callback, EXPIRED via expiry job); after any committed `remaining_quantity += qty` release, invalidate `tickets:available:{ticketTypeId}`; never decrement on PAID — keeps the fast gate consistent with the DB source of truth
- [x] 5.8 Write concurrency integration test: 200 threads simultaneously purchasing the last SVIP ticket — assert exactly 1 succeeds
- [x] 5.9 Write per-user limit concurrency test: same user sends 5 concurrent requests for 1 ticket each (limit = 2) — assert at most 2 succeed

## 6. Payment Gateway Integration

- [x] 6.1 Implement `PaymentGatewayService` interface with `createPaymentUrl(order)` and `verifyCallback(params)` methods
- [x] 6.2 Implement `VNPayGatewayService`: build signed payment URL, verify HMAC-SHA512 callback signature
- [x] 6.3 Implement `MoMoGatewayService`: build signed payment URL, verify RSA/HMAC callback signature
- [x] 6.4 Wrap all gateway calls with Resilience4j `@CircuitBreaker`: 5 failures / 10s → OPEN; 30s cooldown → HALF-OPEN probe; when OPEN, reject purchase before claiming inventory or creating an order
- [x] 6.5 Implement gateway callback endpoints: `GET /api/payments/vnpay/callback` and `POST /api/payments/momo/callback` — unauthenticated but signature-verified; update order status and trigger post-payment flow only after signature validation
- [x] 6.6 Implement two-layer idempotency key store (D6): durable PostgreSQL `idempotency_keys` table is the source of truth — claim the key inside the purchase transaction with `INSERT ... ON CONFLICT DO NOTHING` (first-writer-wins); Redis (24h TTL) is the fast-path cache only; on duplicate, return the stored result without creating a new payment session
- [x] 6.7 Implement PENDING_CONFIRMATION flow: on webhook delivery timeout after the user was redirected, set order status to PENDING_CONFIRMATION (inventory stays reserved); reconcile when the delayed webhook arrives
- [x] 6.8 Implement active gateway reconciliation: before the expiry job transitions a PENDING_CONFIRMATION order to EXPIRED, query the gateway's transaction-status API (VNPAY `querydr` / MoMo transaction query); if the gateway reports success, mark PAID instead of expiring
- [x] 6.9 Handle success webhook (or query result) arriving for an already-EXPIRED order: the seat was released and may be resold, so do NOT re-grant inventory — mark the order REFUND_REQUIRED, alert the organizer/support via the admin dashboard, and notify the user that a refund is owed (refund execution itself is manual/out-of-band, per design Non-Goals)
- [x] 6.10 Implement `GET /api/orders/{id}` — polling endpoint so frontend can check order status after redirect
- [x] 6.11 Implement refund administration endpoints — ORGANIZER only (ownership-scoped): `GET /api/admin/orders?concertId=&status=REFUND_REQUIRED` lists orders awaiting manual refund for owned concerts only; `POST /api/admin/orders/{id}/mark-refunded` transitions REFUND_REQUIRED → REFUNDED for audit after ownership verification (money movement happens manually in the gateway merchant portal, per design Non-Goals)
- [x] 6.12 Write tests: circuit breaker state transitions, OPEN circuit rejects before inventory/order creation, idempotency dedup with Redis down (durable UNIQUE constraint still admits exactly one), timeout-then-webhook reconciliation, gateway-query-before-expiry, success-webhook-after-EXPIRED marks REFUND_REQUIRED without restoring inventory, mark-refunded transition

## 7. QR E-Ticket Generation

- [x] 7.1 Implement `QrTokenService`: generate JWT-signed payload `{ticketId, orderId, userId, concertId, ticketType, zone, issuedAt}` signed with an **asymmetric** key pair (EdDSA/Ed25519 preferred, RS256 acceptable; include `kid` header for key rotation); the private signing key lives server-side only (D8)
- [x] 7.2 On order transition to PAID: generate one QR token per ticket, store in `tickets.qr_token`
- [x] 7.3 Implement `GET /api/orders/{id}/tickets` — return list of tickets with QR token (base64 PNG or SVG) for display in frontend
- [x] 7.4 Expose `GET /api/checker/key-bundle?concertId=X` — CHECKER only; returns the **public** verification key(s) keyed by `kid` + concert validity window; the private signing key is never sent to devices, so a compromised device cannot forge tickets; app stores the bundle in OS secure storage (Keychain on iOS, Keystore on Android)
- [x] 7.5 Write test: verify QR token is unique per ticket, verify tampered token fails validation

## 8. Offline Check-in (Mobile App)

- [x] 8.1 Implement React Native checker app login screen: call `POST /api/auth/login`, store JWT in SecureStorage; on login call `GET /api/checker/key-bundle?concertId=X` and `GET /api/checker/assignments?concertId=X` for assigned concerts; store the public verification key bundle and assignment state in secure local storage; refresh both whenever the device is online
- [x] 8.2 Implement QR scanner screen using `react-native-camera` or `expo-barcode-scanner`
- [x] 8.3 Implement `GET /api/checker/assignments?concertId=X` and assignment storage: return `gate_id`, optional `lane_id`, allowed zones, and assignment `state` (ACTIVE/STANDBY/INACTIVE) for the checker/device; cache it locally so offline scans are scoped to one gate/zone assignment
- [x] 8.4 Implement local SQLite schema: `local_checkins(client_scan_id, ticket_id, scanned_at, checker_id, device_id, gate_id, lane_id, zone, sync_status)` where `sync_status` is one of SYNCED / PENDING_SYNC / CONFLICT; unique constraints on `client_scan_id` and `ticket_id`
- [x] 8.5 On every scan (online and offline): verify the asymmetric JWT signature (EdDSA/RS256) with the public key from secure storage (selected by `kid`); verify QR `concertId` and `zone` match the cached ACTIVE gate assignment; if not, display WRONG GATE and do not write a check-in; check `local_checkins` for existing record on `ticket_id`; if found, display ALREADY USED — do not proceed regardless of network state
- [x] 8.6 Block scanner access offline if no cached assignment exists for the concert, or if the cached assignment is standby/inactive; allow standby devices to scan only after online reassignment or an audited emergency local activation so the device cannot admit tickets without an active gate/zone scope
- [x] 8.7 Implement online check-in (write-local-first, synchronous): generate `client_scan_id`, write record to local SQLite with status PENDING_SYNC including `gate_id`, optional `lane_id`, and `zone`; synchronously call `POST /api/checkins/{ticketId}` with `client_scan_id` and device/gate/lane/zone metadata; on 200 OK or idempotent replay OK update status to SYNCED and display VALID; on 409 update status to CONFLICT and display ALREADY USED; on timeout/network error leave as PENDING_SYNC and display VALID (offline fallback)
- [x] 8.8 Implement offline scan path: generate `client_scan_id`, write record to local SQLite with status PENDING_SYNC including `gate_id`, optional `lane_id`, and `zone`; display VALID immediately with no backend call
- [x] 8.9 Implement sync queue: on reconnect, flush all PENDING_SYNC records via `POST /api/checkins/batch`; include `client_scan_id`, `device_id`, `gate_id`, optional `lane_id`, `zone`, and device scan timestamp; update each record's status to SYNCED or CONFLICT based on per-record backend response; retrying the same `client_scan_id` must not create a conflict
- [x] 8.10 Implement `POST /api/checkins/batch` on backend: for each record, first return OK only when an existing `client_scan_id` belongs to the same ticket (idempotent retry), reject reused `client_scan_id` for a different ticket as an invalid client-id collision, otherwise attempt insert into `checkins`; on `ticket_id` conflict INSERT into `checkin_conflicts` table capturing `client_scan_id`, `ticket_id`, `attempted_by`, `device_id`, `gate_id`, optional `lane_id`, `zone`, `attempted_at`, `winning_checked_in_at`; return per-record result (ok / conflict)
- [x] 8.11 Implement VIP guest lookup screen (online-only): search bar accepting name (fuzzy, diacritic-insensitive) or phone number (exact after normalization); call `GET /api/vip-guests?concertId=&q=`; display list of matches for checker to disambiguate; "Mark as Entered" button calls `POST /api/vip-guests/{id}/enter`; if device offline display "No connection — VIP lookup requires network"
- [x] 8.12 Implement VIP already-admitted and not-found responses in the app: display "ALREADY ADMITTED — Entered at [timestamp]" on 409; display "NOT ON GUEST LIST — Contact organizer" on 404
- [x] 8.13 Implement `GET /api/admin/concerts/{id}/checkin-conflicts` — ORGANIZER only (ownership-scoped); return conflict attempts for one owned concert, including gate/lane, zone, device, checker, and time delta for the admin audit page
- [x] 8.14 Add admin/setup support to create gate/lane assignments and mark one active scanner per lane during offline operation; backup devices should be configured as STANDBY/INACTIVE unless the active scanner fails, with activation recorded online or through a local emergency audit record queued for sync
- [x] 8.15 Implement `POST /api/checker/assignment-audit` — CHECKER only; accepts queued local assignment audit events (including `EMERGENCY_LOCAL_ACTIVATED`) and persists them to `checker_assignment_audit` for organizer review
- [x] 8.16 Write test: scan → offline store → reconnect → sync → verify backend state matches; write test: retry same `client_scan_id` after lost response returns OK without conflict; write test: online scan → device goes offline → re-scan same ticket → assert ALREADY USED from local SQLite; write test: wrong-zone QR is rejected offline without local check-in; write test: missing cached assignment blocks offline scanning; write test: standby scanner blocks until emergency activation and later syncs an audit event; wrong-role access to checker/admin conflict routes returns 403

## 9. Notifications

- [x] 9.1 Define `NotificationChannel` interface: `send(NotificationEvent event)`
- [x] 9.2 Implement `EmailNotificationChannel` using JavaMailSender: purchase confirmation with QR code attachment, 24h reminder, cancellation notice
- [x] 9.3 Implement `InAppNotificationChannel` using Server-Sent Events (SSE) or WebSocket: realtime in-app notification to active sessions
- [x] 9.4 Implement `NotificationService`: iterate all registered `NotificationChannel` beans; catch per-channel exceptions and continue
- [x] 9.5 Implement retry logic for failed email sends: up to 3 retries with exponential backoff; failure does not affect order status
- [x] 9.6 Implement scheduled 24h reminder job: `@Scheduled` cron; query concerts starting in 22–26 hours; dispatch reminder events for all PAID ticket holders
- [x] 9.7 Implement transactional outbox for must-arrive e-ticket delivery (D14): write a `notification_outbox` row in the same DB transaction that marks the order PAID; a scheduled worker polls PENDING/FAILED outbox rows and delivers via the email channel with retry until acknowledged (status SENT), incrementing `attempts` and backing off on failure
- [x] 9.8 Wire notification dispatch into: post-payment flow (e-ticket confirmation via outbox; in-app toast fire-and-forget via Redis Pub/Sub), concert cancellation handler (cancellation notice), 24h reminder job (best-effort Pub/Sub)
- [x] 9.9 Write test: verify email channel failure does not propagate exception to caller; verify reminder job fires for correct concerts; verify an outbox row written before a simulated crash is still delivered by the worker after restart

## 10. Rate Limiting

- [x] 10.1 Implement Redis Lua script for Token Bucket: atomically check and decrement bucket; return remaining tokens and retry-after seconds
- [x] 10.2 Implement `RateLimitFilter` (Spring `OncePerRequestFilter`): extract IP and userId; run Lua script; return 429 with `Retry-After` header on exhaustion
- [x] 10.3 Configure per-endpoint buckets: purchase endpoint (5 req / 10s burst), read endpoints (60 req / min), default (30 req / 10s)
- [x] 10.4 Implement dual-key limiting: check both IP bucket and userId bucket (if authenticated); reject if either is exhausted
- [x] 10.5 Implement fail-open: if Redis is unreachable during rate limit check, allow request and log warning
- [x] 10.6 Write test: 100 concurrent requests from same IP — assert exactly the allowed burst count succeeds, rest receive 429

## 11. Caching

- [ ] 11.1 Implement `ConcertCacheService`: cache-aside for concert listing (key: `concerts:list:page:{n}`, TTL 5 min) and detail (key: `concerts:detail:{id}`, TTL 60s)
- [ ] 11.2 Implement active cache invalidation: on create/update/cancel concert, delete `concerts:list:*` keys and `concerts:detail:{id}`
- [ ] 11.3 Implement ticket availability cache: key `tickets:available:{ticketTypeId}`, TTL 10s; read-through on miss; delete after every committed `remaining_quantity` mutation, including reservation/order creation, release on FAILED/EXPIRED, and admin ticket quantity changes
- [ ] 11.4 Ensure purchase endpoint never reads from cache: inventory enforcement always goes through the PostgreSQL conditional atomic decrement (D3); cached availability is display-only
- [ ] 11.5 Write test: verify cache hit returns same data; verify cache is invalidated within TTL after concert update

## 12. AI Artist Bio

- [ ] 12.1 Implement `POST /api/admin/concerts/{id}/artist-pdf` — ORGANIZER only; validate real PDF by magic bytes (not extension/Content-Type); reject encrypted/protected PDFs; accept ≤ 20MB; store file; stamp an increasing `bio_generation_id`; set `bio_status = GENERATING`; return 202
- [ ] 12.2 Implement `ArtistBioProcessor` `@Async` service: extract text using Apache PDFBox bounded by an extraction timeout and page/char ceiling (defuse decompression-bomb PDFs)
- [ ] 12.3 In `ArtistBioProcessor`: validate extracted text length (≥ 50 chars); on failure, set `bio_status = FAILED` and `bio_error` with the reason
- [ ] 12.4 Implement Gemini API call behind an `ArtistBioGenerator` interface: send cleaned text (capped to stay within free-tier token limits) with a structured prompt that delimits the press-kit text as untrusted data (prompt-injection hardening); parse response
- [ ] 12.5 On successful API response: save generated text to `artist_bio_draft` as `bio_status = DRAFT` (NOT public); write only if the task's `bio_generation_id` is still the latest (discard stale late completions)
- [ ] 12.6 Implement retry: up to 2 retries on Gemini API error (including free-tier 429 quota errors) with exponential backoff; after all fail, set `bio_status = FAILED` and `bio_error`
- [ ] 12.7 Implement review endpoints — ORGANIZER only (ownership-scoped): `GET /api/admin/concerts/{id}/artist-bio` for draft/status/error review, `PUT /api/admin/concerts/{id}/artist-bio` to edit draft text, `POST /api/admin/concerts/{id}/artist-bio/publish` → copy `artist_bio_draft` into public `artist_bio`, clear draft/error fields, set `bio_status = PUBLISHED`, and invalidate concert detail cache, `POST /api/admin/concerts/{id}/artist-bio/reject` → clear draft, set `bio_status = REJECTED`, and keep any previous public `artist_bio`
- [ ] 12.8 Implement a scheduled reaper: transition any `GENERATING` row older than the threshold (e.g. 5 min) out of GENERATING (re-queue or FAILED) so restarts don't strand bios
- [ ] 12.9 Rate-limit regenerations per concert/organizer so repeated uploads cannot drain the free-tier quota
- [ ] 12.10 Expose only public `artist_bio` in `GET /api/concerts/{id}`; if no public bio exists, return placeholder/status data without exposing `artist_bio_draft` or `bio_error`. `GET /api/admin/concerts/{id}/artist-bio` exposes DRAFT/FAILED/REJECTED/GENERATING details and `bio_error` for organizer review
- [ ] 12.11 Write tests: mock the Gemini API; verify success sets DRAFT (not public); image-only PDF sets FAILED with `bio_error`; 429 sets FAILED "AI service busy"; non-PDF-by-magic-bytes rejected; stale late completion is discarded; reaper clears a stuck GENERATING row; drafts/errors are never exposed publicly; a previously published `artist_bio` remains visible during regeneration

## 13. VIP Guest CSV Import

- [ ] 13.1 Implement `VipGuestImportJob` `@Scheduled` at `0 0 2 * * *` (02:00 daily): scan configured import directory for CSV files
- [ ] 13.2 Implement CSV parser using OpenCSV: case-insensitive header mapping, trim whitespace, skip blank rows
- [ ] 13.3 Implement phone normalizer (strip spaces/dashes, resolve `0` ↔ `+84` prefix to one canonical form) with unit tests — it anchors upsert idempotency (D12); rows missing the phone column are skipped with a logged reason
- [ ] 13.4 Implement per-row `event_code → concert_id` resolution against the `concerts` table: unresolvable rows are skipped with a logged reason; if every row in the file is unresolvable, quarantine the whole file to `error/` with an admin alert — never guess a concert
- [ ] 13.5 Implement idempotent field-level upsert: `INSERT INTO vip_guests ... ON CONFLICT (concert_id, phone_normalized) DO UPDATE SET` sponsor-supplied columns only (name, sponsor, zone, active); never touch system-owned `entered` / `entered_at`
- [ ] 13.6 Implement snapshot reconciliation scoped to concerts present in the file: after upserting, set `active = false` (soft delete) on `vip_guests` rows absent from the file, only for the concerts the file actually contains — never deactivate guests of concerts the file does not mention
- [ ] 13.7 Implement per-row error handling: catch parse/validation exceptions per row; log row number and reason; continue to next row
- [ ] 13.8 Implement file-level error handling: if CSV is entirely unparseable, move to `error/` archive dir; log alert
- [ ] 13.9 Implement file lifecycle: move successfully processed files to `processed/` and record their content hash in `import_files`; skip already-seen hashes on future runs
- [ ] 13.10 Implement `POST /api/admin/vip-imports` — ORGANIZER only; manual on-demand import running the same pipeline (resolution, upsert, reconciliation, archiving) for files that arrive after the nightly window; rows resolving to concerts not owned by the requester are rejected/skipped with an audit reason
- [ ] 13.11 Log import summary after each run: total rows processed, inserted, updated, deactivated, skipped, errored
- [ ] 13.12 Implement `GET /api/vip-guests` — CHECKER only; search by `concertId` + `q` (phone exact match after normalization, or name fuzzy match using `unaccent()` + `ilike`); only `active = true` guests are admissible; return list of matches with `id`, `name`, `phone_normalized` (partial), `entered`, `entered_at`
- [ ] 13.13 Implement `POST /api/vip-guests/{id}/enter` — CHECKER only; conditional `UPDATE vip_guests SET entered=true, entered_at=now() WHERE id=? AND entered=false AND active=true`; return 409 if 0 rows affected (already admitted or deactivated)
- [ ] 13.14 Write tests: process same CSV twice — assert no duplicates; bad rows skipped, valid rows inserted; phone format variants resolve to one guest; guest absent from a later file is deactivated only within concerts present in that file; re-import does not reset `entered`; unknown `event_code` file is quarantined

## 14. Admin Web Dashboard (Frontend)

- [ ] 14.1 Implement admin login page: call auth API, store JWT in httpOnly cookie or memory, redirect to dashboard
- [ ] 14.2 Implement concert list page (ORGANIZER): table of concerts with status badges (DRAFT/PUBLISHED/CANCELLED), create/edit/publish/cancel actions
- [ ] 14.3 Implement concert create/edit form: fields for name, date, venue, description, SVG seat map upload, ticket types configuration
- [ ] 14.4 Implement ticket type configuration widget: add/remove rows for zone, price, quantity, sale open time, per-user limit
- [ ] 14.5 Implement PDF upload for AI bio: drag-and-drop or file picker; poll `bio_status`; when DRAFT, show review UI to edit the text and publish or reject (the bio is never auto-published)
- [ ] 14.6 Implement concert stats page: revenue chart, tickets sold per zone, check-in count
- [ ] 14.7 Implement route guards: redirect non-ORGANIZER users away from `/admin/**`
- [ ] 14.8 Implement check-in conflicts page (ORGANIZER): table of `checkin_conflicts` for a given concert showing ticket ID, attempting checker, gate/lane, zone, device ID, attempted timestamp, time delta from winning check-in — enables post-event fraud investigation
- [ ] 14.9 Implement refunds page (ORGANIZER): table of REFUND_REQUIRED orders for their concerts (order ID, buyer, amount, gateway ref, why it requires refund); "Mark as refunded" action calling `POST /api/admin/orders/{id}/mark-refunded` after the manual gateway refund is done

## 15. Public Web Frontend (Next.js)

- [ ] 15.1 Implement concert listing page (`/`): paginated cards with name, date, venue, thumbnail, zone availability badges
- [ ] 15.2 Implement concert detail page (`/concerts/[id]`): artist info with bio, venue map, interactive SVG seat map with zone availability, buy buttons per zone
- [ ] 15.3 Implement purchase flow: zone selection → quantity picker → payment provider selection → redirect to gateway URL
- [ ] 15.4 Implement order confirmation page (`/orders/[id]`): poll order status; on PAID, display QR e-ticket(s) with download option
- [ ] 15.5 Implement my tickets page (`/me/tickets`): list all purchased tickets with QR codes
- [ ] 15.6 Implement near-real-time availability update: poll `GET /api/concerts/{id}/availability` every 10s on concert detail page; update zone counts
- [ ] 15.7 Implement auth pages: register, login, logout; store JWT in httpOnly cookie; handle 401 redirects

## 16. Seed Data

- [ ] 16.1 Create SQL seed script: 4 sample concerts — `Anh Trai Say Hi`, `Anh Trai Vượt Ngàn Chông Gai`, `Em Xinh Say Hi`, `Chị Đẹp Đạp Gió Rẽ Sóng` — each with status PUBLISHED (visible out of the box) and a human-readable `event_code` (e.g. `ATSH-HCM-2026`) matching the sample VIP CSV
- [ ] 16.2 Add ticket types for each concert: GA (500k VND, 5000 qty, limit 4), CAT2 (800k, 2000 qty, limit 4), CAT1 (1.2M, 1000 qty, limit 4), VIP (2M, 500 qty, limit 2), SVIP (3.5M, 200 qty, limit 2)
- [ ] 16.3 Add sample SVG seat map for each concert (zone-colored SVG with GA, SVIP, VIP, CAT1, CAT2 regions)
- [ ] 16.4 Add seed users: 1 ORGANIZER (`organizer@ticketbox.vn`), 2 CHECKERs (`checker1@ticketbox.vn`, `checker2@ticketbox.vn`), 3 AUDIENCE users
- [ ] 16.5 Add sample VIP guest CSV file in `import-samples/` for testing the nightly import flow
- [ ] 16.6 Seed each concert with a pre-written `artist_bio` and `bio_status = PUBLISHED` so concert pages show a bio out of the box — a live free-tier (Gemini) quota wall on demo day must not leave every page on the "coming soon" placeholder; the upload→draft→publish flow is still exercised separately on demand

## 17. Sale-Open Waiting Queue (D16)

- [ ] 17.1 Implement queue store: Redis sorted set per concert (`queue:{concertId}`) scored by enqueue timestamp (FIFO); queue is activated for a configurable window around each ticket type's `sale_opens_at`
- [ ] 17.2 Implement `POST /api/queue/{concertId}/enter` — authenticated; add user to the ZSET (idempotent re-entry returns existing position), return queue position
- [ ] 17.3 Implement `GET /api/queue/{concertId}/status` — polling endpoint returning current position and estimated wait; when admitted, returns the signed admission token
- [ ] 17.4 Implement admission job: scheduled task pops N users/sec (configurable, tied to purchase-path capacity) from the head of the ZSET and issues each a signed, short-lived (2–3 min) admission token (JWT bound to userId + concertId)
- [ ] 17.5 Enforce admission token on `POST /api/tickets/purchase` while a queue is active for the concert: missing/expired/invalid token → reject and redirect back to the queue
- [ ] 17.6 Implement fail-safe behavior on Redis outage during an active sale-open window: close the gate (reject new entrants to the purchase path) rather than admitting an unmetered herd; log and alert
- [ ] 17.7 Implement frontend waiting room page: poll queue status, show "#N in line, est. wait", auto-advance to the purchase page when the admission token is granted
- [ ] 17.8 Write tests: FIFO ordering (user enqueued earlier is admitted earlier), purchase without valid token rejected, expired token rejected, admission rate bounds concurrent purchase sessions

## 18. Testing, Documentation & Final Wiring

- [ ] 18.1 Write `README.md`: prerequisites, how to run with `docker compose up`, seed data steps, test accounts and passwords, API overview
- [ ] 18.2 Define the test profile and fixtures: isolated PostgreSQL/Redis test containers (or Docker Compose test services), deterministic gateway/Gemini/SMTP mocks, fixed test clock, seeded ORGANIZER/CHECKER/AUDIENCE accounts, and repeatable sample concerts/VIP CSV files
- [ ] 18.3 Add API contract tests for every public and protected route in the API baseline: assert method/path, request validation, response shape, status codes, idempotency headers, and no draft/error-only fields leak from public responses (`artist_bio_draft`, `bio_error`, unowned DRAFT concerts)
- [ ] 18.4 Add RBAC/ownership matrix tests: anonymous access to public concert reads succeeds; AUDIENCE/ORGANIZER can queue and purchase; CHECKER can only use checker/VIP gate APIs plus public reads; wrong-role protected calls return 403; unauthenticated protected calls return 401; cross-organizer admin/order/refund/bio/import access returns 403
- [ ] 18.5 Add database invariant tests after migrations: required unique constraints exist (`tickets.qr_token`, `checkins.client_scan_id`, `checkins.ticket_id`, `vip_guests(concert_id, phone_normalized)`, `idempotency_keys.key`); enum/status values match specs; refund/audit, lane, AI bio draft/error, PDF URI, and checker assignment audit columns are present
- [ ] 18.6 Write end-to-end smoke test script: register/login → browse concerts → enter queue when active → purchase → gateway callback marks PAID → receive QR → checker downloads key bundle/assignment → check in ticket → verify duplicate scan becomes conflict
- [ ] 18.7 Add payment/order lifecycle integration tests covering PENDING expiry, PENDING_CONFIRMATION reconciliation, EXPIRED late-success → REFUND_REQUIRED, manual mark-refunded, inventory restore/no-restore rules, Redis per-user counter release, and notification outbox creation on PAID
- [ ] 18.8 Add offline-checkin sync integration tests covering online write-local-first, offline scan replay by `client_scan_id`, same-device duplicate blocking, wrong gate/zone rejection without local write, standby scanner blocking, emergency activation audit row creation and sync, batch conflict recording with lane metadata, idempotent retry without false conflict, and admin conflict visibility scoped by organizer
- [ ] 18.9 Add AI bio contract tests covering PDF validation, DRAFT stored only in `artist_bio_draft`, publish copy to public `artist_bio`, reject keeps any previous public bio, FAILED stores `bio_error`, public concert detail never exposes draft/error fields, and cache invalidates on publish/edit
- [ ] 18.10 Add VIP CSV end-to-end import tests covering unknown `event_code`, unowned manual-import rows, per-row partial failure, duplicate-in-file handling, full-snapshot deactivation scoped only to represented concerts, content-hash skip, processed/error archive movement, and `entered` preservation
- [ ] 18.11 Verify Docker Compose `up` from a clean state reaches healthy status for all services, runs migrations, loads seed data, and exposes the web app and `/api/**` through Nginx only
- [ ] 18.12 Verify seed data loads correctly: all 4 concerts visible on listing page with correct event codes, ticket types, prices, quantities, published bios, sample accounts, checker gate assignments, and sample VIP CSV
- [ ] 18.13 Run load simulation (e.g., k6 or JMeter): 500 concurrent purchase requests for 200 SVIP tickets with the queue enabled — assert no oversell, at most per-user limit tickets per user, bounded DB connection pool usage, valid queue FIFO ordering, and acceptable error/status distribution
- [ ] 18.14 Add CI wiring for the final verification suite: backend unit tests, backend integration tests with PostgreSQL/Redis, frontend lint/build, OpenSpec validation (`openspec validate ticketbox-platform --strict`), and the smoke script; document the exact commands in `README.md`
