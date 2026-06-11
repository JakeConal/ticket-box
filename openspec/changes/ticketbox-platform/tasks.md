## 1. Project Setup & Infrastructure

- [ ] 1.1 Initialize Spring Boot 4 project with Gradle Groovy DSL (Java 25, Spring Web, Spring Security, Spring Data JPA, Spring Mail, Spring Scheduling)
- [ ] 1.2 Create `docker-compose.yml` with services: `api`, `postgres`, `redis`, `nginx`
- [ ] 1.3 Configure `application.yml` with profiles: `dev`, `test`; wire PostgreSQL and Redis connection properties
- [ ] 1.4 Add core Gradle dependencies: Resilience4j, jjwt, Apache PDFBox, OpenCSV, Google Gen AI Java SDK (or HTTP client for the Gemini REST API)
- [ ] 1.5 Initialize React/Next.js frontend project (`ticketbox-web`) with TypeScript and Tailwind CSS
- [ ] 1.6 Initialize React Native project (`ticketbox-checker`) for the mobile check-in app
- [ ] 1.7 Set up Nginx reverse proxy config: route `/api/**` → Spring Boot, `/` → Next.js
- [ ] 1.8 Add `.env.example` documenting all required environment variables (DB URL, Redis URL, JWT secret, VNPAY/MoMo keys, Gemini API key, SMTP config)

## 2. Database Schema & Migrations

- [ ] 2.1 Create Flyway (or Liquibase) migration: `users` table (`id`, `email`, `password_hash`, `role`, `created_at`)
- [ ] 2.2 Create migration: `refresh_tokens` table (`id`, `user_id`, `token_hash`, `expires_at`, `revoked`)
- [ ] 2.3 Create migration: `concerts` table (`id`, `name`, `description`, `venue`, `event_date`, `status`, `artist_bio`, `bio_status` [GENERATING/DRAFT/PUBLISHED/FAILED], `bio_generation_id` [version token for concurrent regeneration], `seat_map_svg`, `created_by`)
- [ ] 2.4 Create migration: `ticket_types` table (`id`, `concert_id`, `name`, `zone`, `price`, `total_quantity`, `remaining_quantity`, `sale_opens_at`, `per_user_limit`)
- [ ] 2.5 Create migration: `orders` table (`id`, `user_id`, `concert_id`, `status`, `idempotency_key`, `payment_provider`, `payment_ref`, `created_at`, `paid_at`)
- [ ] 2.6 Create migration: `order_items` table (`id`, `order_id`, `ticket_type_id`, `quantity`)
- [ ] 2.7 Create migration: `tickets` table (`id`, `order_id`, `ticket_type_id`, `user_id`, `qr_token`, `checked_in`, `checked_in_at`)
- [ ] 2.8 Create migration: `checkins` table (`id`, `ticket_id`, `checker_id`, `checked_in_at`, `device_id`, `synced_at`); unique constraint on `ticket_id`
- [ ] 2.9 Create migration: `vip_guests` table (`id`, `concert_id`, `name`, `phone_normalized`, `sponsor`, `entered`, `entered_at`)
- [ ] 2.10 Add indexes: `orders(user_id, concert_id)`, `tickets(qr_token)` unique, `order_items(order_id, ticket_type_id)`, `vip_guests(concert_id, phone_normalized)` unique
- [ ] 2.11 Create migration: `checkin_conflicts` table (`id`, `ticket_id`, `attempted_by` (checker user_id), `attempted_at`, `device_id`, `winning_checked_in_at`); index on `ticket_id` and `attempted_by`

## 3. Authentication & RBAC

- [ ] 3.1 Implement `POST /api/auth/register` — create user with role AUDIENCE, hash password with BCrypt
- [ ] 3.2 Implement `POST /api/auth/login` — validate credentials, issue JWT access token (15-min TTL) + refresh token (7-day TTL)
- [ ] 3.3 Implement `POST /api/auth/refresh` — validate refresh token, rotate: issue new access + refresh token, invalidate old refresh token
- [ ] 3.4 Implement refresh token reuse detection: if a revoked token is presented, revoke all tokens for that user
- [ ] 3.5 Configure Spring Security 7 filter chain (lambda DSL): JWT validation filter, role-based `@PreAuthorize` on controllers
- [ ] 3.6 Implement `JwtUtil` service: generate signed JWT (HMAC-SHA256), parse and validate, extract claims (userId, role)
- [ ] 3.7 Add seed script / SQL insert for initial ORGANIZER and CHECKER accounts (used for testing)
- [ ] 3.8 Write integration tests: register → login → access protected endpoint → refresh → revoke

