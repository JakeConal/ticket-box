package com.ticketbox.ticket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.auth.model.User;
import com.ticketbox.auth.model.UserRole;
import com.ticketbox.auth.repository.UserRepository;
import com.ticketbox.auth.security.AuthJwtUtil;
import com.ticketbox.concert.cache.ConcertCache;
import com.ticketbox.ticket.service.OrderExpiryService;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
        "spring.flyway.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:ticket-purchase-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "ticketbox.auth.jwt-secret=test-secret",
        "ticketbox.auth.access-token-ttl=15m",
        "ticketbox.auth.refresh-token-ttl=7d",
        "ticketbox.orders.expiry-initial-delay-ms=3600000"
})
class TicketPurchaseIntegrationTest {

    @LocalServerPort
    private int port;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private AuthJwtUtil authJwtUtil;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private OrderExpiryService orderExpiryService;

    @Autowired
    @Qualifier("testTicketPurchaseCache")
    private InMemoryConcertCache concertCache;

    @BeforeEach
    void resetData() {
        createAuxiliaryTables();
        jdbcTemplate.execute("delete from order_items");
        jdbcTemplate.execute("delete from idempotency_keys");
        jdbcTemplate.execute("delete from orders");
        jdbcTemplate.execute("delete from ticket_types");
        jdbcTemplate.execute("delete from concerts");
        jdbcTemplate.execute("delete from refresh_tokens");
        userRepository.deleteAll();
        concertCache.clear();
    }

    @Test
    void purchaseCreatesPendingOrderAndReturnsStoredResultForDuplicateIdempotencyKey() throws Exception {
        String token = tokenFor(saveUser("buyer@ticketbox.vn", UserRole.AUDIENCE));
        UUID concertId = createPublishedConcert("PURCHASE-IDEMPOTENT");
        UUID ticketTypeId = createTicketType(concertId, 5, 5, 2, Instant.now().minus(Duration.ofMinutes(1)));

        TestResponse first = postPurchase(token, null, ticketTypeId, 1);
        assertThat(first.status()).isEqualTo(HttpStatus.OK.value());
        UUID orderId = UUID.fromString(first.json().get("orderId").asText());
        String generatedKey = first.headers().firstValue("Idempotency-Key").orElseThrow();
        assertThat(first.json().get("paymentUrl").asText()).isEqualTo("mock-payment://orders/" + orderId);
        assertThat(remainingQuantity(ticketTypeId)).isEqualTo(4);

        TestResponse duplicate = postPurchase(token, generatedKey, ticketTypeId, 1);
        assertThat(duplicate.status()).isEqualTo(HttpStatus.OK.value());
        assertThat(UUID.fromString(duplicate.json().get("orderId").asText())).isEqualTo(orderId);
        assertThat(remainingQuantity(ticketTypeId)).isEqualTo(4);
        assertThat(activeOrderItemQuantity(orderId)).isEqualTo(1);
    }

