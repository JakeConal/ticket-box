WITH seeded_assignments (
    id,
    concert_id,
    checker_id,
    device_id,
    gate_id,
    lane_id,
    allowed_zones,
    state,
    activation_mode,
    activated_at
) AS (
    VALUES
        ('40000000-0000-0000-0001-000000000001'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, 'checker1-device', 'GATE-A', 'LANE-1', ARRAY['GA','CAT2','CAT1','VIP','SVIP']::text[], 'ACTIVE', 'ONLINE', now()),
        ('40000000-0000-0000-0001-000000000002'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000003'::uuid, 'checker2-device', 'GATE-A', 'LANE-2', ARRAY['GA','CAT2','CAT1','VIP','SVIP']::text[], 'STANDBY', 'ONLINE', NULL),
        ('40000000-0000-0000-0002-000000000001'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, 'checker1-device', 'GATE-A', 'LANE-1', ARRAY['GA','CAT2','CAT1','VIP','SVIP']::text[], 'ACTIVE', 'ONLINE', now()),
        ('40000000-0000-0000-0002-000000000002'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000003'::uuid, 'checker2-device', 'GATE-A', 'LANE-2', ARRAY['GA','CAT2','CAT1','VIP','SVIP']::text[], 'STANDBY', 'ONLINE', NULL),
        ('40000000-0000-0000-0003-000000000001'::uuid, '20000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, 'checker1-device', 'GATE-A', 'LANE-1', ARRAY['GA','CAT2','CAT1','VIP','SVIP']::text[], 'ACTIVE', 'ONLINE', now()),
        ('40000000-0000-0000-0003-000000000002'::uuid, '20000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000003'::uuid, 'checker2-device', 'GATE-A', 'LANE-2', ARRAY['GA','CAT2','CAT1','VIP','SVIP']::text[], 'STANDBY', 'ONLINE', NULL),
        ('40000000-0000-0000-0004-000000000001'::uuid, '20000000-0000-0000-0000-000000000004'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, 'checker1-device', 'GATE-A', 'LANE-1', ARRAY['GA','CAT2','CAT1','VIP','SVIP']::text[], 'ACTIVE', 'ONLINE', now()),
        ('40000000-0000-0000-0004-000000000002'::uuid, '20000000-0000-0000-0000-000000000004'::uuid, '10000000-0000-0000-0000-000000000003'::uuid, 'checker2-device', 'GATE-A', 'LANE-2', ARRAY['GA','CAT2','CAT1','VIP','SVIP']::text[], 'STANDBY', 'ONLINE', NULL)
)
INSERT INTO checker_gate_assignments (
    id,
    concert_id,
    checker_id,
    device_id,
    gate_id,
    lane_id,
    allowed_zones,
    state,
    activation_mode,
    activated_at,
    created_at
)
SELECT
    id,
    concert_id,
    checker_id,
    device_id,
    gate_id,
    lane_id,
    allowed_zones,
    state,
    activation_mode,
    activated_at,
    now()
FROM seeded_assignments
ON CONFLICT (id) DO UPDATE
SET concert_id = EXCLUDED.concert_id,
    checker_id = EXCLUDED.checker_id,
    device_id = EXCLUDED.device_id,
    gate_id = EXCLUDED.gate_id,
    lane_id = EXCLUDED.lane_id,
    allowed_zones = EXCLUDED.allowed_zones,
    state = EXCLUDED.state,
    activation_mode = EXCLUDED.activation_mode,
    activated_at = EXCLUDED.activated_at;

INSERT INTO checker_assignment_audit (
    assignment_id,
    checker_id,
    device_id,
    action,
    reason
)
SELECT
    id,
    checker_id,
    device_id,
    CASE WHEN state = 'ACTIVE' THEN 'ACTIVATED' ELSE 'ASSIGNED' END,
    'Seeded demo checker assignment'
FROM checker_gate_assignments
WHERE id IN (
    '40000000-0000-0000-0001-000000000001',
    '40000000-0000-0000-0001-000000000002',
    '40000000-0000-0000-0002-000000000001',
    '40000000-0000-0000-0002-000000000002',
    '40000000-0000-0000-0003-000000000001',
    '40000000-0000-0000-0003-000000000002',
    '40000000-0000-0000-0004-000000000001',
    '40000000-0000-0000-0004-000000000002'
);
