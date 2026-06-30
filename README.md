# TicketBox

TicketBox is a Spring Boot, Next.js, PostgreSQL, Redis, and Nginx ticketing platform with organizer concert management, audience purchase flow, signed QR tickets, checker gate APIs, offline check-in sync, VIP CSV import, payment callbacks, AI artist bio review, caching, rate limiting, notifications, and sale-open waiting queues.

## Prerequisites

- Docker Desktop with WSL integration enabled, or Docker Engine inside WSL.
- Node.js 22+ for local smoke and load scripts.
- OpenSpec CLI available on `PATH` for change validation.
- Ports `8088`, `8080`, `3000`, `5432`, and `6379` free, or override them in `docker-compose.yml`.

Copy `.env.example` to `.env` for local overrides when needed. The defaults are usable for a local demo.

## Run

From the repository root:

```sh
docker compose up --build
```

The public web app is served through Nginx at `http://localhost:8088`. The API is available through the same reverse proxy at `http://localhost:8088/api/**`; direct API and web service ports are also exposed at `http://localhost:8080` and `http://localhost:3000` for debugging.

If `8088` is already allocated, run with an alternate reverse-proxy port:

```sh
NGINX_PORT=18088 docker compose up --build
```

Flyway runs automatically when the API starts. The seed migrations create demo users, four published concerts, ticket types, seat maps, and published artist bios. A repeatable VIP CSV sample is stored in `import-samples/vip-guests-sample.csv`.

## AI Artist Bio

Live AI bio generation uses Google Gemini. Set `GEMINI_API_KEY` in your local `.env` before uploading a press-kit PDF from the organizer dashboard. Keep `.env` local-only and never commit API keys.

Runtime knobs:

- `GEMINI_API_KEY`: required for live generation.
- `GEMINI_MODEL`: Gemini model name, default `gemini-2.0-flash`.
- `GEMINI_REQUEST_TIMEOUT`: outbound Gemini request timeout, default `30s`.
- `ARTIST_PDF_STORAGE_DIR`: local PDF storage path, default `./storage/artist-pdfs`.
- `ARTIST_PDF_MAX_BYTES`: upload size limit in bytes, default `20971520` (20MB).
- `ARTIST_PDF_MAX_PAGES`: page limit, default `20`.
- `ARTIST_PDF_MAX_EXTRACTED_CHARS`: extracted text cap, default `40000`.
- `ARTIST_BIO_MAX_PROMPT_CHARS`: prompt text cap, default `20000`.
- `ARTIST_PDF_EXTRACTION_TIMEOUT`: PDF text extraction timeout, default `10s`.

Use `import-samples/artist-press-kit-sample.pdf` for a small text-based demo upload. The file contains selectable text so the extraction path can produce source content for Gemini.

If the API restarts while a bio is still `GENERATING`, the scheduled reaper marks it `FAILED` with `Generation interrupted - please retry` so organizers can safely upload again. Regeneration throttling is currently in-memory and intended for the single-instance local/demo stack; use a database-backed guard before running multiple API instances.

## Seed Accounts

All seeded accounts use password `password`.

| Role | Email |
| --- | --- |
| ORGANIZER | `organizer@ticketbox.vn` |
| CHECKER | `checker1@ticketbox.vn` |
| CHECKER | `checker2@ticketbox.vn` |
| AUDIENCE | `audience1@ticketbox.vn` |
| AUDIENCE | `audience2@ticketbox.vn` |
| AUDIENCE | `audience3@ticketbox.vn` |

Seed event codes are `ATSH-HCM-2026`, `ATVNCG-HN-2026`, `EXSH-HCM-2026`, and `CDDG-HN-2026`. Each concert has GA, CAT2, CAT1, VIP, and SVIP ticket types.

## API Overview

| Area | Routes |
| --- | --- |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh` |
| Public concerts | `GET /api/concerts`, `GET /api/concerts/{id}`, `GET /api/concerts/{id}/availability` |
| Organizer admin | `/api/admin/concerts/**`, `/api/admin/orders/**`, `/api/admin/vip-imports` |
| Queue and purchase | `POST /api/queue/{concertId}/enter`, `GET /api/queue/{concertId}/status`, `POST /api/tickets/purchase` |
| Payments | `GET /api/payments/vnpay/callback`, `GET /api/payments/vnpay/ipn`, `POST /api/payments/momo/callback` |
| Orders and tickets | `GET /api/orders/{id}`, `GET /api/orders/{id}/tickets` |
| Checker | `GET /api/checker/key-bundle`, `GET /api/checker/assignments`, `POST /api/checker/assignment-audit` |
| Check-in and VIP gate | `POST /api/checkins/{ticketId}`, `POST /api/checkins/batch`, `GET /api/vip-guests`, `POST /api/vip-guests/{id}/enter` |

Public concert responses expose only published bio text. Draft bio and processing error fields stay behind organizer review routes.

## Verification

Backend tests in Docker/WSL:

```sh
wsl docker run --rm -v "/mnt/d/hcmus-sixth-semester-practice/Software Design/Final Project/ticket-box/api:/workspace" -w /workspace gradle:9-jdk25-alpine gradle --no-daemon --project-cache-dir /tmp/ticketbox-gradle-cache test
```

Frontend build:

```sh
wsl docker build -f ticketbox-web/Dockerfile -t ticketbox-web-final-check .
```

Compose build and runtime smoke:

```sh
wsl docker compose build api web
NGINX_PORT=18088 LOAD_USERS=20 sh scripts/verify-runtime-stack.sh
```

The default runtime smoke does not call Gemini. To include the AI bio lifecycle (`upload -> DRAFT -> public hidden -> publish -> public visible`), set `GEMINI_API_KEY` in local `.env` and run:

```sh
AI_BIO_SMOKE=true NGINX_PORT=18088 LOAD_USERS=20 sh scripts/verify-runtime-stack.sh
```

This AI smoke uses the real Gemini service, so it requires outbound network access from the API container and available Gemini quota. Increase `AI_BIO_SMOKE_TIMEOUT_MS` if generation is slow.

Queue/load simulation against a running stack:

```sh
LOAD_USERS=500 node scripts/load-purchase-queue.mjs
```

OpenSpec validation:

```sh
openspec validate ticketbox-platform --strict
```

The detailed lifecycle coverage lives in the backend integration tests:

- `TicketPurchaseIntegrationTest`: purchase idempotency, payment callbacks, expiry, refund-required late success, refund marking, inventory release, notification outbox.
- `QueueAdmissionIntegrationTest`: FIFO queue admission, admission-token enforcement, expiry, and rate bounds.
- `CheckinIntegrationTest`: checker assignments, local/offline replay semantics, duplicate conflicts, gate/zone enforcement, emergency audit, organizer conflict visibility, and VIP gate entry.
- `ArtistBioIntegrationTest`: PDF validation, Gemini mock handling, draft/public bio boundaries, failure storage, stale generation handling, and cache invalidation.
- `VipGuestImportServiceTest`: unknown event codes, partial row failure, duplicate/import idempotency, scoped deactivation, content-hash skip, archive movement, and entered preservation.
