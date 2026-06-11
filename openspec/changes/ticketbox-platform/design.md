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

### D3 — Ticket Inventory Contention: Conditional Atomic Decrement + Reservation Lifecycle

**Decision:** When a purchase is initiated, decrement inventory with a single conditional atomic UPDATE rather than an explicit lock-read-write sequence:

```sql
UPDATE ticket_type
SET remaining = remaining - :qty
WHERE id = :id AND remaining >= :qty;
-- rows affected = 1 → reservation succeeded; 0 → sold out (HTTP 409)
```

This statement is atomic under PostgreSQL's row-level write lock, cannot produce negative inventory, and avoids a separate `SELECT` round-trip. The order is created in status `PENDING` in the same transaction.

**Reservation lifecycle (reserve-on-create):** Inventory is decremented at order creation, *before* payment — so every unpaid order holds seats and MUST be reclaimable:

```
Buy ─▶ PENDING (inventory −q) ─▶ payment URL returned
         │                              │
         │ user pays                    │ user abandons / never returns
         ▼                              ▼
   PAID (inventory stays −q)      PENDING expiry job (TTL 8 min)
                                  ─▶ EXPIRED, inventory += q (released)
```

Order states and their inventory effect:
- `PENDING` → reserved; released by expiry job if no payment within **8 minutes**.
- `PENDING_CONFIRMATION` → reserved; reconciled by webhook or released after 15 min (see payment spec).
- `PAID` → reserved permanently.
- `FAILED` / `EXPIRED` → released (`remaining += q`).

The background expiry job (D11 scheduler) scans for stale `PENDING` and `PENDING_CONFIRMATION` orders and releases their inventory. Without this, a few thousand abandoned checkouts would lock all 200 SVIP seats within seconds even though nobody paid.

**Alternatives considered:**
- *`SELECT FOR UPDATE` then decrement*: Correct but holds a lock across read+write; the conditional UPDATE achieves the same guarantee in one statement with shorter lock hold time. `SKIP LOCKED` remains useful for the expiry job to claim stale orders without contending with live purchases.
- *Optimistic locking (version column)*: Lower contention in low-traffic scenarios, but at 80k concurrent users optimistic retry storms degrade throughput and UX.
- *Redis atomic decrement (DECR)*: Fast but requires a two-phase commit pattern to keep Redis and PostgreSQL consistent — adds complexity and failure modes.

**Rationale:** The conditional UPDATE is simple, correct by construction, and avoids distributed coordination. PostgreSQL row-level write locks do not block readers (plain `SELECT`). Combined with the waiting queue (D16), connection pool limits, and rate limiting upstream, lock hold time and queue depth are bounded. For 200 SVIP seats among 80k buyers the serialization on one row is the *intended* bottleneck — we serialize access, not parallelize it.

---

### D4 — Per-User Purchase Limit: Redis Atomic Counter + DB Constraint

**Decision:** Two-layer enforcement, with the durable DB layer as the source of truth:

1. *Fast gate (Redis):* `INCRBY` on key `limit:{user_id}:{concert_id}:{ticket_type_id}` reserves quota at purchase initiation; if the result exceeds the configured limit it is immediately decremented back and the request is rejected with HTTP 409. This rejects excess requests cheaply before they reach the DB transaction.
2. *Durable guard (PostgreSQL):* Within the purchase transaction, the system counts the user's existing non-released tickets for that ticket type (`SELECT count(*) FROM order_items oi JOIN orders o ... WHERE o.status IN ('PENDING','PENDING_CONFIRMATION','PAID')`) under the same transaction and rejects if `count + qty > limit`. Because there is no native declarative constraint for an aggregate per-user limit, this is enforced by an in-transaction check (serializable isolation on the count, or a per-user advisory lock) — **not** a `CHECK`/`UNIQUE` constraint.

