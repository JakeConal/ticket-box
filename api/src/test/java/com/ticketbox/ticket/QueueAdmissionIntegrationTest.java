package com.ticketbox.ticket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.auth.model.User;
import com.ticketbox.auth.model.UserRole;
import com.ticketbox.auth.repository.UserRepository;
import com.ticketbox.auth.security.UserPrincipal;
import com.ticketbox.concert.cache.ConcertCache;
import com.ticketbox.ticket.dto.PaymentProvider;
import com.ticketbox.ticket.dto.QueueStatusResponse;
import com.ticketbox.ticket.dto.PurchaseRequest;
import com.ticketbox.ticket.service.QueueAdmissionService;
import com.ticketbox.ticket.service.QueueStore;
import com.ticketbox.ticket.service.TicketPurchaseService;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@TestPropertySource(properties = {
        "spring.flyway.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:queue-admission-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "ticketbox.auth.jwt-secret=test-secret",
        "ticketbox.queue.enabled=true",
        "ticketbox.queue.active-window-before=5m",
        "ticketbox.queue.active-window-after=30m",
        "ticketbox.queue.admit-batch-size=1",
        "ticketbox.queue.admission-token-ttl=3s",
        "ticketbox.queue.admission-delay=1h",
        "ticketbox.queue.admission-initial-delay=1h",
        "ticketbox.orders.expiry-initial-delay-ms=3600000"
})
class QueueAdmissionIntegrationTest {

    @Autowired
    private QueueAdmissionService queueAdmissionService;

    @Autowired
    private TicketPurchaseService ticketPurchaseService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    @Qualifier("testQueueStore")
    private InMemoryQueueStore queueStore;

    @Autowired
    @Qualifier("testQueueConcertCache")
    private InMemoryConcertCache concertCache;

    @BeforeEach
    void resetData() {
        createAuxiliaryTables();
        jdbcTemplate.execute("delete from notification_outbox");
        jdbcTemplate.execute("delete from order_items");
        jdbcTemplate.execute("delete from tickets");
        jdbcTemplate.execute("delete from idempotency_keys");
        jdbcTemplate.execute("delete from orders");
        jdbcTemplate.execute("delete from ticket_types");
        jdbcTemplate.execute("delete from concerts");
        jdbcTemplate.execute("delete from refresh_tokens");
        userRepository.deleteAll();
        queueStore.clear();
        concertCache.clear();
        SecurityContextHolder.clearContext();
    }

    @Test
    void queueAdmissionIsFifoAndBatchSizeBoundsNewAdmissions() throws Exception {
        UUID concertId = createPublishedConcert("QUEUE-FIFO");
        User first = saveUser("queue-first@ticketbox.vn", UserRole.AUDIENCE);
        Thread.sleep(5);
        User second = saveUser("queue-second@ticketbox.vn", UserRole.AUDIENCE);

        QueueStatusResponse firstStatus = queueAdmissionService.enterQueue(concertId, UserPrincipal.from(first));
        QueueStatusResponse secondStatus = queueAdmissionService.enterQueue(concertId, UserPrincipal.from(second));

        assertThat(firstStatus.position()).isEqualTo(1);
        assertThat(secondStatus.position()).isEqualTo(2);
        assertThat(queueAdmissionService.admitNextBatch(concertId)).isEqualTo(1);
        QueueStatusResponse admitted = queueAdmissionService.status(concertId, UserPrincipal.from(first));
        assertThat(admitted.admitted()).isTrue();
        assertThat(admitted.admissionToken()).isNotBlank();
        assertThat(queueAdmissionService.status(concertId, UserPrincipal.from(second)).position()).isEqualTo(1);
    }

    @Test
    void purchaseRequiresValidAdmissionTokenDuringActiveQueueWindow() {
        UUID concertId = createPublishedConcert("QUEUE-PURCHASE");
        UUID ticketTypeId = createTicketType(concertId);
        User buyer = saveUser("queued-buyer@ticketbox.vn", UserRole.AUDIENCE);
        UserPrincipal principal = UserPrincipal.from(buyer);
        authenticate(principal);

        assertThatThrownBy(() -> ticketPurchaseService.purchase(
                UUID.randomUUID().toString(),
                new PurchaseRequest(ticketTypeId, 1, PaymentProvider.VNPAY, null)))
                .isInstanceOf(ResponseStatusException.class)
                .extracting("statusCode")
                .isEqualTo(HttpStatus.FORBIDDEN);

        queueAdmissionService.enterQueue(concertId, principal);
        queueAdmissionService.admitNextBatch(concertId);
        String token = queueAdmissionService.status(concertId, principal).admissionToken();

        assertThatCode(() -> ticketPurchaseService.purchase(
                UUID.randomUUID().toString(),
                new PurchaseRequest(ticketTypeId, 1, PaymentProvider.VNPAY, token)))
                .doesNotThrowAnyException();
    }

