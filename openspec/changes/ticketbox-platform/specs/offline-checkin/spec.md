## ADDED Requirements

### Requirement: Checker staff can scan and validate QR e-tickets at the gate
An authenticated user with the CHECKER role SHALL be able to scan a QR code using the mobile app and receive an immediate pass/fail result.

#### Scenario: Valid QR code scanned while online
- **WHEN** a CHECKER scans a valid, unused QR e-ticket while connected to the network
- **THEN** the app displays a green "VALID — [Ticket Type] [Name]" result within 1 second and the backend marks the ticket as checked-in

#### Scenario: Invalid or tampered QR code scanned
- **WHEN** a CHECKER scans a QR code with an invalid JWT signature
- **THEN** the app displays a red "INVALID — Tampered or unrecognized ticket" result

#### Scenario: Already-checked-in ticket scanned
- **WHEN** a CHECKER scans a QR code for a ticket that is already marked as checked-in
- **THEN** the app displays a red "ALREADY USED — Checked in at [timestamp]" result

### Requirement: Check-in operates correctly without network connectivity
The checker mobile app SHALL record check-ins locally and provide pass/fail decisions when the backend is unreachable.

#### Scenario: Valid QR scanned while offline
- **WHEN** a CHECKER scans a valid QR code while the device has no network connection
- **THEN** the app verifies the JWT signature locally, displays the result, and records the check-in in local SQLite storage with PENDING_SYNC status

#### Scenario: Duplicate scan while offline (same session)
- **WHEN** a CHECKER scans the same QR code twice while offline
- **THEN** the app detects the duplicate in local SQLite and displays "ALREADY USED" for the second scan

#### Scenario: App reconnects after offline period
- **WHEN** the device regains network connectivity
- **THEN** the app automatically flushes all PENDING_SYNC check-ins to the backend via `POST /checkins/batch` within 30 seconds

### Requirement: Offline check-in sync is idempotent and conflict-free
The backend SHALL process batched offline check-ins without creating duplicate records or allowing a ticket to be marked as checked-in more than once.

#### Scenario: Batch sync with no conflicts
- **WHEN** the checker app sends a batch of 50 offline check-ins to the backend
- **THEN** the backend upserts all records, marks each ticket as checked-in using server timestamp, and returns success for each record

#### Scenario: Batch sync with duplicate ticket
- **WHEN** the checker app sends a batch containing a ticket ID already marked as checked-in by another device
- **THEN** the backend rejects the duplicate entry, returns the existing check-in timestamp, and the app marks that local record as CONFLICT without overwriting the server state

#### Scenario: No check-in data lost on app restart during offline period
- **WHEN** the checker app is closed and reopened while offline
- **THEN** all previously recorded PENDING_SYNC check-ins are preserved in local SQLite and included in the next sync attempt

### Requirement: Checker app requires authentication
The checker mobile app SHALL require a valid CHECKER-role JWT to access QR scanning functionality.

#### Scenario: Checker accesses app with valid credentials
- **WHEN** a CHECKER logs in with valid credentials
- **THEN** the app loads the QR scanner and pre-downloads the signing public key for offline validation

#### Scenario: AUDIENCE user attempts to access checker app
- **WHEN** a user with AUDIENCE role authenticates into the checker app
- **THEN** the app displays "Access denied — this app is for authorized staff only" and returns to the login screen
