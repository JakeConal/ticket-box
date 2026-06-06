## Context

TicketBox is a greenfield concert ticketing platform built for Vietnamese events that attract 80k+ concurrent users at sale open. The system must handle ticket inventory contention (200 SVIP seats, tens of thousands of buyers), protect payment integrity, allow offline gate check-in at stadiums with poor connectivity, and integrate a one-way CSV guest list pipeline with no callback API. The backend stack is Java 25 + Spring Boot 4 (Gradle Groovy DSL); frontend is React/Next.js; mobile checker app is React Native.

## Goals / Non-Goals

**Goals:**
- Handle 80,000 concurrent users at ticket sale open without data corruption or double-selling
- Enforce per-user ticket purchase limits atomically under concurrent load
- Process payments via VNPAY/MoMo with idempotency and circuit breaker protection
- Support offline QR check-in with conflict-free sync when connectivity resumes
- Expose role-restricted access across web, admin, and mobile surfaces
- Generate AI artist bios from uploaded PDF press kits
- Import nightly VIP guest CSV without interrupting live system
- Cache high-read concert pages to keep database read load manageable

**Non-Goals:**
- Real VNPAY/MoMo production credentials (sandbox/mock used in development)
- Horizontal auto-scaling / Kubernetes (Docker Compose only for this project)
- Full seat-by-seat seating (zone-level only: GA, SVIP, VIP, CAT1, CAT2)
- Real-time secondary ticket market or resale
- Multi-language i18n beyond Vietnamese/English

## Decisions

### D1 — Architecture: Modular Monolith with Domain Separation

**Decision:** Single Spring Boot application with clear module boundaries (concert, ticket, payment, checkin, notification, admin, ai-bio, csv-import), deployed as one service behind Nginx. Mobile checker app is a separate React Native client.

**Alternatives considered:**
- *Microservices*: Eliminates shared-process coupling but introduces distributed tracing, service mesh, and inter-service auth complexity that is disproportionate for an academic project.
- *Serverless functions*: Good for CSV import and AI bio, but complicates local Docker Compose dev and shared transaction management.

**Rationale:** Modular monolith gives domain isolation benefits of microservices while keeping operational complexity within Docker Compose. Module boundaries are enforced by package structure and tested integration boundaries, making a future split straightforward.

---

### D2 — Database: PostgreSQL as Primary + Redis as Cache/Lock Store

**Decision:** PostgreSQL for all persistent data (concerts, tickets, orders, users, check-ins, guest list). Redis for: cache-aside (concert data), rate limiting counters, idempotency key store, distributed locks.

**Alternatives considered:**
- *MongoDB*: Flexible schema useful for seat maps, but loses ACID transactions critical for ticket inventory atomicity.
- *MySQL*: Comparable to PostgreSQL; PostgreSQL chosen for `SELECT FOR UPDATE SKIP LOCKED` and better JSON support for SVG seat map metadata.

**Rationale:** Ticket purchase requires atomic decrement of inventory + order creation in one transaction — PostgreSQL ACID guarantees this. Redis handles all high-frequency low-latency operations (cache hits, rate limit buckets, lock acquisition) without touching PostgreSQL.

---

### D3 — Ticket Inventory Contention: Pessimistic Locking via `SELECT FOR UPDATE`

**Decision:** When a purchase is initiated, acquire a row-level lock on the `ticket_type` row with `SELECT FOR UPDATE`, check remaining quantity, decrement, and create the order — all in one database transaction.

**Alternatives considered:**
- *Optimistic locking (version column)*: Lower contention in low-traffic scenarios, but at 80k concurrent users optimistic retry storms degrade throughput and UX.
- *Redis atomic decrement (DECR)*: Fast but requires a two-phase commit pattern to keep Redis and PostgreSQL consistent — adds complexity and failure modes.
- *Queue-based reservation*: Fair but adds latency and requires a reservation expiry job.

**Rationale:** Pessimistic locking is simple, correct by construction, and avoids distributed coordination. PostgreSQL row-level locks do not block readers (SELECT without FOR UPDATE). Combined with connection pool limits and rate limiting upstream, the lock hold time is bounded.

---

### D4 — Per-User Purchase Limit: Redis Atomic Counter + DB Constraint

**Decision:** Redis `INCR`/`INCRBY` per `(user_id, concert_id, ticket_type_id)` key acts as the first gate; a unique-count constraint in PostgreSQL (`order_items` filtered by paid status) acts as the hard guard.

**Rationale:** Redis check rejects excess requests cheaply before they reach the DB transaction. PostgreSQL constraint is the source of truth and prevents any bypass via race conditions. Two-layer defense handles the "many concurrent requests from same user" scenario explicitly called out in the project requirements.

---

### D5 — Rate Limiting: Token Bucket in Redis (Lua Script)

**Decision:** Each API endpoint (especially `POST /tickets/purchase`) has a Token Bucket enforced by a Lua script executed atomically in Redis. Buckets are keyed by IP and by authenticated `user_id`. Exceeded requests receive `429 Too Many Requests` with `Retry-After`.

