package com.ticketbox.concert;

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
        "spring.datasource.url=jdbc:h2:mem:concert-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "ticketbox.auth.jwt-secret=test-secret",
        "ticketbox.auth.access-token-ttl=15m",
        "ticketbox.auth.refresh-token-ttl=7d"
})
class ConcertIntegrationTest {

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
    @Qualifier("testConcertCache")
    private InMemoryConcertCache concertCache;

    @BeforeEach
    void resetData() {
        createAuxiliaryTables();
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
    void validationRejectsMissingFieldsPastDatesAndInvalidTicketLimits() throws Exception {
        String organizerToken = organizerToken("organizer@ticketbox.vn");

        TestResponse missingName = postJson("/api/admin/concerts", organizerToken, Map.of(
                "venue", "HCMC Stadium",
                "eventDate", futureEventDate(),
                "eventCode", "VALIDATION-1",
                "seatMapSvg", "<svg />"));
        assertThat(missingName.status()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY.value());

        TestResponse pastDate = postJson("/api/admin/concerts", organizerToken, Map.of(
                "name", "Past Concert",
                "venue", "HCMC Stadium",
                "eventDate", Instant.now().minus(Duration.ofDays(1)).toString(),
                "eventCode", "VALIDATION-2",
                "seatMapSvg", "<svg />"));
        assertThat(pastDate.status()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY.value());

        UUID concertId = createDraftConcert(organizerToken, "Validation Concert", "VALIDATION-3");
        TestResponse invalidTicketType = postJson(
                "/api/admin/concerts/" + concertId + "/ticket-types",
                organizerToken,
                ticketTypeBody("VIP", "VIP", 10, 11, null));
        assertThat(invalidTicketType.status()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY.value());
    }

    @Test
    void draftPublishPublicVisibilityAndCancelLifecycle() throws Exception {
        String organizerToken = organizerToken("owner@ticketbox.vn");
        UUID concertId = createDraftConcert(organizerToken, "Lifecycle Concert", "LIFE-1");

        assertThat(getJson("/api/concerts", null).json().get("content").size()).isZero();
        assertThat(getJson("/api/concerts/" + concertId, null).status())
                .isEqualTo(HttpStatus.NOT_FOUND.value());

        assertThat(postJson("/api/admin/concerts/" + concertId + "/publish", organizerToken, Map.of()).status())
                .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY.value());

        UUID ticketTypeId = createTicketType(organizerToken, concertId, 5);
        assertThat(postJson("/api/admin/concerts/" + concertId + "/publish", organizerToken, Map.of()).status())
                .isEqualTo(HttpStatus.OK.value());
        assertThat(getJson("/api/concerts", null).json().get("content").size()).isEqualTo(1);
        assertThat(getJson("/api/concerts/" + concertId, null).status())
                .isEqualTo(HttpStatus.OK.value());
        assertThat(postJson("/api/admin/concerts/" + concertId + "/publish", organizerToken, Map.of()).status())
                .isEqualTo(HttpStatus.CONFLICT.value());

        UUID buyerId = saveUser("buyer@ticketbox.vn", UserRole.AUDIENCE).getId();
        UUID orderId = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into orders (id, user_id, concert_id, status, created_at, paid_at) values (?, ?, ?, 'PAID', ?, ?)",
                orderId,
                buyerId,
                concertId,
                Instant.now(),
                Instant.now());
        jdbcTemplate.update(
                "insert into order_items (id, order_id, ticket_type_id, quantity) values (?, ?, ?, 1)",
                UUID.randomUUID(),
                orderId,
                ticketTypeId);

