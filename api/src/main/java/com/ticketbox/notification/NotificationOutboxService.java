package com.ticketbox.notification;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Connection;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class NotificationOutboxService {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final NotificationEventFactory eventFactory;

    public NotificationOutboxService(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            NotificationEventFactory eventFactory) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.eventFactory = eventFactory;
    }

    public void enqueuePurchaseConfirmation(UUID orderId) {
        NotificationEvent event = eventFactory.purchaseConfirmation(orderId);
        insert(orderId, event.eventType(), toJson(event));
    }

    private void insert(UUID orderId, String eventType, String payloadJson) {
        if (isPostgres()) {
            jdbcTemplate.update("""
                    insert into notification_outbox (order_id, event_type, payload)
                    values (?, ?, ?::jsonb)
                    """, orderId, eventType, payloadJson);
            return;
        }
        jdbcTemplate.update("""
                insert into notification_outbox (order_id, event_type, payload)
                values (?, ?, ?)
                """, orderId, eventType, payloadJson);
    }

    private boolean isPostgres() {
        return jdbcTemplate.execute((Connection connection) ->
                "PostgreSQL".equals(connection.getMetaData().getDatabaseProductName()));
    }

    private String toJson(NotificationEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (Exception ex) {
            throw new IllegalStateException("Could not serialize notification event", ex);
        }
    }
}
