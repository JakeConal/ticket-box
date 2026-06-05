## ADDED Requirements

### Requirement: System imports VIP guest list from CSV on a nightly schedule
The system SHALL run a scheduled job nightly at 02:00 (server time) to process any new CSV files placed in the designated import directory.

#### Scenario: CSV file present at scheduled time
- **WHEN** the scheduler fires at 02:00 and finds a CSV file in the import directory
- **THEN** the system reads and parses the file, upserts valid guest records into the `vip_guests` table, and logs a summary (total rows, inserted, updated, skipped)

#### Scenario: No CSV file present at scheduled time
- **WHEN** the scheduler fires at 02:00 and finds no CSV files in the import directory
- **THEN** the system logs "No import files found" and exits without error

### Requirement: CSV import is idempotent
Processing the same CSV file multiple times SHALL produce the same final state in the database with no duplicate guest records.

#### Scenario: Same file processed twice
- **WHEN** the same CSV file is present in the import directory on two consecutive nights
- **THEN** the system upserts on `(concert_id, phone_normalized)` — existing records are updated, not duplicated; import summary shows updated count instead of inserted

#### Scenario: CSV with overlapping rows within one file
- **WHEN** a CSV file contains two rows with the same phone number for the same concert
- **THEN** the system processes the first row, logs a duplicate-within-file warning for the second, and inserts only one record

### Requirement: CSV import handles malformed data without disrupting live service
The import job SHALL skip individual bad rows with structured error logging and continue processing valid rows; it SHALL NOT affect live traffic.

#### Scenario: Row with missing required column
- **WHEN** a CSV row is missing the `phone` column value
- **THEN** the system skips that row, logs the row number and reason, and continues with the next row

#### Scenario: CSV file with entirely wrong format
- **WHEN** the CSV file cannot be parsed at all (e.g., binary file, completely wrong delimiter)
- **THEN** the system logs the parse failure, moves the file to an error archive directory, and sends an alert to admins; no records are modified

#### Scenario: Import failure does not affect concurrent ticket purchases
- **WHEN** the CSV import job runs while users are actively purchasing tickets
- **THEN** the import transaction is isolated and does not lock any concert or ticket tables used by the purchase flow

### Requirement: Checker staff can verify VIP guests at the gate
At event time, a CHECKER SHALL be able to look up a guest by name or phone number to confirm their VIP guest list status.

#### Scenario: Guest found on VIP list
- **WHEN** a CHECKER searches for a guest by phone number and the guest exists in `vip_guests` for that concert
- **THEN** the app displays the guest's name, sponsor, and entry status (not yet entered / entered)

#### Scenario: Guest not found on VIP list
- **WHEN** a CHECKER searches for a guest and no matching record exists
- **THEN** the app displays "Not on guest list" and the CHECKER follows manual verification protocol

#### Scenario: VIP guest entry recorded
- **WHEN** a CHECKER marks a guest as entered
- **THEN** the system records the entry timestamp and the guest's status changes to ENTERED; subsequent scans show "Already entered at [time]"
