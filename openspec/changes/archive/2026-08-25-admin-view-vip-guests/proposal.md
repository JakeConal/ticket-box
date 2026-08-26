## Why

Organizers currently have no visual dashboard or UI panel on the web interface to view the list of VIP guests imported for their concerts. This forces them to query the database manually or log in as checkers on the mobile app to verify import success, which degrades the post-import organizer experience.

## What Changes

- Add a new REST API endpoint `GET /api/admin/concerts/{id}/vip-guests` that returns the list of VIP guest records for a specific concert, restricted to the owning organizer.
- Add a new REST API endpoint `DELETE /api/admin/concerts/{id}/vip-guests/{guestId}` that soft-deletes a VIP guest (setting `active = false`), restricted to the owning organizer.
- Implement the API client helper functions `getVipGuests(concertId: string)` and `deleteVipGuest(concertId: string, guestId: string)` in the web application (`ticketbox-web/src/lib/admin-api.ts`).
- Add a new "VIP Guests List" panel on the Organizer dashboard page (`ticketbox-web/src/app/admin/page.tsx`) to display the imported VIP guests details (name, phone, sponsor, zone, entered status) for the currently selected concert with a search filter and a delete button to manually remove guests.

## Capabilities

### New Capabilities
- `admin-vip-guests-view`: Describes the requirements for organizers to view the list of imported VIP guest records for their concerts.

### Modified Capabilities
- (none)

## Impact

- `api/src/main/java/com/ticketbox/concert/controller/AdminConcertController.java`: Add endpoints `GET /api/admin/concerts/{id}/vip-guests` and `DELETE /api/admin/concerts/{id}/vip-guests/{guestId}`.
- `ticketbox-web/src/lib/admin-api.ts`: Add client helper functions `getVipGuests` and `deleteVipGuest`.
- `ticketbox-web/src/app/admin/page.tsx`: Implement UI list component, search filter, and deletion handler for VIP guests.
