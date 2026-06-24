## Context

Currently, organizers can trigger manual VIP CSV imports, but the admin workspace dashboard lacks any UI or API integrations to view the active list of imported VIP guests. To verify imports, organizers are forced to query the database directly or use a checker account on the mobile check-in app. Providing a dedicated VIP list panel directly on the concert dashboard resolves this friction.

## Goals / Non-Goals

**Goals:**
- Implement a backend REST API endpoint `GET /api/admin/concerts/{id}/vip-guests` restricted to the owning organizer.
- Implement a backend REST API endpoint `DELETE /api/admin/concerts/{id}/vip-guests/{guestId}` restricted to the owning organizer.
- Implement the client wrapper helpers `getVipGuests` and `deleteVipGuest` in the Next.js API layer.
- Add a new UI panel to display a table of VIP guest records (name, masked phone, sponsor, zone, check-in status) for the selected event on the organizer dashboard, complete with search filtering and a delete button for each guest.

**Non-Goals:**
- Implement edit or manual insertion of individual VIP guest records from the dashboard (imports remain the primary sync vector).
- Allow check-in or entry registration of VIP guests from the organizer admin UI (check-in remains a checker-only role action).

## Decisions

## Decisions

### D1 — Backend REST Endpoint & Security
We will expose `GET /api/admin/concerts/{id}/vip-guests` and `DELETE /api/admin/concerts/{id}/vip-guests/{guestId}` in `AdminConcertController.java`.
- **Authorization**: The endpoints are nested under `/api/admin/concerts/**`, inherit the existing Spring Security configuration restricting access to the `ORGANIZER` role, and utilize `OrganizerOwnershipService.requireOwnedConcert(concertId)` to verify concert ownership.
- **Service Integration**: The controller delegates to `VipGuestService`:
  - `getVipGuestsByConcert(concertId)`: queries the `vip_guests` table filtering by `concert_id` and `active = true`, ordered alphabetically by name, mapping results using the existing `VipGuestResponse` DTO (with standard phone number masking).
  - `deleteVipGuest(concertId, guestId)`: executes an update `set active = false` where `concert_id = ?` and `id = ?` and `active = true`. If the update count is 0, throw a `ResponseStatusException` with `404 Not Found`.

### D2 — Frontend API client wrapper
We will declare client wrapper functions in `ticketbox-web/src/lib/admin-api.ts`:
- `getVipGuests(concertId: string): Promise<VipGuestResponse[]>`: invokes `adminGet` at `/api/admin/concerts/${concertId}/vip-guests` and returns the array of typed responses.
- `deleteVipGuest(concertId: string, guestId: string): Promise<void>`: invokes `adminDelete` (or custom DELETE fetch request) at `/api/admin/concerts/${concertId}/vip-guests/${guestId}`.

### D3 — UI dashboard list panel
We will add a new panel titled **"VIP Guest Directory"** below the import panel on the organizer dashboard page (`ticketbox-web/src/app/admin/page.tsx`).
- **State Integration**: Add `vipGuests` state array.
- **Fetch Hook**: On selecting a concert in `loadWorkspace()`, fetch the VIP guests list for the concert and populate the state.
- **Deletion Action**: Add a "Remove" button in each table row. Clicking it displays a browser confirmation prompt (`window.confirm`). If confirmed, the API helper `deleteVipGuest` is called and, on success, the list is re-fetched.
- **Styling**: Render a table matching the existing dashboard style (black borders, sans-serif typography, striped rows) containing the columns: Name, Masked Phone, Sponsor, Zone, Status, and Actions (with the Delete button).

## Risks / Trade-offs

- **[Risk] High volume of guests**: A concert may have thousands of VIP guests, causing high payload sizes and UI render lag.
  - *Mitigation*: Limit the query size or let the service return up to 500 records. For the initial phase, a standard database `LIMIT 500` is sufficient for admin verification.
