package com.ticketbox.ticket.service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderExpiryService {

    private static final String PENDING = "PENDING";
    private static final String PENDING_CONFIRMATION = "PENDING_CONFIRMATION";
    private static final Duration PENDING_TTL = Duration.ofMinutes(8);
    private static final Duration PENDING_CONFIRMATION_TTL = Duration.ofMinutes(15);
    private static final int BATCH_SIZE = 100;

    private final JdbcTemplate jdbcTemplate;
    private final OrderReleaseService orderReleaseService;

    public OrderExpiryService(JdbcTemplate jdbcTemplate, OrderReleaseService orderReleaseService) {
        this.jdbcTemplate = jdbcTemplate;
        this.orderReleaseService = orderReleaseService;
    }

    @Scheduled(
            initialDelayString = "${ticketbox.orders.expiry-initial-delay-ms:60000}",
            fixedDelayString = "${ticketbox.orders.expiry-scan-ms:60000}")
    public void expireStaleOrdersScheduled() {
        expireStaleOrders();
    }

    @Transactional
    public int expireStaleOrders() {
        Instant now = Instant.now();
        List<UUID> orderIds = jdbcTemplate.query("""
                select id
                from orders
                where (status = ? and created_at < ?)
                   or (status = ? and created_at < ?)
                order by created_at
                limit ?
                for update skip locked
                """,
                (rs, rowNum) -> rs.getObject("id", UUID.class),
                PENDING,
                now.minus(PENDING_TTL),
                PENDING_CONFIRMATION,
                now.minus(PENDING_CONFIRMATION_TTL),
                BATCH_SIZE);

        int expired = 0;
        for (UUID orderId : orderIds) {
            if (orderReleaseService.markExpiredAndRelease(orderId)) {
                expired++;
            }
        }
        return expired;
    }
}
