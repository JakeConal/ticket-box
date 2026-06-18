package com.ticketbox.checkin.service;

import com.ticketbox.auth.service.OrganizerOwnershipService;
import com.ticketbox.checkin.dto.CheckinConflictResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class CheckinConflictService {

    private final JdbcTemplate jdbcTemplate;
    private final OrganizerOwnershipService organizerOwnershipService;

    public CheckinConflictService(JdbcTemplate jdbcTemplate, OrganizerOwnershipService organizerOwnershipService) {
        this.jdbcTemplate = jdbcTemplate;
        this.organizerOwnershipService = organizerOwnershipService;
    }

    public List<CheckinConflictResponse> listForConcert(UUID concertId) {
        organizerOwnershipService.requireOwnedConcert(concertId);
        return jdbcTemplate.query("""
                select cc.id,
                       cc.client_scan_id,
                       cc.ticket_id,
                       cc.attempted_by,
                       cc.attempted_at,
                       cc.device_id,
                       cc.gate_id,
                       cc.lane_id,
                       cc.zone,
                       cc.winning_checked_in_at,
                       cc.created_at
                from checkin_conflicts cc
                join tickets t on t.id = cc.ticket_id
                join ticket_types tt on tt.id = t.ticket_type_id
                where tt.concert_id = ?
                order by cc.created_at desc
                """, this::mapConflict, concertId);
    }

    private CheckinConflictResponse mapConflict(ResultSet rs, int rowNum) throws SQLException {
        return new CheckinConflictResponse(
                rs.getObject("id", UUID.class),
                rs.getObject("client_scan_id", UUID.class),
                rs.getObject("ticket_id", UUID.class),
                rs.getObject("attempted_by", UUID.class),
                rs.getTimestamp("attempted_at").toInstant(),
                rs.getString("device_id"),
                rs.getString("gate_id"),
                rs.getString("lane_id"),
                rs.getString("zone"),
                rs.getTimestamp("winning_checked_in_at").toInstant(),
                Math.abs(java.time.Duration.between(
                        rs.getTimestamp("winning_checked_in_at").toInstant(),
                        rs.getTimestamp("attempted_at").toInstant()).toSeconds()),
                rs.getTimestamp("created_at").toInstant());
    }
}
