CREATE TABLE checker_assignment_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES checker_gate_assignments(id) ON DELETE SET NULL,
    checker_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    device_id TEXT,
    action VARCHAR(64) NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_checker_assignment_audit_action CHECK (
        action IN (
            'ASSIGNED',
            'ACTIVATED',
            'STANDBY',
            'DEACTIVATED',
            'EMERGENCY_LOCAL_ACTIVATED'
        )
    )
);

CREATE INDEX idx_checker_assignment_audit_assignment_id
    ON checker_assignment_audit(assignment_id);
CREATE INDEX idx_checker_assignment_audit_checker_id
    ON checker_assignment_audit(checker_id);
CREATE INDEX idx_checker_assignment_audit_created_at
    ON checker_assignment_audit(created_at);
