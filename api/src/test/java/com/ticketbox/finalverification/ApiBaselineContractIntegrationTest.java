package com.ticketbox.finalverification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.auth.model.User;
import com.ticketbox.auth.model.UserRole;
import com.ticketbox.auth.repository.UserRepository;
import com.ticketbox.concert.cache.ConcertCache;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
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
        "spring.datasource.url=jdbc:h2:mem:api-baseline-contract-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "ticketbox.auth.jwt-secret=test-secret",
        "ticketbox.auth.access-token-ttl=15m",
        "ticketbox.auth.refresh-token-ttl=7d",
        "ticketbox.queue.enabled=false",
        "ticketbox.rate-limit.purchase.capacity=10000",
        "ticketbox.rate-limit.defaults.capacity=10000",
        "ticketbox.rate-limit.read.capacity=10000"
})
class ApiBaselineContractIntegrationTest {

    @LocalServerPort
    private int port;

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    @Qualifier("apiBaselineConcertCache")
    private InMemoryConcertCache concertCache;

    @BeforeEach
    void resetData() {
        createAuxiliaryTables();
        jdbcTemplate.execute("delete from checker_assignment_audit");
        jdbcTemplate.execute("delete from checker_gate_assignments");
        jdbcTemplate.execute("delete from checkin_conflicts");
        jdbcTemplate.execute("delete from checkins");
        jdbcTemplate.execute("delete from tickets");
        jdbcTemplate.execute("delete from order_items");
        jdbcTemplate.execute("delete from orders");
        jdbcTemplate.execute("delete from ticket_types");
        jdbcTemplate.execute("delete from concerts");
        jdbcTemplate.execute("delete from refresh_tokens");
        userRepository.deleteAll();
        concertCache.clear();
    }

    @Test
    void publicRoutesExposeOnlyPublishedConcertsAndNoBioDraftInternals() throws Exception {
        String organizerToken = tokenFor(saveUser("owner@ticketbox.vn", UserRole.ORGANIZER));
        UUID draftConcertId = createDraftConcert(organizerToken, "Draft Only", "DRAFT-CONTRACT");
        UUID publishedConcertId = createDraftConcert(organizerToken, "Published Contract", "PUB-CONTRACT");
        createTicketType(organizerToken, publishedConcertId);
        assertThat(postJson("/api/admin/concerts/" + publishedConcertId + "/publish", organizerToken, Map.of()).status())
                .isEqualTo(HttpStatus.OK.value());
        jdbcTemplate.update(
                "update concerts set artist_bio_draft = ?, bio_error = ? where id = ?",
                "organizer-only draft",
                "organizer-only error",
                publishedConcertId);

        TestResponse list = getJson("/api/concerts", null);
        assertThat(list.status()).isEqualTo(HttpStatus.OK.value());
        assertThat(list.body()).contains("PUB-CONTRACT");
        assertThat(list.body()).doesNotContain("DRAFT-CONTRACT");
        assertNoPublicBioLeak(list.body());

        TestResponse detail = getJson("/api/concerts/" + publishedConcertId, null);
        assertThat(detail.status()).isEqualTo(HttpStatus.OK.value());
        assertThat(detail.json().get("eventCode").asText()).isEqualTo("PUB-CONTRACT");
        assertNoPublicBioLeak(detail.body());

        assertThat(getJson("/api/concerts/" + draftConcertId, null).status())
                .isEqualTo(HttpStatus.NOT_FOUND.value());
        assertThat(getJson("/api/concerts/" + publishedConcertId + "/availability", null).status())
                .isEqualTo(HttpStatus.OK.value());
    }

    @Test
    void protectedRoutesReturnExpectedAuthAndRoleStatusCodes() throws Exception {
        String organizerToken = tokenFor(saveUser("organizer@ticketbox.vn", UserRole.ORGANIZER));
        String otherOrganizerToken = tokenFor(saveUser("other-organizer@ticketbox.vn", UserRole.ORGANIZER));
        String audienceToken = tokenFor(saveUser("audience@ticketbox.vn", UserRole.AUDIENCE));
        String checkerToken = tokenFor(saveUser("checker@ticketbox.vn", UserRole.CHECKER));
        UUID concertId = createDraftConcert(organizerToken, "Protected Contract", "PROTECTED-CONTRACT");
        createTicketType(organizerToken, concertId);
        assertThat(postJson("/api/admin/concerts/" + concertId + "/publish", organizerToken, Map.of()).status())
                .isEqualTo(HttpStatus.OK.value());

        assertThat(postJson("/api/tickets/purchase", null, purchaseBody(UUID.randomUUID())).status())
                .isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(postJson("/api/tickets/purchase", checkerToken, purchaseBody(UUID.randomUUID())).status())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(postJson("/api/tickets/purchase", audienceToken, Map.of(
                "ticketTypeId", UUID.randomUUID().toString(),
                "quantity", 0,
                "paymentProvider", "VNPAY")).status())
                .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY.value());
        assertThat(postJson("/api/queue/" + concertId + "/enter", audienceToken, Map.of()).status())
                .isEqualTo(HttpStatus.OK.value());
        assertThat(getJson("/api/queue/" + concertId + "/status", organizerToken).status())
                .isEqualTo(HttpStatus.OK.value());

