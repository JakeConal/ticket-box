# Capability: admin-vip-guests-view

## Purpose
TBD

## Requirements

### Requirement: Admin Retrieve VIP Guest List API
The system SHALL expose a REST API endpoint `GET /api/admin/concerts/{concertId}/vip-guests` that allows organizers to fetch the list of VIP guest records for a specific concert. The endpoint SHALL require authentication with the `ORGANIZER` role. The system SHALL verify that the concert belongs to the authenticated organizer, and if the ownership check fails, it SHALL return a `403 Forbidden` status code.

#### Scenario: Authorized access to VIP guest list
- **WHEN** the owning organizer requests the VIP guest list for their concert
- **THEN** the system returns a list of active VIP guest records for that concert.

#### Scenario: Unauthorized access by non-owning organizer
- **WHEN** an organizer requests the VIP guest list for a concert they do not own
- **THEN** the system returns a `403 Forbidden` status code.

### Requirement: Display VIP Guest List in Dashboard
The frontend organizer workspace page SHALL fetch the VIP guest list for the currently selected concert and display them in a structured table layout. The display table SHALL show the name, masked phone number, sponsor, ticket zone, check-in status (entered/not entered), and entry timestamp (if entered) for each VIP guest. If no VIP guests are registered for the concert, the UI SHALL display a message indicating that no VIP guests have been imported.

#### Scenario: Render VIP guest list table
- **WHEN** the organizer selects a concert with imported VIP guests
- **THEN** the frontend retrieves the guest records and renders them in a list showing their name, masked phone number, sponsor, zone, and check-in status.

#### Scenario: Render empty VIP list placeholder
- **WHEN** the organizer selects a concert with no imported VIP guests
- **THEN** the frontend displays a status message stating that no VIP guests have been registered for this event.

### Requirement: Admin Remove VIP Guest API
The system SHALL expose a REST API endpoint `DELETE /api/admin/concerts/{concertId}/vip-guests/{guestId}` that allows organizers to soft-delete a specific VIP guest record (marking `active = false`). The endpoint SHALL require authentication with the `ORGANIZER` role. The system SHALL verify that the concert belongs to the authenticated organizer, and if the ownership check fails, it SHALL return a `403 Forbidden` status code. If the VIP guest is not found or is already inactive, it SHALL return a `404 Not Found` status code.

#### Scenario: Authorized deletion of VIP guest
- **WHEN** the owning organizer requests the deletion of an active VIP guest in their concert
- **THEN** the system marks the VIP guest as inactive (`active = false`) and returns a `204 No Content` status code.

#### Scenario: Unauthorized deletion by non-owning organizer
- **WHEN** an organizer requests the deletion of a VIP guest for a concert they do not own
- **THEN** the system returns a `403 Forbidden` status code.

### Requirement: Delete Button in Dashboard VIP Guest Table
The frontend organizer workspace page SHALL render a delete/remove button next to each VIP guest record. Clicking the button SHALL prompt a confirmation dialog. If confirmed, it SHALL invoke the delete API and refresh the list to instantly remove the guest from the UI.

#### Scenario: Deleting a VIP guest
- **WHEN** the organizer clicks the remove button and confirms the deletion
- **THEN** the system invokes the deletion API and refreshes the VIP guest list to remove the guest from the dashboard list.