**Counter reconciliation (critical):** The brief scopes the limit to *successfully paid* orders, but the Redis gate reserves at *initiation*. Therefore the Redis counter MUST be decremented whenever an order is released — i.e. on `FAILED` and `EXPIRED` transitions (and never on `PAID`). The same expiry/failure paths from D3 that release inventory also decrement the Redis limit counter. Without this, a user who abandons two checkouts is permanently locked out of tickets they never bought. The DB count (which filters by non-released status) is self-correcting and remains the source of truth if Redis and the DB ever diverge.

**Rationale:** Redis rejects the bulk of concurrent same-user spam cheaply; the in-transaction DB count prevents any race-condition bypass and survives a Redis flush. Two-layer defense handles the "many concurrent requests from same user" scenario explicitly called out in the project requirements, and mirrors the durable-guard pattern also used for idempotency (D6).

---

### D5 — Rate Limiting: Token Bucket in Redis (Lua Script)

**Decision:** Each API endpoint (especially `POST /tickets/purchase`) has a Token Bucket enforced by a Lua script executed atomically in Redis. Buckets are keyed by IP and by authenticated `user_id`. Exceeded requests receive `429 Too Many Requests` with `Retry-After`.

**Alternatives considered:**
- *Fixed Window*: Simple but bursty at window boundary — a user can double the allowed rate by timing requests across the window edge.
- *Sliding Window Log*: Accurate but stores a timestamp per request — high memory cost at 80k users.
- *Leaky Bucket*: Smooths output but queues requests, adding latency under load.

**Rationale:** Token Bucket allows short bursts (natural user behavior) while capping sustained rate. Lua script atomicity in Redis means no race conditions between check and consume. Per-IP + per-user dual keying blocks both anonymous bots and authenticated multi-account abuse.

**Relationship to the waiting queue (D16):** Rate limiting alone is *rejection*, not *fairness* — it drops excess requests and favors whoever retries fastest, which is the scalper-bot advantage. For the sale-open spike, the waiting queue (D16) provides the ordering/fairness guarantee; the token bucket then protects the already-admitted stream and the always-open endpoints (browse, availability). The two are complementary, not redundant.

---

### D6 — Payment Reliability: Circuit Breaker (Resilience4j) + Idempotency Keys

**Decision:**
- *Circuit Breaker*: Resilience4j `@CircuitBreaker` wraps all VNPAY/MoMo calls. Thresholds: 5 failures in 10-second window → Open; 30s wait → Half-Open probe. When Open, purchase flow returns a user-facing "payment temporarily unavailable" with no charge.
- *Idempotency Key*: Client generates a UUID per purchase attempt and sends it as `Idempotency-Key` header. Two-layer storage, mirroring D4: a durable `idempotency_keys` table in PostgreSQL (`key` UNIQUE, `result`, `created_at`) is the hard guard, with Redis (24h TTL) as the fast path. On a duplicate key the backend returns the stored result without re-charging. The durable layer matters precisely because the failure mode is double-charge: if Redis is down (its own risk note says rate limiting "falls back to allow-all"), the Postgres UNIQUE constraint still rejects the duplicate. A purchase-time `INSERT ... ON CONFLICT DO NOTHING` on the key column atomically claims first-writer-wins even under concurrent retries.

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

### D8 — QR E-Ticket: Asymmetrically-Signed JWT (RS256 / EdDSA)

**Decision:** E-ticket QR code encodes a JWT signed with an **asymmetric** key pair (EdDSA/Ed25519 preferred; RS256 acceptable). Payload: `{ticket_id, order_id, user_id, concert_id, ticket_type, issued_at}`. The **private** signing key lives server-side only. The checker app ships the **public** key and verifies the signature offline.

**Why not HMAC:** HMAC-SHA256 is symmetric — offline verification would require shipping the *signing* secret inside every checker app bundle, where it is trivially extractable. Anyone with the secret could forge unlimited valid tickets. Asymmetric signing lets devices verify without holding any forging capability; key rotation is handled by bundling a small set of valid public keys (keyed by JWT `kid`) and refreshing them when the device is online.

