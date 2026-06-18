INSERT INTO users (id, email, password_hash, role, created_at)
VALUES
    (
        '10000000-0000-0000-0000-000000000004',
        'audience1@ticketbox.vn',
        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        'AUDIENCE',
        now()
    ),
    (
        '10000000-0000-0000-0000-000000000005',
        'audience2@ticketbox.vn',
        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        'AUDIENCE',
        now()
    ),
    (
        '10000000-0000-0000-0000-000000000006',
        'audience3@ticketbox.vn',
        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        'AUDIENCE',
        now()
    )
ON CONFLICT (email) DO UPDATE
SET role = EXCLUDED.role;

WITH demo_concerts (
    id,
    name,
    description,
    venue,
    event_date,
    event_code,
    artist_bio,
    seat_map_svg
) AS (
    VALUES
        (
            '20000000-0000-0000-0000-000000000001'::uuid,
            'Anh Trai Say Hi',
            'A high-energy showcase bringing the Anh Trai Say Hi cast to Ho Chi Minh City for a full stadium night.',
            'Sân vận động Thống Nhất, TP. Hồ Chí Minh',
            '2026-09-12 20:00:00+07'::timestamptz,
            'ATSH-HCM-2026',
            $$Anh Trai Say Hi gathers beloved performers from the hit music reality format for a polished concert built around vocal stages, dance moments, and fan-favorite collaborations. This demo event ships with a published bio so buyers can inspect the public concert detail page without depending on live AI generation.$$,
            $$<svg viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Anh Trai Say Hi seat map"><rect width="640" height="360" fill="#f8fafc"/><rect x="250" y="24" width="140" height="52" rx="6" fill="#111827"/><text x="320" y="57" text-anchor="middle" font-family="Arial" font-size="18" fill="#ffffff">STAGE</text><path d="M72 104h496v68H72z" fill="#7c3aed" opacity=".88"/><path d="M96 188h448v56H96z" fill="#db2777" opacity=".86"/><path d="M128 260h384v50H128z" fill="#2563eb" opacity=".84"/><path d="M32 196h48v116H32zM560 196h48v116h-48z" fill="#f59e0b" opacity=".86"/><path d="M48 324h544v24H48z" fill="#16a34a" opacity=".84"/><g font-family="Arial" font-size="16" font-weight="700" fill="#ffffff"><text x="320" y="145" text-anchor="middle">SVIP</text><text x="320" y="221" text-anchor="middle">VIP</text><text x="320" y="292" text-anchor="middle">CAT1</text><text x="56" y="258" text-anchor="middle" transform="rotate(-90 56 258)">CAT2</text><text x="584" y="258" text-anchor="middle" transform="rotate(90 584 258)">CAT2</text><text x="320" y="343" text-anchor="middle">GA</text></g></svg>$$
        ),
        (
            '20000000-0000-0000-0000-000000000002'::uuid,
            'Anh Trai Vượt Ngàn Chông Gai',
            'A large-format live concert celebrating the Anh Trai Vượt Ngàn Chông Gai performers and stage teams.',
            'Sân vận động Mỹ Đình, Hà Nội',
            '2026-10-03 19:30:00+07'::timestamptz,
            'ATVNCG-HN-2026',
            $$Anh Trai Vượt Ngàn Chông Gai turns the competition show's strongest performances into a live stadium experience, pairing familiar anthems with new arrangements and group stages. The seeded biography is public and ready for demos while organizers can still test the upload, draft, and publish AI workflow separately.$$,
            $$<svg viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Anh Trai Vuot Ngan Chong Gai seat map"><rect width="640" height="360" fill="#f8fafc"/><ellipse cx="320" cy="194" rx="280" ry="132" fill="#e5e7eb"/><rect x="238" y="26" width="164" height="58" rx="8" fill="#111827"/><text x="320" y="61" text-anchor="middle" font-family="Arial" font-size="18" fill="#ffffff">STAGE</text><path d="M178 104h284l-32 58H210z" fill="#7c3aed" opacity=".9"/><path d="M142 174h356l-36 58H178z" fill="#db2777" opacity=".88"/><path d="M104 244h432l-28 50H132z" fill="#2563eb" opacity=".86"/><path d="M42 128h82v166H42zM516 128h82v166h-82z" fill="#f59e0b" opacity=".88"/><path d="M92 310h456v32H92z" fill="#16a34a" opacity=".86"/><g font-family="Arial" font-size="16" font-weight="700" fill="#ffffff"><text x="320" y="139" text-anchor="middle">SVIP</text><text x="320" y="208" text-anchor="middle">VIP</text><text x="320" y="276" text-anchor="middle">CAT1</text><text x="83" y="216" text-anchor="middle" transform="rotate(-90 83 216)">CAT2</text><text x="557" y="216" text-anchor="middle" transform="rotate(90 557 216)">CAT2</text><text x="320" y="333" text-anchor="middle">GA</text></g></svg>$$
        ),
        (
            '20000000-0000-0000-0000-000000000003'::uuid,
            'Em Xinh Say Hi',
            'A bright pop concert focused on Em Xinh Say Hi performances, choreography, and fan interaction.',
            'Nhà thi đấu Phú Thọ, TP. Hồ Chí Minh',
            '2026-11-07 20:00:00+07'::timestamptz,
            'EXSH-HCM-2026',
            $$Em Xinh Say Hi brings a colorful pop-forward show to the arena, highlighting group chemistry, solo stages, and a production style designed for close fan engagement. This seeded artist bio keeps the public page complete out of the box and avoids any dependency on Gemini quota during a demo.$$,
            $$<svg viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Em Xinh Say Hi seat map"><rect width="640" height="360" fill="#f8fafc"/><rect x="222" y="26" width="196" height="54" rx="8" fill="#111827"/><text x="320" y="59" text-anchor="middle" font-family="Arial" font-size="18" fill="#ffffff">STAGE</text><path d="M228 98h184l34 60H194z" fill="#7c3aed" opacity=".9"/><path d="M172 170h296l46 62H126z" fill="#db2777" opacity=".88"/><path d="M118 244h404l36 56H82z" fill="#2563eb" opacity=".86"/><path d="M38 92h110v110H38zM492 92h110v110H492z" fill="#f59e0b" opacity=".88"/><path d="M62 314h516v30H62z" fill="#16a34a" opacity=".86"/><g font-family="Arial" font-size="16" font-weight="700" fill="#ffffff"><text x="320" y="134" text-anchor="middle">SVIP</text><text x="320" y="207" text-anchor="middle">VIP</text><text x="320" y="278" text-anchor="middle">CAT1</text><text x="93" y="152" text-anchor="middle">CAT2</text><text x="547" y="152" text-anchor="middle">CAT2</text><text x="320" y="337" text-anchor="middle">GA</text></g></svg>$$
        ),
        (
            '20000000-0000-0000-0000-000000000004'::uuid,
            'Chị Đẹp Đạp Gió Rẽ Sóng',
            'A premium concert night for Chị Đẹp Đạp Gió Rẽ Sóng fans with vocal showcases and dance-heavy sets.',
            'Cung Điền kinh Mỹ Đình, Hà Nội',
            '2026-12-05 19:30:00+07'::timestamptz,
            'CDDG-HN-2026',
            $$Chị Đẹp Đạp Gió Rẽ Sóng presents a refined live program built around standout vocalists, dance crews, and polished ensemble performances. The demo seed publishes this biography immediately so the audience-facing site has complete editorial content from the first Docker Compose run.$$,
            $$<svg viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Chi Dep Dap Gio Re Song seat map"><rect width="640" height="360" fill="#f8fafc"/><rect x="232" y="24" width="176" height="56" rx="8" fill="#111827"/><text x="320" y="58" text-anchor="middle" font-family="Arial" font-size="18" fill="#ffffff">STAGE</text><path d="M246 100h148l56 58H190z" fill="#7c3aed" opacity=".9"/><path d="M172 170h296l52 58H120z" fill="#db2777" opacity=".88"/><path d="M88 240h464v54H88z" fill="#2563eb" opacity=".86"/><path d="M34 104h110v190H34zM496 104h110v190H496z" fill="#f59e0b" opacity=".88"/><path d="M70 310h500v34H70z" fill="#16a34a" opacity=".86"/><g font-family="Arial" font-size="16" font-weight="700" fill="#ffffff"><text x="320" y="136" text-anchor="middle">SVIP</text><text x="320" y="205" text-anchor="middle">VIP</text><text x="320" y="273" text-anchor="middle">CAT1</text><text x="89" y="205" text-anchor="middle" transform="rotate(-90 89 205)">CAT2</text><text x="551" y="205" text-anchor="middle" transform="rotate(90 551 205)">CAT2</text><text x="320" y="335" text-anchor="middle">GA</text></g></svg>$$
        )
)
INSERT INTO concerts (
    id,
    name,
    description,
    venue,
    event_date,
    status,
    event_code,
    artist_bio,
    artist_bio_draft,
    bio_status,
    bio_error,
    bio_generation_id,
    artist_pdf_uri,
    seat_map_svg,
    created_by,
    created_at,
    updated_at
)
SELECT
    id,
    name,
    description,
    venue,
    event_date,
    'PUBLISHED',
    event_code,
    artist_bio,
    NULL,
    'PUBLISHED',
    NULL,
    0,
    NULL,
    seat_map_svg,
    '10000000-0000-0000-0000-000000000001',
    now(),
    now()
