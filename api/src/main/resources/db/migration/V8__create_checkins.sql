CREATE TABLE checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_scan_id UUID NOT NULL,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    checker_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    device_id TEXT NOT NULL,
    gate_id TEXT NOT NULL,
    lane_id TEXT,
    zone TEXT NOT NULL,
    scanned_at_device TIMESTAMPTZ,
    CONSTRAINT uq_checkins_client_scan_id UNIQUE (client_scan_id),
    CONSTRAINT uq_checkins_ticket_id UNIQUE (ticket_id)
);

CREATE INDEX idx_checkins_checker_id ON checkins(checker_id);
CREATE INDEX idx_checkins_gate_lane ON checkins(gate_id, lane_id);
