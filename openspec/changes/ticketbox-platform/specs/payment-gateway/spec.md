## ADDED Requirements

### Requirement: Payment is initiated via VNPAY or MoMo
The system SHALL support initiating a payment session through either VNPAY or MoMo based on the user's selection.

API contract: payment sessions are initiated only through `POST /api/tickets/purchase`, which returns `{orderId, paymentUrl}` after inventory reservation and idempotency-key claim.

#### Scenario: VNPAY payment session created
- **WHEN** a user selects VNPAY and submits a purchase request
- **THEN** the system creates a pending order, calls the VNPAY API to create a payment URL, and returns the redirect URL to the client within 2 seconds

#### Scenario: MoMo payment session created
- **WHEN** a user selects MoMo and submits a purchase request
- **THEN** the system creates a pending order, calls the MoMo API to create a payment URL, and returns the redirect URL to the client within 2 seconds

### Requirement: Payment result is confirmed via gateway callback
The system SHALL process the payment gateway's callback (webhook or redirect) to confirm or reject the payment and update the order accordingly.

API contract: VNPAY sends `GET /api/payments/vnpay/callback`; MoMo sends `POST /api/payments/momo/callback`. These callback endpoints are not JWT-authenticated, but they MUST verify the provider signature before changing order state.

#### Scenario: Successful payment callback
- **WHEN** the payment gateway sends a successful payment notification
- **THEN** the system verifies the gateway signature, marks the order as PAID, and triggers e-ticket generation and notification — inventory was already decremented at order creation and requires no further change

#### Scenario: Failed payment callback
- **WHEN** the payment gateway sends a failed or cancelled payment notification
- **THEN** the system marks the order as FAILED, releases the inventory reservation, and the user is informed of the failure

#### Scenario: Invalid gateway signature on callback
- **WHEN** a callback arrives with an invalid or missing signature
- **THEN** the system returns HTTP 400, discards the callback, and does not change order status

### Requirement: Each purchase attempt is idempotent
The system SHALL prevent a user from being charged twice for the same purchase attempt, regardless of client retries or network interruptions.

#### Scenario: Duplicate purchase request within Redis fast-path TTL
- **WHEN** a client sends a purchase request with the same Idempotency-Key header within the 24-hour Redis fast-path cache TTL
- **THEN** the system returns the result of the original request (same order ID, same status) without initiating a new payment session

#### Scenario: Duplicate purchase request after Redis fast-path TTL expiry
- **WHEN** a client sends a purchase request with an Idempotency-Key whose 24-hour Redis fast-path cache entry has expired
- **THEN** the system checks the durable PostgreSQL `idempotency_keys` table and, while the DB row exists, returns the stored result without creating a new payment session

#### Scenario: Purchase without idempotency key
- **WHEN** a client submits a purchase request without the Idempotency-Key header
- **THEN** the system generates and assigns an idempotency key server-side, and includes it in the response headers

#### Scenario: Idempotency key persisted durably as the source of truth
- **WHEN** a purchase request is processed with an Idempotency-Key
- **THEN** the system records the key in a durable store (a PostgreSQL `idempotency_keys` table with a UNIQUE constraint on the key) within the purchase transaction, with Redis used only as a fast-path cache

#### Scenario: Duplicate request when Redis fast-path is unavailable
- **WHEN** two requests with the same Idempotency-Key arrive concurrently (or on retry) and the Redis cache is unavailable
- **THEN** the durable UNIQUE constraint admits exactly one (first-writer-wins via `INSERT ... ON CONFLICT DO NOTHING`); the duplicate returns the stored result and no second payment session is created or charged

### Requirement: Circuit breaker protects against gateway failures
The system SHALL use a circuit breaker to prevent cascading failures when VNPAY or MoMo is consistently unavailable.

#### Scenario: Circuit breaker opens after threshold failures
- **WHEN** 5 or more payment gateway calls fail within a 10-second window
- **THEN** the circuit breaker transitions to OPEN state and subsequent purchase attempts receive HTTP 503 "Payment temporarily unavailable" without attempting to call the gateway