## 4. Concert Management

- [ ] 4.1 Implement `GET /api/concerts` — paginated listing; serve from Redis cache (TTL 5 min), fall through to DB on miss
- [ ] 4.2 Implement `GET /api/concerts/{id}` — concert detail with ticket types; Redis cache (TTL 60s), active invalidation on update
- [ ] 4.3 Implement `POST /api/admin/concerts` — ORGANIZER only; create concert with metadata and SVG seat map
- [ ] 4.4 Implement `PUT /api/admin/concerts/{id}` — ORGANIZER only; update concert metadata; invalidate detail + listing cache
- [ ] 4.5 Implement `DELETE /api/admin/concerts/{id}` — ORGANIZER only; set status CANCELLED; invalidate caches; trigger cancellation notification
- [ ] 4.6 Implement `POST /api/admin/concerts/{id}/ticket-types` — ORGANIZER only; create ticket type with per-user limit validation
- [ ] 4.7 Implement `PUT /api/admin/concerts/{id}/ticket-types/{typeId}` — ORGANIZER only; update ticket type config
- [ ] 4.8 Implement `GET /api/admin/concerts/{id}/stats` — ORGANIZER only; revenue total, tickets sold per type, check-in count
- [ ] 4.9 Write unit tests for concert validation (missing fields, past event date rejection, per-user limit > quantity rejection)

## 5. Ticket Purchase & Inventory

- [ ] 5.1 Implement `POST /api/tickets/purchase` — authenticated AUDIENCE only; validate sale window, check `Idempotency-Key` header
- [ ] 5.2 Implement pessimistic lock: `SELECT ... FOR UPDATE` on `ticket_types.remaining_quantity` within purchase transaction
- [ ] 5.3 Implement per-user limit gate: Redis `INCRBY` on `limit:{userId}:{concertId}:{ticketTypeId}`; reject if exceeds limit before DB transaction
- [ ] 5.4 Implement DB-level guard: count paid `order_items` for user + ticket type; reject if sum + new quantity exceeds limit (hard guard inside transaction)
- [ ] 5.5 On successful inventory decrement: create order (status PENDING_PAYMENT), create order items, return `{orderId, paymentUrl}`
- [ ] 5.6 Implement order expiry: scheduled job cancels PENDING_PAYMENT orders older than 15 minutes and restores inventory
- [ ] 5.7 Write concurrency integration test: 200 threads simultaneously purchasing the last SVIP ticket — assert exactly 1 succeeds
- [ ] 5.8 Write per-user limit concurrency test: same user sends 5 concurrent requests for 1 ticket each (limit = 2) — assert at most 2 succeed

## 6. Payment Gateway Integration

- [ ] 6.1 Implement `PaymentGatewayService` interface with `createPaymentUrl(order)` and `verifyCallback(params)` methods
- [ ] 6.2 Implement `VNPayGatewayService`: build signed payment URL, verify HMAC-SHA512 callback signature
- [ ] 6.3 Implement `MoMoGatewayService`: build signed payment URL, verify RSA/HMAC callback signature
- [ ] 6.4 Wrap all gateway calls with Resilience4j `@CircuitBreaker`: 5 failures / 10s → OPEN; 30s cooldown → HALF-OPEN probe
- [ ] 6.5 Implement `GET /api/payments/vnpay/callback` and `GET /api/payments/momo/callback` — verify signature, update order status, trigger post-payment flow
- [ ] 6.6 Implement idempotency key store: save `(key → orderId, result)` in Redis with 24h TTL; check on every purchase request
- [ ] 6.7 Implement PENDING_CONFIRMATION flow: on gateway timeout, set order status to PENDING_CONFIRMATION; reconcile when webhook arrives
- [ ] 6.8 Implement `GET /api/orders/{id}` — polling endpoint so frontend can check order status after redirect
- [ ] 6.9 Write tests: circuit breaker state transitions, idempotency key dedup, timeout-then-webhook reconciliation

## 7. QR E-Ticket Generation

- [ ] 7.1 Implement `QrTokenService`: generate JWT-signed payload `{ticketId, orderId, userId, concertId, ticketType, issuedAt}` using HMAC-SHA256
- [ ] 7.2 On order transition to PAID: generate one QR token per ticket, store in `tickets.qr_token`
- [ ] 7.3 Implement `GET /api/orders/{id}/tickets` — return list of tickets with QR token (base64 PNG or SVG) for display in frontend
- [ ] 7.4 Expose `GET /api/checker/key-bundle?concert_id=X` — CHECKER only; returns HMAC signing key + concert validity window; app stores key in OS secure storage (Keychain on iOS, Keystore on Android)
- [ ] 7.5 Write test: verify QR token is unique per ticket, verify tampered token fails validation