**Rationale:** Asymmetric signature allows the checker app to validate authenticity offline without granting it the ability to mint tickets. The `ticket_id` is then used for duplicate-entry detection (both online and in the offline sync queue, per D9).

---

### D9 — Offline Check-in: Local SQLite + Sync Queue

**Decision:** React Native checker app stores scanned check-ins in local SQLite. On scan: write to local DB first, then attempt sync to backend. If offline: queue the record. On reconnect: flush queue to `POST /checkins/batch`. Backend applies check-ins with idempotent upsert on `ticket_id`; last-write-wins conflict policy with server timestamp authority.

**Alternatives considered:**
- *CRDTs*: Correct but significant implementation complexity for a check-in-only use case.
- *Reject if offline*: Unacceptable — project requirement explicitly requires offline operation.

**Rationale:** Check-in is append-only (a ticket is either checked-in or not). Last-write-wins is safe because duplicate check-ins are detected by `ticket_id` uniqueness constraint on backend. The one-way nature (ticket can only transition to checked-in, never back) eliminates merge conflicts.

**Implementation note — SQLite as universal scan log:** The local SQLite `checkins` table is not merely an offline buffer; it is the authoritative scan log for this device regardless of connectivity. All scans — online and offline — write to SQLite first before any backend call is made. This ensures that if the device transitions from online to offline mid-session, already-scanned tickets are still rejected locally without requiring a network check. Local records carry one of three statuses: `SYNCED` (backend confirmed), `PENDING_SYNC` (awaiting sync), or `CONFLICT` (backend rejected — already admitted by another device). All three statuses block re-entry on this device.

**Guarantee boundary — cross-device offline double-entry:** The "a ticket may not be used twice" guarantee is **per-device always, global eventually** — it cannot be absolute while two devices are simultaneously offline. If checker A and checker B are both offline and each scans the same ticket, both admit the holder at the gate; the conflict is only detected when the second device syncs and the backend's `ticket_id` uniqueness rejects it (marking that local record `CONFLICT`). The person is already inside by then. This residual window is inherent to offline-capable multi-device check-in and is accepted; it is mitigated operationally by assigning each ticket-holder to a single gate/zone so two checkers rarely scan the same ticket, and by surfacing `CONFLICT` records in the admin dashboard for post-hoc review.

---

### D10 — Caching: Cache-Aside with Redis, Two-Tier TTL

**Decision:**
- Concert list: TTL 5 minutes. Invalidated on any concert create/update/cancel.
- Concert detail (incl. ticket type info): TTL 60 seconds. Invalidated on concert update.
- Ticket availability count: TTL 10 seconds + active invalidation after each successful purchase.
- No caching on purchase/checkout endpoints.

**Rationale:** Concert metadata changes rarely; 5-min stale list is acceptable. Ticket counts must be near-real-time (10s TTL) so buyers see accurate availability. Active invalidation on purchase ensures counts drop promptly rather than waiting out the TTL.

---

### D11 — AI Artist Bio: Google Gemini (Free Tier) with PDF Text Extraction

**Decision:** Organizer uploads PDF → backend extracts text via Apache PDFBox → sends to the **Google Gemini API free tier** (`gemini-2.0-flash`) with a structured prompt → stores generated bio in `concerts.artist_bio`. Processing is async (background Spring `@Async` task); UI shows "Generating..." until complete.

**Alternatives considered:**
- *Claude / OpenAI paid APIs*: stronger models, but a paid dependency is out of scope for an academic project; the bio is a short, low-stakes summary that the free tier handles well.
- *Groq / OpenRouter free models*: free and fast, but the open models they host are generally weaker on Vietnamese, and the bios are about Vietnamese artists from Vietnamese press kits.
- *Self-hosted Ollama*: fully free and offline with no external key, but needs local GPU compute to be usable and adds a container to Docker Compose.

