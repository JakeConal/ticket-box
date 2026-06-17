CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    concert_id UUID NOT NULL REFERENCES concerts(id) ON DELETE RESTRICT,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    idempotency_key TEXT,
    payment_provider VARCHAR(32),
    payment_ref TEXT,
    refund_reason TEXT,
    refunded_at TIMESTAMPTZ,
    refunded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at TIMESTAMPTZ,
    CONSTRAINT chk_orders_status CHECK (
        status IN (
            'PENDING',
            'PENDING_CONFIRMATION',
            'PAID',
            'FAILED',
            'EXPIRED',
            'REFUND_REQUIRED',
            'REFUNDED'
        )
    ),
    CONSTRAINT chk_orders_payment_provider CHECK (
        payment_provider IS NULL
        OR payment_provider IN ('VNPAY', 'MOMO')
    )
);

CREATE INDEX idx_orders_status_created_at ON orders(status, created_at);
CREATE UNIQUE INDEX ux_orders_idempotency_key
    ON orders(idempotency_key)
    WHERE idempotency_key IS NOT NULL;