    @Test
    void expiredAdmissionTokenIsRejected() throws Exception {
        UUID concertId = createPublishedConcert("QUEUE-EXPIRED");
        User buyer = saveUser("expired-admission@ticketbox.vn", UserRole.AUDIENCE);
        UserPrincipal principal = UserPrincipal.from(buyer);

        queueAdmissionService.enterQueue(concertId, principal);
        queueAdmissionService.admitNextBatch(concertId);
        String token = queueAdmissionService.status(concertId, principal).admissionToken();
        Thread.sleep(3500);

        assertThatThrownBy(() -> queueAdmissionService.requireAdmissionIfActive(concertId, principal, token))
                .isInstanceOf(ResponseStatusException.class)
                .extracting("statusCode")
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    private UUID createPublishedConcert(String eventCode) {
        User organizer = saveUser(eventCode.toLowerCase() + "@ticketbox.vn", UserRole.ORGANIZER);
        UUID concertId = UUID.randomUUID();
        Instant now = Instant.now();
        jdbcTemplate.update("""
                insert into concerts (
                    id,
                    name,
                    description,
                    venue,
                    event_date,
                    status,
                    event_code,
                    artist_bio,
                    bio_generation_id,
                    seat_map_svg,
                    created_by,
                    created_at,
                    updated_at
                )
                values (?, ?, ?, ?, ?, 'PUBLISHED', ?, ?, 0, ?, ?, ?, ?)
                """,
                concertId,
                "Queue Concert",
                "Concert description",
                "HCMC Stadium",
                now.plus(Duration.ofDays(30)),
                eventCode,
                "Published artist bio",
                "<svg><rect id='SVIP'/></svg>",
                organizer.getId(),
                now,
                now);
        createTicketType(concertId);
        return concertId;
    }

    private UUID createTicketType(UUID concertId) {
        UUID ticketTypeId = UUID.randomUUID();
        jdbcTemplate.update("""
                insert into ticket_types (
                    id,
                    concert_id,
                    name,
                    zone,
                    price,
                    total_quantity,
                    remaining_quantity,
                    sale_opens_at,
                    per_user_limit,
                    created_at
                )
                values (?, ?, 'SVIP', 'SVIP', ?, 10, 10, ?, 2, ?)
                """,
                ticketTypeId,
                concertId,
                new BigDecimal("3500000.00"),
                Instant.now().minus(Duration.ofMinutes(1)),
                Instant.now());
        return ticketTypeId;
    }

    private User saveUser(String email, UserRole role) {
        return userRepository.save(new User(
                UUID.randomUUID(),
                email,
                passwordEncoder.encode("password123"),
                role,
                Instant.now()));
    }

    private void authenticate(UserPrincipal principal) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }

    private void createAuxiliaryTables() {
        jdbcTemplate.execute("""
                create table if not exists orders (
                    id uuid primary key,
                    user_id uuid not null,
                    concert_id uuid not null,
                    status varchar(32) not null,
                    idempotency_key varchar(255),
                    payment_provider varchar(32),
                    payment_ref varchar(255),
                    refund_reason varchar(255),
                    refunded_at timestamp,
                    refunded_by uuid,
                    created_at timestamp not null,
                    paid_at timestamp
                )
                """);
        jdbcTemplate.execute("""
                create unique index if not exists ux_orders_idempotency_key
                on orders(idempotency_key)
                """);
        jdbcTemplate.execute("""
                create table if not exists order_items (
                    id uuid primary key,
                    order_id uuid not null,
                    ticket_type_id uuid not null,
                    quantity integer not null
                )
                """);
        jdbcTemplate.execute("""
                create table if not exists tickets (
                    id uuid primary key,
                    order_id uuid not null,
                    ticket_type_id uuid not null,
                    user_id uuid not null,
                    qr_token varchar(4000) not null,
                    issued_at timestamp not null
                )
                """);
        jdbcTemplate.execute("""
                create unique index if not exists ux_tickets_qr_token
                on tickets(qr_token)
                """);
        jdbcTemplate.execute("""
                create table if not exists idempotency_keys (
                    "key" varchar(255) primary key,
                    order_id uuid,
                    result varchar(4000),
                    created_at timestamp not null
                )
                """);
        jdbcTemplate.execute("""
                create table if not exists notification_outbox (
                    id uuid default random_uuid() primary key,
                    order_id uuid not null,
                    event_type varchar(120) not null,
                    payload clob not null,
                    status varchar(32) not null default 'PENDING',
                    attempts integer not null default 0,
                    created_at timestamp not null default now(),
                    sent_at timestamp
                )
                """);
    }

