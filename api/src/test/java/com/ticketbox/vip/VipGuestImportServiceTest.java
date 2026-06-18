package com.ticketbox.vip;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@TestPropertySource(properties = {
        "spring.flyway.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:vip-import-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "ticketbox.auth.jwt-secret=test-secret",
        "ticketbox.auth.access-token-ttl=15m",
        "ticketbox.auth.refresh-token-ttl=7d",
        "ticketbox.imports.vip-dir=build/test-vip-imports",
        "ticketbox.orders.expiry-initial-delay-ms=3600000"
})
class VipGuestImportServiceTest {

    private static final Path IMPORT_DIR = Path.of("build/test-vip-imports");

    @Autowired
    private VipGuestImportService importService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void resetData() throws IOException {
        createAuxiliaryTables();
        jdbcTemplate.execute("delete from import_files");
        jdbcTemplate.execute("delete from vip_guests");
        jdbcTemplate.execute("delete from concerts");
        cleanDirectory(IMPORT_DIR);
        Files.createDirectories(IMPORT_DIR);
    }

    @Test
    void duplicateFileBadRowsAndPhoneVariantsDoNotCreateDuplicates() throws IOException {
        UUID ownerId = UUID.randomUUID();
        createConcert("ATSH-HCM", ownerId);
        String csv = """
                Event_Code, Name, Phone, Sponsor, Zone
                ATSH-HCM, Nguyen Van A, 0901 234 567, Brand A, SVIP
                ATSH-HCM, Duplicate A, +84 901 234 567, Brand A, VIP
                ATSH-HCM, Missing Phone, , Brand A, VIP
                UNKNOWN, Unknown Guest, 0909 999 999, Brand A, VIP
                """;

        writeCsv("night-one.csv", csv);
        List<VipGuestImportSummaryResponse> firstRun = importService.processPendingImports(Optional.empty());

        assertThat(firstRun).hasSize(1);
        assertThat(firstRun.getFirst().inserted()).isEqualTo(1);
        assertThat(firstRun.getFirst().skipped()).isEqualTo(3);
        assertThat(firstRun.getFirst().archive()).isEqualTo("processed");
        assertThat(countGuests()).isEqualTo(1);
        assertThat(phoneFor("Nguyen Van A")).isEqualTo("84901234567");

        writeCsv("night-two-copy.csv", csv);
        List<VipGuestImportSummaryResponse> secondRun = importService.processPendingImports(Optional.empty());

        assertThat(secondRun).hasSize(1);
        assertThat(secondRun.getFirst().message()).contains("already-seen");
        assertThat(countGuests()).isEqualTo(1);
        assertThat(Files.exists(IMPORT_DIR.resolve("processed").resolve("night-two-copy.csv"))).isTrue();
    }

    @Test
    void snapshotReconciliationIsScopedAndReimportPreservesEnteredStatus() throws IOException {
        UUID ownerId = UUID.randomUUID();
        UUID concertA = createConcert("CONCERT-A", ownerId);
        UUID concertB = createConcert("CONCERT-B", ownerId);
        UUID enteredGuest = insertVipGuest(concertA, "Original Name", "84901111111", true, true);
        UUID absentGuest = insertVipGuest(concertA, "Revoked Guest", "84902222222", true, false);
        UUID otherConcertGuest = insertVipGuest(concertB, "Other Concert Guest", "84903333333", true, false);

        writeCsv("snapshot.csv", """
                event_code,name,phone,sponsor,zone
                CONCERT-A,Updated Name,0901 111 111,Brand A,SVIP
                """);

        VipGuestImportSummaryResponse summary = importService.processPendingImports(Optional.empty()).getFirst();

        assertThat(summary.updated()).isEqualTo(1);
        assertThat(summary.deactivated()).isEqualTo(1);
        assertThat(isActive(absentGuest)).isFalse();
        assertThat(isActive(otherConcertGuest)).isTrue();
        assertThat(isEntered(enteredGuest)).isTrue();
        assertThat(nameFor(enteredGuest)).isEqualTo("Updated Name");
    }

