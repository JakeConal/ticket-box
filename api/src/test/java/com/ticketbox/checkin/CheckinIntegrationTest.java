package com.ticketbox.checkin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.auth.model.User;
import com.ticketbox.auth.model.UserRole;
import com.ticketbox.auth.repository.UserRepository;
import com.ticketbox.auth.security.AuthJwtUtil;
import com.ticketbox.concert.cache.ConcertCache;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
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
        "spring.datasource.url=jdbc:h2:mem:checkin-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "ticketbox.auth.jwt-secret=test-secret",
        "ticketbox.auth.access-token-ttl=15m",
        "ticketbox.auth.refresh-token-ttl=7d",
        "ticketbox.orders.expiry-initial-delay-ms=3600000"
})
class CheckinIntegrationTest {

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
    @Qualifier("testCheckinCache")
    private InMemoryConcertCache concertCache;

    private User organizer;
    private User checker;
    private User audience;
    private UUID concertId;
    private UUID ticketId;

    @BeforeEach
    void resetData() {
        createAuxiliaryTables();
        jdbcTemplate.execute("delete from checker_assignment_audit");
        jdbcTemplate.execute("delete from checker_gate_assignments");
        jdbcTemplate.execute("delete from checkin_conflicts");
        jdbcTemplate.execute("delete from checkins");
        jdbcTemplate.execute("delete from vip_guests");
        jdbcTemplate.execute("delete from tickets");
        jdbcTemplate.execute("delete from order_items");
        jdbcTemplate.execute("delete from orders");
        jdbcTemplate.execute("delete from ticket_types");
        jdbcTemplate.execute("delete from concerts");
        jdbcTemplate.execute("delete from refresh_tokens");
        userRepository.deleteAll();
        concertCache.clear();

        organizer = saveUser("checkin-organizer@ticketbox.vn", UserRole.ORGANIZER);
        checker = saveUser("checker@ticketbox.vn", UserRole.CHECKER);
        audience = saveUser("checkin-audience@ticketbox.vn", UserRole.AUDIENCE);
        concertId = createPublishedConcert();
        UUID ticketTypeId = createTicketType(concertId);
        UUID orderId = createPaidOrder(concertId, audience.getId());
        ticketId = createTicket(orderId, ticketTypeId, audience.getId());
        createAssignment(checker.getId(), "ACTIVE");
    }

