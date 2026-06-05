## ADDED Requirements

### Requirement: API endpoints are protected by per-IP rate limiting
The system SHALL apply Token Bucket rate limiting keyed by client IP address to all API endpoints, blocking excessive requests with HTTP 429.

#### Scenario: Request within rate limit
- **WHEN** a client IP sends requests at a rate within the configured token bucket capacity
- **THEN** all requests are processed normally with no rate-limit headers indicating rejection

#### Scenario: Request exceeds rate limit
- **WHEN** a client IP exhausts its token bucket allowance
- **THEN** the system returns HTTP 429 Too Many Requests with a `Retry-After` header indicating when the bucket will refill, and does not forward the request to the backend handler

#### Scenario: Rate limit resets after bucket refill interval
- **WHEN** a client IP that previously received a 429 waits for the refill period
- **THEN** the client's bucket is partially or fully replenished and subsequent requests are accepted

### Requirement: Authenticated users are also rate-limited by user ID
In addition to IP-based limiting, the system SHALL apply a separate Token Bucket keyed by authenticated user ID to prevent abuse via IP rotation.

#### Scenario: Same user from different IPs
- **WHEN** an authenticated user sends requests from multiple IP addresses simultaneously, each under the per-IP limit
- **THEN** the per-user bucket is decremented for each request; when the per-user bucket is exhausted, requests from all IPs for that user return 429

#### Scenario: Per-user limit more permissive than per-IP limit for ticket purchase
- **WHEN** a legitimate authenticated user sends multiple rapid purchase requests
- **THEN** the per-user bucket for the purchase endpoint allows up to the configured burst before rate limiting

### Requirement: Purchase endpoint has stricter rate limiting than read endpoints
The ticket purchase endpoint SHALL have a significantly lower rate limit than read-only endpoints to prevent bot-driven purchase storms.

#### Scenario: Purchase endpoint burst limit
- **WHEN** a single IP or user sends more than 5 purchase requests within 10 seconds
- **THEN** the system returns 429 for requests beyond the 5-request burst, regardless of whether tickets are available

#### Scenario: Concert listing endpoint higher limit
- **WHEN** a single IP sends up to 60 requests per minute to the concert listing endpoint
- **THEN** all requests are served (cache hits expected to handle most load)

### Requirement: Rate limit state is stored atomically in Redis
Token Bucket counters SHALL be maintained in Redis using a Lua script to ensure atomicity of check-and-consume operations.

#### Scenario: Concurrent requests do not cause counter corruption
- **WHEN** 100 simultaneous requests arrive for the same IP bucket
- **THEN** exactly the allowed number pass through (no over-admission due to race conditions) and the remainder receive 429

#### Scenario: Redis unavailable
- **WHEN** Redis is unreachable and rate limit state cannot be checked
- **THEN** the system fails open (allows requests through) and logs a warning; availability is prioritized over strict rate enforcement during Redis downtime