        assertThat(getJson("/api/admin/concerts/" + concertId + "/stats", audienceToken).status())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(getJson("/api/admin/concerts/" + concertId + "/stats", organizerToken).status())
                .isEqualTo(HttpStatus.OK.value());
        assertThat(putJson("/api/admin/concerts/" + concertId, otherOrganizerToken, concertBody("Stolen", "PROTECTED-CONTRACT"))
                .status()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(getJson("/api/admin/concerts/" + concertId + "/artist-bio", otherOrganizerToken).status())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(postJson("/api/admin/vip-imports", audienceToken, Map.of()).status())
                .isEqualTo(HttpStatus.FORBIDDEN.value());

        assertThat(getJson("/api/checker/key-bundle?concertId=" + concertId, checkerToken).status())
                .isEqualTo(HttpStatus.OK.value());
        assertThat(getJson("/api/checker/assignments?concertId=" + concertId, checkerToken).status())
                .isEqualTo(HttpStatus.OK.value());
        assertThat(getJson("/api/checker/assignments?concertId=" + concertId, audienceToken).status())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(getJson("/api/concerts/" + concertId, checkerToken).status())
                .isEqualTo(HttpStatus.OK.value());
    }

    @Test
    void purchaseResponseIncludesIdempotencyAndLocationHeaders() throws Exception {
        String organizerToken = tokenFor(saveUser("seller@ticketbox.vn", UserRole.ORGANIZER));
        String audienceToken = tokenFor(saveUser("buyer@ticketbox.vn", UserRole.AUDIENCE));
        UUID concertId = createDraftConcert(organizerToken, "Purchase Contract", "PURCHASE-CONTRACT");
        UUID ticketTypeId = createTicketType(organizerToken, concertId, Instant.now().minus(Duration.ofHours(1)));
        assertThat(postJson("/api/admin/concerts/" + concertId + "/publish", organizerToken, Map.of()).status())
                .isEqualTo(HttpStatus.OK.value());

        TestResponse purchase = postJsonWithHeaders(
                "/api/tickets/purchase",
                audienceToken,
                purchaseBody(ticketTypeId),
                Map.of("Idempotency-Key", "phase18-contract-key"));

        assertThat(purchase.status()).isEqualTo(HttpStatus.OK.value());
        assertThat(purchase.headers().firstValue("Idempotency-Key")).contains("phase18-contract-key");
        assertThat(purchase.headers().firstValue("Location")).isPresent();
        assertThat(purchase.json().get("orderId").asText()).isNotBlank();
        assertThat(purchase.json().get("paymentUrl").asText()).contains("vnp_TxnRef=");

        JsonNode pendingStats = getJson("/api/admin/concerts/" + concertId + "/stats", organizerToken).json();
        assertThat(pendingStats.get("revenueTotal").decimalValue()).isZero();
        assertThat(pendingStats.get("ticketsSoldPerType").get(0).get("soldQuantity").asLong()).isZero();

        UUID orderId = UUID.fromString(purchase.json().get("orderId").asText());
        jdbcTemplate.update("update orders set status = 'FAILED' where id = ?", orderId);
        JsonNode failedStats = getJson("/api/admin/concerts/" + concertId + "/stats", organizerToken).json();
        assertThat(failedStats.get("revenueTotal").decimalValue()).isZero();
        assertThat(failedStats.get("ticketsSoldPerType").get(0).get("soldQuantity").asLong()).isZero();
    }

    private UUID createDraftConcert(String organizerToken, String name, String eventCode) throws Exception {
        TestResponse response = postJson("/api/admin/concerts", organizerToken, concertBody(name, eventCode));
        assertThat(response.status()).isEqualTo(HttpStatus.CREATED.value());
        return UUID.fromString(response.json().get("id").asText());
    }

    private UUID createTicketType(String organizerToken, UUID concertId) throws Exception {
        return createTicketType(organizerToken, concertId, Instant.now().plus(Duration.ofHours(1)));
    }

    private UUID createTicketType(String organizerToken, UUID concertId, Instant saleOpensAt) throws Exception {
        TestResponse response = postJson("/api/admin/concerts/" + concertId + "/ticket-types", organizerToken, Map.of(
                "name", "SVIP",
                "zone", "SVIP",
                "price", "3500000.00",
                "totalQuantity", 200,
                "remainingQuantity", 200,
                "saleOpensAt", saleOpensAt.toString(),
                "perUserLimit", 2));
        assertThat(response.status()).isEqualTo(HttpStatus.CREATED.value());
        return UUID.fromString(response.json().get("id").asText());
    }

    private Map<String, Object> concertBody(String name, String eventCode) {
        return Map.of(
                "name", name,
                "description", "Contract test concert",
                "venue", "HCMC Arena",
                "eventDate", Instant.now().plus(Duration.ofDays(30)).toString(),
                "eventCode", eventCode,
                "artistBio", "Published artist bio",
                "seatMapSvg", "<svg><rect id='SVIP'/></svg>");
    }

