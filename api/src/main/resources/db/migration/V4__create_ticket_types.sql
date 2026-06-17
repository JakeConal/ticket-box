CREATE TABLE ticket_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concert_id UUID NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    zone VARCHAR(80) NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    total_quantity INTEGER NOT NULL,
    remaining_quantity INTEGER NOT NULL,
    sale_opens_at TIMESTAMPTZ NOT NULL,
    per_user_limit INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_ticket_types_price_non_negative CHECK (price >= 0),
    CONSTRAINT chk_ticket_types_total_quantity_positive CHECK (total_quantity > 0),
    CONSTRAINT chk_ticket_types_remaining_quantity_range CHECK (
        remaining_quantity >= 0
        AND remaining_quantity <= total_quantity
    ),
    CONSTRAINT chk_ticket_types_per_user_limit_range CHECK (
        per_user_limit > 0
        AND per_user_limit <= total_quantity
    )
);

CREATE INDEX idx_ticket_types_concert_id ON ticket_types(concert_id);
