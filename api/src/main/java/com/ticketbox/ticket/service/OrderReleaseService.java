package com.ticketbox.ticket.service;

import com.ticketbox.concert.cache.ConcertCacheService;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderReleaseService {

    private static final String PENDING = "PENDING";
    private static final String PENDING_CONFIRMATION = "PENDING_CONFIRMATION";
    private static final String FAILED = "FAILED";
    private static final String EXPIRED = "EXPIRED";
    private static final Set<String> RELEASABLE_STATUSES = Set.of(PENDING, PENDING_CONFIRMATION);

    private final JdbcTemplate jdbcTemplate;
    private final PurchaseLimitCounter purchaseLimitCounter;
    private final ConcertCacheService concertCacheService;

    public OrderReleaseService(
            JdbcTemplate jdbcTemplate,
            PurchaseLimitCounter purchaseLimitCounter,
            ConcertCacheService concertCacheService) {
        this.jdbcTemplate = jdbcTemplate;
        this.purchaseLimitCounter = purchaseLimitCounter;
        this.concertCacheService = concertCacheService;
    }

    @Transactional
    public boolean markFailedAndRelease(UUID orderId) {
        return release(orderId, FAILED);
    }

    @Transactional
    public boolean markPaymentSetupFailedAndRelease(UUID orderId, String idempotencyKey) {
        boolean released = release(orderId, FAILED);
        if (released) {
            jdbcTemplate.update(
                    "update orders set idempotency_key = null where id = ? and idempotency_key = ?",
                    orderId,
                    idempotencyKey);
            jdbcTemplate.update(
                    "delete from idempotency_keys where \"key\" = ? and (order_id is null or order_id = ?)",
                    idempotencyKey,
                    orderId);
        }
        return released;
    }

    @Transactional
    public boolean markExpiredAndRelease(UUID orderId) {
        return release(orderId, EXPIRED);
    }

    private boolean release(UUID orderId, String targetStatus) {
        OrderSnapshot order = findOrder(orderId);
        if (!RELEASABLE_STATUSES.contains(order.status())) {
            return false;
        }

        List<OrderItemSnapshot> items = findItems(orderId);
        int updated = jdbcTemplate.update("""
                update orders
                set status = ?
                where id = ?
                  and status in (?, ?)
                """, targetStatus, orderId, PENDING, PENDING_CONFIRMATION);
        if (updated == 0) {
            return false;
        }

        for (OrderItemSnapshot item : items) {
            jdbcTemplate.update("""
                    update ticket_types
                    set remaining_quantity = remaining_quantity + ?
                    where id = ?
                    """, item.quantity(), item.ticketTypeId());
            concertCacheService.invalidateTicketAvailability(item.ticketTypeId());
            purchaseLimitCounter.release(order.userId(), order.concertId(), item.ticketTypeId(), item.quantity());
        }
        return true;
    }

    private OrderSnapshot findOrder(UUID orderId) {
        return jdbcTemplate.query("""
                select user_id, concert_id, status
                from orders
                where id = ?
                """, rs -> {
            if (!rs.next()) {
                throw new IllegalArgumentException("Order not found: " + orderId);
            }
            return new OrderSnapshot(
                    rs.getObject("user_id", UUID.class),
                    rs.getObject("concert_id", UUID.class),
                    rs.getString("status"));
        }, orderId);
    }

    private List<OrderItemSnapshot> findItems(UUID orderId) {
        return jdbcTemplate.query("""
                select ticket_type_id, quantity
                from order_items
                where order_id = ?
                """, (rs, rowNum) -> mapItem(rs), orderId);
    }

    private OrderItemSnapshot mapItem(ResultSet rs) throws SQLException {
        return new OrderItemSnapshot(
                rs.getObject("ticket_type_id", UUID.class),
                rs.getInt("quantity"));
    }

    private record OrderSnapshot(UUID userId, UUID concertId, String status) {
    }

    private record OrderItemSnapshot(UUID ticketTypeId, int quantity) {
    }
}