**Alternatives considered:**
- *Fixed Window*: Simple but bursty at window boundary — a user can double the allowed rate by timing requests across the window edge.
- *Sliding Window Log*: Accurate but stores a timestamp per request — high memory cost at 80k users.
- *Leaky Bucket*: Smooths output but queues requests, adding latency under load.

**Rationale:** Token Bucket allows short bursts (natural user behavior) while capping sustained rate. Lua script atomicity in Redis means no race conditions between check and consume. Per-IP + per-user dual keying blocks both anonymous bots and authenticated multi-account abuse.

---

### D6 — Payment Reliability: Circuit Breaker (Resilience4j) + Idempotency Keys

**Decision:**
- *Circuit Breaker*: Resilience4j `@CircuitBreaker` wraps all VNPAY/MoMo calls. Thresholds: 5 failures in 10-second window → Open; 30s wait → Half-Open probe. When Open, purchase flow returns a user-facing "payment temporarily unavailable" with no charge.
- *Idempotency Key*: Client generates a UUID per purchase attempt and sends it as `Idempotency-Key` header. Backend stores `(key → result)` in Redis with 24h TTL. Duplicate requests within TTL return the cached result without re-charging.

**Alternatives considered:**
- *Retry with exponential backoff only*: Does not protect against gateway partial failures where the charge went through but the response was lost.
- *Saga pattern*: Correct for multi-service distributed transactions but overengineered for a monolith where the payment call is a single outbound HTTP call.

**Rationale:** Idempotency key prevents double-charge even when the client retries aggressively. Circuit Breaker prevents cascade failure where a slow gateway exhausts connection pool threads and brings down the whole API.

---

### D7 — Auth: JWT with Refresh Tokens, RBAC Middleware

**Decision:** Stateless JWT access tokens (15-min TTL) + refresh tokens stored in `refresh_tokens` table (7-day TTL, rotated on use). Roles encoded in JWT claims: `AUDIENCE`, `ORGANIZER`, `CHECKER`. Spring Security `@PreAuthorize` enforces roles at controller method level; a global filter rejects expired or tampered tokens.

**Alternatives considered:**
- *Session-based auth*: Requires sticky sessions or shared session store — adds Redis coupling for auth state.
- *API keys for Checker*: Simpler but doesn't support user identity for audit logs.

**Rationale:** JWT is stateless and scales horizontally. Short access token TTL limits blast radius of token theft. Refresh token rotation invalidates stolen refresh tokens on next legitimate use.

---

### D8 — QR E-Ticket: JWT-Signed Payload

**Decision:** E-ticket QR code encodes a JWT signed with an HMAC-SHA256 secret. Payload: `{ticket_id, order_id, user_id, concert_id, ticket_type, issued_at}`. Checker app verifies signature offline using the embedded public key bundle.

**Rationale:** JWT signature allows the checker app to validate authenticity without a network call. The `ticket_id` is then used for duplicate-entry detection (both online and in offline sync queue).

---

### D9 — Offline Check-in: Local SQLite + Sync Queue

**Decision:** React Native checker app stores scanned check-ins in local SQLite. On scan: write to local DB first, then attempt sync to backend. If offline: queue the record. On reconnect: flush queue to `POST /checkins/batch`. Backend applies check-ins with idempotent upsert on `ticket_id`; last-write-wins conflict policy with server timestamp authority.

**Alternatives considered:**
- *CRDTs*: Correct but significant implementation complexity for a check-in-only use case.
- *Reject if offline*: Unacceptable — project requirement explicitly requires offline operation.

**Rationale:** Check-in is append-only (a ticket is either checked-in or not). Last-write-wins is safe because duplicate check-ins are detected by `ticket_id` uniqueness constraint on backend. The one-way nature (ticket can only transition to checked-in, never back) eliminates merge conflicts.

**Implementation note — SQLite as universal scan log:** The local SQLite `checkins` table is not merely an offline buffer; it is the authoritative scan log for this device regardless of connectivity. All scans — online and offline — write to SQLite first before any backend call is made. This ensures that if the device transitions from online to offline mid-session, already-scanned tickets are still rejected locally without requiring a network check. Local records carry one of three statuses: `SYNCED` (backend confirmed), `PENDING_SYNC` (awaiting sync), or `CONFLICT` (backend rejected — already admitted by another device). All three statuses block re-entry on this device.

---

### D10 — Caching: Cache-Aside with Redis, Two-Tier TTL

**Decision:**
- Concert list: TTL 5 minutes. Invalidated on any concert create/update/cancel.
- Concert detail (incl. ticket type info): TTL 60 seconds. Invalidated on concert update.
- Ticket availability count: TTL 10 seconds + active invalidation after each successful purchase.
- No caching on purchase/checkout endpoints.

**Rationale:** Concert metadata changes rarely; 5-min stale list is acceptable. Ticket counts must be near-real-time (10s TTL) so buyers see accurate availability. Active invalidation on purchase ensures counts drop promptly rather than waiting out the TTL.

---

### D11 — AI Artist Bio: Claude API with PDF Text Extraction

