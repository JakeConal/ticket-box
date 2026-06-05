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
- **THEN** the system verifies the gateway signature, marks the order as PAID, decrements inventory, and triggers e-ticket generation and notification

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
The system SHALL handle payment timeout scenarios where the gateway response is not received within the expected window.

#### Scenario: Gateway call times out
- **WHEN** the payment gateway does not respond within the configured timeout (10 seconds)
- **THEN** the system marks the order as PENDING_CONFIRMATION, does not decrement inventory yet, and waits for the gateway webhook to reconcile

#### Scenario: Order reconciled via webhook after timeout
- **WHEN** the payment gateway sends a delayed webhook confirming the payment after a prior timeout
- **THEN** the system processes the webhook, marks the order as PAID, and triggers e-ticket delivery — no duplicate charge occurs
