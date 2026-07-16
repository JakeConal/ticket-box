package com.ticketbox.ticket.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.auth.security.UserPrincipal;
import com.ticketbox.auth.service.AuthenticatedUserService;
import com.ticketbox.concert.cache.ConcertCacheService;
import com.ticketbox.payment.gateway.PaymentGatewayManager;
import com.ticketbox.payment.gateway.PaymentGatewayRequest;
import com.ticketbox.ticket.dto.PurchaseRequest;
import com.ticketbox.ticket.dto.PurchaseResponse;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TicketPurchaseService {

    private static final String PENDING = "PENDING";
    private static final String PENDING_CONFIRMATION = "PENDING_CONFIRMATION";
    private static final String PAID = "PAID";
    private static final String PUBLISHED = "PUBLISHED";
    private static final java.time.Duration IDEMPOTENCY_FAST_PATH_TTL = java.time.Duration.ofHours(24);

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final StringRedisTemplate redisTemplate;
    private final AuthenticatedUserService authenticatedUserService;
    private final PurchaseLimitCounter purchaseLimitCounter;
    private final PurchaseLockRegistry purchaseLockRegistry;
    private final QueueAdmissionService queueAdmissionService;
    private final ConcertCacheService concertCacheService;
    private final PaymentGatewayManager paymentGatewayManager;
    private final OrderReleaseService orderReleaseService;
    private final TransactionTemplate transactionTemplate;
    private final boolean isPostgres;

    public TicketPurchaseService(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            StringRedisTemplate redisTemplate,
            AuthenticatedUserService authenticatedUserService,
            PurchaseLimitCounter purchaseLimitCounter,
            PurchaseLockRegistry purchaseLockRegistry,
            QueueAdmissionService queueAdmissionService,
            ConcertCacheService concertCacheService,
            PaymentGatewayManager paymentGatewayManager,
            OrderReleaseService orderReleaseService,
            TransactionTemplate transactionTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.redisTemplate = redisTemplate;
        this.authenticatedUserService = authenticatedUserService;
        this.purchaseLimitCounter = purchaseLimitCounter;
        this.purchaseLockRegistry = purchaseLockRegistry;
        this.queueAdmissionService = queueAdmissionService;
        this.concertCacheService = concertCacheService;
        this.paymentGatewayManager = paymentGatewayManager;
        this.orderReleaseService = orderReleaseService;
        this.transactionTemplate = transactionTemplate;

        String dbName;
        try {
            dbName = jdbcTemplate.execute((java.sql.Connection conn) -> conn.getMetaData().getDatabaseProductName());
        } catch (Exception e) {
            dbName = "PostgreSQL";
        }
        this.isPostgres = "PostgreSQL".equalsIgnoreCase(dbName);
    }

    public PurchaseResult purchase(String requestedIdempotencyKey, PurchaseRequest request) {
        UserPrincipal user = authenticatedUserService.requireCurrentUser();
        String idempotencyKey = requestedIdempotencyKey == null || requestedIdempotencyKey.isBlank()
                ? UUID.randomUUID().toString()
                : requestedIdempotencyKey.trim();

        Optional<PurchaseResponse> existing = findStoredResult(idempotencyKey);
        if (existing.isPresent()) {
            return new PurchaseResult(idempotencyKey, existing.get());
        }

        paymentGatewayManager.ensureAvailable(request.paymentProvider());
        PendingPurchase pendingPurchase = transactionTemplate.execute(status ->
                purchaseLockRegistry.withUserTicketTypeLock(user.id(), request.ticketTypeId(), () ->
                        createPendingPurchase(user, idempotencyKey, request)));
        if (pendingPurchase.existingResponse().isPresent()) {
            return new PurchaseResult(idempotencyKey, pendingPurchase.existingResponse().get());
        }

        PurchaseResponse response;
        try {
            String paymentUrl = paymentGatewayManager.createPaymentUrl(new PaymentGatewayRequest(
                    pendingPurchase.orderId(),
                    user.id(),
                    pendingPurchase.concertId(),
                    request.paymentProvider(),
                    pendingPurchase.amount()));
            response = new PurchaseResponse(pendingPurchase.orderId(), paymentUrl);
            storeResult(idempotencyKey, pendingPurchase.orderId(), response);
        } catch (RuntimeException ex) {
            try {
                orderReleaseService.markPaymentSetupFailedAndRelease(
                        pendingPurchase.orderId(),
                        idempotencyKey);
            } catch (RuntimeException cleanupError) {
                ex.addSuppressed(cleanupError);
            }
            throw ex;
        }

        return new PurchaseResult(idempotencyKey, response);
    }

    private PendingPurchase createPendingPurchase(UserPrincipal user, String idempotencyKey, PurchaseRequest request) {
        Optional<PurchaseResponse> existing = findStoredResult(idempotencyKey);
        if (existing.isPresent()) {
            return PendingPurchase.existing(existing.get());
        }

        TicketTypeSnapshot ticketType = findTicketType(request.ticketTypeId());
        if (!PUBLISHED.equals(ticketType.concertStatus())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Ticket type not found");
        }
        if (ticketType.saleOpensAt().isAfter(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Sale has not opened yet");
        }
        queueAdmissionService.requireAdmissionIfActive(ticketType.concertId(), user, request.admissionToken());

        boolean redisReserved = purchaseLimitCounter.reserve(
                user.id(),
                ticketType.concertId(),
                ticketType.id(),
                request.quantity(),
                ticketType.perUserLimit());
        if (!redisReserved) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Purchase limit reached for this ticket type");
        }

        boolean completed = false;
        try {
            Optional<PurchaseResponse> duplicate = claimIdempotencyKey(idempotencyKey);
            if (duplicate.isPresent()) {
                purchaseLimitCounter.release(user.id(), ticketType.concertId(), ticketType.id(), request.quantity());
                completed = true;
                return PendingPurchase.existing(duplicate.get());
            }
            int alreadyReserved = countActiveQuantity(user.id(), ticketType.id());
            if (alreadyReserved + request.quantity() > ticketType.perUserLimit()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Purchase limit reached for this ticket type");
            }

            int updated = jdbcTemplate.update("""
                    update ticket_types
                    set remaining_quantity = remaining_quantity - ?
                    where id = ?
                      and remaining_quantity >= ?
                    """, request.quantity(), ticketType.id(), request.quantity());
            if (updated == 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Tickets sold out");
            }
            concertCacheService.invalidateTicketAvailability(ticketType.id());

            UUID orderId = UUID.randomUUID();
            Instant now = Instant.now();
            jdbcTemplate.update("""
                    insert into orders (
                        id,
                        user_id,
                        concert_id,
                        status,
                        idempotency_key,
                        payment_provider,
                        created_at
                    )
                    values (?, ?, ?, ?, ?, ?, ?)
                    """,
                    orderId,
                    user.id(),
                    ticketType.concertId(),
                    PENDING,
                    idempotencyKey,
                    request.paymentProvider().name(),
                    Timestamp.from(now));
            jdbcTemplate.update("""
                    insert into order_items (id, order_id, ticket_type_id, quantity)
                    values (?, ?, ?, ?)
                    """, UUID.randomUUID(), orderId, ticketType.id(), request.quantity());

            completed = true;
            return new PendingPurchase(
                    orderId,
                    ticketType.concertId(),
                    ticketType.price().multiply(BigDecimal.valueOf(request.quantity())),
                    Optional.empty());
        } catch (RuntimeException ex) {
            if (!completed) {
                purchaseLimitCounter.release(user.id(), ticketType.concertId(), ticketType.id(), request.quantity());
            }
            throw ex;
        }
    }

    private TicketTypeSnapshot findTicketType(UUID ticketTypeId) {
        List<UUID> lockedIds = jdbcTemplate.query(
                "select id from ticket_types where id = ? for update",
                (rs, rowNum) -> rs.getObject("id", UUID.class),
                ticketTypeId);
        if (lockedIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Ticket type not found");
        }
        return jdbcTemplate.query("""
                select tt.id,
                       tt.concert_id,
                       tt.price,
                       tt.sale_opens_at,
                       tt.per_user_limit,
                       c.status as concert_status
                from ticket_types tt
                join concerts c on c.id = tt.concert_id
                where tt.id = ?
                """, rs -> {
                    if (!rs.next()) {
                        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Ticket type not found");
                    }
                    return mapTicketTypeSnapshot(rs);
                }, ticketTypeId);
    }

    private TicketTypeSnapshot mapTicketTypeSnapshot(ResultSet rs) throws SQLException {
        return new TicketTypeSnapshot(
                rs.getObject("id", UUID.class),
                rs.getObject("concert_id", UUID.class),
                rs.getBigDecimal("price"),
                rs.getTimestamp("sale_opens_at").toInstant(),
                rs.getInt("per_user_limit"),
                rs.getString("concert_status"));
    }

    private int countActiveQuantity(UUID userId, UUID ticketTypeId) {
        Integer count = jdbcTemplate.queryForObject("""
                select coalesce(sum(oi.quantity), 0)
                from order_items oi
                join orders o on o.id = oi.order_id
                where o.user_id = ?
                  and oi.ticket_type_id = ?
                  and o.status in (?, ?, ?)
                """, Integer.class, userId, ticketTypeId, PENDING, PENDING_CONFIRMATION, PAID);
        return count == null ? 0 : count;
    }

    private Optional<PurchaseResponse> claimIdempotencyKey(String idempotencyKey) {
        try {
            jdbcTemplate.update(
                    "insert into idempotency_keys (\"key\", created_at) values (?, ?)",
                    idempotencyKey,
                    Timestamp.from(Instant.now()));
            return Optional.empty();
        } catch (DuplicateKeyException ex) {
            return Optional.of(findStoredResult(idempotencyKey)
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.CONFLICT,
                            "Purchase request is already in progress")));
        }
    }

    private Optional<PurchaseResponse> findStoredResult(String idempotencyKey) {
        Optional<PurchaseResponse> fastPathResult = findFastPathResult(idempotencyKey);
        if (fastPathResult.isPresent()) {
            return fastPathResult;
        }
        return jdbcTemplate.query("""
                select result
                from idempotency_keys
                where "key" = ?
                """, rs -> {
            if (!rs.next()) {
                return Optional.empty();
            }
            String result = rs.getString("result");
            if (result == null || result.isBlank()) {
                return Optional.empty();
            }
            try {
                PurchaseResponse response = objectMapper.readValue(result, PurchaseResponse.class);
                storeFastPathResult(idempotencyKey, result);
                return Optional.of(response);
            } catch (Exception ex) {
                throw new IllegalStateException("Stored idempotency result is unreadable", ex);
            }
        }, idempotencyKey);
    }

    private void storeResult(String idempotencyKey, UUID orderId, PurchaseResponse response) {
        try {
            String result = objectMapper.writeValueAsString(response);
            if (isPostgres) {
                jdbcTemplate.update(
                        "update idempotency_keys set order_id = ?, result = cast(? as jsonb) where \"key\" = ?",
                        orderId,
                        result,
                        idempotencyKey);
            } else {
                jdbcTemplate.update(
                        "update idempotency_keys set order_id = ?, result = ? where \"key\" = ?",
                        orderId,
                        result,
                        idempotencyKey);
            }
            storeFastPathResult(idempotencyKey, result);
        } catch (Exception ex) {
            throw new IllegalStateException("Could not store idempotency result", ex);
        }
    }

    private Optional<PurchaseResponse> findFastPathResult(String idempotencyKey) {
        try {
            String result = redisTemplate.opsForValue().get(idempotencyFastPathKey(idempotencyKey));
            if (result == null || result.isBlank()) {
                return Optional.empty();
            }
            return Optional.of(objectMapper.readValue(result, PurchaseResponse.class));
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    private void storeFastPathResult(String idempotencyKey, String result) {
        try {
            redisTemplate.opsForValue().set(
                    idempotencyFastPathKey(idempotencyKey),
                    result,
                    IDEMPOTENCY_FAST_PATH_TTL);
        } catch (Exception ex) {
            // PostgreSQL remains the durable source of truth when Redis is unavailable.
        }
    }

    private String idempotencyFastPathKey(String idempotencyKey) {
        return "idempotency:" + idempotencyKey;
    }

    public record PurchaseResult(String idempotencyKey, PurchaseResponse response) {
    }

    private record TicketTypeSnapshot(
            UUID id,
            UUID concertId,
            BigDecimal price,
            Instant saleOpensAt,
            int perUserLimit,
            String concertStatus) {
    }

    private record PendingPurchase(
            UUID orderId,
            UUID concertId,
            BigDecimal amount,
            Optional<PurchaseResponse> existingResponse) {

        static PendingPurchase existing(PurchaseResponse response) {
            return new PendingPurchase(null, null, BigDecimal.ZERO, Optional.of(response));
        }
    }
}
