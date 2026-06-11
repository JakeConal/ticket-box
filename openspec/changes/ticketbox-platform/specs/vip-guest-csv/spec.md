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
Processing the same CSV file multiple times SHALL produce the same final state in the database with no duplicate guest records. Idempotency SHALL be anchored on the normalized phone number, not the guest name.

#### Scenario: Same file processed twice
- **WHEN** the same CSV file is present in the import directory on two consecutive nights
- **THEN** the system upserts on `(concert_id, phone_normalized)` — existing records are updated, not duplicated; import summary shows updated count instead of inserted

#### Scenario: CSV with overlapping rows within one file
- **WHEN** a CSV file contains two rows with the same phone number for the same concert
- **THEN** the system processes the first row, logs a duplicate-within-file warning for the second, and inserts only one record

#### Scenario: Same guest with a different name spelling across files
- **WHEN** a guest appears on night one as "Nguyễn Văn A" and on night two as "Nguyen Van A" with the same phone number
- **THEN** the system matches them by normalized phone and updates the existing record's name — it does NOT create a second guest record

#### Scenario: Phone numbers in varied formats normalize to one identity
- **WHEN** the same guest's phone appears as "0901 234 567", "+84 901 234 567", and "0901-234-567" across rows or files
- **THEN** all forms normalize to a single canonical value so they resolve to one guest record

### Requirement: Each row's concert is resolved via an agreed event code
Because the sponsor has no access to TicketBox's internal concert identifiers, each CSV row SHALL carry a human-readable `event_code` that the system resolves to a concert; unresolvable codes SHALL fail safely without guessing.

#### Scenario: Row resolves to a concert via event code
- **WHEN** a CSV row carries `event_code` matching a concert in the `concerts` table
- **THEN** the system resolves it to that concert's internal id and upserts the guest under that concert

#### Scenario: Row with an unknown event code
- **WHEN** a CSV row carries an `event_code` that matches no concert
- **THEN** the system does not guess a concert; if the whole file's codes are unresolvable it is quarantined to `error/` with an admin alert, and individual unresolvable rows are skipped with a logged reason

### Requirement: Nightly file is treated as a full snapshot with reconciliation scoped to concerts present in the file
Each import SHALL treat the CSV as the authoritative full guest list for the concerts it contains, deactivating absent guests only within those concerts so that revoked invitations are honored without affecting unrelated concerts.

#### Scenario: Guest removed from a later file is revoked
- **WHEN** a guest present in a previous import is absent from the latest CSV for that same concert
- **THEN** the system marks that guest record `active = false` (soft delete, preserving history) and the checker app no longer admits them as a VIP guest

#### Scenario: Reconciliation only affects concerts present in the file
- **WHEN** a file contains guests for concert A only, while concert B also has VIP guests in the database
- **THEN** reconciliation deactivates absent guests for concert A but leaves concert B's guests untouched — absence from this file is not treated as revocation for concerts the file does not mention

#### Scenario: One file carries guests for multiple concerts
- **WHEN** a single CSV contains rows with different `event_code` values for several concerts
- **THEN** the system upserts and reconciles each concert independently, scoping the snapshot per resolved concert

#### Scenario: Reconciliation does not hard-delete history
- **WHEN** a guest is deactivated by reconciliation
- **THEN** the record is retained with `active = false` and any prior `entered`/`entered_at` values intact for audit, rather than being physically deleted

### Requirement: Import preserves system-owned entry status
The import SHALL update only sponsor-supplied fields and SHALL NOT overwrite entry-status fields recorded at the gate.

#### Scenario: Re-import does not un-admit an entered guest
- **WHEN** a guest has already been marked ENTERED at the gate and an import (scheduled or manual) re-processes a file containing that guest
- **THEN** the upsert updates sponsor fields (name, sponsor, zone) but leaves `entered` and `entered_at` unchanged; the guest is not reset to not-entered

### Requirement: Organizer can trigger import manually for late files
The system SHALL provide an organizer-triggered manual import that runs the same pipeline on demand, to recover from files that arrive after the nightly window.

#### Scenario: File arrives after the nightly job ran
- **WHEN** the sponsor's file arrives after 02:00 and an ORGANIZER triggers a manual import before the event
- **THEN** the system runs the full import pipeline on the new file and updates the guest list, with the same idempotency, reconciliation, and isolation guarantees as the scheduled run

### Requirement: Processed files are archived to avoid blind re-import
The system SHALL move successfully processed files out of the import directory so they are not reprocessed on every subsequent run.

#### Scenario: Successfully processed file is archived
- **WHEN** the import job finishes processing a file without a whole-file parse failure
- **THEN** the file is moved to a `processed/` archive directory and is skipped (by content hash) on future runs, so the same file is not re-imported nightly

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
