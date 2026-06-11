## ADDED Requirements

### Requirement: User receives purchase confirmation with e-ticket
After a successful ticket purchase, the system SHALL send a confirmation notification containing order details and all QR e-tickets to the buyer.

#### Scenario: Email confirmation sent after payment confirmed
- **WHEN** a payment is confirmed and the order transitions to PAID status
- **THEN** the system sends an email to the buyer's registered address within 30 seconds, containing order summary and QR code image(s) for each purchased ticket

#### Scenario: In-app notification sent after payment confirmed
- **WHEN** a payment is confirmed and the buyer is an authenticated app session
- **THEN** the system sends an in-app push notification with the order confirmation and a deep link to view e-tickets

#### Scenario: Notification delivery failure does not fail the order
- **WHEN** the email provider is unavailable at the time of sending
- **THEN** the system retries the notification up to 3 times with exponential backoff; the order remains PAID regardless of notification outcome

#### Scenario: E-ticket delivery survives a process crash (must-arrive via outbox)
- **WHEN** an order transitions to PAID
- **THEN** the e-ticket notification intent is written to a transactional outbox in the same database transaction that marks the order PAID; a worker delivers it with retry until acknowledged, so the e-ticket is not lost even if the application process crashes between commit and send — the persisted QR on the order also remains retrievable in-app as a backstop

#### Scenario: Best-effort notifications use lightweight dispatch
- **WHEN** a best-effort notification (in-app toast, 24h reminder) is dispatched
- **THEN** the system MAY use fire-and-forget Pub/Sub without the durable outbox guarantee, since loss of one such message is acceptable; only must-arrive notifications (e-ticket delivery) require the outbox

### Requirement: System sends 24-hour pre-event reminder
The system SHALL automatically send a reminder notification to all ticket holders 24 hours before the concert starts.

#### Scenario: Reminder sent on schedule
- **WHEN** 24 hours before a concert's start datetime
- **THEN** the system sends a reminder email and in-app notification to all users with PAID tickets for that concert, including event details and a link to their e-tickets

#### Scenario: Reminder not sent for cancelled concert
- **WHEN** a concert is cancelled before its reminder window
- **THEN** no reminder is sent; instead, cancellation notifications are sent to ticket holders

### Requirement: Notification channels are pluggable
The notification system SHALL be implemented with a pluggable channel architecture that allows new channels (Zalo OA, SMS) to be added without modifying existing business logic.

#### Scenario: New channel added without code change to order flow
- **WHEN** a new SMS notification channel is registered as a Spring bean implementing the NotificationChannel interface
- **THEN** the system automatically includes SMS in all outbound notifications without any changes to the purchase or reminder services

#### Scenario: One channel failing does not block others
- **WHEN** the email channel throws an exception during notification dispatch
- **THEN** the system logs the error and continues delivering through remaining channels (in-app, etc.)

### Requirement: Concert cancellation triggers notification to all ticket holders
When an ORGANIZER cancels a concert, the system SHALL notify all affected ticket holders.

#### Scenario: Cancellation notification dispatched
- **WHEN** an ORGANIZER cancels a concert with existing PAID ticket holders
- **THEN** the system sends a cancellation notification via all registered channels to every ticket holder within 5 minutes of cancellation
