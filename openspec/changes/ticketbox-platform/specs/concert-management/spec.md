## ADDED Requirements

### Requirement: Organizer can create a concert
An authenticated user with the ORGANIZER role SHALL be able to create a new concert with all required metadata.

#### Scenario: Successful concert creation
- **WHEN** an ORGANIZER submits a valid concert form (name, date, venue, artist info, SVG seat map, at least one ticket type)
- **THEN** the system creates the concert with status DRAFT, returns the new concert ID, and makes it visible to Organizers in the admin dashboard

#### Scenario: Missing required fields
- **WHEN** an ORGANIZER submits a concert form missing name, date, or venue
- **THEN** the system returns HTTP 422 with field-level validation errors and does not create the concert

### Requirement: Organizer can configure ticket types per concert
An ORGANIZER SHALL be able to define one or more ticket types for a concert, each with name, price, total quantity, sale open datetime, and per-user purchase limit.

#### Scenario: Valid ticket type configuration
- **WHEN** an ORGANIZER creates ticket types for zones GA, SVIP, VIP, CAT1, CAT2 with distinct prices, quantities, and per-user limits
- **THEN** the system saves all ticket types linked to the concert and exposes them on the public concert detail page

#### Scenario: Per-user limit exceeds total quantity
- **WHEN** an ORGANIZER sets a per-user limit greater than the ticket type's total quantity
- **THEN** the system returns HTTP 422 and rejects the configuration

### Requirement: Organizer can publish a concert to make it publicly visible
A concert SHALL start in DRAFT status, invisible to the public, and SHALL become publicly visible only when its owning ORGANIZER explicitly publishes it. Publishing requires the concert to have at least one configured ticket type.

#### Scenario: Organizer publishes a draft concert
- **WHEN** an ORGANIZER publishes a DRAFT concert that has complete metadata and at least one ticket type
- **THEN** the system transitions the concert to PUBLISHED, invalidates the listing cache, and the concert appears in the public listing and detail pages

#### Scenario: Publish rejected without ticket types
- **WHEN** an ORGANIZER attempts to publish a DRAFT concert that has no ticket types configured
- **THEN** the system returns HTTP 422 and the concert remains DRAFT

#### Scenario: Draft concert is not publicly accessible
- **WHEN** an unauthenticated user (or any non-owner) requests a DRAFT concert's detail page or the public listing
- **THEN** the DRAFT concert is excluded from the listing and its detail endpoint returns HTTP 404; only the owning ORGANIZER can see it via the admin dashboard

#### Scenario: Publish attempt on a non-DRAFT concert
- **WHEN** an ORGANIZER attempts to publish a concert already PUBLISHED or CANCELLED
- **THEN** the system returns HTTP 409 Conflict

### Requirement: Organizer can update concert information
An ORGANIZER SHALL be able to update a concert's metadata (name, description, venue, artist info, seat map) before the concert date.

#### Scenario: Update concert while not yet sold out
- **WHEN** an ORGANIZER updates the concert description and artist info
- **THEN** the system saves the changes, invalidates the concert detail cache, and reflects the update on the public page within 60 seconds

#### Scenario: Update concert after event date has passed
- **WHEN** an ORGANIZER attempts to update a concert whose date is in the past
- **THEN** the system returns HTTP 409 and rejects the update

### Requirement: Organizer can cancel a concert
An ORGANIZER SHALL be able to cancel a concert, which marks it as CANCELLED and stops new ticket sales.

#### Scenario: Cancel concert with existing ticket holders
- **WHEN** an ORGANIZER cancels a concert that has paid ticket holders
- **THEN** the system sets concert status to CANCELLED, halts new purchases, and notifies all ticket holders via the notification system

#### Scenario: Attempt to cancel already-cancelled concert
- **WHEN** an ORGANIZER attempts to cancel a concert already in CANCELLED status
- **THEN** the system returns HTTP 409 Conflict

### Requirement: Public users can browse the concert listing
Unauthenticated and authenticated users SHALL be able to view a paginated list of upcoming concerts with basic info (name, date, venue, thumbnail, availability status).

#### Scenario: Concert listing served from cache
- **WHEN** any user requests the concert listing page
- **THEN** the system serves data from Redis cache if available (miss falls through to DB), and responds within 200ms at P99 under normal load

#### Scenario: Recently cancelled concert excluded from listing
- **WHEN** an ORGANIZER cancels a concert
- **THEN** the concert is removed from the public listing within 5 minutes (cache TTL or active invalidation)

### Requirement: Public users can view concert detail
Any user SHALL be able to view a concert detail page including artist info, venue, seat map (interactive SVG by zone), and real-time ticket availability per zone.

#### Scenario: Ticket availability reflects recent purchases
- **WHEN** a ticket is purchased for zone SVIP
- **THEN** the remaining SVIP count displayed on the detail page decreases within 10 seconds

#### Scenario: Sold-out zone marked visually
- **WHEN** a ticket type's remaining quantity reaches zero
- **THEN** the corresponding zone on the SVG seat map is marked as sold out and the buy button for that zone is disabled
