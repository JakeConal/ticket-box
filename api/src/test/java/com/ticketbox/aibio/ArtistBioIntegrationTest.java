package com.ticketbox.aibio;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.auth.model.User;
import com.ticketbox.auth.model.UserRole;
import com.ticketbox.auth.repository.UserRepository;
import com.ticketbox.auth.security.AuthJwtUtil;
import com.ticketbox.concert.cache.ConcertCache;
import com.ticketbox.concert.model.BioStatus;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
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
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
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
        "spring.datasource.url=jdbc:h2:mem:artist-bio-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "ticketbox.auth.jwt-secret=test-secret",
        "ticketbox.auth.access-token-ttl=15m",
        "ticketbox.auth.refresh-token-ttl=7d",
        "ticketbox.ai.storage-dir=./build/test-artist-pdfs",
        "ticketbox.ai.regeneration-min-interval=1m",
        "ticketbox.ai.reaper-delay-ms=3600000",
        "ticketbox.ai.reaper-threshold=5m",
        "ticketbox.ai.extraction-timeout=5s"
})
@Timeout(90)
class ArtistBioIntegrationTest {

    private static final String GENERATED_BIO = "Generated artist biography draft ready for review.";

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

    @Autowired
    private ArtistBioService artistBioService;

    @Autowired
    private TestArtistBioGenerator artistBioGenerator;

    @Autowired
    @Qualifier("testArtistBioCache")
    private InMemoryConcertCache concertCache;

    @BeforeEach
    void resetData() {
        jdbcTemplate.execute("delete from ticket_types");
        jdbcTemplate.execute("delete from concerts");
        jdbcTemplate.execute("delete from refresh_tokens");
        userRepository.deleteAll();
        concertCache.clear();
        artistBioGenerator.reset();
    }

    @Test
    void validPdfGeneratesDraftWithoutLeakingDraftOrErrorPubliclyThenPublishInvalidatesCache() throws Exception {
        User organizer = saveUser("bio-owner@ticketbox.vn", UserRole.ORGANIZER);
        String token = tokenFor(organizer);
        UUID concertId = createPublishedConcert(organizer, "AI-BIO-SUCCESS", "Published bio remains visible");

        JsonNode cachedPublic = getJson("/api/concerts/" + concertId, null).json();
        assertThat(cachedPublic.get("artistBio").asText()).isEqualTo("Published bio remains visible");

        TestResponse upload = postMultipart(
                "/api/admin/concerts/" + concertId + "/artist-pdf",
                token,
                "press-kit.pdf",
                textPdf());
        assertThat(upload.status()).isEqualTo(HttpStatus.ACCEPTED.value());
        assertThat(upload.json().get("bioStatus").asText()).isEqualTo("GENERATING");

        JsonNode duringGeneration = getJson("/api/concerts/" + concertId, null).json();
        assertThat(duringGeneration.get("artistBio").asText()).isEqualTo("Published bio remains visible");
        assertThat(duringGeneration.toString()).doesNotContain("artistBioDraft", "bioError");

        awaitBioStatus(concertId, BioStatus.DRAFT);
        JsonNode review = getJson("/api/admin/concerts/" + concertId + "/artist-bio", token).json();
        assertThat(review.get("artistBioDraft").asText()).isEqualTo(GENERATED_BIO);
        assertThat(getJson("/api/concerts/" + concertId, null).json().get("artistBio").asText())
                .isEqualTo("Published bio remains visible");

        assertThat(postNoBody("/api/admin/concerts/" + concertId + "/artist-bio/publish", token).status())
                .isEqualTo(HttpStatus.OK.value());

        JsonNode publicAfterPublish = getJson("/api/concerts/" + concertId, null).json();
        assertThat(publicAfterPublish.get("artistBio").asText()).isEqualTo(GENERATED_BIO);
        assertThat(publicAfterPublish.toString()).doesNotContain("artistBioDraft", "bioError");
    }

