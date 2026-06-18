package com.ticketbox.checkin.service;

import com.ticketbox.auth.security.UserPrincipal;
import com.ticketbox.auth.service.AuthenticatedUserService;
import com.ticketbox.checkin.dto.CheckinBatchRequest;
import com.ticketbox.checkin.dto.CheckinBatchResponse;
import com.ticketbox.checkin.dto.CheckinRequest;
import com.ticketbox.checkin.dto.CheckinResultResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CheckinService {

    private final JdbcTemplate jdbcTemplate;
    private final AuthenticatedUserService authenticatedUserService;

    public CheckinService(JdbcTemplate jdbcTemplate, AuthenticatedUserService authenticatedUserService) {
        this.jdbcTemplate = jdbcTemplate;
        this.authenticatedUserService = authenticatedUserService;
    }

    @Transactional
    public CheckinResultResponse checkIn(UUID ticketId, CheckinRequest request) {
        UserPrincipal checker = authenticatedUserService.requireCurrentUser();
        Scan scan = new Scan(
                ticketId,
                request.clientScanId(),
                request.deviceId(),
                request.gateId(),
                request.laneId(),
                request.zone(),
                request.scannedAtDevice());
        return process(checker.id(), scan);
    }

    @Transactional
    public CheckinBatchResponse checkInBatch(CheckinBatchRequest request) {
        UserPrincipal checker = authenticatedUserService.requireCurrentUser();
        List<CheckinResultResponse> results = request.checkins()
                .stream()
                .map(item -> process(checker.id(), new Scan(
                        item.ticketId(),
                        item.clientScanId(),
                        item.deviceId(),
                        item.gateId(),
                        item.laneId(),
                        item.zone(),
                        item.scannedAtDevice())))
                .toList();
        return new CheckinBatchResponse(results);
    }

    private CheckinResultResponse process(UUID checkerId, Scan scan) {
        Optional<String> validationError = scan.validationError();
        if (validationError.isPresent()) {
            return invalid(scan, validationError.get());
        }
        Optional<TicketContext> ticket = findTicket(scan.ticketId());
        if (ticket.isEmpty()) {
            return invalid(scan, "Ticket not found");
        }
        if (!"PAID".equals(ticket.get().orderStatus())) {
            return invalid(scan, "Ticket order is not paid");
        }
        if (!normalize(scan.zone()).equals(normalize(ticket.get().zone()))) {
            return invalid(scan, "Ticket zone does not match scan zone");
        }
        Optional<ExistingCheckin> existingClientScan = findByClientScanId(scan.clientScanId());
        if (existingClientScan.isPresent()) {
            ExistingCheckin existing = existingClientScan.get();
            if (existing.ticketId().equals(scan.ticketId())) {
                return ok(scan, existing.checkedInAt(), "Already synced");
            }
            return invalid(scan, "client_scan_id already belongs to a different ticket");
        }
        try {
            Instant checkedInAt = insertCheckin(checkerId, scan);
            return ok(scan, checkedInAt, "Checked in");
        } catch (DataIntegrityViolationException ex) {
            return conflict(checkerId, scan);
        }
    }

    private Instant insertCheckin(UUID checkerId, Scan scan) {
        Instant scannedAt = scan.scannedAt();
        jdbcTemplate.update("""
                insert into checkins (
                    client_scan_id,
                    ticket_id,
                    checker_id,
                    device_id,
                    gate_id,
                    lane_id,
                    zone,
                    scanned_at_device
                )
                values (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                scan.clientScanId(),
                scan.ticketId(),
                checkerId,
                scan.deviceId(),
                scan.gateId(),
                blankToNull(scan.laneId()),
                normalize(scan.zone()),
                Timestamp.from(scannedAt));
        return findByClientScanId(scan.clientScanId())
                .map(ExistingCheckin::checkedInAt)
                .orElse(scannedAt);
    }

    private CheckinResultResponse conflict(UUID checkerId, Scan scan) {
        Optional<ExistingCheckin> winning = findByTicketId(scan.ticketId());
        if (winning.isEmpty()) {
            Optional<ExistingCheckin> existingClientScan = findByClientScanId(scan.clientScanId());
            if (existingClientScan.isPresent() && existingClientScan.get().ticketId().equals(scan.ticketId())) {
                return ok(scan, existingClientScan.get().checkedInAt(), "Already synced");
            }
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Check-in conflict could not be resolved");
        }
        jdbcTemplate.update("""
                insert into checkin_conflicts (
                    client_scan_id,
                    ticket_id,
                    attempted_by,
                    attempted_at,
                    device_id,
                    gate_id,
                    lane_id,
                    zone,
                    winning_checked_in_at
                )
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                scan.clientScanId(),
                scan.ticketId(),
                checkerId,
                Timestamp.from(scan.scannedAt()),
                scan.deviceId(),
                scan.gateId(),
                blankToNull(scan.laneId()),
                normalize(scan.zone()),
                Timestamp.from(winning.get().checkedInAt()));
        return new CheckinResultResponse(
                scan.clientScanId(),
                scan.ticketId(),
                "CONFLICT",
                null,
                winning.get().checkedInAt(),
                "Ticket was already checked in");
    }

    private Optional<TicketContext> findTicket(UUID ticketId) {
        return jdbcTemplate.query("""
                select t.id,
                       tt.zone,
                       o.status
                from tickets t
                join ticket_types tt on tt.id = t.ticket_type_id
                join orders o on o.id = t.order_id
                where t.id = ?
                """, (rs, rowNum) -> new TicketContext(
                rs.getObject("id", UUID.class),
                rs.getString("zone"),
                rs.getString("status")), ticketId).stream().findFirst();
    }

    private Optional<ExistingCheckin> findByClientScanId(UUID clientScanId) {
        return jdbcTemplate.query("""
                select client_scan_id,
                       ticket_id,
                       checked_in_at
                from checkins
                where client_scan_id = ?
                """, this::mapExistingCheckin, clientScanId).stream().findFirst();
    }

    private Optional<ExistingCheckin> findByTicketId(UUID ticketId) {
        return jdbcTemplate.query("""
                select client_scan_id,
                       ticket_id,
                       checked_in_at
                from checkins
                where ticket_id = ?
                """, this::mapExistingCheckin, ticketId).stream().findFirst();
    }

    private ExistingCheckin mapExistingCheckin(ResultSet rs, int rowNum) throws SQLException {
        return new ExistingCheckin(
                rs.getObject("client_scan_id", UUID.class),
                rs.getObject("ticket_id", UUID.class),
                rs.getTimestamp("checked_in_at").toInstant());
    }

    private CheckinResultResponse ok(Scan scan, Instant checkedInAt, String message) {
        return new CheckinResultResponse(scan.clientScanId(), scan.ticketId(), "OK", checkedInAt, null, message);
    }

    private CheckinResultResponse invalid(Scan scan, String message) {
        return new CheckinResultResponse(scan.clientScanId(), scan.ticketId(), "INVALID", null, null, message);
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private record TicketContext(UUID ticketId, String zone, String orderStatus) {
    }

    private record ExistingCheckin(UUID clientScanId, UUID ticketId, Instant checkedInAt) {
    }

    private record Scan(
            UUID ticketId,
            UUID clientScanId,
            String deviceId,
            String gateId,
            String laneId,
            String zone,
            Instant scannedAtDevice) {

        Instant scannedAt() {
            return scannedAtDevice == null ? Instant.now() : scannedAtDevice;
        }

        Optional<String> validationError() {
            if (ticketId == null) {
                return Optional.of("ticketId is required");
            }
            if (clientScanId == null) {
                return Optional.of("clientScanId is required");
            }
            if (deviceId == null || deviceId.isBlank()) {
                return Optional.of("deviceId is required");
            }
            if (gateId == null || gateId.isBlank()) {
                return Optional.of("gateId is required");
            }
            if (zone == null || zone.isBlank()) {
                return Optional.of("zone is required");
            }
            return Optional.empty();
        }
    }
}
