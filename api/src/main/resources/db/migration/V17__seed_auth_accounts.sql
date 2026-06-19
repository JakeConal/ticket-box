CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (id, email, password_hash, role, created_at)
VALUES
    (
        '10000000-0000-0000-0000-000000000001',
        'organizer@ticketbox.vn',
        crypt('password', gen_salt('bf', 10)),
        'ORGANIZER',
        now()
    ),
    (
        '10000000-0000-0000-0000-000000000002',
        'checker1@ticketbox.vn',
        crypt('password', gen_salt('bf', 10)),
        'CHECKER',
        now()
    ),
    (
        '10000000-0000-0000-0000-000000000003',
        'checker2@ticketbox.vn',
        crypt('password', gen_salt('bf', 10)),
        'CHECKER',
        now()
    )
ON CONFLICT (email) DO NOTHING;