    @Test
    void imageOnlyPdfAndQuotaFailureSetOrganizerVisibleErrorsOnly() throws Exception {
        User organizer = saveUser("bio-failures@ticketbox.vn", UserRole.ORGANIZER);
        String token = tokenFor(organizer);
        UUID imageOnlyConcert = createPublishedConcert(organizer, "AI-BIO-IMAGE", null);

        assertThat(postMultipart(
                "/api/admin/concerts/" + imageOnlyConcert + "/artist-pdf",
                token,
                "blank.pdf",
                blankPdf()).status()).isEqualTo(HttpStatus.ACCEPTED.value());
        awaitBioStatus(imageOnlyConcert, BioStatus.FAILED);
        JsonNode imageReview = getJson("/api/admin/concerts/" + imageOnlyConcert + "/artist-bio", token).json();
        assertThat(imageReview.get("bioError").asText()).contains("Text extraction failed");
        assertThat(getJson("/api/concerts/" + imageOnlyConcert, null).json().get("artistBio").isNull()).isTrue();

        artistBioGenerator.setMode(TestArtistBioGenerator.Mode.QUOTA);
        UUID quotaConcert = createPublishedConcert(organizer, "AI-BIO-QUOTA", null);
        assertThat(postMultipart(
                "/api/admin/concerts/" + quotaConcert + "/artist-pdf",
                token,
                "press-kit.pdf",
                textPdf()).status()).isEqualTo(HttpStatus.ACCEPTED.value());
        awaitBioStatus(quotaConcert, BioStatus.FAILED);
        JsonNode quotaReview = getJson("/api/admin/concerts/" + quotaConcert + "/artist-bio", token).json();
        assertThat(quotaReview.get("bioError").asText()).contains("AI service busy");
        assertThat(artistBioGenerator.calls()).isEqualTo(3);
    }

    @Test
    void rejectsNonPdfAndRateLimitsRepeatedRegenerationAttempts() throws Exception {
        User organizer = saveUser("bio-validation@ticketbox.vn", UserRole.ORGANIZER);
        String token = tokenFor(organizer);
        UUID nonPdfConcert = createPublishedConcert(organizer, "AI-BIO-NONPDF", null);

        TestResponse nonPdf = postMultipart(
                "/api/admin/concerts/" + nonPdfConcert + "/artist-pdf",
                token,
                "fake.pdf",
                "not really a pdf".getBytes());
        assertThat(nonPdf.status()).isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE.value());

        UUID throttledConcert = createPublishedConcert(organizer, "AI-BIO-THROTTLE", null);
        assertThat(postMultipart(
                "/api/admin/concerts/" + throttledConcert + "/artist-pdf",
                token,
                "press-kit.pdf",
                textPdf()).status()).isEqualTo(HttpStatus.ACCEPTED.value());

        TestResponse secondUpload = postMultipart(
                "/api/admin/concerts/" + throttledConcert + "/artist-pdf",
                token,
                "press-kit.pdf",
                textPdf());
        assertThat(secondUpload.status()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
    }