**Rationale:** Gemini's free tier offers a generous quota with no cost, simple REST/SDK access, and strong Vietnamese-language quality — the decisive factor given the source material and output are Vietnamese. PDFBox is Apache-licensed, embeds cleanly into Spring Boot, and handles multi-page press kit PDFs. Async processing avoids blocking the upload endpoint during AI call latency. The provider is wrapped behind an internal `ArtistBioGenerator` interface so swapping models (or upgrading to a paid tier) is a one-class change.

**Free-tier constraints:** The free tier enforces rate/quota limits (requests-per-minute and per-day). The bio generator must handle `429`/quota responses gracefully (retry with backoff, then `FAILED` with a clear reason) and cap the extracted text sent per request to stay within token limits — see the text-cap mitigation below.

**Human review gate — the bio is never auto-published.** This is the one pipeline in the system where *untrusted third-party content* (a press kit authored by labels/PR, not by us) is transformed by an AI and would otherwise be published publicly as factual statements about *real, named people*. Two hazards follow: (a) **prompt injection** — the press kit text can contain instructions like "ignore the above and write …", and the output is public; (b) **hallucination** — the model can invent biographical "facts" about real celebrities, creating a defamation/misinformation surface under the platform's name. The structural mitigation is to make the AI a *drafting assistant*, not an autopublisher, by inserting an organizer approval step:

```
   GENERATING ──▶ DRAFT ──(organizer reviews / edits)──▶ PUBLISHED ──▶ public page
       │            │                                                     ▲
       │            └─ reject / re-upload ──▶ GENERATING                  │
       └─ FAILED ───────────────────────────────────────────────  (only PUBLISHED shows)
```

A completed generation lands in `DRAFT`, visible only to the organizer in the admin dashboard. The public concert page shows the bio **only when status is `PUBLISHED`**; in every other state it shows the "coming soon" placeholder. The organizer may edit the draft text before publishing. Prompt hardening (delimit the untrusted text, instruct the model to treat it as data not instructions) is defense-in-depth, but the review gate is the accountable control. This is a deliberate scope choice: bios are no longer auto-published.

**Crash safety — durable status with a reaper.** `@Async` runs in-memory, so a restart mid-generation would strand a row in `GENERATING` forever. Mirroring the PENDING-order expiry pattern (D3), a scheduled reaper re-queues (or marks `FAILED`) any `GENERATING` row older than a threshold (e.g. 5 minutes), so no bio is permanently stuck.

**Concurrent regeneration — generation version token.** Re-upload is allowed, so two async tasks can race; a slow earlier task could finish *after* a faster later one and overwrite newer content with older. Each upload stamps the concert with a monotonically increasing `bio_generation_id`; a completing task writes its result only if its id is still the latest, otherwise it discards. (Same ordering guard used for payment-webhook reconciliation and offline-checkin sync.)

**Cache invalidation on publish.** Concert detail is cached with a 60s TTL (D10). A status transition that changes what the public sees — i.e. reaching `PUBLISHED` (or an organizer edit to a published bio) — actively invalidates the concert-detail cache, exactly like availability invalidation after a purchase. Without this the page can show a stale "coming soon" for up to a TTL after the bio is live.

**Input hardening.** The upload path treats the PDF as hostile: validate the real content type by magic bytes (not just extension/`Content-Type`); reject encrypted/password-protected PDFs early; bound PDFBox extraction with a timeout and a page/char ceiling to defuse decompression-bomb PDFs (small on disk, huge when expanded); cap extracted text length before the Gemini call (token cost); and rate-limit regenerations per concert/organizer so repeated uploads cannot drain the free-tier quota or rack up cost.

---

### D12 — VIP Guest CSV Import: Scheduled Job with Idempotent Upsert

**Decision:** Spring `@Scheduled` job runs nightly at 02:00 (configurable), with an organizer-triggered manual import on the admin dashboard as a safety valve for late files. Reads CSV from a watched directory (or S3 bucket mount). Parses rows with Jakarta CSV; skips malformed rows with a structured error log. Upserts into `vip_guests` on the **`(concert_id, phone_normalized)`** unique key — duplicates update instead of insert. Job runs in a separate transaction; failures do not affect live traffic.

