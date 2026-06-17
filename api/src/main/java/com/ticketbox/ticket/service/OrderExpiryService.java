package com.ticketbox.ticket.service;

import com.ticketbox.payment.service.PaymentOrderService;
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
    private final PaymentOrderService paymentOrderService;

    public OrderExpiryService(
            JdbcTemplate jdbcTemplate,
            OrderReleaseService orderReleaseService,
            PaymentOrderService paymentOrderService) {
        this.jdbcTemplate = jdbcTemplate;
        this.orderReleaseService = orderReleaseService;
        this.paymentOrderService = paymentOrderService;
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
        List<StaleOrder> orders = jdbcTemplate.query("""
                select id, status
                from orders
                where (status = ? and created_at < ?)
                   or (status = ? and created_at < ?)
                order by created_at
                limit ?
                for update skip locked
                """,
                (rs, rowNum) -> new StaleOrder(
                        rs.getObject("id", UUID.class),
                        rs.getString("status")),
                PENDING,
                now.minus(PENDING_TTL),
                PENDING_CONFIRMATION,
                now.minus(PENDING_CONFIRMATION_TTL),
                BATCH_SIZE);

        int expired = 0;
        for (StaleOrder order : orders) {
            if (PENDING_CONFIRMATION.equals(order.status())
                    && paymentOrderService.reconcilePendingConfirmation(order.id())) {
                continue;
            }
            if (orderReleaseService.markExpiredAndRelease(order.id())) {
                expired++;
            }
        }
        return expired;
    }

    private record StaleOrder(UUID id, String status) {
    }
}
