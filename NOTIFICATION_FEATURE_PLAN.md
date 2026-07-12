# Minimal Notification Feature Tasks

## Goal

Implement the urgent notification requirement with the smallest safe scope:

- Email confirmation after successful ticket purchase.
- Email includes existing QR e-ticket attachment.
- Basic in-app confirmation through existing SSE notification backend.
- Reminder notification about 24 hours before the concert.
- Keep `NotificationChannel` as the future extension point for SMS/Zalo OA.

## Task Checklist

### Task 1: Verify Current Email Purchase Flow

- [x] Confirm `PaymentOrderService.markPaidOrRefundRequired(...)` calls `ticketIssuanceService.issueTicketsForPaidOrder(orderId)` before notification enqueue.
- [x] Confirm `NotificationOutboxService.enqueuePurchaseConfirmation(orderId)` is called only when order transitions to `PAID`.
- [x] Confirm `NotificationEventFactory.purchaseConfirmation(orderId)` loads issued tickets and attaches QR PNG files.
- [x] Confirm `NotificationOutboxWorker` sends pending email jobs through `EmailNotificationChannel`.

### Task 2: Prevent Duplicate Purchase Emails

- [x] Add a Flyway migration for a unique index on purchase confirmation outbox rows.
- [x] Recommended constraint: unique `(order_id, event_type)` for `event_type = 'PURCHASE_CONFIRMATION'`.
- [x] Update `NotificationOutboxService.insert(...)` to ignore duplicate purchase confirmation rows.
- [x] Add/update a backend test proving duplicate payment callbacks do not create duplicate purchase email jobs.

### Task 3: Keep Email E-Ticket Minimal

- [x] Keep current QR PNG attachment behavior.
- [x] Improve the email body only if needed with concert name, order ID, and ticket wallet link.
- [x] Do not implement PDF generation in this urgent scope.
- [x] Do not store generated files separately in this urgent scope.

### Task 4: Add Minimal Frontend In-App Notification

- [x] Add Next.js proxy route for backend `GET /api/notifications/stream`.
- [x] Implement a small client component using `EventSource`.
- [x] Show a simple toast/banner when an in-app notification arrives.
- [x] Include notification title, body, and deep link.
- [x] Mount the listener in `ticketbox-web/src/app/layout.tsx`.

### Task 5: Verify Reminder Behavior

- [x] Confirm `PreEventReminderJob` scans paid orders for published concerts around the 24-hour window.
- [x] Confirm `orders.reminder_sent_at` prevents duplicate reminder sends.
- [x] Keep current reminder channel behavior unless it sends unintended SMS stub messages.
- [x] If the SMS stub is active in reminders, disable it for now or remove it from active Spring registration.

### Task 6: Add Focused Tests

- [x] Test purchase confirmation outbox idempotency.
- [x] Test email outbox worker sends QR attachment payload.
- [x] Test reminder job sends only one reminder for an eligible paid order.
- [x] Test `NotificationService.sendInApp(...)` does not call email channel.
- [x] Add frontend manual verification notes if automated UI tests are not available.

Frontend manual verification note:

- Log in as an audience user, keep the browser open, complete a payment callback, and confirm a toast appears from `/audience-api/notifications/stream`.

### Task 7: Document Runtime Config

- [x] Confirm `.env.example` includes SMTP config.
- [x] Confirm `docker-compose.yml` passes SMTP config to the API.
- [x] Add short developer note for testing email locally with SMTP/Mailpit/MailHog if available.
- [x] Document that SMS/Zalo OA are deferred and will be added as new `NotificationChannel` implementations.

Runtime config note:

- Local Docker email uses Mailpit by default: `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, `SMTP_AUTH=false`, `SMTP_STARTTLS_ENABLE=false`.
- Open Mailpit at `http://localhost:8025` to inspect confirmation emails and QR e-ticket attachments.
- You do not need to give developers your personal email password for local testing. Register or log in with any test email address, for example `buyer@example.com`; Mailpit catches the email instead of sending it externally.
- For real email delivery, configure an SMTP provider in `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_AUTH=true`, and `SMTP_STARTTLS_ENABLE=true` when required by the provider.
- If using Gmail, use a Google App Password, not your normal Gmail password. Do not commit real SMTP credentials.
- SMS and Zalo OA are deferred. They should be added later as new `NotificationChannel` implementations with their own environment variables.

## Implementation Order

1. Verify current backend purchase email flow.
2. Add duplicate protection for purchase confirmation outbox.
3. Add or adjust focused backend tests.
4. Add frontend SSE proxy and listener.
5. Verify reminder behavior.
6. Update config/documentation notes.

## Minimal Acceptance Criteria

- [x] Successful payment sends one confirmation email.
- [x] Confirmation email contains QR e-ticket attachment.
- [x] Duplicate payment callbacks do not create duplicate purchase email rows.
- [x] Logged-in audience can see a basic in-app purchase confirmation.
- [x] Paid orders receive no more than one 24-hour reminder.
- [x] Future SMS/Zalo OA can still be added through `NotificationChannel`.

Acceptance status note:

- These criteria are implemented in code and configured for local Docker email through Mailpit. Full runtime verification still requires starting the stack, completing a successful payment callback, and checking `http://localhost:8025`.

## Deferred Work

- PDF e-ticket generation.
- Persistent in-app notification inbox.
- Per-channel delivery table.
- User notification preferences.
- Real SMS provider.
- Zalo OA provider.
- Admin notification monitoring UI.