**Idempotency anchor — normalized phone, not name:** The upsert key is `(concert_id, phone_normalized)`; `name` is deliberately *excluded*. Name is mutable display data (accent/spelling variants like "Nguyễn Văn A" vs "Nguyen Van A" arrive across nightly files) — keying on it would create duplicate guest rows for the same person. Phone is the stable identity. The phone normalizer (strip spaces/dashes, resolve `0` ↔ `+84` prefix to one canonical form) is therefore load-bearing for idempotency and is unit-tested. Phone is a required column; rows without it are skipped.

**Concert identity via agreed `event_code`, not internal UUID:** The sponsor has no API and no knowledge of TicketBox's internal `concert_id` (a UUID minted in our DB). Identity therefore travels as a **human-readable `event_code`** (e.g. `ATSH-HCM-0815`) that the organizer assigns at concert creation and shares with the sponsor out-of-band — the same channel the CSV travels. The import resolves `event_code → concert_id` against the `concerts` table; an unresolvable code is a **whole-file error** (quarantine + alert), never a guess. This is rejected in favor of two weaker alternatives: embedding the UUID in the CSV (impossible — the sponsor doesn't have it) and encoding identity in the filename/drop-folder (pushes identity into the transport layer where a typo silently misfiles guests onto the wrong concert with no validation surface). With no API, structural validation against `concerts` is the *only* place a wrong-concert file can be caught before it corrupts a live guest list.

**File granularity & scoped reconciliation:** `event_code` is a **per-row** column, so one file MAY carry guests for multiple concerts (a sponsor running a festival series). This makes reconciliation scoping critical: the snapshot is authoritative only for the **concerts actually present in the file**, never globally. A file containing only *Anh Trai Say Hi* guests must NOT deactivate *Em Xinh* guests merely because they are absent. Reconciliation groups rows by resolved `concert_id` and deactivates absent guests *only within those concerts*.

**Snapshot semantics with reconcile-on-import:** The file is treated as a **full snapshot** of each represented concert's guest list, not a delta. After upserting present rows, the job deactivates `vip_guests` rows — *scoped to the concerts present in this file* — that are *absent* from the file (soft-delete: `active = false`, not hard delete — preserves audit trail and any `ENTERED` history). This handles guest *revocation*: a guest dropped from a later file is no longer admitted. Without reconciliation, the additive-only upsert could never revoke access.

**Field-level merge protects system-owned columns:** The UPDATE half of the upsert merges *sponsor-supplied columns only* (name, sponsor, zone, `active`). System-owned columns (`entered`, `entered_at`) are never touched by import — so a re-run mid-event cannot un-admit a guest who already entered.

**File lifecycle:** Successfully processed files are moved to a `processed/` archive (and skipped on future runs via content hash); unparseable files are quarantined in `error/` with an admin alert. Without a success archive, the job would re-import the same file every night — harmless under upsert but misleading in logs and risky if a stale file lingers.

**Rationale:** No brand sponsor API exists — CSV drop is the only integration point. Idempotent upsert (anchored on normalized phone) means re-processing the same file is safe. Full-snapshot reconciliation makes the in-DB list converge to exactly what the sponsor last sent. Separate transaction isolation means a bad CSV file cannot corrupt existing guest data or contend with the purchase path.

---

### D13 — Notification Architecture: Strategy Pattern for Channels

**Decision:** `NotificationService` dispatches through a list of registered `NotificationChannel` implementations (email via JavaMailSender, in-app via WebSocket/SSE). New channels (Zalo OA, SMS) added by implementing the interface and registering as a Spring bean — zero changes to call sites.

**Rationale:** Project requirement explicitly states the system must be extensible for new notification channels without major changes. Strategy pattern + Spring bean registration is the natural implementation in Spring Boot.

