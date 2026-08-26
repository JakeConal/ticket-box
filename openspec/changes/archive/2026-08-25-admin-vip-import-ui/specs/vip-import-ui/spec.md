## ADDED Requirements

### Requirement: Trigger Manual VIP Import
The frontend SHALL provide a user interface element that allows organizers to trigger the manual import of VIP guest CSV files on demand. When clicked, the frontend SHALL perform a POST request to the `/api/admin/vip-imports` endpoint. During processing, the trigger interface element SHALL be disabled, and a loading indicator SHALL be displayed.

#### Scenario: Successful import request
- **WHEN** the organizer clicks the trigger button
- **THEN** the frontend sends a POST request to `/api/admin/vip-imports`, disables the button, displays a loading indicator, and updates the view with the returned import summaries upon successful completion.

#### Scenario: Failed import request
- **WHEN** the organizer clicks the trigger button and the API request fails
- **THEN** the frontend displays an error message detailing the failure and re-enables the trigger button.

### Requirement: Display Import Summaries
Upon completion of the import, the frontend SHALL display a summary of the processed files. For each processed file, the summary SHALL include the file name, total rows, and the count of inserted, updated, skipped, deactivated, and errored rows. If no files were pending or processed, the frontend SHALL display a status message indicating that no new files were found.

#### Scenario: Multi-file import summary display
- **WHEN** the import completes and returns a list of file summaries
- **THEN** the frontend renders a table or structured list showing the file name and the breakdown of total, inserted, updated, deactivated, skipped, and errored rows for each file.

#### Scenario: No pending files summary display
- **WHEN** the import completes and returns an empty list of summaries
- **THEN** the frontend displays a message indicating that no new VIP guest import files were found in the pending directory.