FROM demo_concerts
ON CONFLICT (event_code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    venue = EXCLUDED.venue,
    event_date = EXCLUDED.event_date,
    status = EXCLUDED.status,
    artist_bio = EXCLUDED.artist_bio,
    artist_bio_draft = EXCLUDED.artist_bio_draft,
    bio_status = EXCLUDED.bio_status,
    bio_error = EXCLUDED.bio_error,
    seat_map_svg = EXCLUDED.seat_map_svg,
    created_by = EXCLUDED.created_by,
    updated_at = now();

INSERT INTO ticket_types (
    id,
    concert_id,
    name,
    zone,
    price,
    total_quantity,
    remaining_quantity,
    sale_opens_at,
    per_user_limit,
    created_at
)
VALUES
    ('30000000-0000-0000-0001-000000000001', '20000000-0000-0000-0000-000000000001', 'GA', 'GA', 500000, 5000, 5000, '2026-07-01 10:00:00+07', 4, now()),
    ('30000000-0000-0000-0001-000000000002', '20000000-0000-0000-0000-000000000001', 'CAT2', 'CAT2', 800000, 2000, 2000, '2026-07-01 10:00:00+07', 4, now()),
    ('30000000-0000-0000-0001-000000000003', '20000000-0000-0000-0000-000000000001', 'CAT1', 'CAT1', 1200000, 1000, 1000, '2026-07-01 10:00:00+07', 4, now()),
    ('30000000-0000-0000-0001-000000000004', '20000000-0000-0000-0000-000000000001', 'VIP', 'VIP', 2000000, 500, 500, '2026-07-01 10:00:00+07', 2, now()),
    ('30000000-0000-0000-0001-000000000005', '20000000-0000-0000-0000-000000000001', 'SVIP', 'SVIP', 3500000, 200, 200, '2026-07-01 10:00:00+07', 2, now()),
    ('30000000-0000-0000-0002-000000000001', '20000000-0000-0000-0000-000000000002', 'GA', 'GA', 500000, 5000, 5000, '2026-07-15 10:00:00+07', 4, now()),
    ('30000000-0000-0000-0002-000000000002', '20000000-0000-0000-0000-000000000002', 'CAT2', 'CAT2', 800000, 2000, 2000, '2026-07-15 10:00:00+07', 4, now()),
    ('30000000-0000-0000-0002-000000000003', '20000000-0000-0000-0000-000000000002', 'CAT1', 'CAT1', 1200000, 1000, 1000, '2026-07-15 10:00:00+07', 4, now()),
    ('30000000-0000-0000-0002-000000000004', '20000000-0000-0000-0000-000000000002', 'VIP', 'VIP', 2000000, 500, 500, '2026-07-15 10:00:00+07', 2, now()),
    ('30000000-0000-0000-0002-000000000005', '20000000-0000-0000-0000-000000000002', 'SVIP', 'SVIP', 3500000, 200, 200, '2026-07-15 10:00:00+07', 2, now()),
    ('30000000-0000-0000-0003-000000000001', '20000000-0000-0000-0000-000000000003', 'GA', 'GA', 500000, 5000, 5000, '2026-08-01 10:00:00+07', 4, now()),
    ('30000000-0000-0000-0003-000000000002', '20000000-0000-0000-0000-000000000003', 'CAT2', 'CAT2', 800000, 2000, 2000, '2026-08-01 10:00:00+07', 4, now()),
    ('30000000-0000-0000-0003-000000000003', '20000000-0000-0000-0000-000000000003', 'CAT1', 'CAT1', 1200000, 1000, 1000, '2026-08-01 10:00:00+07', 4, now()),
    ('30000000-0000-0000-0003-000000000004', '20000000-0000-0000-0000-000000000003', 'VIP', 'VIP', 2000000, 500, 500, '2026-08-01 10:00:00+07', 2, now()),
    ('30000000-0000-0000-0003-000000000005', '20000000-0000-0000-0000-000000000003', 'SVIP', 'SVIP', 3500000, 200, 200, '2026-08-01 10:00:00+07', 2, now()),
    ('30000000-0000-0000-0004-000000000001', '20000000-0000-0000-0000-000000000004', 'GA', 'GA', 500000, 5000, 5000, '2026-08-15 10:00:00+07', 4, now()),
    ('30000000-0000-0000-0004-000000000002', '20000000-0000-0000-0000-000000000004', 'CAT2', 'CAT2', 800000, 2000, 2000, '2026-08-15 10:00:00+07', 4, now()),
    ('30000000-0000-0000-0004-000000000003', '20000000-0000-0000-0000-000000000004', 'CAT1', 'CAT1', 1200000, 1000, 1000, '2026-08-15 10:00:00+07', 4, now()),
    ('30000000-0000-0000-0004-000000000004', '20000000-0000-0000-0000-000000000004', 'VIP', 'VIP', 2000000, 500, 500, '2026-08-15 10:00:00+07', 2, now()),
    ('30000000-0000-0000-0004-000000000005', '20000000-0000-0000-0000-000000000004', 'SVIP', 'SVIP', 3500000, 200, 200, '2026-08-15 10:00:00+07', 2, now())
ON CONFLICT (id) DO UPDATE
SET concert_id = EXCLUDED.concert_id,
    name = EXCLUDED.name,
    zone = EXCLUDED.zone,
    price = EXCLUDED.price,
    total_quantity = EXCLUDED.total_quantity,
    remaining_quantity = EXCLUDED.remaining_quantity,
    sale_opens_at = EXCLUDED.sale_opens_at,
    per_user_limit = EXCLUDED.per_user_limit;
