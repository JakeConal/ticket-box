## 1. H2 Test Integration Fix

- [x] 1.1 Detect database product type in TicketPurchaseService to avoid cast as jsonb on H2 database
- [x] 1.2 Run Gradle tests to verify purchase integration tests pass successfully

## 2. API Integration

- [x] 2.1 Declare VipImportSummary type in admin-api.ts
- [x] 2.2 Implement triggerVipImport client helper function calling POST /api/admin/vip-imports in admin-api.ts

## 3. UI Component Implementation

- [x] 3.1 Add React state hooks for VIP import processing (loading, summary list) in page.tsx
- [x] 3.2 Add the VIP Guest Import panel layout under the Stats section on the organizer workspace page
- [x] 3.3 Implement manual trigger action button with disabled states during import processing
- [x] 3.4 Implement summaries table displaying results (fileName, totalRows, inserted, updated, deactivated, skipped, errored)
- [x] 3.5 Implement error and empty state alert messaging for the import trigger