---

### D14 — Message Broker: Redis Pub/Sub for Notifications

**Decision:** Use Redis Pub/Sub for internal event dispatch (purchase-confirmed → notification workers). Not RabbitMQ/Kafka.

**Rationale:** Redis is already in the stack for cache and rate limiting. Redis Pub/Sub is sufficient for at-most-once notification delivery and avoids adding a 4th infrastructure service.

**Delivery tiers — best-effort vs must-arrive:** Not all notifications tolerate loss equally.
- *Best-effort (Pub/Sub is fine):* in-app toast, the T-24h reminder. Losing one is acceptable.
- *Must-arrive (needs durability):* the e-ticket delivery after a paid order. This rides a **transactional outbox**, not fire-and-forget Pub/Sub — the outbox row is written in the same transaction that marks the order `PAID`, and a worker delivers (email) with retry until acknowledged. This is doubly safe because the signed QR is also persisted on the order, so the buyer can always retrieve the e-ticket in-app even if email delivery is delayed. Payment *state* itself is never carried over Pub/Sub — it is handled synchronously in the transaction.

## Risks / Trade-offs

- **Inventory row contention under extreme load** → the conditional atomic decrement (D3) still serializes writes on a single `ticket_type` row; response time grows with contention. Mitigation: the waiting queue (D16) bounds how many admitted sessions contend at once, rate limiting bounds request rate, and the connection pool (`HikariCP`) cap prevents thread exhaustion. Accept: for 200 SVIP seats among 80k buyers, the bottleneck is intentional — we serialize access, not parallelize it.

- **Redis single point of failure (now broader)** → Redis backs cache, rate-limit buckets, the per-user limit fast gate (D4), the idempotency fast path (D6), and the waiting queue (D16). On Redis loss: cache misses fall to DB; rate limiting falls back to allow-all; the **durable Postgres guards still hold** for idempotency (UNIQUE) and per-user limit (in-transaction count), so correctness is preserved even though throughput degrades. The waiting queue is unavailable during a Redis outage — fallback is to close the sale-open gate (fail-safe: reject new entrants) rather than admit an unmetered herd. Mitigation: Redis persistence (AOF) enabled; accept a degraded-performance window during restart rather than blocking all traffic.

- **Reservation-leak / counter drift** → if the expiry job (D3) stalls, abandoned `PENDING` orders hold inventory and inflate the Redis per-user counter. Mitigation: the job is idempotent and frequent; the DB count (D4) and `remaining` column are the self-correcting source of truth, so a delayed job degrades availability of seats temporarily but never corrupts correctness.

- **Offline check-in clock skew** → Mobile device time may differ from server time, affecting timestamp ordering. Mitigation: server timestamp is authoritative for `checked_in_at`; device timestamp is stored separately for audit only.

- **Circuit breaker hides partial payment success** → Gateway charged user but timeout before response → circuit opens → user sees error but was charged. Mitigation: idempotency key ensures retry returns same result; webhook from VNPAY/MoMo reconciles async; order marked `PENDING_CONFIRMATION` until webhook arrives.

- **PDF text extraction quality** → Scanned PDFs or image-only press kits yield no extractable text. Mitigation: validate extracted text length before calling the Gemini API; surface error to Organizer with "Text extraction failed — please upload a text-based PDF."

- **CSV malformed data** → Sponsor sends inconsistent column names or encoding. Mitigation: flexible header mapping (case-insensitive, trim whitespace); log and skip individual bad rows; alert Organizer via admin dashboard after import.

---

### D15 — Runtime & Build Stack: Java 25 + Spring Boot 4 + Gradle (Groovy DSL)

**Decision:** Backend targets Java 25 and Spring Boot 4. Build system is Gradle with the Groovy DSL (`build.gradle`).