    @TestConfiguration
    static class QueueAdmissionTestConfig {

        @Bean("testQueueStore")
        @Primary
        InMemoryQueueStore testQueueStore() {
            return new InMemoryQueueStore();
        }

        @Bean("testQueueConcertCache")
        @Primary
        InMemoryConcertCache testQueueConcertCache(ObjectMapper objectMapper) {
            return new InMemoryConcertCache(objectMapper);
        }
    }

    static class InMemoryQueueStore implements QueueStore {

        private final Map<String, Map<String, Double>> queues = new ConcurrentHashMap<>();
        private final Map<String, TokenValue> values = new ConcurrentHashMap<>();

        @Override
        public Optional<Double> score(String key, String member) {
            return Optional.ofNullable(queues.getOrDefault(key, Map.of()).get(member));
        }

        @Override
        public void add(String key, String member, double score) {
            queues.computeIfAbsent(key, ignored -> new ConcurrentHashMap<>()).put(member, score);
        }

        @Override
        public Optional<Long> rank(String key, String member) {
            List<String> ordered = queues.getOrDefault(key, Map.of())
                    .entrySet()
                    .stream()
                    .sorted(Map.Entry.<String, Double>comparingByValue().thenComparing(Map.Entry.comparingByKey()))
                    .map(Map.Entry::getKey)
                    .toList();
            int index = ordered.indexOf(member);
            return index >= 0 ? Optional.of((long) index) : Optional.empty();
        }

        @Override
        public List<String> popMin(String key, int count) {
            Map<String, Double> queue = queues.getOrDefault(key, Map.of());
            List<String> admitted = queue.entrySet()
                    .stream()
                    .sorted(Comparator.<Map.Entry<String, Double>, Double>comparing(Map.Entry::getValue)
                            .thenComparing(Map.Entry::getKey))
                    .limit(count)
                    .map(Map.Entry::getKey)
                    .toList();
            admitted.forEach(queue::remove);
            return admitted;
        }

        @Override
        public void setValue(String key, String value, Duration ttl) {
            values.put(key, new TokenValue(value, Instant.now().plus(ttl)));
        }

        @Override
        public Optional<String> getValue(String key) {
            TokenValue value = values.get(key);
            if (value == null) {
                return Optional.empty();
            }
            if (Instant.now().isAfter(value.expiresAt())) {
                values.remove(key);
                return Optional.empty();
            }
            return Optional.of(value.value());
        }

        @Override
        public void expire(String key, Duration ttl) {
        }

        void clear() {
            queues.clear();
            values.clear();
        }

        private record TokenValue(String value, Instant expiresAt) {
        }
    }

    static class InMemoryConcertCache implements ConcertCache {

        private final ObjectMapper objectMapper;
        private final Map<String, String> values = new ConcurrentHashMap<>();

        InMemoryConcertCache(ObjectMapper objectMapper) {
            this.objectMapper = objectMapper;
        }

        @Override
        public <T> Optional<T> get(String key, Class<T> type) {
            return Optional.ofNullable(values.get(key))
                    .map(value -> read(value, type));
        }

        @Override
        public void put(String key, Object value, Duration ttl) {
            try {
                values.put(key, objectMapper.writeValueAsString(value));
            } catch (Exception ex) {
                throw new IllegalStateException(ex);
            }
        }

        @Override
        public void evict(String key) {
            values.remove(key);
        }

        @Override
        public void evictByPrefix(String prefix) {
            values.keySet().removeIf(key -> key.startsWith(prefix));
        }

        void clear() {
            values.clear();
        }

        private <T> T read(String value, Class<T> type) {
            try {
                return objectMapper.readValue(value, type);
            } catch (Exception ex) {
                throw new IllegalStateException(ex);
            }
        }
    }
}
