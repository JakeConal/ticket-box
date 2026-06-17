package com.ticketbox.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.auth.model.User;
import com.ticketbox.auth.model.UserRole;
import com.ticketbox.auth.repository.UserRepository;
import com.ticketbox.auth.security.AuthJwtUtil;
import com.ticketbox.auth.service.OrganizerOwnershipService;
import io.jsonwebtoken.Claims;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
        "spring.flyway.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:auth-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "ticketbox.auth.jwt-secret=test-secret",
        "ticketbox.auth.access-token-ttl=15m",
        "ticketbox.auth.refresh-token-ttl=7d"
})
class AuthIntegrationTest {

    @LocalServerPort
    private int port;

    private final HttpClient httpClient = HttpClient.newHttpClient();

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private AuthJwtUtil authJwtUtil;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void resetData() {
        jdbcTemplate.execute("delete from ticket_types");
        jdbcTemplate.execute("delete from concerts");
        jdbcTemplate.execute("delete from refresh_tokens");
        userRepository.deleteAll();
    }

    @Test
    void registerLoginRefreshAndReuseDetection() throws Exception {
        TestResponse registeredResponse = postJson("/api/auth/register", Map.of(
                "email", "audience@ticketbox.vn",
                "password", "password123"));
        assertThat(registeredResponse.status()).isEqualTo(HttpStatus.CREATED.value());
        JsonNode registered = registeredResponse.json();

        String firstRefreshToken = registered.get("refreshToken").asText();

        assertThat(postJson("/api/auth/login", Map.of(
                "email", "audience@ticketbox.vn",
                "password", "password123")).status()).isEqualTo(HttpStatus.OK.value());

        TestResponse refreshedResponse = postJson("/api/auth/refresh", Map.of("refreshToken", firstRefreshToken));
        assertThat(refreshedResponse.status()).isEqualTo(HttpStatus.OK.value());
        JsonNode refreshed = refreshedResponse.json();

        assertThat(postJson("/api/auth/refresh", Map.of("refreshToken", firstRefreshToken)).status())
                .isEqualTo(HttpStatus.UNAUTHORIZED.value());

        assertThat(postJson("/api/auth/refresh", Map.of("refreshToken", refreshed.get("refreshToken").asText())).status())
                .isEqualTo(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    void audienceCannotAccessOrganizerEndpoint() throws Exception {
        TestResponse registeredResponse = postJson("/api/auth/register", Map.of(
                "email", "fan@ticketbox.vn",
                "password", "password123"));
        assertThat(registeredResponse.status()).isEqualTo(HttpStatus.CREATED.value());
        String accessToken = registeredResponse
                .json()
                .get("accessToken")
                .asText();
        Claims claims = authJwtUtil.parseAccessToken(accessToken);
        assertThat(userRepository.findById(UUID.fromString(claims.getSubject()))).isPresent();

        assertThat(getWithBearer("/api/admin/test", accessToken).status())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @Test
    void organizerCannotAccessAnotherOrganizerConcert() throws Exception {
        User owner = saveUser("owner@ticketbox.vn", UserRole.ORGANIZER);
        User other = saveUser("other@ticketbox.vn", UserRole.ORGANIZER);
        UUID concertId = UUID.randomUUID();
        Instant now = Instant.now();
        jdbcTemplate.update("""
                insert into concerts (
                    id,
                    name,
                    venue,
                    event_date,
                    status,
                    event_code,
                    created_by,
                    created_at,
                    updated_at,
                    bio_generation_id
                )
                values (?, 'Owned Concert', 'HCMC Stadium', ?, 'DRAFT', 'AUTH-OWNERSHIP', ?, ?, ?, 0)
                """, concertId, now.plusSeconds(86_400), owner.getId(), now, now);

        String otherToken = login("other@ticketbox.vn");

        assertThat(getWithBearer("/api/admin/test/concerts/" + concertId, otherToken).status())
                .isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    private User saveUser(String email, UserRole role) {
        return userRepository.save(new User(
                UUID.randomUUID(),
                email,
                passwordEncoder.encode("password123"),
                role,
                Instant.now()));
    }

    private String login(String email) throws Exception {
        return postJson("/api/auth/login", Map.of("email", email, "password", "password123"))
                .json()
                .get("accessToken")
                .asText();
    }

    private TestResponse postJson(String path, Map<String, String> body) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url(path)))
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                .build();
        return send(request);
    }

    private TestResponse getWithBearer(String path, String accessToken) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url(path)))
                .header("Authorization", "Bearer " + accessToken)
                .GET()
                .build();
        return send(request);
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

    private record TestResponse(int status, JsonNode json) {
    }

    @TestConfiguration
    static class TestAdminControllerConfig {

        @Bean
        TestAdminController testAdminController(OrganizerOwnershipService ownershipService) {
            return new TestAdminController(ownershipService);
        }
    }

    @RestController
    @RequestMapping("/api/admin/test")
    static class TestAdminController {

        private final OrganizerOwnershipService ownershipService;

        TestAdminController(OrganizerOwnershipService ownershipService) {
            this.ownershipService = ownershipService;
        }

        @GetMapping
        Map<String, String> adminOnly() {
            return Map.of("status", "ok");
        }

        @GetMapping("/concerts/{concertId}")
        Map<String, String> ownedConcert(@PathVariable UUID concertId) {
            ownershipService.requireOwnedConcert(concertId);
            return Map.of("status", "ok");
        }
    }
}
