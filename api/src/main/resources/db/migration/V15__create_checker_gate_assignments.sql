CREATE TABLE checker_gate_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concert_id UUID NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
    checker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT,
    gate_id TEXT NOT NULL,
    lane_id TEXT,
    allowed_zones TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    state VARCHAR(32) NOT NULL DEFAULT 'INACTIVE',
    activation_mode VARCHAR(32) NOT NULL DEFAULT 'ONLINE',
    activated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_checker_gate_assignments_state CHECK (state IN ('ACTIVE', 'STANDBY', 'INACTIVE')),
    CONSTRAINT chk_checker_gate_assignments_activation_mode CHECK (
        activation_mode IN ('ONLINE', 'EMERGENCY_LOCAL')
    ),
    CONSTRAINT chk_checker_gate_assignments_allowed_zones_non_empty CHECK (
        cardinality(allowed_zones) > 0
    )
);

CREATE INDEX idx_checker_gate_assignments_concert_checker
    ON checker_gate_assignments(concert_id, checker_id);
CREATE INDEX idx_checker_gate_assignments_gate_lane
    ON checker_gate_assignments(concert_id, gate_id, lane_id);
CREATE INDEX idx_checker_gate_assignments_state
    ON checker_gate_assignments(state);