    @Test
    void purchaseBeforeSaleOpenReturnsForbidden() throws Exception {
        String token = tokenFor(saveUser("early-buyer@ticketbox.vn", UserRole.AUDIENCE));
        UUID concertId = createPublishedConcert("PURCHASE-SALE-WINDOW");
        UUID ticketTypeId = createTicketType(concertId, 5, 5, 2, Instant.now().plus(Duration.ofHours(1)));

        TestResponse response = postPurchase(token, UUID.randomUUID().toString(), ticketTypeId, 1);

        assertThat(response.status()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(jdbcTemplate.queryForObject("select count(*) from orders", Integer.class)).isZero();
        assertThat(remainingQuantity(ticketTypeId)).isEqualTo(5);
    }

    @Test
    void simultaneousPurchaseOfLastSvipTicketAllowsExactlyOneBuyer() throws Exception {
        UUID concertId = createPublishedConcert("PURCHASE-LAST-SVIP");
        UUID ticketTypeId = createTicketType(concertId, 1, 1, 1, Instant.now().minus(Duration.ofMinutes(1)));
        List<String> tokens = new ArrayList<>();
        for (int i = 0; i < 200; i++) {
            tokens.add(tokenFor(saveUser("last-svip-" + i + "@ticketbox.vn", UserRole.AUDIENCE)));
        }

        List<Integer> statuses = runConcurrent(48, tokens.size(), index ->
                postPurchase(tokens.get(index), UUID.randomUUID().toString(), ticketTypeId, 1).status());

        assertThat(statuses.stream().filter(status -> status == HttpStatus.OK.value()).count()).isEqualTo(1);
        assertThat(statuses.stream().filter(status -> status == HttpStatus.CONFLICT.value()).count()).isEqualTo(199);
        assertThat(remainingQuantity(ticketTypeId)).isZero();
        assertThat(jdbcTemplate.queryForObject("select count(*) from orders where status = 'PENDING'", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void concurrentSameUserPurchasesCannotExceedPerUserLimit() throws Exception {
        String token = tokenFor(saveUser("limit-buyer@ticketbox.vn", UserRole.AUDIENCE));
        UUID concertId = createPublishedConcert("PURCHASE-USER-LIMIT");
        UUID ticketTypeId = createTicketType(concertId, 10, 10, 2, Instant.now().minus(Duration.ofMinutes(1)));

        List<Integer> statuses = runConcurrent(5, 5, ignored ->
                postPurchase(token, UUID.randomUUID().toString(), ticketTypeId, 1).status());

        assertThat(statuses.stream().filter(status -> status == HttpStatus.OK.value()).count()).isEqualTo(2);
        assertThat(statuses.stream().filter(status -> status == HttpStatus.CONFLICT.value()).count()).isEqualTo(3);
        assertThat(activeQuantityForUser("limit-buyer@ticketbox.vn", ticketTypeId)).isEqualTo(2);
        assertThat(remainingQuantity(ticketTypeId)).isEqualTo(8);
    }

    @Test
    void stalePendingOrderExpiresAndReleasesInventoryAndQuota() throws Exception {
        String token = tokenFor(saveUser("expiry-buyer@ticketbox.vn", UserRole.AUDIENCE));
        UUID concertId = createPublishedConcert("PURCHASE-EXPIRY");
        UUID ticketTypeId = createTicketType(concertId, 2, 2, 1, Instant.now().minus(Duration.ofMinutes(1)));
        TestResponse purchase = postPurchase(token, UUID.randomUUID().toString(), ticketTypeId, 1);
        UUID orderId = UUID.fromString(purchase.json().get("orderId").asText());
        jdbcTemplate.update(
                "update orders set created_at = ? where id = ?",
                Instant.now().minus(Duration.ofMinutes(9)),
                orderId);

        int expired = orderExpiryService.expireStaleOrders();

        assertThat(expired).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("select status from orders where id = ?", String.class, orderId))
                .isEqualTo("EXPIRED");
        assertThat(remainingQuantity(ticketTypeId)).isEqualTo(2);
        TestResponse secondPurchase = postPurchase(token, UUID.randomUUID().toString(), ticketTypeId, 1);
        assertThat(secondPurchase.status()).isEqualTo(HttpStatus.OK.value());
    }

    private List<Integer> runConcurrent(int poolSize, int requestCount, ThrowingIntFunction<Integer> task)
            throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(poolSize);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            for (int i = 0; i < requestCount; i++) {
                int index = i;
                futures.add(executor.submit(() -> {
                    start.await();
                    return task.apply(index);
                }));
            }
            start.countDown();
            List<Integer> results = new ArrayList<>();
            for (Future<Integer> future : futures) {
                results.add(future.get(30, TimeUnit.SECONDS));
            }
            return results;
        } finally {
            executor.shutdownNow();
        }
    }

    private TestResponse postPurchase(String bearerToken, String idempotencyKey, UUID ticketTypeId, int quantity)
            throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url("/api/tickets/purchase")))
                .timeout(Duration.ofSeconds(10))
                .header("Authorization", "Bearer " + bearerToken)
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(Map.of(
                        "ticketTypeId", ticketTypeId.toString(),
                        "quantity", quantity,
                        "paymentProvider", "VNPAY"))));
        if (idempotencyKey != null) {
            builder.header("Idempotency-Key", idempotencyKey);
        }
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        JsonNode json = response.body() == null || response.body().isBlank()
                ? objectMapper.createObjectNode()
                : objectMapper.readTree(response.body());
        return new TestResponse(response.statusCode(), json, response.headers());
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
                "SVIP Concert",
                "Concert description",
                "HCMC Stadium",
                now.plus(Duration.ofDays(30)),
                eventCode,
                "Published artist bio",
                "<svg><rect id='SVIP'/></svg>",
                organizer.getId(),
                now,
                now);
        return concertId;
    }

    private UUID createTicketType(
            UUID concertId,
            int totalQuantity,
            int remainingQuantity,
            int perUserLimit,
            Instant saleOpensAt) {
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
                values (?, ?, 'SVIP', 'SVIP', ?, ?, ?, ?, ?, ?)
                """,
                ticketTypeId,
                concertId,
                new BigDecimal("3500000.00"),
                totalQuantity,
                remainingQuantity,
                saleOpensAt,
                perUserLimit,
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

    private String tokenFor(User user) {
        return authJwtUtil.issueTokenPair(user).accessToken();
    }

    private int remainingQuantity(UUID ticketTypeId) {
        return jdbcTemplate.queryForObject(
                "select remaining_quantity from ticket_types where id = ?",
                Integer.class,
                ticketTypeId);
    }

    private int activeOrderItemQuantity(UUID orderId) {
        return jdbcTemplate.queryForObject(
                "select coalesce(sum(quantity), 0) from order_items where order_id = ?",
                Integer.class,
                orderId);
    }

    private int activeQuantityForUser(String email, UUID ticketTypeId) {
        return jdbcTemplate.queryForObject("""
                select coalesce(sum(oi.quantity), 0)
                from order_items oi
                join orders o on o.id = oi.order_id
                join users u on u.id = o.user_id
                where u.email = ?
                  and oi.ticket_type_id = ?
                  and o.status in ('PENDING', 'PENDING_CONFIRMATION', 'PAID')
                """, Integer.class, email, ticketTypeId);
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
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
                create table if not exists idempotency_keys (
                    "key" varchar(255) primary key,
                    order_id uuid,
                    result varchar(4000),
                    created_at timestamp not null
                )
                """);
    }

    private record TestResponse(int status, JsonNode json, HttpHeaders headers) {
    }

    @FunctionalInterface
    private interface ThrowingIntFunction<T> {
        T apply(int value) throws Exception;
    }

    @TestConfiguration
    static class TicketPurchaseTestConfig {

        @Bean("testTicketPurchaseCache")
        @Primary
        InMemoryConcertCache testTicketPurchaseCache(ObjectMapper objectMapper) {
            return new InMemoryConcertCache(objectMapper);
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