#### Scenario: Circuit breaker probes gateway after cooldown
- **WHEN** the circuit breaker has been OPEN for 30 seconds
- **THEN** it transitions to HALF-OPEN and allows a single probe request; if the probe succeeds, it transitions to CLOSED

#### Scenario: Non-payment features available when circuit is open
- **WHEN** the payment circuit breaker is OPEN
- **THEN** concert browsing, ticket availability queries, check-in, and admin functions continue to operate normally

### Requirement: Payment timeout is handled without double-charging
The system SHALL distinguish between two distinct timeout scenarios: failure before the user pays (URL creation timeout) and failure after the user pays (webhook delivery timeout). Each is handled differently.

#### Scenario: Payment URL creation times out (user has not yet paid)
- **WHEN** the backend call to the gateway to create a payment session does not respond within the configured timeout (10 seconds)
- **THEN** the system marks the order as FAILED, restores inventory (`remaining_quantity += quantity`), and returns HTTP 503 to the client — the client never received a payment URL so the user was never redirected and has definitely not been charged; they must start a new purchase attempt

#### Scenario: Webhook delivery times out (user may have already paid)
- **WHEN** the user was successfully redirected to the gateway, completed payment on the gateway's page, but the gateway's webhook notification does not reach the backend within the expected window
- **THEN** the system marks the order as PENDING_CONFIRMATION and does NOT restore inventory — the user may have been charged and the seat must remain reserved until the true outcome is known

#### Scenario: Order reconciled via webhook after delivery timeout — payment succeeded
- **WHEN** the payment gateway sends a delayed webhook confirming successful payment for a PENDING_CONFIRMATION order
- **THEN** the system verifies the signature, marks the order as PAID, and triggers e-ticket generation and notification — inventory remains decremented (correct), no duplicate charge occurs

#### Scenario: Order reconciled via webhook after delivery timeout — payment failed
- **WHEN** the payment gateway sends a delayed webhook confirming payment failure for a PENDING_CONFIRMATION order
- **THEN** the system marks the order as FAILED and restores inventory (`remaining_quantity += quantity`) so the seats become available again

#### Scenario: Gateway is actively queried before expiring an unconfirmed order
- **WHEN** an order has remained in PENDING_CONFIRMATION for more than 15 minutes with no webhook received
- **THEN** before expiring it, the background job queries the gateway's transaction-status API (VNPAY query / MoMo transaction query); if the gateway reports a successful charge the order is marked PAID (inventory stays reserved, e-tickets issued); only if the gateway reports failure or no transaction is the order marked EXPIRED and inventory restored

#### Scenario: No webhook received and gateway query is inconclusive
- **WHEN** an order remains in PENDING_CONFIRMATION past the expiry window and the gateway status query fails or returns no transaction
- **THEN** the background expiry job marks the order as EXPIRED and restores inventory — the user must start a new purchase attempt

### Requirement: Late payment confirmation for an expired order results in a refund, never a re-granted seat
If a successful payment is confirmed (by webhook or status query) for an order that has already been EXPIRED, the system SHALL NOT re-grant the inventory — the seats were released and may have been resold — and SHALL route the order to a refund path instead.

API contract: `GET /api/admin/orders?concertId=&status=REFUND_REQUIRED` lists refund-required orders for concerts owned by the ORGANIZER; `POST /api/admin/orders/{id}/mark-refunded` records the manual refund result after ownership verification. No automated gateway refund API is exposed.

#### Scenario: Success webhook arrives for an already-EXPIRED order
- **WHEN** the gateway delivers a valid, signature-verified success webhook for an order in EXPIRED status
- **THEN** the system marks the order REFUND_REQUIRED (it does not restore or re-decrement `remaining_quantity` and does not issue e-tickets), notifies the user that their payment will be refunded, and surfaces the order in the organizer/admin dashboard for refund handling

#### Scenario: Refund execution is manual and out-of-band
- **WHEN** an order is in REFUND_REQUIRED status
- **THEN** the actual money movement is performed manually by the organizer through the gateway's merchant portal (automated refund API integration is out of scope); once done, the organizer marks the order REFUNDED in the admin dashboard for audit
