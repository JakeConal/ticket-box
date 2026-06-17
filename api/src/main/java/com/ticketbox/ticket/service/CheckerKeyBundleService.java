package com.ticketbox.ticket.service;

import com.ticketbox.ticket.dto.CheckerKeyBundleResponse;
import com.ticketbox.ticket.qr.QrTokenService;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CheckerKeyBundleService {

    private final JdbcTemplate jdbcTemplate;
    private final QrTokenService qrTokenService;

    public CheckerKeyBundleService(JdbcTemplate jdbcTemplate, QrTokenService qrTokenService) {
        this.jdbcTemplate = jdbcTemplate;
        this.qrTokenService = qrTokenService;
    }

    public CheckerKeyBundleResponse getKeyBundle(UUID concertId) {
        ConcertWindow window = findConcertWindow(concertId);
        return new CheckerKeyBundleResponse(
                concertId,
                window.eventDate().minus(Duration.ofDays(1)),
                window.eventDate().plus(Duration.ofDays(1)),
                List.of(new CheckerKeyBundleResponse.VerificationKey(
                        qrTokenService.keyId(),
                        "RS256",
                        qrTokenService.publicKeyPem())));
    }

    private ConcertWindow findConcertWindow(UUID concertId) {
        return jdbcTemplate.query("""
                select event_date
                from concerts
                where id = ?
                """, rs -> {
            if (!rs.next()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Concert not found");
            }
            return mapWindow(rs);
        }, concertId);
    }

    private ConcertWindow mapWindow(ResultSet rs) throws SQLException {
        return new ConcertWindow(rs.getTimestamp("event_date").toInstant());
    }

    private record ConcertWindow(Instant eventDate) {
    }
}