**Alternatives considered:**
- *Java 21 LTS + Spring Boot 3*: The previous LTS pairing; more library ecosystem coverage but misses Java 25 virtual thread improvements and newer language features.
- *Maven*: Wider familiarity in enterprise Java, but more verbose; Gradle offers shorter build scripts and better incremental compilation performance.
- *Gradle Kotlin DSL*: Statically typed, IDE-friendly, but team preference is Groovy DSL for this project.

**Rationale:**
- Java 25 brings finalized virtual threads (Project Loom). These help most on **I/O-bound, non-DB-contended paths** — concert browsing, AI/PDF calls, gateway HTTP waits — where thousands of cheap parked threads beat a bounded platform-thread pool. On the **purchase write path the limiter is the DB connection pool + the inventory row lock, not thread count**: virtual threads merely park more cheaply on the same bounded HikariCP pool, they do not remove the serialization. The waiting queue (D16) and rate limiting are what actually bound that path. The 80k-concurrency story is therefore "absorb the read/browse herd with virtual threads; meter the write herd with the queue."
- Spring Boot 4 (built on Spring Framework 7) aligns with Jakarta EE 11 and provides first-class virtual thread support via `spring.threads.virtual.enabled=true`.
- Gradle Groovy DSL is familiar, concise, and well-supported by the Spring Boot Gradle plugin.

**Compatibility notes:**
- Verify all third-party dependencies (Resilience4j, Apache PDFBox, jjwt, Jakarta CSV) against the Spring Boot 4 BOM before locking versions.
- Spring Boot 4 requires Java 17 minimum; Java 25 is forward-compatible.
- Spring Security 7 (bundled with SB4) changes some configuration APIs — security config must use the lambda DSL, not deprecated `WebSecurityConfigurerAdapter`.

---

### D16 — Sale-Open Spike: Virtual Waiting Queue

**Decision:** Purchase access during a sale-open window is gated by a **virtual waiting queue** backed by Redis, not by raw rate-limit rejection. On arrival a user is issued a signed queue token and a position; the backend admits users from the front of the queue at a controlled rate (the rate the purchase path can actually serve) into a short-lived "admitted" window during which they may call the purchase endpoint.

```
                    ┌─────────────────────────────┐
80k arrive ───────▶ │  Waiting room (Redis ZSET)  │
                    │  "You are #14,203 in line"  │  ← FIFO by enqueue time
                    └──────────────┬──────────────┘
                                   │ admit N/sec from the head
                                   ▼
                    ┌─────────────────────────────┐
                    │  Admitted window (token TTL)│  ← token required to
                    │  → POST /tickets/purchase   │     reach purchase path
                    └──────────────┬──────────────┘
                                   │ token-scoped token bucket (D5)
                                   ▼
                       Conditional atomic decrement (D3)
```

**Mechanics:**
- Queue is a Redis sorted set scored by enqueue timestamp (FIFO ⇒ fairness). Admission is a periodic job popping the head at a configurable admit-rate tied to DB capacity.
- The admit token is short-lived (e.g. 2–3 min) and is required by the purchase endpoint; expired/absent token ⇒ redirected back to the queue. This caps how many sessions can contend on the inventory row at once, which directly bounds D3 lock depth.
- Front end polls position; users see "#N in line, est. wait …" instead of a 429 error.

**Alternatives considered:**
- *Pure rate-limit rejection (token bucket only)*: simplest, but returns 429 to tens of thousands of *real* users who then hammer retry — no ordering, no fairness, rewards the fastest/most-aggressive client. Directly conflicts with the brief's repeated *"tính công bằng giữa các khán giả thật"* (fairness among real audience members).
- *First-come DB write free-for-all*: no protection; the thundering herd collapses the connection pool.

**Rationale:** The brief pairs the 80k-spike requirement with fairness *twice*. A FIFO queue is the literal implementation of fairness and converts an unbounded thundering herd into a metered, ordered stream sized to what the inventory path can serve — protecting D3's lock and the connection pool while giving real users a predictable experience instead of a retry lottery. Token bucket (D5) remains in front of always-open endpoints and behind the admission gate.
