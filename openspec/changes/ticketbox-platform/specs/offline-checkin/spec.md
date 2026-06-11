## ADDED Requirements

### Requirement: Checker staff can scan and validate QR e-tickets at the gate
An authenticated user with the CHECKER role SHALL be able to scan a QR code using the mobile app and receive an immediate pass/fail result.

#### Scenario: Valid QR code scanned while online
- **WHEN** a CHECKER scans a valid, unused QR e-ticket while connected to the network
- **THEN** the app verifies the JWT signature locally, synchronously calls `POST /checkins/{ticketId}`, waits for the backend response, and only upon receiving HTTP 200 writes the check-in to local SQLite with status SYNCED and displays a green "VALID — [Ticket Type] [Name]" result within 1 second

#### Scenario: Ticket already checked in by another gate — detected online
- **WHEN** a CHECKER scans a valid QR code while online but the backend returns HTTP 409 (already checked in by another device)
- **THEN** the app writes the record to local SQLite with status CONFLICT and displays a red "ALREADY USED — Checked in at [timestamp]" result; the attendee is not admitted

#### Scenario: Network drops during online check-in call — fallback to offline path
- **WHEN** a CHECKER scans a valid QR code while online, but the backend call times out or the connection is lost before a response is received
- **THEN** the app writes the check-in to local SQLite with status PENDING_SYNC, displays a green "VALID (offline fallback)" result, and syncs to the backend when connectivity is restored

#### Scenario: Online check-in recorded locally prevents same-device duplicate after going offline
- **WHEN** a CHECKER scans a valid QR code while online, the backend confirms with HTTP 200, and the device subsequently loses network connectivity
- **THEN** any re-scan of the same ticket on the same device is rejected locally with "ALREADY USED" — the SYNCED record in local SQLite is the guard, not the network

#### Scenario: Invalid or tampered QR code scanned
- **WHEN** a CHECKER scans a QR code with an invalid JWT signature
- **THEN** the app displays a red "INVALID — Tampered or unrecognized ticket" result

#### Scenario: Already-checked-in ticket scanned (detected locally)
- **WHEN** a CHECKER scans a QR code for a ticket already present in local SQLite (status SYNCED, PENDING_SYNC, or CONFLICT)
- **THEN** the app displays a red "ALREADY USED — Checked in at [timestamp]" result without making a backend call

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
- **THEN** the backend rejects the duplicate entry, records the conflict attempt in the `checkin_conflicts` table (capturing ticket ID, attempting checker user ID, device ID, attempted timestamp, and the winning check-in timestamp), returns the existing check-in timestamp to the app, and the app marks that local record as CONFLICT without overwriting the server state

#### Scenario: Conflict audit trail is preserved for post-event review
- **WHEN** a conflict is recorded during batch sync
- **THEN** an ORGANIZER can view all conflict attempts for their concert via the admin dashboard, including which ticket was involved, which device attempted the duplicate scan, and the time difference between the original and duplicate scan — enabling post-event fraud investigation

#### Scenario: No check-in data lost on app restart during offline period
- **WHEN** the checker app is closed and reopened while offline
- **THEN** all previously recorded PENDING_SYNC check-ins are preserved in local SQLite and included in the next sync attempt

#### Scenario: Same ticket scanned on two simultaneously-offline devices (guarantee boundary)
- **WHEN** two checker devices are both offline and each scans the same ticket during the offline window
- **THEN** each device admits the holder locally (the no-double-entry guarantee is per-device always, global only on sync); when both devices later sync, the backend admits the first and records the second in `checkin_conflicts`, marking that device's local record CONFLICT — the residual double-admission window is inherent to offline multi-device operation and is mitigated operationally by single-gate assignment per ticket

### Requirement: VIP guests can be admitted via identity lookup
An authenticated CHECKER SHALL be able to search for a VIP guest by name or phone number and mark them as admitted. VIP guest lookup requires network connectivity; the VIP entrance is an organizer responsibility to keep connected.

#### Scenario: VIP guest found by phone number and admitted
- **WHEN** a CHECKER searches by phone number and a matching VIP guest record is found with `entered = false`
- **THEN** the backend returns the guest record, the CHECKER confirms the identity visually, submits `POST /checkin/vip/{vip_id}`, and the system sets `entered = true` with server timestamp; the app displays "ADMITTED — [Guest Name]"

#### Scenario: VIP guest found by name with multiple matches
- **WHEN** a CHECKER searches by name and multiple records match
- **THEN** the app displays the list of matches (name + partial phone) for the CHECKER to disambiguate; the CHECKER selects the correct record before submitting admission

#### Scenario: VIP guest already admitted
- **WHEN** a CHECKER attempts to admit a VIP guest whose record already has `entered = true`
- **THEN** the backend returns HTTP 409 and the app displays "ALREADY ADMITTED — Entered at [timestamp]"; the guest is not admitted again

#### Scenario: Person not found on VIP guest list
- **WHEN** a CHECKER searches by name or phone and no matching record exists for the concert
- **THEN** the app displays "NOT ON GUEST LIST — Contact organizer" and does not admit the person

#### Scenario: VIP lookup attempted without network connectivity
- **WHEN** a CHECKER attempts to search for a VIP guest while the device has no network connection
- **THEN** the app displays "No connection — VIP lookup requires network; please restore connectivity or contact the organizer" and does not admit the person; VIP entrances are expected to maintain connectivity as an operational requirement

### Requirement: Checker app requires authentication
The checker mobile app SHALL require a valid CHECKER-role JWT to access QR scanning functionality.

#### Scenario: Checker accesses app with valid credentials
- **WHEN** a CHECKER logs in with valid credentials
- **THEN** the app loads the QR scanner and pre-downloads the **public** verification key(s) for offline JWT signature verification (asymmetric — EdDSA/RS256, keyed by JWT `kid`); the app never receives the private signing key, so a compromised device cannot forge tickets. The public key bundle is stored in device secure storage (Keychain on iOS, Keystore on Android)

#### Scenario: AUDIENCE user attempts to access checker app
- **WHEN** a user with AUDIENCE role authenticates into the checker app
- **THEN** the app displays "Access denied — this app is for authorized staff only" and returns to the login screen