    @Test
    void editRejectStaleCompletionAndReaperKeepBioLifecycleConsistent() throws Exception {
        User organizer = saveUser("bio-review@ticketbox.vn", UserRole.ORGANIZER);
        String token = tokenFor(organizer);
        UUID concertId = createPublishedConcert(organizer, "AI-BIO-REVIEW", "Original public bio");

        jdbcTemplate.update("""
                update concerts
                set bio_status = 'DRAFT',
                    artist_bio_draft = 'Generated draft',
                    bio_generation_id = 2
                where id = ?
                """, concertId);
        assertThat(putJson(
                "/api/admin/concerts/" + concertId + "/artist-bio",
                token,
                Map.of("draftText", "Organizer edited draft")).status()).isEqualTo(HttpStatus.OK.value());
        assertThat(postJson(
                "/api/admin/concerts/" + concertId + "/artist-bio/reject",
                token,
                Map.of("reason", "Needs a different tone")).status()).isEqualTo(HttpStatus.OK.value());
        JsonNode rejected = getJson("/api/admin/concerts/" + concertId + "/artist-bio", token).json();
        assertThat(rejected.get("bioStatus").asText()).isEqualTo("REJECTED");
        assertThat(rejected.get("publicArtistBio").asText()).isEqualTo("Original public bio");

        jdbcTemplate.update("""
                update concerts
                set bio_status = 'GENERATING',
                    artist_bio_draft = null,
                    bio_generation_id = 2
                where id = ?
                """, concertId);
        assertThat(artistBioService.saveDraftIfCurrent(concertId, 1, "Late stale draft")).isFalse();
        assertThat(jdbcTemplate.queryForObject(
                "select artist_bio_draft from concerts where id = ?",
                String.class,
                concertId)).isNull();

        jdbcTemplate.update(
                "update concerts set updated_at = ? where id = ?",
                Instant.now().minus(Duration.ofMinutes(10)),
                concertId);
        assertThat(artistBioService.reapStuckGenerating()).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "select bio_status from concerts where id = ?",
                String.class,
                concertId)).isEqualTo("FAILED");
        assertThat(jdbcTemplate.queryForObject(
                "select bio_error from concerts where id = ?",
                String.class,
                concertId)).isEqualTo("Generation interrupted - please retry");
    }

    private void awaitBioStatus(UUID concertId, BioStatus status) throws InterruptedException {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(8));
        while (Instant.now().isBefore(deadline)) {
            String current = jdbcTemplate.queryForObject(
                    "select bio_status from concerts where id = ?",
                    String.class,
                    concertId);
            if (status.name().equals(current)) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Timed out waiting for bio status " + status);
    }

    private TestResponse getJson(String path, String bearerToken) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path)))
                .timeout(Duration.ofSeconds(10))
                .GET();
        addBearer(builder, bearerToken);
        return send(builder.build());
    }

    private TestResponse postNoBody(String path, String bearerToken) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path)))
                .timeout(Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.noBody());
        addBearer(builder, bearerToken);
        return send(builder.build());
    }

    private TestResponse postJson(String path, String bearerToken, Map<String, ?> body) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path)))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
        addBearer(builder, bearerToken);
        return send(builder.build());
    }

    private TestResponse putJson(String path, String bearerToken, Map<String, ?> body) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path)))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .PUT(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
        addBearer(builder, bearerToken);
        return send(builder.build());
    }

    private TestResponse postMultipart(String path, String bearerToken, String fileName, byte[] fileBytes)
            throws Exception {
        String boundary = "----ticketbox-test-" + UUID.randomUUID();
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.write(("--" + boundary + "\r\n").getBytes());
        body.write(("Content-Disposition: form-data; name=\"file\"; filename=\"" + fileName + "\"\r\n").getBytes());
        body.write(("Content-Type: application/pdf\r\n\r\n").getBytes());
        body.write(fileBytes);
        body.write(("\r\n--" + boundary + "--\r\n").getBytes());

        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path)))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()));
        addBearer(builder, bearerToken);
        return send(builder.build());
    }

    private TestResponse send(HttpRequest request) throws Exception {
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        JsonNode json = response.body() == null || response.body().isBlank()
                ? objectMapper.createObjectNode()
                : objectMapper.readTree(response.body());
        return new TestResponse(response.statusCode(), json);
    }

    private void addBearer(HttpRequest.Builder builder, String bearerToken) {
        if (bearerToken != null) {
            builder.header("Authorization", "Bearer " + bearerToken);
        }
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    private byte[] textPdf() throws Exception {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.newLineAtOffset(50, 700);
                content.showText("This press kit contains enough extractable artist biography source text ");
                content.newLineAtOffset(0, -16);
                content.showText("for the AI drafting assistant to produce a public concert bio.");
                content.endText();
            }
            document.save(output);
            return output.toByteArray();
        }
    }

    private byte[] blankPdf() throws Exception {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.addPage(new PDPage());
            document.save(output);
            return output.toByteArray();
        }
    }

    private UUID createPublishedConcert(User organizer, String eventCode, String publicBio) {
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
                    bio_status,
                    bio_generation_id,
                    seat_map_svg,
                    created_by,
                    created_at,
                    updated_at
                )
                values (?, ?, ?, ?, ?, 'PUBLISHED', ?, ?, ?, 0, ?, ?, ?, ?)
                """,
                concertId,
                "AI Bio Concert",
                "Concert description",
                "HCMC Stadium",
                now.plus(Duration.ofDays(30)),
                eventCode,
                publicBio,
                publicBio == null ? null : "PUBLISHED",
                "<svg><rect id='VIP'/></svg>",
                organizer.getId(),
                now,
                now);
        createTicketType(concertId);
        return concertId;
    }

    private void createTicketType(UUID concertId) {
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
                values (?, ?, 'VIP', 'VIP', ?, 10, 10, ?, 2, ?)
                """,
                UUID.randomUUID(),
                concertId,
                new BigDecimal("2000000.00"),
                Instant.now().minus(Duration.ofMinutes(1)),
                Instant.now());
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

    private record TestResponse(int status, JsonNode json) {
    }

    @TestConfiguration
    static class ArtistBioTestConfig {

        @Bean
        @Primary
        TestArtistBioGenerator testArtistBioGenerator() {
            return new TestArtistBioGenerator();
        }

        @Bean("testArtistBioCache")
        @Primary
        InMemoryConcertCache testArtistBioCache(ObjectMapper objectMapper) {
            return new InMemoryConcertCache(objectMapper);
        }
    }

    static class TestArtistBioGenerator implements ArtistBioGenerator {

        enum Mode {
            SUCCESS,
            QUOTA
        }

        private final AtomicReference<Mode> mode = new AtomicReference<>(Mode.SUCCESS);
        private final AtomicInteger calls = new AtomicInteger();

        @Override
        public String generateBio(String cleanedPressKitText) {
            calls.incrementAndGet();
            if (mode.get() == Mode.QUOTA) {
                throw new ArtistBioGenerationException("quota", true);
            }
            return GENERATED_BIO;
        }

        void setMode(Mode mode) {
            this.mode.set(mode);
        }

        int calls() {
            return calls.get();
        }

        void reset() {
            mode.set(Mode.SUCCESS);
            calls.set(0);
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