        assertThat(delete("/api/admin/concerts/" + concertId, organizerToken).status())
                .isEqualTo(HttpStatus.NO_CONTENT.value());
        assertThat(jdbcTemplate.queryForObject(
                "select status from orders where id = ?",
                String.class,
                orderId))
                .isEqualTo("REFUND_REQUIRED");
        assertThat(getJson("/api/concerts", null).json().get("content").size()).isZero();
        assertThat(delete("/api/admin/concerts/" + concertId, organizerToken).status())
                .isEqualTo(HttpStatus.CONFLICT.value());
    }

    @Test
    void availabilityUsesCacheAndAdminQuantityChangeInvalidatesIt() throws Exception {
        String organizerToken = organizerToken("cache-owner@ticketbox.vn");
        UUID concertId = createDraftConcert(organizerToken, "Cache Concert", "CACHE-1");
        UUID ticketTypeId = createTicketType(organizerToken, concertId, 5);
        assertThat(postJson("/api/admin/concerts/" + concertId + "/publish", organizerToken, Map.of()).status())
                .isEqualTo(HttpStatus.OK.value());

        JsonNode firstAvailability = getJson("/api/concerts/" + concertId + "/availability", null).json();
        assertThat(firstAvailability.get(0).get("remainingQuantity").asInt()).isEqualTo(5);

        jdbcTemplate.update("update ticket_types set remaining_quantity = 3 where id = ?", ticketTypeId);
        JsonNode cachedAvailability = getJson("/api/concerts/" + concertId + "/availability", null).json();
        assertThat(cachedAvailability.get(0).get("remainingQuantity").asInt()).isEqualTo(5);

        assertThat(putJson(
                "/api/admin/concerts/" + concertId + "/ticket-types/" + ticketTypeId,
                organizerToken,
                ticketTypeBody("VIP", "VIP", 5, 2, 0)).status())
                .isEqualTo(HttpStatus.OK.value());
        JsonNode invalidatedAvailability = getJson("/api/concerts/" + concertId + "/availability", null).json();
        assertThat(invalidatedAvailability.get(0).get("remainingQuantity").asInt()).isEqualTo(0);
        assertThat(invalidatedAvailability.get(0).get("soldOut").asBoolean()).isTrue();
    }

    private UUID createDraftConcert(String organizerToken, String name, String eventCode) throws Exception {
        TestResponse response = postJson("/api/admin/concerts", organizerToken, Map.of(
                "name", name,
                "description", "Concert description",
                "venue", "HCMC Stadium",
                "eventDate", futureEventDate(),
                "eventCode", eventCode,
                "artistBio", "Published artist bio",
                "seatMapSvg", "<svg><rect id='VIP'/></svg>"));
        assertThat(response.status()).isEqualTo(HttpStatus.CREATED.value());
        return UUID.fromString(response.json().get("id").asText());
    }

    private UUID createTicketType(String organizerToken, UUID concertId, int quantity) throws Exception {
        TestResponse response = postJson(
                "/api/admin/concerts/" + concertId + "/ticket-types",
                organizerToken,
                ticketTypeBody("VIP", "VIP", quantity, 2, null));
        assertThat(response.status()).isEqualTo(HttpStatus.CREATED.value());
        return UUID.fromString(response.json().get("id").asText());
    }

    private String organizerToken(String email) throws Exception {
        saveUser(email, UserRole.ORGANIZER);
        return postJson("/api/auth/login", null, Map.of("email", email, "password", "password123"))
                .json()
                .get("accessToken")
                .asText();
    }

    private User saveUser(String email, UserRole role) {
        return userRepository.save(new User(
                UUID.randomUUID(),
                email,
                passwordEncoder.encode("password123"),
                role,
                Instant.now()));
    }

    private Map<String, Object> ticketTypeBody(
            String name,
            String zone,
            int totalQuantity,
            int perUserLimit,
            Integer remainingQuantity) {
        return Map.of(
                "name", name,
                "zone", zone,
                "price", "100000.00",
                "totalQuantity", totalQuantity,
                "remainingQuantity", remainingQuantity == null ? totalQuantity : remainingQuantity,
                "saleOpensAt", Instant.now().plus(Duration.ofHours(1)).toString(),
                "perUserLimit", perUserLimit);
    }

    private String futureEventDate() {
        return Instant.now().plus(Duration.ofDays(30)).toString();
    }

    private TestResponse getJson(String path, String bearerToken) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path))).GET();
        addBearer(builder, bearerToken);
        return send(builder.build());
    }

    private TestResponse postJson(String path, String bearerToken, Map<String, ?> body) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path)))
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
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

    private TestResponse delete(String path, String bearerToken) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path))).DELETE();
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
        return new TestResponse(response.statusCode(), json);
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
                    refund_reason varchar(255),
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
                    qr_token varchar(255)
                )
                """);
        jdbcTemplate.execute("""
                create table if not exists checkins (
                    id uuid primary key,
                    ticket_id uuid not null
                )
                """);
    }

    private record TestResponse(int status, JsonNode json) {
    }

    @TestConfiguration
    static class ConcertTestConfig {

        @Bean("testConcertCache")
        @Primary
        InMemoryConcertCache testConcertCache(ObjectMapper objectMapper) {
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