## 8. Offline Check-in (Mobile App)

- [ ] 8.1 Implement React Native checker app login screen: call `POST /api/auth/login`, store JWT in SecureStorage; on login call `GET /api/checker/key-bundle` and store HMAC signing key in Keychain (iOS) / Keystore (Android)
- [ ] 8.2 Implement QR scanner screen using `react-native-camera` or `expo-barcode-scanner`
- [ ] 8.3 Implement local SQLite schema: `local_checkins(ticket_id, scanned_at, checker_id, device_id, sync_status)` where `sync_status` is one of SYNCED / PENDING_SYNC / CONFLICT; unique constraint on `ticket_id`
- [ ] 8.4 On every scan (online and offline): verify HMAC-SHA256 JWT signature with key from secure storage; check `local_checkins` for existing record on `ticket_id`; if found, display ALREADY USED — do not proceed regardless of network state
- [ ] 8.5 Implement online check-in (write-local-first, synchronous): write record to local SQLite with status PENDING_SYNC; synchronously call `POST /api/checkins/{ticketId}`; on 200 OK update status to SYNCED and display VALID; on 409 update status to CONFLICT and display ALREADY USED; on timeout/network error leave as PENDING_SYNC and display VALID (offline fallback)
- [ ] 8.6 Implement offline scan path: write record to local SQLite with status PENDING_SYNC; display VALID immediately with no backend call
- [ ] 8.7 Implement sync queue: on reconnect, flush all PENDING_SYNC records via `POST /api/checkins/batch`; update each record's status to SYNCED or CONFLICT based on per-record backend response
- [ ] 8.8 Implement `POST /api/checkins/batch` on backend: for each record attempt idempotent upsert (`INSERT ... ON CONFLICT (ticket_id) DO NOTHING`); on conflict INSERT into `checkin_conflicts` table capturing `ticket_id`, `attempted_by`, `device_id`, `attempted_at`, `winning_checked_in_at`; return per-record result (ok / conflict)
- [ ] 8.9 Implement VIP guest lookup screen (online-only): search bar accepting name (fuzzy, diacritic-insensitive) or phone number (exact after normalization); call `GET /api/vip-guests?concertId=&q=`; display list of matches for checker to disambiguate; "Mark as Entered" button calls `POST /api/vip-guests/{id}/enter`; if device offline display "No connection — VIP lookup requires network"
- [ ] 8.10 Implement VIP already-admitted and not-found responses in the app: display "ALREADY ADMITTED — Entered at [timestamp]" on 409; display "NOT ON GUEST LIST — Contact organizer" on 404
- [ ] 8.11 Write test: scan → offline store → reconnect → sync → verify backend state matches; write test: online scan → device goes offline → re-scan same ticket → assert ALREADY USED from local SQLite

## 9. Notifications

- [ ] 9.1 Define `NotificationChannel` interface: `send(NotificationEvent event)`
- [ ] 9.2 Implement `EmailNotificationChannel` using JavaMailSender: purchase confirmation with QR code attachment, 24h reminder, cancellation notice
- [ ] 9.3 Implement `InAppNotificationChannel` using Server-Sent Events (SSE) or WebSocket: push notification to active sessions
- [ ] 9.4 Implement `NotificationService`: iterate all registered `NotificationChannel` beans; catch per-channel exceptions and continue
- [ ] 9.5 Implement retry logic for failed email sends: up to 3 retries with exponential backoff; failure does not affect order status
- [ ] 9.6 Implement scheduled 24h reminder job: `@Scheduled` cron; query concerts starting in 22–26 hours; dispatch reminder events for all PAID ticket holders
- [ ] 9.7 Wire notification dispatch into: post-payment flow (purchase confirmation), concert cancellation handler (cancellation notice)
- [ ] 9.8 Write test: verify email channel failure does not propagate exception to caller; verify reminder job fires for correct concerts

## 10. Rate Limiting

- [ ] 10.1 Implement Redis Lua script for Token Bucket: atomically check and decrement bucket; return remaining tokens and retry-after seconds
- [ ] 10.2 Implement `RateLimitFilter` (Spring `OncePerRequestFilter`): extract IP and userId; run Lua script; return 429 with `Retry-After` header on exhaustion
- [ ] 10.3 Configure per-endpoint buckets: purchase endpoint (5 req / 10s burst), read endpoints (60 req / min), default (30 req / 10s)
- [ ] 10.4 Implement dual-key limiting: check both IP bucket and userId bucket (if authenticated); reject if either is exhausted
- [ ] 10.5 Implement fail-open: if Redis is unreachable during rate limit check, allow request and log warning
- [ ] 10.6 Write test: 100 concurrent requests from same IP — assert exactly the allowed burst count succeeds, rest receive 429

