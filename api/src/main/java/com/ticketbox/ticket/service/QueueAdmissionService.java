package com.ticketbox.ticket.service;

import com.ticketbox.auth.model.User;
import com.ticketbox.auth.repository.UserRepository;
import com.ticketbox.auth.security.AuthJwtUtil;
import com.ticketbox.auth.security.UserPrincipal;
import com.ticketbox.ticket.dto.QueueStatusResponse;
import io.jsonwebtoken.Claims;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class QueueAdmissionService {

    private static final Logger log = LoggerFactory.getLogger(QueueAdmissionService.class);

    private final QueueStore queueStore;
    private final QueueProperties properties;
    private final AuthJwtUtil authJwtUtil;
    private final UserRepository userRepository;
    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;
    private final AtomicLong scoreSequence = new AtomicLong();

    public QueueAdmissionService(
            QueueStore queueStore,
            QueueProperties properties,
            AuthJwtUtil authJwtUtil,
            UserRepository userRepository,
            JdbcTemplate jdbcTemplate,
            Clock clock) {
        this.queueStore = queueStore;
        this.properties = properties;
        this.authJwtUtil = authJwtUtil;
        this.userRepository = userRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
    }

    public QueueStatusResponse enterQueue(UUID concertId, UserPrincipal user) {
        if (!isQueueActive(concertId)) {
            return inactive(concertId);
        }
        try {
            String userId = user.id().toString();
            Optional<QueueStatusResponse> admitted = admittedStatus(concertId, admittedKey(concertId, user.id()));
            if (admitted.isPresent()) {
                return admitted.get();
            }
            String queueKey = queueKey(concertId);
            if (queueStore.score(queueKey, userId).isEmpty()) {
                queueStore.add(queueKey, userId, enqueueScore());
            }
            queueStore.expire(queueKey, properties.getQueueTtl());
            return waitingStatus(concertId, user);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw queueUnavailable(concertId, ex);
        }
    }

    public QueueStatusResponse status(UUID concertId, UserPrincipal user) {
        if (!isQueueActive(concertId)) {
            return inactive(concertId);
        }
        try {
            return admittedStatus(concertId, admittedKey(concertId, user.id()))
                    .orElseGet(() -> waitingStatus(concertId, user));
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw queueUnavailable(concertId, ex);
        }
    }

    public void requireAdmissionIfActive(UUID concertId, UserPrincipal user, String admissionToken) {
        if (!isQueueActive(concertId)) {
            return;
        }
        if (admissionToken == null || admissionToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Waiting queue admission token is required");
        }
        try {
            String storedToken = queueStore.getValue(admittedKey(concertId, user.id()))
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.FORBIDDEN,
                            "Waiting queue admission token is expired or not admitted"));
            if (!storedToken.equals(admissionToken)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Waiting queue admission token is invalid");
            }
            Claims claims = authJwtUtil.parseAdmissionToken(admissionToken);
            if (!user.id().toString().equals(claims.getSubject())
                    || !concertId.toString().equals(claims.get("concertId", String.class))
                    || tokenExpired(claims)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Waiting queue admission token is invalid");
            }
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            if (isJwtFailure(ex)) {
                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "Waiting queue admission token is expired or invalid");
            }
            throw queueUnavailable(concertId, ex);
        }
    }

    @Scheduled(
            initialDelayString = "${ticketbox.queue.admission-initial-delay:1s}",
            fixedDelayString = "${ticketbox.queue.admission-delay:1s}")
    public void admitScheduled() {
        if (!properties.isEnabled()) {
            return;
        }
        for (UUID concertId : activeConcertIds()) {
            admitNextBatch(concertId);
        }
    }

    public int admitNextBatch(UUID concertId) {
        if (!isQueueActive(concertId)) {
            return 0;
        }
        try {
            List<String> userIds = queueStore.popMin(queueKey(concertId), properties.getAdmitBatchSize());
            int admitted = 0;
            for (String rawUserId : userIds) {
                UUID userId = UUID.fromString(rawUserId);
                User user = userRepository.findById(userId).orElse(null);
                if (user == null) {
                    continue;
                }
                Instant expiresAt = clock.instant().plus(properties.getAdmissionTokenTtl());
                String token = authJwtUtil.issueAdmissionToken(user, concertId.toString(), expiresAt);
                queueStore.setValue(admittedKey(concertId, userId), token, properties.getAdmissionTokenTtl());
                admitted++;
            }
            return admitted;
        } catch (RuntimeException ex) {
            log.error("ALERT waiting queue admission failed for concert {}", concertId, ex);
            return 0;
        }
    }

    private QueueStatusResponse waitingStatus(UUID concertId, UserPrincipal user) {
        Long position = queueStore.rank(queueKey(concertId), user.id().toString())
                .map(rank -> rank + 1)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User is not in the waiting queue"));
        return new QueueStatusResponse(
                concertId,
                true,
                position,
                estimatedWaitSeconds(position),
                false,
                null,
                null);
    }

    private Optional<QueueStatusResponse> admittedStatus(UUID concertId, String admittedKey) {
        Optional<String> token = queueStore.getValue(admittedKey);
        if (token.isEmpty()) {
            return Optional.empty();
        }
        try {
            Claims claims = authJwtUtil.parseAdmissionToken(token.get());
            if (tokenExpired(claims)) {
                return Optional.empty();
            }
            return Optional.of(new QueueStatusResponse(
                    concertId,
                    true,
                    null,
                    0L,
                    true,
                    token.get(),
                    claims.getExpiration().toInstant()));
        } catch (RuntimeException ex) {
            if (isJwtFailure(ex)) {
                return Optional.empty();
            }
            throw ex;
        }
    }

    private QueueStatusResponse inactive(UUID concertId) {
        return new QueueStatusResponse(concertId, false, null, null, true, null, null);
    }

    private long estimatedWaitSeconds(long position) {
        int batchSize = Math.max(1, properties.getAdmitBatchSize());
        long batches = (long) Math.ceil(position / (double) batchSize);
        Duration delay = properties.getAdmissionDelay();
        return Math.max(1L, batches * Math.max(1L, delay.toSeconds()));
    }

    private boolean isQueueActive(UUID concertId) {
        if (!properties.isEnabled()) {
            return false;
        }
        Instant now = clock.instant();
        Integer count = jdbcTemplate.queryForObject("""
                select count(*)
                from ticket_types tt
                join concerts c on c.id = tt.concert_id
                where tt.concert_id = ?
                  and c.status = 'PUBLISHED'
                  and tt.sale_opens_at between ? and ?
                """,
                Integer.class,
                concertId,
                Timestamp.from(now.minus(properties.getActiveWindowAfter())),
                Timestamp.from(now.plus(properties.getActiveWindowBefore())));
        return count != null && count > 0;
    }

    private double enqueueScore() {
        return clock.millis() + ((scoreSequence.getAndIncrement() % 1_000L) / 1_000.0);
    }

    private List<UUID> activeConcertIds() {
        Instant now = clock.instant();
        return jdbcTemplate.queryForList("""
                select distinct tt.concert_id
                from ticket_types tt
                join concerts c on c.id = tt.concert_id
                where c.status = 'PUBLISHED'
                  and tt.sale_opens_at between ? and ?
                """,
                UUID.class,
                Timestamp.from(now.minus(properties.getActiveWindowAfter())),
                Timestamp.from(now.plus(properties.getActiveWindowBefore())));
    }

    private ResponseStatusException queueUnavailable(UUID concertId, RuntimeException ex) {
        log.error("ALERT waiting queue unavailable for active concert {}; gate closed fail-safe", concertId, ex);
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Waiting queue is temporarily unavailable; purchases are paused");
    }

    private boolean isJwtFailure(RuntimeException ex) {
        return ex.getClass().getName().startsWith("io.jsonwebtoken.")
                || ex instanceof IllegalArgumentException;
    }

    private boolean tokenExpired(Claims claims) {
        return claims.getExpiration() == null || !claims.getExpiration().toInstant().isAfter(clock.instant());
    }

    private String queueKey(UUID concertId) {
        return "queue:" + concertId;
    }

    private String admittedKey(UUID concertId, UUID userId) {
        return "queue:admitted:%s:%s".formatted(concertId, userId);
    }
}
