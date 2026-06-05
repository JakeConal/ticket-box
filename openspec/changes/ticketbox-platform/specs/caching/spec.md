## ADDED Requirements

### Requirement: Concert listing is served from Redis cache
The system SHALL cache the paginated concert listing response in Redis and serve it without querying the database on cache hits.

#### Scenario: Cache hit on concert listing
- **WHEN** a user requests the concert listing and a cache entry exists in Redis
- **THEN** the system serves the cached response without querying PostgreSQL; response time is under 50ms at P99

#### Scenario: Cache miss on concert listing
- **WHEN** no cache entry exists for the concert listing (cold start or post-invalidation)
- **THEN** the system queries PostgreSQL, writes the result to Redis with a 5-minute TTL, and serves the response

#### Scenario: Cache invalidated when concert is created or updated
- **WHEN** an ORGANIZER creates, updates, or cancels a concert
- **THEN** the system actively invalidates the concert listing cache key in Redis so the next request fetches fresh data

### Requirement: Concert detail page is served from Redis cache
The system SHALL cache individual concert detail responses (including ticket type metadata) in Redis.

#### Scenario: Cache hit on concert detail
- **WHEN** a user requests a concert detail page and a cache entry exists
- **THEN** the system serves the cached response without querying PostgreSQL

#### Scenario: Cache expires after 60 seconds
- **WHEN** a concert detail cache entry reaches its 60-second TTL
- **THEN** the next request triggers a cache miss, fetches from PostgreSQL, and repopulates the cache

#### Scenario: Cache invalidated on concert update
- **WHEN** an ORGANIZER updates a concert's metadata
- **THEN** the system immediately invalidates that concert's detail cache key

### Requirement: Ticket availability count is cached with short TTL and active invalidation
The system SHALL cache remaining ticket counts per ticket type with a 10-second TTL and actively invalidate after each confirmed purchase.

#### Scenario: Ticket count cache active invalidation after purchase
- **WHEN** a ticket purchase is confirmed and inventory is decremented
- **THEN** the system deletes the ticket availability cache key for that ticket type, so the next read fetches the updated count from PostgreSQL

#### Scenario: Ticket count cache miss falls through to database
- **WHEN** no cache entry exists for a ticket type's available count
- **THEN** the system queries PostgreSQL, writes the count to Redis with a 10-second TTL, and serves the result

#### Scenario: Ticket count TTL prevents stale data persisting
- **WHEN** a cache invalidation is missed due to an edge case
- **THEN** the 10-second TTL ensures the count is refreshed from the database within 10 seconds, bounding maximum staleness

### Requirement: Cache layer does not affect purchase correctness
The system SHALL ensure that caching of ticket availability is used only for display purposes; inventory enforcement SHALL always go through the database transaction.

#### Scenario: Stale cache shows tickets available but DB has zero
- **WHEN** a user sees non-zero availability from cache and attempts to purchase
- **THEN** the purchase flow queries actual inventory from PostgreSQL with `SELECT FOR UPDATE`; if inventory is zero, the purchase is rejected with HTTP 409 regardless of what the cache showed

#### Scenario: No caching on purchase or checkout endpoints
- **WHEN** a user submits a purchase request
- **THEN** the system does not serve any part of the purchase response from cache; all purchase logic executes against the live database