## 11. Caching

- [ ] 11.1 Implement `ConcertCacheService`: cache-aside for concert listing (key: `concerts:list:page:{n}`, TTL 5 min) and detail (key: `concerts:detail:{id}`, TTL 60s)
- [ ] 11.2 Implement active cache invalidation: on create/update/cancel concert, delete `concerts:list:*` keys and `concerts:detail:{id}`
- [ ] 11.3 Implement ticket availability cache: key `tickets:available:{ticketTypeId}`, TTL 10s; read-through on miss; delete on confirmed purchase
- [ ] 11.4 Ensure purchase endpoint never reads from cache: inventory check always queries PostgreSQL with `SELECT FOR UPDATE`
- [ ] 11.5 Write test: verify cache hit returns same data; verify cache is invalidated within TTL after concert update

## 12. AI Artist Bio

- [ ] 12.1 Implement `POST /api/admin/concerts/{id}/artist-pdf` — ORGANIZER only; validate real PDF by magic bytes (not extension/Content-Type); reject encrypted/protected PDFs; accept ≤ 20MB; store file; stamp an increasing `bio_generation_id`; set `bio_status = GENERATING`; return 202
- [ ] 12.2 Implement `ArtistBioProcessor` `@Async` service: extract text using Apache PDFBox bounded by an extraction timeout and page/char ceiling (defuse decompression-bomb PDFs)
- [ ] 12.3 In `ArtistBioProcessor`: validate extracted text length (≥ 50 chars); on failure, set `bio_status = FAILED` with reason
- [ ] 12.4 Implement Gemini API call behind an `ArtistBioGenerator` interface: send cleaned text (capped to stay within free-tier token limits) with a structured prompt that delimits the press-kit text as untrusted data (prompt-injection hardening); parse response
- [ ] 12.5 On successful API response: save generated text as `bio_status = DRAFT` (NOT public); write only if the task's `bio_generation_id` is still the latest (discard stale late completions)
- [ ] 12.6 Implement retry: up to 2 retries on Gemini API error (including free-tier 429 quota errors) with exponential backoff; after all fail, set `bio_status = FAILED`
- [ ] 12.7 Implement review endpoints — ORGANIZER only: `GET` draft for review, `PUT` to edit draft text, `POST .../publish` → `bio_status = PUBLISHED` + invalidate concert detail cache, `POST .../reject`
- [ ] 12.8 Implement a scheduled reaper: transition any `GENERATING` row older than the threshold (e.g. 5 min) out of GENERATING (re-queue or FAILED) so restarts don't strand bios
- [ ] 12.9 Rate-limit regenerations per concert/organizer so repeated uploads cannot drain the free-tier quota
- [ ] 12.10 Expose `bio_status` and the bio text in `GET /api/concerts/{id}` so the public page shows the bio ONLY when PUBLISHED (placeholder otherwise); admin endpoint exposes DRAFT for review
- [ ] 12.11 Write tests: mock the Gemini API; verify success sets DRAFT (not public); image-only PDF sets FAILED; 429 sets FAILED "AI service busy"; non-PDF-by-magic-bytes rejected; stale late completion is discarded; reaper clears a stuck GENERATING row; only PUBLISHED bio appears on the public page

## 13. VIP Guest CSV Import

- [ ] 13.1 Implement `VipGuestImportJob` `@Scheduled` at `0 0 2 * * *` (02:00 daily): scan configured import directory for CSV files
- [ ] 13.2 Implement CSV parser using OpenCSV: case-insensitive header mapping, trim whitespace, skip blank rows
- [ ] 13.3 Implement idempotent upsert: `INSERT INTO vip_guests ... ON CONFLICT (concert_id, phone_normalized) DO UPDATE SET ...`
- [ ] 13.4 Implement per-row error handling: catch parse/validation exceptions per row; log row number and reason; continue to next row
- [ ] 13.5 Implement file-level error handling: if CSV is entirely unparseable, move to `import-errors/` archive dir; log alert
- [ ] 13.6 Log import summary after each run: total rows processed, inserted, updated, skipped, errored
- [ ] 13.7 Implement `GET /api/vip-guests` — CHECKER only; search by `concertId` + `q` (phone exact match after normalization, or name fuzzy match using `unaccent()` + `ilike`); return list of matches with `id`, `name`, `phone_normalized` (partial), `entered`, `entered_at`
- [ ] 13.8 Implement `POST /api/vip-guests/{id}/enter` — CHECKER only; conditional `UPDATE vip_guests SET entered=true, entered_at=now() WHERE id=? AND entered=false`; return 409 if 0 rows affected (already admitted)
- [ ] 13.9 Write test: process same CSV twice — assert no duplicates in DB; process CSV with bad rows — assert valid rows inserted

