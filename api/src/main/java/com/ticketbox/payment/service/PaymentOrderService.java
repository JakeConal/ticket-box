package com.ticketbox.payment.service;

import com.ticketbox.auth.security.UserPrincipal;
import com.ticketbox.auth.service.AuthenticatedUserService;
import com.ticketbox.auth.service.OrganizerOwnershipService;
import com.ticketbox.notification.NotificationEventFactory;
import com.ticketbox.notification.NotificationOutboxService;
import com.ticketbox.notification.NotificationService;
import com.ticketbox.payment.dto.AdminOrderResponse;
import com.ticketbox.payment.dto.OrderStatusResponse;
import com.ticketbox.payment.gateway.PaymentGatewayManager;
import com.ticketbox.payment.gateway.PaymentGatewayRequest;
import com.ticketbox.payment.gateway.PaymentVerificationResult;
import com.ticketbox.ticket.dto.PaymentProvider;
import com.ticketbox.ticket.service.TicketIssuanceService;
import com.ticketbox.ticket.service.OrderReleaseService;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PaymentOrderService {

    private static final String PENDING = "PENDING";
    private static final String PENDING_CONFIRMATION = "PENDING_CONFIRMATION";
    private static final String PAID = "PAID";
    private static final String EXPIRED = "EXPIRED";
    private static final String REFUND_REQUIRED = "REFUND_REQUIRED";
    private static final String REFUNDED = "REFUNDED";

    private final JdbcTemplate jdbcTemplate;
    private final PaymentGatewayManager paymentGatewayManager;
    private final OrderReleaseService orderReleaseService;
    private final TicketIssuanceService ticketIssuanceService;
    private final AuthenticatedUserService authenticatedUserService;
    private final OrganizerOwnershipService organizerOwnershipService;
    private final NotificationOutboxService notificationOutboxService;
    private final NotificationEventFactory notificationEventFactory;
    private final NotificationService notificationService;

    public PaymentOrderService(
            JdbcTemplate jdbcTemplate,
            PaymentGatewayManager paymentGatewayManager,
            OrderReleaseService orderReleaseService,
            TicketIssuanceService ticketIssuanceService,
            AuthenticatedUserService authenticatedUserService,
            OrganizerOwnershipService organizerOwnershipService,
            NotificationOutboxService notificationOutboxService,
            NotificationEventFactory notificationEventFactory,
            NotificationService notificationService) {
        this.jdbcTemplate = jdbcTemplate;
        this.paymentGatewayManager = paymentGatewayManager;
        this.orderReleaseService = orderReleaseService;
        this.ticketIssuanceService = ticketIssuanceService;
        this.authenticatedUserService = authenticatedUserService;
        this.organizerOwnershipService = organizerOwnershipService;
        this.notificationOutboxService = notificationOutboxService;
        this.notificationEventFactory = notificationEventFactory;
        this.notificationService = notificationService;
    }

    @Transactional
    public Map<String, String> handleCallback(PaymentProvider provider, Map<String, String> params) {
        PaymentVerificationResult result = paymentGatewayManager.verifyCallback(provider, params);
        if (!result.valid()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, result.message());
        }
        if (result.success()) {
            markPaidOrRefundRequired(result.orderId(), result.paymentRef());
        } else {
            orderReleaseService.markFailedAndRelease(result.orderId());
        }
        return Map.of("status", "ok");
    }

    public boolean reconcilePendingConfirmation(UUID orderId) {
        PaymentOrderSnapshot order = findOrder(orderId);
        if (!PENDING_CONFIRMATION.equals(order.status())) {
            return false;
        }
        PaymentVerificationResult result = paymentGatewayManager.queryTransactionStatus(new PaymentGatewayRequest(
                order.id(),
                order.userId(),
                order.concertId(),
                PaymentProvider.valueOf(order.paymentProvider()),
                order.amount()));
        if (result.valid() && result.success()) {
            markPaidOrRefundRequired(orderId, result.paymentRef());
            return true;
        }
        return false;
    }

    @Transactional
    public void markPendingConfirmation(UUID orderId) {
        jdbcTemplate.update("""
                update orders
                set status = ?
                where id = ?
                  and status = ?
                """, PENDING_CONFIRMATION, orderId, PENDING);
    }

    @Transactional
    public void markPaidOrRefundRequired(UUID orderId, String paymentRef) {
        PaymentOrderSnapshot order = findOrder(orderId);
        if (PAID.equals(order.status()) || REFUND_REQUIRED.equals(order.status())) {
            return;
        }
        if (EXPIRED.equals(order.status())) {
            jdbcTemplate.update("""
                    update orders
                    set status = ?,
                        payment_ref = ?,
                        refund_reason = ?,
                        paid_at = ?
                    where id = ?
                    """,
                    REFUND_REQUIRED,
                    paymentRef,
                    "Payment succeeded after reservation expiry",
                    Instant.now(),
                    orderId);
            return;
        }
        if (PENDING.equals(order.status()) || PENDING_CONFIRMATION.equals(order.status())) {
            jdbcTemplate.update("""
                    update orders
                    set status = ?,
                        payment_ref = ?,
                        paid_at = ?
                    where id = ?
                    """, PAID, paymentRef, Instant.now(), orderId);
            ticketIssuanceService.issueTicketsForPaidOrder(orderId);
            notificationOutboxService.enqueuePurchaseConfirmation(orderId);
            notificationService.sendInApp(notificationEventFactory.inAppPurchaseConfirmation(orderId));
        }
    }

    public OrderStatusResponse getOwnedOrder(UUID orderId) {
        UserPrincipal user = authenticatedUserService.requireCurrentUser();
        return jdbcTemplate.query("""
                select id, concert_id, status, payment_provider, payment_ref, created_at, paid_at
                from orders
                where id = ?
                  and user_id = ?
                """, rs -> {
            if (!rs.next()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found");
            }
            return new OrderStatusResponse(
                    rs.getObject("id", UUID.class),
                    rs.getObject("concert_id", UUID.class),
                    rs.getString("status"),
                    rs.getString("payment_provider"),
                    rs.getString("payment_ref"),
                    instant(rs, "created_at"),
                    instant(rs, "paid_at"));
        }, orderId, user.id());
    }

    public List<AdminOrderResponse> listOwnedConcertOrders(UUID concertId, String status) {
        organizerOwnershipService.requireOwnedConcert(concertId);
        if (status == null || status.isBlank()) {
            return jdbcTemplate.query("""
                    select id, user_id, concert_id, status, payment_provider, payment_ref, refund_reason, created_at, paid_at
                    from orders
                    where concert_id = ?
                    order by created_at desc
                    """, (rs, rowNum) -> mapAdminOrder(rs), concertId);
        }
        return jdbcTemplate.query("""
                select id, user_id, concert_id, status, payment_provider, payment_ref, refund_reason, created_at, paid_at
                from orders
                where concert_id = ?
                  and status = ?
                order by created_at desc
                """, (rs, rowNum) -> mapAdminOrder(rs), concertId, status);
    }

    @Transactional
    public void markRefunded(UUID orderId) {
        PaymentOrderSnapshot order = findOrder(orderId);
        organizerOwnershipService.requireOwnedConcert(order.concertId());
        UserPrincipal organizer = authenticatedUserService.requireCurrentUser();
        int updated = jdbcTemplate.update("""
                update orders
                set status = ?,
                    refunded_at = ?,
                    refunded_by = ?
                where id = ?
                  and status = ?
                """, REFUNDED, Instant.now(), organizer.id(), orderId, REFUND_REQUIRED);
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Order is not awaiting refund");
        }
    }

    private PaymentOrderSnapshot findOrder(UUID orderId) {
        return jdbcTemplate.query("""
                select o.id,
                       o.user_id,
                       o.concert_id,
                       o.status,
                       o.payment_provider,
                       coalesce(sum(oi.quantity * tt.price), 0) as amount
                from orders o
                left join order_items oi on oi.order_id = o.id
                left join ticket_types tt on tt.id = oi.ticket_type_id
                where o.id = ?
                group by o.id, o.user_id, o.concert_id, o.status, o.payment_provider
                """, rs -> {
            if (!rs.next()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found");
            }
            return new PaymentOrderSnapshot(
                    rs.getObject("id", UUID.class),
                    rs.getObject("user_id", UUID.class),
                    rs.getObject("concert_id", UUID.class),
                    rs.getString("status"),
                    rs.getString("payment_provider"),
                    rs.getBigDecimal("amount"));
        }, orderId);
    }

    private AdminOrderResponse mapAdminOrder(ResultSet rs) throws SQLException {
        return new AdminOrderResponse(
                rs.getObject("id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getObject("concert_id", UUID.class),
                rs.getString("status"),
                rs.getString("payment_provider"),
                rs.getString("payment_ref"),
                rs.getString("refund_reason"),
                instant(rs, "created_at"),
                instant(rs, "paid_at"));
    }

    private Instant instant(ResultSet rs, String column) throws SQLException {
        return rs.getTimestamp(column) == null ? null : rs.getTimestamp(column).toInstant();
    }

    private record PaymentOrderSnapshot(
            UUID id,
            UUID userId,
            UUID concertId,
            String status,
            String paymentProvider,
            BigDecimal amount) {
    }
}
