## Context

The backend implements a manual VIP CSV import API at `POST /api/admin/vip-imports` that processes pending files in the server's imports folder and returns a list of import summaries. Currently, the admin web dashboard has no UI page, component, or client API functions to interact with this manual trigger, leaving organizers unable to process late-arriving VIP guest CSV files from the web app.

## Goals / Non-Goals

**Goals:**
- Implement `triggerVipImport` in the Next.js frontend API layer to communicate with `POST /api/admin/vip-imports`.
- Add a new, premium-styled UI panel in the organizer admin workspace (`ticketbox-web/src/app/admin/page.tsx`) to trigger the VIP import manually.
- Display the import execution summaries (file name, counts for inserted, updated, skipped, deactivated, and errored rows) inside the dashboard once the import completes.
- Handle loading, success, and error states gracefully to provide a premium user experience.

**Non-Goals:**
- Modify the backend REST controller or change how files are placed in the `./imports/vip` directory (out-of-band delivery/FTP is assumed).
- Implement a CSV drag-and-drop file upload to the server (the API relies on scanning the server-side directory).

## Decisions

### D1 — API Integration: Client Wrapper
Add type declarations and API client support to `lib/admin-api.ts`.
- **Type**: `VipImportSummary` mapping exactly to the backend's `VipGuestImportSummaryResponse` (fields: `fileName`, `totalRows`, `inserted`, `updated`, `deactivated`, `skipped`, `errored`, `archived`, `archive`, `message`).
- **Function**: `triggerVipImport(): Promise<VipImportSummary[]>` using the `adminJson` wrapper with `POST` request to `/api/admin/vip-imports`.

### D2 — UI Component Integration: Organizer Dashboard Panel
Add a new panel in the organizer workspace dashboard (`ticketbox-web/src/app/admin/page.tsx`).
- **Layout Location**: A dedicated UI widget next to "AI artist bio" or "Stats", styled using the shared `ui` design tokens (black borders, sans-serif typography, structured table layout).
- **Interactions**:
  - A main "Trigger VIP Import" action button.
  - Disable button and show a "Scanning and importing..." loading state during execution.
  - Table displaying the summary list of processed files upon successful completion.
  - Alert banners displaying any error details or success messages returned by the API.

## Risks / Trade-offs

- **[Risk] Sync API Timeout**: If the pending files are very large, processing might take longer than standard HTTP timeout windows, causing the frontend request to fail.
  - *Mitigation*: The backend handles per-row transactions and content-hash caching, keeping execution fast. The UI will display a distinct loading spinner and lock the button to prevent multiple triggers.
- **[Risk] Directory Empty / Files Missing**: Triggering manual import with no files in the pending directory might return an empty list or trigger a warning.
  - *Mitigation*: Show a friendly message ("No new files found to process") if the API returns an empty summary list.