## 14. Admin Web Dashboard (Frontend)

- [ ] 14.1 Implement admin login page: call auth API, store JWT in httpOnly cookie or memory, redirect to dashboard
- [ ] 14.2 Implement concert list page (ORGANIZER): table of concerts with status badges, create/edit/cancel actions
- [ ] 14.3 Implement concert create/edit form: fields for name, date, venue, description, SVG seat map upload, ticket types configuration
- [ ] 14.4 Implement ticket type configuration widget: add/remove rows for zone, price, quantity, sale open time, per-user limit
- [ ] 14.5 Implement PDF upload for AI bio: drag-and-drop or file picker; poll `bio_status` and display result when COMPLETE
- [ ] 14.6 Implement concert stats page: revenue chart, tickets sold per zone, check-in count
- [ ] 14.7 Implement route guards: redirect non-ORGANIZER users away from `/admin/**`
- [ ] 14.8 Implement check-in conflicts page (ORGANIZER): table of `checkin_conflicts` for a given concert showing ticket ID, attempting checker, device ID, attempted timestamp, time delta from winning check-in — enables post-event fraud investigation

## 15. Public Web Frontend (Next.js)

- [ ] 15.1 Implement concert listing page (`/`): paginated cards with name, date, venue, thumbnail, zone availability badges
- [ ] 15.2 Implement concert detail page (`/concerts/[id]`): artist info with bio, venue map, interactive SVG seat map with zone availability, buy buttons per zone
- [ ] 15.3 Implement purchase flow: zone selection → quantity picker → payment provider selection → redirect to gateway URL
- [ ] 15.4 Implement order confirmation page (`/orders/[id]`): poll order status; on PAID, display QR e-ticket(s) with download option
- [ ] 15.5 Implement my tickets page (`/me/tickets`): list all purchased tickets with QR codes
- [ ] 15.6 Implement real-time availability update: poll `GET /api/concerts/{id}/availability` every 10s on concert detail page; update zone counts
- [ ] 15.7 Implement auth pages: register, login, logout; store JWT in httpOnly cookie; handle 401 redirects

## 16. Seed Data

- [ ] 16.1 Create SQL seed script: 4 sample concerts — `Anh Trai Say Hi`, `Anh Trai Vượt Ngàn Chông Gai`, `Em Xinh Say Hi`, `Chị Đẹp Đạp Gió Rẽ Sóng`
- [ ] 16.2 Add ticket types for each concert: GA (500k VND, 5000 qty, limit 4), CAT2 (800k, 2000 qty, limit 4), CAT1 (1.2M, 1000 qty, limit 4), VIP (2M, 500 qty, limit 2), SVIP (3.5M, 200 qty, limit 2)
- [ ] 16.3 Add sample SVG seat map for each concert (zone-colored SVG with GA, SVIP, VIP, CAT1, CAT2 regions)
- [ ] 16.4 Add seed users: 1 ORGANIZER (`organizer@ticketbox.vn`), 2 CHECKERs (`checker1@ticketbox.vn`, `checker2@ticketbox.vn`), 3 AUDIENCE users
- [ ] 16.5 Add sample VIP guest CSV file in `import-samples/` for testing the nightly import flow
- [ ] 16.6 Seed each concert with a pre-written `artist_bio` and `bio_status = PUBLISHED` so concert pages show a bio out of the box — a live free-tier (Gemini) quota wall on demo day must not leave every page on the "coming soon" placeholder; the upload→draft→publish flow is still exercised separately on demand

## 17. Testing, Documentation & Final Wiring

- [ ] 17.1 Write `README.md`: prerequisites, how to run with `docker compose up`, seed data steps, test accounts and passwords, API overview
- [ ] 17.2 Write end-to-end smoke test script: register → login → browse concerts → purchase → receive QR → check-in
- [ ] 17.3 Verify all Spring Security role guards are in place: attempt each restricted endpoint with wrong role → assert 403
- [ ] 17.4 Verify Docker Compose `up` from clean state reaches healthy status for all services
- [ ] 17.5 Verify seed data loads correctly: all 4 concerts visible on listing page with correct ticket types and prices
- [ ] 17.6 Run load simulation (e.g., k6 or JMeter): 500 concurrent purchase requests for 200 SVIP tickets — assert no oversell
