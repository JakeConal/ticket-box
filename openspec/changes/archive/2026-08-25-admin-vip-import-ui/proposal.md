## Why

Organizers currently have no way to manually trigger VIP guest list CSV imports from the Next.js admin dashboard, forcing them to use command-line tools or external HTTP clients. This change introduces a user-friendly UI in the organizer workspace to trigger manual imports of pending CSV files on demand and view the processing summary.

## What Changes

- Add API client support for `POST /api/admin/vip-imports` in the web application (`ticketbox-web/src/lib/admin-api.ts`).
- Add a dedicated "VIP Guest Import" section to the Organizer dashboard (`ticketbox-web/src/app/admin/page.tsx`) enabling organizers to manually trigger the import execution.
- Display the result summary (inserted, updated, skipped, deactivated, and errored row counts) dynamically on the dashboard.

## Capabilities

### New Capabilities
- `vip-import-ui`: Describes the user interface requirements for triggering manual VIP imports and presenting the import summary responses.

### Modified Capabilities
- (none)

## Impact

- `ticketbox-web/src/lib/admin-api.ts`: Add `triggerVipImport` API helper function.
- `ticketbox-web/src/app/admin/page.tsx`: Implement the UI panel, trigger action, and statistics display for manual VIP CSV imports.