    private Map<String, Object> purchaseBody(UUID ticketTypeId) {
        return Map.of(
                "ticketTypeId", ticketTypeId.toString(),
                "quantity", 1,
                "paymentProvider", "VNPAY");
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
        return postJsonUnchecked("/api/auth/login", null, Map.of(
                "email", user.getEmail(),
                "password", "password123")).json().get("accessToken").asText();
    }

    private TestResponse getJson(String path, String bearerToken) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path))).GET();
        addBearer(builder, bearerToken);
        return send(builder.build());
    }

    private TestResponse postJson(String path, String bearerToken, Map<String, ?> body) throws Exception {
        return postJsonWithHeaders(path, bearerToken, body, Map.of());
    }

    private TestResponse postJsonUnchecked(String path, String bearerToken, Map<String, ?> body) {
        try {
            return postJson(path, bearerToken, body);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private TestResponse postJsonWithHeaders(
            String path,
            String bearerToken,
            Map<String, ?> body,
            Map<String, String> headers) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path)))
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
        headers.forEach(builder::header);
        addBearer(builder, bearerToken);
        return send(builder.build());
    }

    private TestResponse putJson(String path, String bearerToken, Map<String, ?> body) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path)))
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .PUT(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
        addBearer(builder, bearerToken);
        return send(builder.build());
    }

    private void addBearer(HttpRequest.Builder builder, String bearerToken) {
        if (bearerToken != null) {
            builder.header("Authorization", "Bearer " + bearerToken);
        }
    }

    private TestResponse send(HttpRequest request) throws Exception {
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        JsonNode json = response.body() == null || response.body().isBlank()
                ? objectMapper.createObjectNode()
                : objectMapper.readTree(response.body());
        return new TestResponse(response.statusCode(), response.body(), json, response.headers());
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    private void assertNoPublicBioLeak(String body) {
        assertThat(body)
                .doesNotContain("artistBioDraft")
                .doesNotContain("artist_bio_draft")
                .doesNotContain("bioError")
                .doesNotContain("bio_error")
                .doesNotContain("organizer-only draft")
                .doesNotContain("organizer-only error");
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
                    issued_at timestamp
                )
                """);
        jdbcTemplate.execute("""
                create table if not exists checkins (
                    id uuid default random_uuid() primary key,
                    client_scan_id uuid,
                    ticket_id uuid not null unique,
                    checker_id uuid,
                    checked_in_at timestamp,
                    device_id varchar(255),
                    gate_id varchar(255),
                    lane_id varchar(255),
                    zone varchar(80),
                    scanned_at_device timestamp
                )
                """);
        jdbcTemplate.execute("""
                create table if not exists checkin_conflicts (
                    id uuid default random_uuid() primary key,
                    client_scan_id uuid not null,
                    ticket_id uuid not null,
                    attempted_by uuid not null,
                    attempted_at timestamp not null,
                    device_id varchar(255) not null,
                    gate_id varchar(255) not null,
                    lane_id varchar(255),
                    zone varchar(80) not null,
                    winning_checked_in_at timestamp not null,
                    created_at timestamp not null default now()
                )
                """);
        jdbcTemplate.execute("""
                create table if not exists idempotency_keys (
                    "key" varchar(255) primary key,
                    order_id uuid,
                    result varchar(4000),
                    created_at timestamp not null default now()
                )
                """);
        jdbcTemplate.execute("""
                create table if not exists notification_outbox (
                    id uuid default random_uuid() primary key,
                    order_id uuid,
                    event_type varchar(64) not null,
                    payload clob,
                    status varchar(32) not null,
                    attempts integer not null default 0,
                    created_at timestamp not null default now(),
                    sent_at timestamp
                )
                """);
        jdbcTemplate.execute("""
                create table if not exists checker_gate_assignments (
                    id uuid primary key,
                    concert_id uuid not null,
                    checker_id uuid not null,
                    device_id varchar(255),
                    gate_id varchar(255) not null,
                    lane_id varchar(255),
                    allowed_zones varchar array not null,
                    state varchar(32) not null,
                    activation_mode varchar(32) not null,
                    activated_at timestamp,
                    created_at timestamp not null
                )
                """);
        jdbcTemplate.execute("""
                create table if not exists checker_assignment_audit (
                    id uuid default random_uuid() primary key,
                    assignment_id uuid,
                    checker_id uuid not null,
                    device_id varchar(255),
                    action varchar(64) not null,
                    reason varchar(1000),
                    created_at timestamp not null default now()
                )
                """);
    }

    private record TestResponse(int status, String body, JsonNode json, java.net.http.HttpHeaders headers) {
    }

    @TestConfiguration
    static class ApiBaselineTestConfig {

        @Bean("apiBaselineConcertCache")
        @Primary
        InMemoryConcertCache apiBaselineConcertCache(ObjectMapper objectMapper) {
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
            return Optional.ofNullable(values.get(key)).map(value -> read(value, type));
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