    @Test
    void unknownEventCodeFileIsQuarantinedWithoutRecordingHash() throws IOException {
        writeCsv("unknown.csv", """
                event_code,name,phone,sponsor,zone
                MISSING,Unknown Guest,0909 999 999,Brand A,VIP
                """);

        VipGuestImportSummaryResponse summary = importService.processPendingImports(Optional.empty()).getFirst();

        assertThat(summary.archive()).isEqualTo("error");
        assertThat(summary.message()).contains("unresolvable");
        assertThat(Files.exists(IMPORT_DIR.resolve("error").resolve("unknown.csv"))).isTrue();
        assertThat(countGuests()).isZero();
        assertThat(jdbcTemplate.queryForObject("select count(*) from import_files", Integer.class)).isZero();
    }

    @Test
    void manualImportSkipsRowsForUnownedConcerts() throws IOException {
        UUID ownerA = UUID.randomUUID();
        UUID ownerB = UUID.randomUUID();
        createConcert("OWNED", ownerA);
        createConcert("UNOWNED", ownerB);
        writeCsv("manual.csv", """
                event_code,name,phone,sponsor,zone
                OWNED,Owned Guest,0901 111 111,Brand A,SVIP
                UNOWNED,Unowned Guest,0902 222 222,Brand B,VIP
                """);

        VipGuestImportSummaryResponse summary = importService.processPendingImports(Optional.of(ownerA)).getFirst();

        assertThat(summary.inserted()).isEqualTo(1);
        assertThat(summary.skipped()).isEqualTo(1);
        assertThat(countGuests()).isEqualTo(1);
        assertThat(phoneFor("Owned Guest")).isEqualTo("84901111111");
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from vip_guests where name = 'Unowned Guest'",
                Integer.class)).isZero();
    }

    private UUID createConcert(String eventCode, UUID ownerId) {
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
                values (?, ?, 'Description', 'HCMC Stadium', ?, 'PUBLISHED',
                        ?, 'Bio', 0, '<svg/>', ?, ?, ?)
                """, id, eventCode + " Concert", now.plus(Duration.ofDays(10)), eventCode, ownerId, now, now);
        return id;
    }

    private UUID insertVipGuest(UUID concertId, String name, String phone, boolean active, boolean entered) {
        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
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
                    entered_at,
                    created_at,
                    updated_at
                )
                values (?, ?, ?, ?, 'Seed Sponsor', 'SVIP', ?, ?, ?, ?, ?)
                """, id, concertId, name, phone, active, entered, entered ? now : null, now, now);
        return id;
    }

    private int countGuests() {
        return jdbcTemplate.queryForObject("select count(*) from vip_guests", Integer.class);
    }

    private String phoneFor(String name) {
        return jdbcTemplate.queryForObject(
                "select phone_normalized from vip_guests where name = ?",
                String.class,
                name);
    }

    private String nameFor(UUID id) {
        return jdbcTemplate.queryForObject("select name from vip_guests where id = ?", String.class, id);
    }

    private boolean isActive(UUID id) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject("select active from vip_guests where id = ?", Boolean.class, id));
    }

    private boolean isEntered(UUID id) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject("select entered from vip_guests where id = ?", Boolean.class, id));
    }

    private void writeCsv(String fileName, String content) throws IOException {
        Files.writeString(IMPORT_DIR.resolve(fileName), content);
    }

    private void cleanDirectory(Path directory) throws IOException {
        if (!Files.exists(directory)) {
            return;
        }
        try (var stream = Files.walk(directory)) {
            for (Path path : stream.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    private void createAuxiliaryTables() {
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
                    updated_at timestamp not null,
                    constraint ux_vip_guest_test unique (concert_id, phone_normalized)
                )
                """);
        jdbcTemplate.execute("""
                create table if not exists import_files (
                    id uuid default random_uuid() primary key,
                    file_name varchar(1000) not null,
                    content_hash varchar(255) not null unique,
                    processed_at timestamp not null default now(),
                    summary varchar(4000)
                )
                """);
    }
}
