CREATE TABLE idempotency_keys (
    key TEXT PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_idempotency_keys_order_id ON idempotency_keys(order_id);
CREATE INDEX idx_idempotency_keys_created_at ON idempotency_keys(created_at);
