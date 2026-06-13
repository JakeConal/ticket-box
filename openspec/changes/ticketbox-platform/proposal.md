## Why

Vietnam's major concert events (Anh Trai Say Hi, Chị Đẹp Đạp Gió Rẽ Sóng, etc.) are currently sold through fragmented channels — Zalo OA, Google Forms, manual bank transfers — causing sites to crash under load, fans charged without receiving tickets, and scalper bots sweeping inventory in seconds. A unified, resilient ticketing platform is needed now to digitize the full lifecycle from sale to gate entry.

## What Changes

- Introduce a full-stack concert ticketing platform (web frontend + backend API + mobile check-in app) built from scratch
- Implement near-real-time ticket availability display while enforcing inventory and per-user purchase limits directly in PostgreSQL under concurrent load
- Integrate VNPAY/MoMo payment gateways with idempotency and circuit breaker protection
- Add offline-capable QR check-in mobile app with local-first sync, gate/zone-scoped scanner assignments, and conflict audit
- Implement RBAC with three roles: Audience, Organizer, and Checker
- Add AI-generated artist bio from uploaded PDF press kits
- Add scheduled one-way CSV import for VIP guest lists from brand sponsors
- Implement Redis-based caching for high-read endpoints (concert listing, concert detail)
- Implement rate limiting (Token Bucket) at the API gateway layer
- Add a FIFO virtual waiting queue (Redis-backed) that meters access to the purchase path during sale-open spikes — fairness by arrival order instead of 429 retry lotteries
- Add an extensible notification system (email + in-app, pluggable for Zalo OA / SMS)

## Capabilities

### New Capabilities

- `concert-management`: Create, update, cancel concerts; configure ticket types (name, price, quantity, sale window, per-user limit); manage interactive SVG seat map zones (GA, SVIP, VIP, CAT1, CAT2)
- `ticket-purchase`: Browse concerts and near-real-time availability; select ticket type and quantity; enforce per-user limits atomically; complete purchase via payment gateway; receive QR e-ticket
- `payment-gateway`: Integrate VNPAY and MoMo; idempotency key generation and dedup; circuit breaker (Closed/Open/Half-Open) with graceful degradation when gateway is down
- `offline-checkin`: Mobile app scans QR codes at assigned event gates/zones; records check-ins locally when offline; syncs to backend when connectivity resumes; prevents same-device duplicate entry, rejects wrong-gate tickets offline, and records cross-device conflicts for audit
- `notification`: Send purchase confirmation + e-ticket via email and in-app realtime notification (SSE/WebSocket); send 24h pre-event reminder; pluggable channel architecture for future Zalo OA / SMS / native push
- `admin-rbac`: Three roles — Audience (browse + buy), Organizer (full concert CRUD + revenue stats), Checker (QR scan only); JWT-based auth; middleware enforcement on every API endpoint and admin page
- `ai-artist-bio`: Organizer uploads PDF press kit; system extracts and cleans text; calls AI model (Google Gemini API, free tier) to generate short bio; bio displayed on concert detail page
- `vip-guest-csv`: Scheduled nightly import of CSV files from brand sponsor; idempotent upsert with duplicate detection; error-tolerant parsing; checker staff can verify VIP guests at gate
- `rate-limiting`: Token Bucket algorithm enforced at API gateway; configurable per-endpoint thresholds; returns 429 with Retry-After; complemented by a FIFO virtual waiting queue for sale-open windows that admits users in arrival order at a rate the purchase path can serve — together they protect the backend from 80k-user spikes while preserving fairness
- `caching`: Redis cache-aside for concert list (TTL ~5 min) and concert detail (TTL ~1 min); active invalidation of ticket count cache on each committed `remaining_quantity` mutation

### Modified Capabilities

_(none — this is a greenfield project)_

## Impact

- **New services**: Backend API (Java 25 / Spring Boot 4), Web Frontend (React/Next.js), Mobile Checker App (React Native), Redis, PostgreSQL, Redis Pub/Sub as an internal best-effort event channel (plus transactional outbox for must-arrive delivery), AI API integration
- **External dependencies**: VNPAY payment gateway, MoMo payment gateway, Google Gemini API free tier (AI artist bio), SMTP provider
- **Data**: No existing data to migrate — seed data required for 4 sample concerts with full ticket types, pricing, and seat maps
- **Infrastructure**: Requires Docker Compose setup for local dev; Redis; PostgreSQL; optional S3-compatible storage for PDF uploads
