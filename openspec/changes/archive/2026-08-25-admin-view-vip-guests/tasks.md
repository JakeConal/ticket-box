## 1. Backend REST API Implementation

- [x] 1.1 Implement getVipGuestsByConcert query mapping in VipGuestService.java
- [x] 1.2 Implement GET /{id}/vip-guests endpoint in AdminConcertController.java with ownership check
- [x] 1.3 Verify backend compilation and tests pass successfully
- [x] 1.4 Implement soft-delete in VipGuestService.java
- [x] 1.5 Implement DELETE /{id}/vip-guests/{guestId} in AdminConcertController.java with ownership check
- [x] 1.6 Add integration tests for deletion in CheckinIntegrationTest.java

## 2. API Client Integration

- [x] 2.1 Implement getVipGuests client helper calling the backend endpoint in admin-api.ts
- [x] 2.2 Implement deleteVipGuest client helper calling the backend deletion endpoint in admin-api.ts

## 3. Frontend UI Component Integration

- [x] 3.1 Add vipGuests React state hook and workspace loading action in page.tsx
- [x] 3.2 Add the VIP Guest Directory panel layout below the Import panel in page.tsx
- [x] 3.3 Implement list table rendering guest details (name, masked phone, sponsor, zone, check-in status)
- [x] 3.4 Implement frontend client-side text filtering for quick VIP guest search within the directory panel
- [x] 3.5 Add "Remove" button / action in the VIP Guest table rows in page.tsx
- [x] 3.6 Implement confirmation dialog and reload list on successful deletion in page.tsx
