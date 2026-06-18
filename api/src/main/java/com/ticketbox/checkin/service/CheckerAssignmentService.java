package com.ticketbox.checkin.service;

import com.ticketbox.auth.security.UserPrincipal;
import com.ticketbox.auth.service.AuthenticatedUserService;
import com.ticketbox.auth.service.OrganizerOwnershipService;
import com.ticketbox.checkin.dto.CheckerAssignmentAuditRequest;
import com.ticketbox.checkin.dto.CheckerAssignmentRequest;
import com.ticketbox.checkin.dto.CheckerAssignmentResponse;
import com.ticketbox.checkin.dto.CheckerAssignmentStateRequest;
import com.ticketbox.checkin.dto.CheckerAssignmentsResponse;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CheckerAssignmentService {

    private static final Set<String> STATES = Set.of("ACTIVE", "STANDBY", "INACTIVE");
    private static final Set<String> ACTIVATION_MODES = Set.of("ONLINE", "EMERGENCY_LOCAL");
    private static final Set<String> AUDIT_ACTIONS = Set.of(
            "ASSIGNED",
            "ACTIVATED",
            "STANDBY",
            "DEACTIVATED",
            "EMERGENCY_LOCAL_ACTIVATED");

    private final JdbcTemplate jdbcTemplate;
    private final AuthenticatedUserService authenticatedUserService;
    private final OrganizerOwnershipService organizerOwnershipService;

    public CheckerAssignmentService(
            JdbcTemplate jdbcTemplate,
            AuthenticatedUserService authenticatedUserService,
            OrganizerOwnershipService organizerOwnershipService) {
        this.jdbcTemplate = jdbcTemplate;
        this.authenticatedUserService = authenticatedUserService;
        this.organizerOwnershipService = organizerOwnershipService;
    }

    public CheckerAssignmentsResponse listForCurrentChecker(UUID concertId) {
        UserPrincipal checker = authenticatedUserService.requireCurrentUser();
        List<CheckerAssignmentResponse> assignments = jdbcTemplate.query("""
                select id,
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
                from checker_gate_assignments
                where concert_id = ?
                  and checker_id = ?
                order by case state when 'ACTIVE' then 0 when 'STANDBY' then 1 else 2 end,
                         gate_id,
                         lane_id nulls first
                """, this::mapAssignment, concertId, checker.id());
        return new CheckerAssignmentsResponse(concertId, checker.id(), assignments);
    }

    @Transactional
    public CheckerAssignmentResponse create(UUID concertId, CheckerAssignmentRequest request) {
        organizerOwnershipService.requireOwnedConcert(concertId);
        String state = normalizeState(request.state());
        UUID assignmentId = insertAssignment(concertId, request, state);
        if ("ACTIVE".equals(state)) {
            demoteOtherActiveAssignments(concertId, request.gateId(), request.laneId(), assignmentId);
        }
        audit(assignmentId, request.checkerId(), request.deviceId(), "ASSIGNED", "Created by organizer");
        if ("ACTIVE".equals(state)) {
            audit(assignmentId, request.checkerId(), request.deviceId(), "ACTIVATED", "Created active by organizer");
        }
        return findAssignment(assignmentId);
    }

    @Transactional
    public CheckerAssignmentResponse updateState(
            UUID concertId,
            UUID assignmentId,
            CheckerAssignmentStateRequest request) {
        organizerOwnershipService.requireOwnedConcert(concertId);
        String state = normalizeState(request.state());
        String activationMode = request.activationMode() == null || request.activationMode().isBlank()
                ? "ONLINE"
                : normalizeActivationMode(request.activationMode());
        int updated = jdbcTemplate.update("""
                update checker_gate_assignments
                set state = ?,
                    activation_mode = ?,
                    activated_at = case when ? = 'ACTIVE' then now() else activated_at end
                where id = ?
                  and concert_id = ?
                """, state, activationMode, state, assignmentId, concertId);
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Checker assignment not found");
        }
        CheckerAssignmentResponse assignment = findAssignment(assignmentId);
        if ("ACTIVE".equals(state)) {
            demoteOtherActiveAssignments(concertId, assignment.gateId(), assignment.laneId(), assignmentId);
        }
        audit(assignmentId, assignment.checkerId(), assignment.deviceId(), actionForState(state), request.reason());
        return findAssignment(assignmentId);
    }

    @Transactional
    public void recordCurrentCheckerAudit(CheckerAssignmentAuditRequest request) {
        UserPrincipal checker = authenticatedUserService.requireCurrentUser();
        String action = normalizeAuditAction(request.action());
        if (request.assignmentId() != null && !assignmentBelongsToChecker(request.assignmentId(), checker.id())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Assignment does not belong to checker");
        }
        audit(request.assignmentId(), checker.id(), request.deviceId(), action, request.reason());
    }

    private UUID insertAssignment(UUID concertId, CheckerAssignmentRequest request, String state) {
        return jdbcTemplate.execute((ConnectionCallback<UUID>) connection -> {
            try (var statement = connection.prepareStatement("""
                    insert into checker_gate_assignments (
                        concert_id,
                        checker_id,
                        device_id,
                        gate_id,
                        lane_id,
                        allowed_zones,
                        state,
                        activation_mode,
                        activated_at
                    )
                    values (?, ?, ?, ?, ?, ?, ?, 'ONLINE', case when ? = 'ACTIVE' then now() else null end)
                    returning id
                    """)) {
                statement.setObject(1, concertId);
                statement.setObject(2, request.checkerId());
                setNullableString(statement, 3, request.deviceId());
                statement.setString(4, request.gateId());
                setNullableString(statement, 5, request.laneId());
                Array zones = connection.createArrayOf("text", request.allowedZones().toArray(String[]::new));
                statement.setArray(6, zones);
                statement.setString(7, state);
                statement.setString(8, state);
                try (ResultSet resultSet = statement.executeQuery()) {
                    resultSet.next();
                    return resultSet.getObject(1, UUID.class);
                }
            }
        });
    }

    private void audit(UUID assignmentId, UUID checkerId, String deviceId, String action, String reason) {
        jdbcTemplate.update("""
                insert into checker_assignment_audit (
                    assignment_id,
                    checker_id,
                    device_id,
                    action,
                    reason
                )
                values (?, ?, ?, ?, ?)
                """, assignmentId, checkerId, blankToNull(deviceId), action, blankToNull(reason));
    }

    private CheckerAssignmentResponse findAssignment(UUID assignmentId) {
        return jdbcTemplate.query("""
                select id,
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
                from checker_gate_assignments
                where id = ?
                """, rs -> {
            if (!rs.next()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Checker assignment not found");
            }
            return mapAssignment(rs, 1);
        }, assignmentId);
    }

    private boolean assignmentBelongsToChecker(UUID assignmentId, UUID checkerId) {
        Boolean exists = jdbcTemplate.queryForObject("""
                select exists(
                    select 1
                    from checker_gate_assignments
                    where id = ?
                      and checker_id = ?
                )
                """, Boolean.class, assignmentId, checkerId);
        return Boolean.TRUE.equals(exists);
    }

    private void demoteOtherActiveAssignments(UUID concertId, String gateId, String laneId, UUID activeAssignmentId) {
        String normalizedLane = blankToNull(laneId);
        jdbcTemplate.update("""
                update checker_gate_assignments
                set state = 'STANDBY'
                where concert_id = ?
                  and gate_id = ?
                  and (
                      (? is null and lane_id is null)
                      or lane_id = ?
                  )
                  and id <> ?
                  and state = 'ACTIVE'
                """, concertId, gateId, normalizedLane, normalizedLane, activeAssignmentId);
    }

    private CheckerAssignmentResponse mapAssignment(ResultSet rs, int rowNum) throws SQLException {
        return new CheckerAssignmentResponse(
                rs.getObject("id", UUID.class),
                rs.getObject("concert_id", UUID.class),
                rs.getObject("checker_id", UUID.class),
                rs.getString("device_id"),
                rs.getString("gate_id"),
                rs.getString("lane_id"),
                readStringArray(rs.getArray("allowed_zones")),
                rs.getString("state"),
                rs.getString("activation_mode"),
                toInstant(rs.getTimestamp("activated_at")),
                toInstant(rs.getTimestamp("created_at")));
    }

    private List<String> readStringArray(Array sqlArray) throws SQLException {
        if (sqlArray == null) {
            return List.of();
        }
        Object array = sqlArray.getArray();
        if (array instanceof String[] strings) {
            return Arrays.asList(strings);
        }
        if (array instanceof Object[] objects) {
            return Arrays.stream(objects)
                    .map(String::valueOf)
                    .toList();
        }
        return List.of();
    }

    private String normalizeState(String value) {
        String state = normalize(value);
        if (!STATES.contains(state)) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid assignment state");
        }
        return state;
    }

    private String normalizeActivationMode(String value) {
        String mode = normalize(value);
        if (!ACTIVATION_MODES.contains(mode)) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid activation mode");
        }
        return mode;
    }

    private String normalizeAuditAction(String value) {
        String action = normalize(value);
        if (!AUDIT_ACTIONS.contains(action)) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid assignment audit action");
        }
        return action;
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }

    private String actionForState(String state) {
        return switch (state) {
            case "ACTIVE" -> "ACTIVATED";
            case "STANDBY" -> "STANDBY";
            default -> "DEACTIVATED";
        };
    }

    private void setNullableString(java.sql.PreparedStatement statement, int index, String value) throws SQLException {
        if (blankToNull(value) == null) {
            statement.setNull(index, Types.VARCHAR);
        } else {
            statement.setString(index, value.trim());
        }
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private Instant toInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }
}
