package com.ticketbox.notification;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class NotificationOutboxWorker {

    private static final int MAX_ATTEMPTS = 3;

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final NotificationChannel emailNotificationChannel;

    public NotificationOutboxWorker(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            @Qualifier("emailNotificationChannel") NotificationChannel emailNotificationChannel) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.emailNotificationChannel = emailNotificationChannel;
    }

    @Scheduled(fixedDelayString = "${ticketbox.notifications.outbox-delay-ms:30000}")
    public void processPendingOutbox() {
        processBatch(50);
    }

    @Transactional
    public int processBatch(int limit) {
        List<OutboxRow> rows = jdbcTemplate.query("""
                select id,
                       payload,
                       attempts,
                       created_at
                from notification_outbox
                where status in ('PENDING', 'FAILED')
                  and attempts < ?
                order by created_at
                limit ?
                """, this::mapRow, MAX_ATTEMPTS, limit);
        int delivered = 0;
        for (OutboxRow row : rows) {
            if (!eligible(row)) {
                continue;
            }
            try {
                emailNotificationChannel.send(readEvent(row.payload()));
                jdbcTemplate.update("""
                        update notification_outbox
                        set status = 'SENT',
                            sent_at = ?
                        where id = ?
                        """, Instant.now(), row.id());
                delivered++;
            } catch (Exception ex) {
                jdbcTemplate.update("""
                        update notification_outbox
                        set status = 'FAILED',
                            attempts = attempts + 1
                        where id = ?
                        """, row.id());
            }
        }
        return delivered;
    }

    private boolean eligible(OutboxRow row) {
        if (row.attempts() == 0) {
            return true;
        }
        long seconds = 1L << Math.min(row.attempts(), MAX_ATTEMPTS - 1);
        return !row.createdAt().plus(Duration.ofSeconds(seconds)).isAfter(Instant.now());
    }

    private NotificationEvent readEvent(String payload) {
        try {
            return objectMapper.readValue(payload, NotificationEvent.class);
        } catch (Exception ex) {
            throw new IllegalStateException("Could not deserialize notification outbox payload", ex);
        }
    }

    private OutboxRow mapRow(ResultSet rs, int rowNum) throws SQLException {
        return new OutboxRow(
                rs.getObject("id", UUID.class),
                rs.getString("payload"),
                rs.getInt("attempts"),
                rs.getTimestamp("created_at").toInstant());
    }

    private record OutboxRow(UUID id, String payload, int attempts, Instant createdAt) {
    }
}
