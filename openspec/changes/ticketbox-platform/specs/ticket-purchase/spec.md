## ADDED Requirements

### Requirement: Authenticated user can purchase tickets
An authenticated user (AUDIENCE role; ORGANIZER inherits audience permissions per admin-rbac) SHALL be able to select a ticket type and quantity, proceed to payment, and receive a QR e-ticket upon successful payment.

#### Scenario: Successful purchase end-to-end
- **WHEN** an authenticated user selects 2 CAT1 tickets, completes payment via VNPAY, and the gateway confirms payment
- **THEN** the system decrements ticket inventory by 2, creates an order with status PAID, and issues 2 QR e-tickets to the user

#### Scenario: Purchase attempt before sale opens
- **WHEN** a user attempts to purchase tickets before the ticket type's sale open datetime
- **THEN** the system returns HTTP 403 with message "Sale has not opened yet"

#### Scenario: Purchase attempt for sold-out ticket type
- **WHEN** a user attempts to purchase tickets for a ticket type with zero remaining inventory
- **THEN** the system returns HTTP 409 with message "Tickets sold out" without initiating a payment session

### Requirement: Per-user ticket purchase limit is enforced atomically
The system SHALL prevent any user from purchasing more tickets of a given ticket type than the configured per-user limit, even when submitting multiple concurrent requests.

#### Scenario: User within purchase limit
- **WHEN** a user purchases 1 SVIP ticket (limit is 2) and then attempts to purchase 1 more SVIP ticket
- **THEN** the second purchase succeeds; total owned SVIP tickets is 2

#### Scenario: User at purchase limit
- **WHEN** a user already owns 2 SVIP tickets (limit is 2) and attempts to purchase 1 more
- **THEN** the system returns HTTP 409 with message "Purchase limit reached for this ticket type"

#### Scenario: Concurrent requests bypassing limit
- **WHEN** a user submits 3 simultaneous purchase requests for SVIP tickets (limit is 2)
- **THEN** at most 2 requests succeed; all others are rejected with HTTP 409; total owned never exceeds 2

### Requirement: Ticket inventory is decremented atomically
The system SHALL ensure that concurrent purchases of the same ticket type never result in negative inventory or two users holding the same last ticket.

#### Scenario: Last ticket purchased by one buyer
- **WHEN** two users simultaneously attempt to purchase the last remaining SVIP ticket
- **THEN** exactly one purchase succeeds and the other receives HTTP 409 "Tickets sold out"

#### Scenario: Inventory decremented via single atomic conditional update
- **WHEN** a purchase reserves inventory
- **THEN** the decrement is performed by a single conditional statement (`UPDATE ticket_type SET remaining = remaining - :qty WHERE id = :id AND remaining >= :qty`); a result of zero rows affected is treated as sold out and no order is created

### Requirement: Reserved inventory is released when an order is not paid
Inventory is decremented at order creation (reserve-on-create), so the system SHALL reclaim inventory from orders that never reach PAID, ensuring abandoned checkouts do not permanently lock seats.

#### Scenario: Unpaid PENDING order expires and releases inventory
- **WHEN** an order remains in PENDING status (payment URL issued but no payment completed) for more than the reservation window (8 minutes)
- **THEN** a background job transitions the order to EXPIRED and restores inventory (remaining += quantity) so the seats become purchasable again

#### Scenario: Released order frees the buyer's per-user quota
- **WHEN** an order transitions to FAILED or EXPIRED
- **THEN** the system decrements the buyer's per-user limit counter for that ticket type so the released tickets no longer count against their limit; a PAID order never decrements the counter

### Requirement: Sale-open access is gated by a fair waiting queue
During a sale-open window the system SHALL admit users to the purchase path through a FIFO waiting queue rather than rejecting excess load outright, so that access order reflects arrival order.

#### Scenario: User enters the waiting queue at sale open
- **WHEN** a user arrives at the purchase flow while the queue is active
- **THEN** the system enqueues them by arrival time, returns a queue position, and does not allow a purchase call until they hold a valid admission token

#### Scenario: Admission proceeds in arrival order at a controlled rate
- **WHEN** the admission job admits users from the front of the queue
- **THEN** users are admitted in FIFO order at a rate bounded by purchase-path capacity, each receiving a short-lived admission token required by the purchase endpoint

#### Scenario: Purchase attempt without a valid admission token
- **WHEN** a user calls the purchase endpoint without a valid (non-expired) admission token while the queue is active
- **THEN** the request is rejected and the user is redirected back to the waiting queue

### Requirement: User receives QR e-ticket after successful payment
After a payment is confirmed, the system SHALL generate a unique, cryptographically-signed QR code for each purchased ticket and deliver it to the buyer.

#### Scenario: E-ticket delivered after payment confirmation
- **WHEN** payment is confirmed by the gateway webhook or redirect callback
- **THEN** the system generates an asymmetrically-signed (EdDSA/RS256) JWT QR code per ticket using a server-held private key, stores it in the order, and dispatches it to the user via the notification system within 30 seconds

#### Scenario: QR code is unique per ticket
- **WHEN** two users purchase tickets for the same concert
- **THEN** each ticket has a distinct QR code that cannot be used to check in another ticket

### Requirement: Unauthenticated users cannot purchase tickets
The system SHALL reject purchase attempts from unauthenticated requests.

#### Scenario: Purchase without authentication
- **WHEN** an unauthenticated user attempts to POST to the purchase endpoint
- **THEN** the system returns HTTP 401 and does not create any order or payment session
