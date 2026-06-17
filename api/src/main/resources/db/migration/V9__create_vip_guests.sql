CREATE TABLE vip_guests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concert_id UUID NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone_normalized VARCHAR(32) NOT NULL,
    sponsor VARCHAR(255),
    zone VARCHAR(80) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    entered BOOLEAN NOT NULL DEFAULT false,
    entered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vip_guests_concert_active ON vip_guests(concert_id, active);
