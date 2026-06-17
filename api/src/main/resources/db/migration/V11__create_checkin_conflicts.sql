CREATE TABLE checkin_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_scan_id UUID NOT NULL,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    attempted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    attempted_at TIMESTAMPTZ NOT NULL,
    device_id TEXT NOT NULL,
    gate_id TEXT NOT NULL,
    lane_id TEXT,
    zone TEXT NOT NULL,
    winning_checked_in_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_checkin_conflicts_ticket_id ON checkin_conflicts(ticket_id);
CREATE INDEX idx_checkin_conflicts_attempted_by ON checkin_conflicts(attempted_by);
CREATE INDEX idx_checkin_conflicts_gate_id ON checkin_conflicts(gate_id);
CREATE INDEX idx_checkin_conflicts_lane_id ON checkin_conflicts(lane_id);
CREATE INDEX idx_checkin_conflicts_client_scan_id ON checkin_conflicts(client_scan_id);