**Decision:** Organizer uploads PDF → backend extracts text via Apache PDFBox → sends to Claude API (`claude-sonnet-4-6`) with a structured prompt → stores generated bio in `concerts.artist_bio`. Processing is async (background Spring `@Async` task); UI shows "Generating..." until complete.

**Rationale:** PDFBox is Apache-licensed, embeds cleanly into Spring Boot, and handles multi-page press kit PDFs. Async processing avoids blocking the upload endpoint during AI call latency.

---

### D12 — VIP Guest CSV Import: Scheduled Job with Idempotent Upsert

**Decision:** Spring `@Scheduled` job runs nightly at 02:00 (configurable). Reads CSV from a watched directory (or S3 bucket mount). Parses rows with Jakarta CSV; skips malformed rows with a structured error log. Upserts into `vip_guests` table on `(concert_id, name, phone_normalized)` unique key — duplicates update instead of insert. Job runs in a separate transaction; failures do not affect live traffic.

**Rationale:** No brand sponsor API exists — CSV drop is the only integration point. Idempotent upsert means re-processing the same file is safe. Separate transaction isolation means a bad CSV file cannot corrupt existing guest data.

---

### D13 — Notification Architecture: Strategy Pattern for Channels

**Decision:** `NotificationService` dispatches through a list of registered `NotificationChannel` implementations (email via JavaMailSender, in-app via WebSocket/SSE). New channels (Zalo OA, SMS) added by implementing the interface and registering as a Spring bean — zero changes to call sites.

**Rationale:** Project requirement explicitly states the system must be extensible for new notification channels without major changes. Strategy pattern + Spring bean registration is the natural implementation in Spring Boot.

---

### D14 — Message Broker: Redis Pub/Sub for Notifications

**Decision:** Use Redis Pub/Sub for internal event dispatch (purchase-confirmed → notification workers). Not RabbitMQ/Kafka.

**Rationale:** Redis is already in the stack for cache and rate limiting. Redis Pub/Sub is sufficient for at-most-once notification delivery (losing a push notification is acceptable; losing a payment event is not — payment state is handled synchronously in the transaction). Avoids adding a 4th infrastructure service.

## Risks / Trade-offs

- **Pessimistic locking under extreme load** → PostgreSQL row locks queue up; response time grows linearly with contention. Mitigation: rate limiting upstream bounds the queue depth; connection pool (`HikariCP`) cap prevents thread exhaustion. Accept: for 200 SVIP seats among 80k buyers, the bottleneck is intentional — we serialize access, not parallelize it.

- **Redis single point of failure** → Cache miss degrades to DB load; rate limiting falls back to allow-all. Mitigation: Redis persistence (AOF) enabled; accept degraded performance window during Redis restart rather than blocking all traffic.

- **Offline check-in clock skew** → Mobile device time may differ from server time, affecting timestamp ordering. Mitigation: server timestamp is authoritative for `checked_in_at`; device timestamp is stored separately for audit only.

- **Circuit breaker hides partial payment success** → Gateway charged user but timeout before response → circuit opens → user sees error but was charged. Mitigation: idempotency key ensures retry returns same result; webhook from VNPAY/MoMo reconciles async; order marked `PENDING_CONFIRMATION` until webhook arrives.

- **PDF text extraction quality** → Scanned PDFs or image-only press kits yield no extractable text. Mitigation: validate extracted text length before calling Claude API; surface error to Organizer with "Text extraction failed — please upload a text-based PDF."

- **CSV malformed data** → Sponsor sends inconsistent column names or encoding. Mitigation: flexible header mapping (case-insensitive, trim whitespace); log and skip individual bad rows; alert Organizer via admin dashboard after import.

---

### D15 — Runtime & Build Stack: Java 25 + Spring Boot 4 + Gradle (Groovy DSL)

**Decision:** Backend targets Java 25 and Spring Boot 4. Build system is Gradle with the Groovy DSL (`build.gradle`).

**Alternatives considered:**
- *Java 21 LTS + Spring Boot 3*: The previous LTS pairing; more library ecosystem coverage but misses Java 25 virtual thread improvements and newer language features.
- *Maven*: Wider familiarity in enterprise Java, but more verbose; Gradle offers shorter build scripts and better incremental compilation performance.
- *Gradle Kotlin DSL*: Statically typed, IDE-friendly, but team preference is Groovy DSL for this project.

**Rationale:**
- Java 25 brings finalized virtual threads (Project Loom), enabling high-concurrency ticket purchase handling without managing thread pools manually — directly relevant to the 80k concurrent user requirement.
- Spring Boot 4 (built on Spring Framework 7) aligns with Jakarta EE 11 and provides first-class virtual thread support via `spring.threads.virtual.enabled=true`.
- Gradle Groovy DSL is familiar, concise, and well-supported by the Spring Boot Gradle plugin.

**Compatibility notes:**
- Verify all third-party dependencies (Resilience4j, Apache PDFBox, jjwt, Jakarta CSV) against the Spring Boot 4 BOM before locking versions.
- Spring Boot 4 requires Java 17 minimum; Java 25 is forward-compatible.
- Spring Security 7 (bundled with SB4) changes some configuration APIs — security config must use the lambda DSL, not deprecated `WebSecurityConfigurerAdapter`.
