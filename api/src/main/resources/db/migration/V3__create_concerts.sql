CREATE TABLE concerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    venue VARCHAR(255) NOT NULL,
    event_date TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    event_code VARCHAR(64) NOT NULL,
    artist_bio TEXT,
    artist_bio_draft TEXT,
    bio_status VARCHAR(32),
    bio_error TEXT,
    bio_generation_id BIGINT NOT NULL DEFAULT 0,
    artist_pdf_uri TEXT,
    seat_map_svg TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_concerts_event_code UNIQUE (event_code),
    CONSTRAINT chk_concerts_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED')),
    CONSTRAINT chk_concerts_bio_status CHECK (
        bio_status IS NULL
        OR bio_status IN ('GENERATING', 'DRAFT', 'PUBLISHED', 'FAILED', 'REJECTED')
    )
);

CREATE INDEX idx_concerts_created_by ON concerts(created_by);
CREATE INDEX idx_concerts_status_event_date ON concerts(status, event_date);
