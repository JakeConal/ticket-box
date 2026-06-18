package com.ticketbox.checkin.service;

import com.ticketbox.checkin.dto.VipGuestEnterResponse;
import com.ticketbox.checkin.dto.VipGuestResponse;
import com.ticketbox.vip.PhoneNormalizer;
import java.text.Normalizer;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class VipGuestService {

    private final JdbcTemplate jdbcTemplate;
    private final PhoneNormalizer phoneNormalizer;

    public VipGuestService(JdbcTemplate jdbcTemplate, PhoneNormalizer phoneNormalizer) {
        this.jdbcTemplate = jdbcTemplate;
        this.phoneNormalizer = phoneNormalizer;
    }

    public List<VipGuestResponse> search(UUID concertId, String query) {
        String trimmed = query == null ? "" : query.trim();
        if (trimmed.length() < 2) {
            return List.of();
        }
        String phoneQuery = phoneNormalizer.normalize(trimmed).orElse("");
        String foldedQuery = fold(trimmed);
        return jdbcTemplate.query("""
                select id,
                       concert_id,
                       name,
                       phone_normalized,
                       sponsor,
                       zone,
                       entered,
                       entered_at
                from vip_guests
                where concert_id = ?
                  and active = true
                order by entered asc, name asc
                limit 200
                """, this::mapGuestRow, concertId)
                .stream()
                .filter(guest -> fold(guest.name()).contains(foldedQuery)
                        || phoneNormalizer.normalize(guest.phoneNormalized()).orElse("").equals(phoneQuery))
                .limit(20)
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public VipGuestEnterResponse enter(UUID guestId) {
        Instant now = Instant.now();
        int updated = jdbcTemplate.update("""
                update vip_guests
                set entered = true,
                    entered_at = ?,
                    updated_at = ?
                where id = ?
                  and active = true
                  and entered = false
                """, Timestamp.from(now), Timestamp.from(now), guestId);
        if (updated == 1) {
            return new VipGuestEnterResponse(guestId, "ENTERED", now, "VIP guest marked entered");
        }
        VipGuestStatus status = findStatus(guestId);
        if (status == null || !status.active()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "VIP guest not found");
        }
        throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "ALREADY ADMITTED - Entered at " + status.enteredAt());
    }

    private VipGuestStatus findStatus(UUID guestId) {
        return jdbcTemplate.query("""
                select active,
                       entered_at
                from vip_guests
                where id = ?
                """, rs -> rs.next()
                ? new VipGuestStatus(rs.getBoolean("active"), toInstant(rs.getTimestamp("entered_at")))
                : null, guestId);
    }

    private VipGuestRow mapGuestRow(ResultSet rs, int rowNum) throws SQLException {
        return new VipGuestRow(
                rs.getObject("id", UUID.class),
                rs.getObject("concert_id", UUID.class),
                rs.getString("name"),
                rs.getString("phone_normalized"),
                rs.getString("sponsor"),
                rs.getString("zone"),
                rs.getBoolean("entered"),
                toInstant(rs.getTimestamp("entered_at")));
    }

    private VipGuestResponse toResponse(VipGuestRow guest) {
        return new VipGuestResponse(
                guest.id(),
                guest.concertId(),
                guest.name(),
                maskPhone(guest.phoneNormalized()),
                guest.sponsor(),
                guest.zone(),
                guest.entered(),
                guest.enteredAt());
    }

    private String fold(String value) {
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        return normalized.toLowerCase(Locale.ROOT);
    }

    private String maskPhone(String phone) {
        if (phone == null || phone.length() <= 4) {
            return "****";
        }
        return "*".repeat(Math.max(0, phone.length() - 4)) + phone.substring(phone.length() - 4);
    }

    private Instant toInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private record VipGuestStatus(boolean active, Instant enteredAt) {
    }

    private record VipGuestRow(
            UUID id,
            UUID concertId,
            String name,
            String phoneNormalized,
            String sponsor,
            String zone,
            boolean entered,
            Instant enteredAt) {
    }
}
