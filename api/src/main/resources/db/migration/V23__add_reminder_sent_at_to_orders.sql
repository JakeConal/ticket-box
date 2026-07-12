ALTER TABLE orders ADD COLUMN reminder_sent_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX idx_orders_reminder_sent_at ON orders (reminder_sent_at) WHERE reminder_sent_at IS NULL;
