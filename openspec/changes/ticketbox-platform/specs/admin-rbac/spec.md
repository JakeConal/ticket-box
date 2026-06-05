## ADDED Requirements

### Requirement: System enforces three distinct roles
The system SHALL define three roles — AUDIENCE, ORGANIZER, and CHECKER — each with a distinct, non-overlapping set of permitted actions.

#### Scenario: AUDIENCE role permissions
- **WHEN** a user with AUDIENCE role is authenticated
- **THEN** the system allows: browse concerts, view concert detail, purchase tickets, view own orders and e-tickets; and denies: create/edit/cancel concerts, access admin dashboard, access QR scanner

#### Scenario: ORGANIZER role permissions
- **WHEN** a user with ORGANIZER role is authenticated
- **THEN** the system allows: all AUDIENCE permissions plus create/edit/cancel concerts, configure ticket types, upload artist PDFs, view revenue statistics, view all orders for their concerts; and denies: access to QR scanner

#### Scenario: CHECKER role permissions
- **WHEN** a user with CHECKER role is authenticated
- **THEN** the system allows: access QR scanner, verify VIP guests at gate; and denies: all other actions (browsing, purchasing, admin)

### Requirement: Role is encoded in JWT and verified on every request
The system SHALL include the user's role in the JWT access token and validate it on every protected API endpoint via middleware.

#### Scenario: Valid JWT with correct role
- **WHEN** a request arrives with a valid JWT containing role ORGANIZER for an organizer-only endpoint
- **THEN** the request proceeds to the handler

#### Scenario: Valid JWT with insufficient role
- **WHEN** a request arrives with a valid JWT containing role AUDIENCE for an organizer-only endpoint
- **THEN** the system returns HTTP 403 Forbidden without executing the handler

#### Scenario: Missing or expired JWT
- **WHEN** a request arrives without a JWT, or with an expired JWT
- **THEN** the system returns HTTP 401 Unauthorized

### Requirement: Admin dashboard is accessible only to ORGANIZERs
The admin web interface SHALL be restricted to users with the ORGANIZER role.

#### Scenario: ORGANIZER accesses admin dashboard
- **WHEN** an ORGANIZER navigates to /admin
- **THEN** the system renders the admin dashboard with concert management and revenue stats

#### Scenario: AUDIENCE user attempts to access admin dashboard
- **WHEN** an AUDIENCE user navigates to /admin
- **THEN** the system redirects to the login page (if not authenticated) or returns HTTP 403 (if authenticated with insufficient role)

### Requirement: User registration assigns default role AUDIENCE
New user accounts created through public registration SHALL be assigned the AUDIENCE role by default.

#### Scenario: Public user registration
- **WHEN** a new user completes registration via the public signup form
- **THEN** the system creates the account with role AUDIENCE and issues a JWT encoding that role

#### Scenario: ORGANIZER and CHECKER accounts created by admin
- **WHEN** a super-admin or system setup script creates an account with ORGANIZER or CHECKER role
- **THEN** the account is created with the specified role; this endpoint is not accessible via public registration

### Requirement: JWT access tokens are short-lived and refreshable
Access tokens SHALL expire after 15 minutes; users SHALL be able to obtain new tokens using a refresh token without re-authenticating.

#### Scenario: Access token refresh
- **WHEN** a client sends a valid, unexpired refresh token to the token refresh endpoint
- **THEN** the system issues a new access token (15-min TTL) and a new rotated refresh token (7-day TTL); the old refresh token is invalidated

#### Scenario: Refresh token reuse detected
- **WHEN** a previously used (rotated) refresh token is presented
- **THEN** the system invalidates all refresh tokens for that user and returns HTTP 401 (token theft mitigation)