    @Test
    void checkerCanLoadAssignmentsAndAuditEmergencyActivation() throws Exception {
        String token = tokenFor(checker);

        TestResponse assignments = getJson("/api/checker/assignments?concertId=" + concertId, token);
        assertThat(assignments.status()).isEqualTo(HttpStatus.OK.value());
        assertThat(assignments.json().get("assignments").size()).isEqualTo(1);
        assertThat(assignments.json().get("assignments").get(0).get("gateId").asText()).isEqualTo("GATE-A");

        UUID assignmentId = UUID.fromString(assignments.json().get("assignments").get(0).get("id").asText());
        TestResponse audit = postJson("/api/checker/assignment-audit", token, Map.of(
                "assignmentId", assignmentId,
                "deviceId", "device-1",
                "action", "EMERGENCY_LOCAL_ACTIVATED",
                "reason", "offline activation"));

        assertThat(audit.status()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertThat(jdbcTemplate.queryForObject("select count(*) from checker_assignment_audit", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void batchCheckinIsIdempotentAndRecordsTicketConflicts() throws Exception {
        String token = tokenFor(checker);
        UUID firstScanId = UUID.randomUUID();
        UUID secondScanId = UUID.randomUUID();

        TestResponse first = postJson("/api/checkins/batch", token, Map.of(
                "checkins", new Object[] {
                        Map.of(
                                "ticketId", ticketId,
                                "clientScanId", firstScanId,
                                "deviceId", "device-1",
                                "gateId", "GATE-A",
                                "laneId", "LANE-1",
                                "zone", "SVIP",
                                "scannedAtDevice", Instant.now().toString())
                }));

        assertThat(first.status()).isEqualTo(HttpStatus.OK.value());
        assertThat(first.json().get("results").get(0).get("result").asText()).isEqualTo("OK");

        TestResponse retry = postJson("/api/checkins/batch", token, Map.of(
                "checkins", new Object[] {
                        Map.of(
                                "ticketId", ticketId,
                                "clientScanId", firstScanId,
                                "deviceId", "device-1",
                                "gateId", "GATE-A",
                                "laneId", "LANE-1",
                                "zone", "SVIP",
                                "scannedAtDevice", Instant.now().toString())
                }));

        assertThat(retry.status()).isEqualTo(HttpStatus.OK.value());
        assertThat(retry.json().get("results").get(0).get("result").asText()).isEqualTo("OK");
        assertThat(jdbcTemplate.queryForObject("select count(*) from checkins", Integer.class)).isEqualTo(1);

        TestResponse conflict = postJson("/api/checkins/batch", token, Map.of(
                "checkins", new Object[] {
                        Map.of(
                                "ticketId", ticketId,
                                "clientScanId", secondScanId,
                                "deviceId", "device-2",
                                "gateId", "GATE-A",
                                "laneId", "LANE-2",
                                "zone", "SVIP",
                                "scannedAtDevice", Instant.now().toString())
                }));

        assertThat(conflict.status()).isEqualTo(HttpStatus.OK.value());
        assertThat(conflict.json().get("results").get(0).get("result").asText()).isEqualTo("CONFLICT");
        assertThat(jdbcTemplate.queryForObject("select count(*) from checkin_conflicts", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void wrongZoneAndWrongRoleAreRejected() throws Exception {
        TestResponse wrongZone = postJson("/api/checkins/" + ticketId, tokenFor(checker), Map.of(
                "clientScanId", UUID.randomUUID(),
                "deviceId", "device-1",
                "gateId", "GATE-A",
                "zone", "VIP",
                "scannedAtDevice", Instant.now().toString()));

        assertThat(wrongZone.status()).isEqualTo(HttpStatus.OK.value());
        assertThat(wrongZone.json().get("result").asText()).isEqualTo("INVALID");
        assertThat(jdbcTemplate.queryForObject("select count(*) from checkins", Integer.class)).isZero();

        TestResponse wrongRole = getJson("/api/checker/assignments?concertId=" + concertId, tokenFor(audience));
        assertThat(wrongRole.status()).isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @Test
    void organizerCanListCheckinConflictsForOwnedConcertOnly() throws Exception {
        String checkerToken = tokenFor(checker);
        postJson("/api/checkins/" + ticketId, checkerToken, Map.of(
                "clientScanId", UUID.randomUUID(),
                "deviceId", "device-1",
                "gateId", "GATE-A",
                "zone", "SVIP",
                "scannedAtDevice", Instant.now().toString()));
        postJson("/api/checkins/" + ticketId, checkerToken, Map.of(
                "clientScanId", UUID.randomUUID(),
                "deviceId", "device-2",
                "gateId", "GATE-A",
                "zone", "SVIP",
                "scannedAtDevice", Instant.now().toString()));

        TestResponse conflicts = getJson(
                "/api/admin/concerts/" + concertId + "/checkin-conflicts",
                tokenFor(organizer));

        assertThat(conflicts.status()).isEqualTo(HttpStatus.OK.value());
        assertThat(conflicts.json().size()).isEqualTo(1);
        assertThat(conflicts.json().get(0).get("ticketId").asText()).isEqualTo(ticketId.toString());
    }

    @Test
    void checkerCanSearchAndEnterVipGuestOnlineOnly() throws Exception {
        UUID guestId = UUID.randomUUID();
        jdbcTemplate.update("""
                insert into vip_guests (
                    id,
                    concert_id,
                    name,
                    phone_normalized,
                    sponsor,
                    zone,
                    active,
                    entered,
                    created_at,
                    updated_at
                )
                values (?, ?, 'Nguyen Van A', '84901234567', 'Sponsor A', 'SVIP', true, false, ?, ?)
                """, guestId, concertId, Instant.now(), Instant.now());
        String token = tokenFor(checker);

        TestResponse search = getJson("/api/vip-guests?concertId=" + concertId + "&q=Nguyen", token);
        assertThat(search.status()).isEqualTo(HttpStatus.OK.value());
        assertThat(search.json().size()).isEqualTo(1);
        assertThat(search.json().get(0).get("entered").asBoolean()).isFalse();

        TestResponse enter = postNoBody("/api/vip-guests/" + guestId + "/enter", token);
        assertThat(enter.status()).isEqualTo(HttpStatus.OK.value());
        assertThat(enter.json().get("status").asText()).isEqualTo("ENTERED");

        TestResponse secondEnter = postNoBody("/api/vip-guests/" + guestId + "/enter", token);
        assertThat(secondEnter.status()).isEqualTo(HttpStatus.CONFLICT.value());
    }

    @Test
    void organizerCanRetrieveVipGuestList() throws Exception {
        UUID guestId = UUID.randomUUID();
        jdbcTemplate.update("""
                insert into vip_guests (
                    id,
                    concert_id,
                    name,
                    phone_normalized,
                    sponsor,
                    zone,
                    active,
                    entered,
                    created_at,
                    updated_at
                )
                values (?, ?, 'Nguyen Van A', '84901234567', 'Sponsor A', 'SVIP', true, false, ?, ?)
                """, guestId, concertId, Instant.now(), Instant.now());

        // 1. Authorized organizer (owner) fetches the VIP guest list
        String ownerToken = tokenFor(organizer);
        TestResponse response = getJson("/api/admin/concerts/" + concertId + "/vip-guests", ownerToken);
        assertThat(response.status()).isEqualTo(HttpStatus.OK.value());
        assertThat(response.json().size()).isEqualTo(1);
        assertThat(response.json().get(0).get("name").asText()).isEqualTo("Nguyen Van A");
        assertThat(response.json().get(0).get("phoneMasked").asText()).isEqualTo("*******4567");
        assertThat(response.json().get(0).get("sponsor").asText()).isEqualTo("Sponsor A");
        assertThat(response.json().get(0).get("zone").asText()).isEqualTo("SVIP");
        assertThat(response.json().get(0).get("entered").asBoolean()).isFalse();

        // 2. Unauthorized organizer (non-owner) tries to fetch and gets 403
        User nonOwner = saveUser("non-owner@ticketbox.vn", UserRole.ORGANIZER);
        String nonOwnerToken = tokenFor(nonOwner);
        TestResponse unauthorizedResponse = getJson("/api/admin/concerts/" + concertId + "/vip-guests", nonOwnerToken);
        assertThat(unauthorizedResponse.status()).isEqualTo(HttpStatus.FORBIDDEN.value());

        // 3. Checker tries to fetch and gets 403
        String checkerToken = tokenFor(checker);
        TestResponse checkerResponse = getJson("/api/admin/concerts/" + concertId + "/vip-guests", checkerToken);
        assertThat(checkerResponse.status()).isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @Test
    void organizerCanDeleteVipGuest() throws Exception {
        UUID guestId = UUID.randomUUID();
        jdbcTemplate.update("""
                insert into vip_guests (
                    id,
                    concert_id,
                    name,
                    phone_normalized,
                    sponsor,
                    zone,
                    active,
                    entered,
                    created_at,
                    updated_at
                )
                values (?, ?, 'Nguyen Van B', '84901234568', 'Sponsor B', 'SVIP', true, false, ?, ?)
                """, guestId, concertId, Instant.now(), Instant.now());

        String ownerToken = tokenFor(organizer);

        // 1. Unauthorized organizer (non-owner) tries to delete and gets 403
        User nonOwner = saveUser("non-owner-delete@ticketbox.vn", UserRole.ORGANIZER);
        String nonOwnerToken = tokenFor(nonOwner);
        TestResponse unauthorizedResponse = delete("/api/admin/concerts/" + concertId + "/vip-guests/" + guestId, nonOwnerToken);
        assertThat(unauthorizedResponse.status()).isEqualTo(HttpStatus.FORBIDDEN.value());

        // 2. Checker tries to delete and gets 403
        String checkerToken = tokenFor(checker);
        TestResponse checkerResponse = delete("/api/admin/concerts/" + concertId + "/vip-guests/" + guestId, checkerToken);
        assertThat(checkerResponse.status()).isEqualTo(HttpStatus.FORBIDDEN.value());

        // 3. Authorized organizer (owner) deletes the guest successfully (204 No Content)
        TestResponse response = delete("/api/admin/concerts/" + concertId + "/vip-guests/" + guestId, ownerToken);
        assertThat(response.status()).isEqualTo(HttpStatus.NO_CONTENT.value());

        // Verify database state: active should be false
        Boolean active = jdbcTemplate.queryForObject("select active from vip_guests where id = ?", Boolean.class, guestId);
        assertThat(active).isFalse();

        // 4. Authorized organizer tries to delete again and gets 404 (since it's already soft-deleted)
        TestResponse deleteAgain = delete("/api/admin/concerts/" + concertId + "/vip-guests/" + guestId, ownerToken);
        assertThat(deleteAgain.status()).isEqualTo(HttpStatus.NOT_FOUND.value());
    }

    private TestResponse getJson(String path, String bearerToken) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path))).GET();
        addBearer(builder, bearerToken);
        return send(builder.build());
    }

    private TestResponse postNoBody(String path, String bearerToken) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path)))
                .POST(HttpRequest.BodyPublishers.noBody());
        addBearer(builder, bearerToken);
        return send(builder.build());
    }

    private TestResponse postJson(String path, String bearerToken, Object body) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path)))
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
        addBearer(builder, bearerToken);
        return send(builder.build());
    }

    private TestResponse send(HttpRequest request) throws Exception {
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        JsonNode json = response.body() == null || response.body().isBlank()
                ? objectMapper.createObjectNode()
                : objectMapper.readTree(response.body());
        return new TestResponse(response.statusCode(), json, response.headers());
    }

    private void addBearer(HttpRequest.Builder builder, String bearerToken) {
        if (bearerToken != null) {
            builder.header("Authorization", "Bearer " + bearerToken);
        }
    }

    private TestResponse delete(String path, String bearerToken) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path))).DELETE();
        addBearer(builder, bearerToken);
        return send(builder.build());
    }

    private UUID createPublishedConcert() {
        UUID id = UUID.randomUUID();
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
                values (?, 'Check-in Concert', 'Description', 'HCMC Stadium', ?, 'PUBLISHED',
                        'CHECKIN', 'Bio', 0, '<svg/>', ?, ?, ?)
                """, id, now.plus(Duration.ofDays(15)), organizer.getId(), now, now);
        return id;
    }

    private UUID createTicketType(UUID concertId) {
        UUID id = UUID.randomUUID();
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
                values (?, ?, 'SVIP', 'SVIP', ?, 10, 9, ?, 2, ?)
                """, id, concertId, new BigDecimal("3500000.00"), Instant.now().minus(Duration.ofDays(1)), Instant.now());
        return id;
    }

    private UUID createPaidOrder(UUID concertId, UUID userId) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
                insert into orders (
                    id,
                    user_id,
                    concert_id,
                    status,
                    idempotency_key,
                    payment_provider,
                    created_at,
                    paid_at
                )
                values (?, ?, ?, 'PAID', ?, 'VNPAY', ?, ?)
                """, id, userId, concertId, UUID.randomUUID().toString(), Instant.now(), Instant.now());
        return id;
    }

    private UUID createTicket(UUID orderId, UUID ticketTypeId, UUID userId) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
                insert into tickets (
                    id,
                    order_id,
                    ticket_type_id,
                    user_id,
                    qr_token,
                    issued_at
                )
                values (?, ?, ?, ?, 'test-token', ?)
                """, id, orderId, ticketTypeId, userId, Instant.now());
        return id;
    }

    private void createAssignment(UUID checkerId, String state) {
        jdbcTemplate.update("""
                insert into checker_gate_assignments (
                    id,
                    concert_id,
                    checker_id,
                    device_id,
                    gate_id,
                    lane_id,
                    allowed_zones,
                    state,
                    activation_mode,
                    activated_at,
                    created_at
                )
                values (?, ?, ?, 'device-1', 'GATE-A', 'LANE-1', ARRAY['SVIP'], ?, 'ONLINE', ?, ?)
                """, UUID.randomUUID(), concertId, checkerId, state, Instant.now(), Instant.now());
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
                create table if not exists checkins (
                    id uuid default random_uuid() primary key,
                    client_scan_id uuid not null unique,
                    ticket_id uuid not null unique,
                    checker_id uuid not null,
                    checked_in_at timestamp not null default now(),
                    device_id varchar(255) not null,
                    gate_id varchar(255) not null,
                    lane_id varchar(255),
                    zone varchar(80) not null,
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
        jdbcTemplate.execute("""
                create table if not exists vip_guests (
                    id uuid primary key,
                    concert_id uuid not null,
                    name varchar(255) not null,
                    phone_normalized varchar(32) not null,
                    sponsor varchar(255),
                    zone varchar(80) not null,
                    active boolean not null default true,
                    entered boolean not null default false,
                    entered_at timestamp,
                    created_at timestamp not null,
                    updated_at timestamp not null
                )
                """);
    }

    private record TestResponse(int status, JsonNode json, HttpHeaders headers) {
    }

    @TestConfiguration
    static class CheckinTestConfig {

        @Bean("testCheckinCache")
        @Primary
        InMemoryConcertCache testCheckinCache(ObjectMapper objectMapper) {
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
