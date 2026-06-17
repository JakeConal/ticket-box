package com.ticketbox.ticket.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.auth.security.UserPrincipal;
import com.ticketbox.auth.service.AuthenticatedUserService;
import com.ticketbox.concert.cache.ConcertCache;
import com.ticketbox.ticket.dto.PurchaseRequest;
import com.ticketbox.ticket.dto.PurchaseResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TicketPurchaseService {

    private static final String PENDING = "PENDING";
    private static final String PENDING_CONFIRMATION = "PENDING_CONFIRMATION";
    private static final String PAID = "PAID";
    private static final String PUBLISHED = "PUBLISHED";

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final AuthenticatedUserService authenticatedUserService;
    private final PurchaseLimitCounter purchaseLimitCounter;
    private final PurchaseLockRegistry purchaseLockRegistry;
    private final QueueAdmissionService queueAdmissionService;
    private final ConcertCache concertCache;

    public TicketPurchaseService(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            AuthenticatedUserService authenticatedUserService,
            PurchaseLimitCounter purchaseLimitCounter,
            PurchaseLockRegistry purchaseLockRegistry,
            QueueAdmissionService queueAdmissionService,
            ConcertCache concertCache) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.authenticatedUserService = authenticatedUserService;
        this.purchaseLimitCounter = purchaseLimitCounter;
        this.purchaseLockRegistry = purchaseLockRegistry;
        this.queueAdmissionService = queueAdmissionService;
        this.concertCache = concertCache;
    }

    @Transactional
    public PurchaseResult purchase(String requestedIdempotencyKey, PurchaseRequest request) {
        UserPrincipal user = authenticatedUserService.requireCurrentUser();
        String idempotencyKey = requestedIdempotencyKey == null || requestedIdempotencyKey.isBlank()
                ? UUID.randomUUID().toString()
                : requestedIdempotencyKey.trim();

        Optional<PurchaseResponse> existing = findStoredResult(idempotencyKey);
        if (existing.isPresent()) {
            return new PurchaseResult(idempotencyKey, existing.get());
        }

        return purchaseLockRegistry.withUserTicketTypeLock(user.id(), request.ticketTypeId(), () ->
                createPurchase(user, idempotencyKey, request));
    }

    private PurchaseResult createPurchase(UserPrincipal user, String idempotencyKey, PurchaseRequest request) {
        Optional<PurchaseResponse> existing = findStoredResult(idempotencyKey);
        if (existing.isPresent()) {
            return new PurchaseResult(idempotencyKey, existing.get());
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
                return new PurchaseResult(idempotencyKey, duplicate.get());
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
            concertCache.evict("tickets:available:" + ticketType.id());

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
                    now);
            jdbcTemplate.update("""
                    insert into order_items (id, order_id, ticket_type_id, quantity)
                    values (?, ?, ?, ?)
                    """, UUID.randomUUID(), orderId, ticketType.id(), request.quantity());

            PurchaseResponse response = new PurchaseResponse(orderId, "mock-payment://orders/" + orderId);
            storeResult(idempotencyKey, orderId, response);
            completed = true;
            return new PurchaseResult(idempotencyKey, response);
        } catch (RuntimeException ex) {
            if (!completed) {
                purchaseLimitCounter.release(user.id(), ticketType.concertId(), ticketType.id(), request.quantity());
            }
            throw ex;
        }
    }

    private TicketTypeSnapshot findTicketType(UUID ticketTypeId) {
        return jdbcTemplate.query("""
                select tt.id,
                       tt.concert_id,
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
                    Instant.now());
            return Optional.empty();
        } catch (DuplicateKeyException ex) {
            return Optional.of(findStoredResult(idempotencyKey)
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.CONFLICT,
                            "Purchase request is already in progress")));
        }
    }

    private Optional<PurchaseResponse> findStoredResult(String idempotencyKey) {
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
                return Optional.of(objectMapper.readValue(result, PurchaseResponse.class));
            } catch (Exception ex) {
                throw new IllegalStateException("Stored idempotency result is unreadable", ex);
            }
        }, idempotencyKey);
    }

    private void storeResult(String idempotencyKey, UUID orderId, PurchaseResponse response) {
        try {
            jdbcTemplate.update(
                    "update idempotency_keys set order_id = ?, result = ? where \"key\" = ?",
                    orderId,
                    objectMapper.writeValueAsString(response),
                    idempotencyKey);
        } catch (Exception ex) {
            throw new IllegalStateException("Could not store idempotency result", ex);
        }
    }

    public record PurchaseResult(String idempotencyKey, PurchaseResponse response) {
    }

    private record TicketTypeSnapshot(
            UUID id,
            UUID concertId,
            Instant saleOpensAt,
            int perUserLimit,
            String concertStatus) {
    }
}
