## ADDED Requirements

### Requirement: Payment is initiated via VNPAY or MoMo
The system SHALL support initiating a payment session through either VNPAY or MoMo based on the user's selection.

#### Scenario: VNPAY payment session created
- **WHEN** a user selects VNPAY and submits a purchase request
- **THEN** the system creates a pending order, calls the VNPAY API to create a payment URL, and returns the redirect URL to the client within 2 seconds

#### Scenario: MoMo payment session created
- **WHEN** a user selects MoMo and submits a purchase request
- **THEN** the system creates a pending order, calls the MoMo API to create a payment URL, and returns the redirect URL to the client within 2 seconds

### Requirement: Payment result is confirmed via gateway callback
The system SHALL process the payment gateway's callback (webhook or redirect) to confirm or reject the payment and update the order accordingly.

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

#### Scenario: Duplicate purchase request within TTL
- **WHEN** a client sends a purchase request with the same Idempotency-Key header within 24 hours
- **THEN** the system returns the result of the original request (same order ID, same status) without initiating a new payment session

#### Scenario: New purchase after TTL expiry
- **WHEN** a client sends a purchase request with an Idempotency-Key that expired more than 24 hours ago
- **THEN** the system treats it as a new request and creates a new payment session

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
- **THEN** the system marks the order as FAILED, restores inventory (remaining += quantity), and returns HTTP 503 to the client — the client never received a payment URL so the user was never redirected and has definitely not been charged; they must start a new purchase attempt

#### Scenario: Webhook delivery times out (user may have already paid)
- **WHEN** the user was successfully redirected to the gateway, completed payment on the gateway's page, but the gateway's webhook notification does not reach the backend within the expected window
- **THEN** the system marks the order as PENDING_CONFIRMATION and does NOT restore inventory — the user may have been charged and the seat must remain reserved until the true outcome is known

#### Scenario: Order reconciled via webhook after delivery timeout — payment succeeded
- **WHEN** the payment gateway sends a delayed webhook confirming successful payment for a PENDING_CONFIRMATION order
- **THEN** the system verifies the signature, marks the order as PAID, and triggers e-ticket generation and notification — inventory remains decremented (correct), no duplicate charge occurs

#### Scenario: Order reconciled via webhook after delivery timeout — payment failed
- **WHEN** the payment gateway sends a delayed webhook confirming payment failure for a PENDING_CONFIRMATION order
- **THEN** the system marks the order as FAILED and restores inventory (remaining += quantity) so the seats become available again

#### Scenario: No webhook received within expiry window
- **WHEN** an order remains in PENDING_CONFIRMATION status for more than 15 minutes with no webhook received
- **THEN** the background expiry job marks the order as EXPIRED and restores inventory — the user must contact support or start a new purchase attempt
