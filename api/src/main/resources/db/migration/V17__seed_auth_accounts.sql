INSERT INTO users (id, email, password_hash, role, created_at)
VALUES
    (
        '10000000-0000-0000-0000-000000000001',
        'organizer@ticketbox.vn',
        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        'ORGANIZER',
        now()
    ),
    (
        '10000000-0000-0000-0000-000000000002',
        'checker1@ticketbox.vn',
        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        'CHECKER',
        now()
    ),
    (
        '10000000-0000-0000-0000-000000000003',
        'checker2@ticketbox.vn',
        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        'CHECKER',
        now()
    )
ON CONFLICT (email) DO NOTHING;
