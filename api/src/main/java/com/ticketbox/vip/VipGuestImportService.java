package com.ticketbox.vip;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.opencsv.CSVParserBuilder;
import com.opencsv.CSVReader;
import com.opencsv.CSVReaderBuilder;
import com.opencsv.exceptions.CsvException;
import java.io.IOException;
import java.io.OutputStream;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
public class VipGuestImportService {

    private static final Logger log = LoggerFactory.getLogger(VipGuestImportService.class);

    private final VipImportProperties properties;
    private final PhoneNormalizer phoneNormalizer;
    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final boolean postgres;

    public VipGuestImportService(
            VipImportProperties properties,
            PhoneNormalizer phoneNormalizer,
            JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager,
            ObjectMapper objectMapper,
            Clock clock,
            DataSource dataSource) {
        this.properties = properties;
        this.phoneNormalizer = phoneNormalizer;
        this.jdbcTemplate = jdbcTemplate;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.objectMapper = objectMapper;
        this.clock = clock;
        this.postgres = isPostgres(dataSource);
    }

    public List<VipGuestImportSummaryResponse> processPendingImports() {
        return processPendingImports(Optional.empty());
    }

    public List<VipGuestImportSummaryResponse> processPendingImports(Optional<UUID> organizerId) {
        Path importDir = properties.getVipDir();
        try {
            Files.createDirectories(importDir);
            Files.createDirectories(processedDir());
            Files.createDirectories(errorDir());
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "VIP import directory unavailable", ex);
        }

        List<Path> files = listCsvFiles(importDir);
        if (files.isEmpty()) {
            log.info("No import files found in {}", importDir);
            return List.of();
        }

        List<VipGuestImportSummaryResponse> summaries = new ArrayList<>();
        for (Path file : files) {
            ImportSource source = organizerId.isPresent()
                    ? ImportSource.ORGANIZER_DIRECTORY
                    : ImportSource.SYSTEM_DIRECTORY;
            summaries.add(processFile(
                    file,
                    file.getFileName().toString(),
                    organizerId,
                    Optional.empty(),
                    source));
        }
        return summaries;
    }

    public VipGuestImportSummaryResponse processUploadedImport(
            Path file,
            String originalFileName,
            UUID organizerId,
            UUID expectedConcertId) {
        return processFile(
                file,
                originalFileName,
                Optional.of(organizerId),
                Optional.of(expectedConcertId),
                ImportSource.ORGANIZER_UPLOAD);
    }

    private List<Path> listCsvFiles(Path importDir) {
        try (var stream = Files.list(importDir)) {
            return stream
                    .filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".csv"))
                    .sorted(Comparator.comparing(path -> path.getFileName().toString()))
                    .toList();
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Unable to scan VIP import directory", ex);
        }
    }

    private VipGuestImportSummaryResponse processFile(
            Path file,
            String fileName,
            Optional<UUID> organizerId,
            Optional<UUID> expectedConcertId,
            ImportSource source) {
        String hash;
        try {
            hash = sha256(file);
        } catch (IOException ex) {
            log.error("VIP import {} cannot be read", fileName, ex);
            return archiveError(file, SummaryBuilder.forFile(fileName).errored().message("File cannot be read"));
        }

        if (hashSeen(hash)) {
            log.info("Skipping already-imported VIP CSV {} hash={}", fileName, hash);
            VipGuestImportSummaryResponse summary = SummaryBuilder.forFile(fileName)
                    .message("Skipped already-seen content hash")
                    .processed()
                    .build();
            moveTo(file, processedDir());
            return summary;
        }

        ParsedCsv parsed;
        try {
            parsed = parse(file);
        } catch (RuntimeException ex) {
            log.error("VIP import {} is unparseable: {}", fileName, ex.getMessage());
            return archiveError(file, SummaryBuilder.forFile(fileName).errored().message(ex.getMessage()));
        }

        SummaryBuilder summary = SummaryBuilder.forFile(fileName).totalRows(parsed.rows().size());
        Optional<String> scopeIssue = validateImportScope(
                parsed.rows(),
                organizerId,
                expectedConcertId,
                source);
        if (scopeIssue.isPresent()) {
            summary.errored().message(scopeIssue.get());
            if (source == ImportSource.ORGANIZER_UPLOAD) {
                return archiveError(file, summary);
            }
            return summary.build();
        }

        ProcessedImport processedImport = transactionTemplate.execute(status -> {
            ImportMutationResult mutation = applyRows(fileName, parsed.rows(), organizerId, summary);
            if (mutation.quarantine()) {
                return new ProcessedImport(mutation, null);
            }
            VipGuestImportSummaryResponse response = summary
                    .message(mutation.message())
                    .processed()
                    .build();
            recordImportFile(fileName, hash, response);
            return new ProcessedImport(mutation, response);
        });
        if (processedImport == null) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "VIP import failed");
        }

        if (processedImport.mutation().quarantine()) {
            log.error("VIP import {} quarantined: {}", fileName, processedImport.mutation().message());
            return archiveError(file, summary.message(processedImport.mutation().message()));
        }

        VipGuestImportSummaryResponse response = processedImport.response();
        moveTo(file, processedDir());
        log.info(
                "VIP import {} summary: total={}, inserted={}, updated={}, deactivated={}, skipped={}, errored={}",
                fileName,
                response.totalRows(),
                response.inserted(),
                response.updated(),
                response.deactivated(),
                response.skipped(),
                response.errored());
        return response;
    }

    private Optional<String> validateImportScope(
            List<CsvRow> rows,
            Optional<UUID> organizerId,
            Optional<UUID> expectedConcertId,
            ImportSource source) {
        if (organizerId.isEmpty()) {
            return Optional.empty();
        }

        boolean ownedConcertFound = false;
        boolean expectedConcertFound = false;
        for (CsvRow row : rows) {
            if (!StringUtils.hasText(row.eventCode())) {
                if (source == ImportSource.ORGANIZER_UPLOAD) {
                    return Optional.of(
                            "Row %d is missing event_code; no guests were imported"
                                    .formatted(row.rowNumber()));
                }
                continue;
            }
            Optional<ConcertRef> concert = resolveConcert(row.eventCode());
            if (concert.isEmpty()) {
                if (source == ImportSource.ORGANIZER_UPLOAD) {
                    return Optional.of(
                            "Row %d has unknown event_code '%s'; no guests were imported"
                                    .formatted(row.rowNumber(), row.eventCode()));
                }
                continue;
            }

            ConcertRef concertRef = concert.get();
            if (!organizerId.get().equals(concertRef.createdBy())) {
                return Optional.of(
                        source == ImportSource.ORGANIZER_UPLOAD
                                ? "Row %d belongs to a concert outside your organizer account; no guests were imported"
                                        .formatted(row.rowNumber())
                                : "File was left pending because it contains a concert owned by another organizer");
            }

            ownedConcertFound = true;
            if (expectedConcertId.isPresent()) {
                if (!expectedConcertId.get().equals(concertRef.id())) {
                    return Optional.of(
                            "Row %d uses event_code '%s', which does not match the selected concert"
                                    .formatted(row.rowNumber(), row.eventCode()));
                }
                expectedConcertFound = true;
            }
        }

        if (!ownedConcertFound) {
            return Optional.of(
                    source == ImportSource.ORGANIZER_UPLOAD
                            ? "CSV does not contain a valid event_code for the selected concert"
                            : "File was left pending because it contains no concerts owned by this organizer");
        }
        if (expectedConcertId.isPresent() && !expectedConcertFound) {
            return Optional.of("CSV does not contain the selected concert's event_code");
        }
        return Optional.empty();
    }

    private ImportMutationResult applyRows(
            String fileName,
            List<CsvRow> rows,
            Optional<UUID> organizerId,
            SummaryBuilder summary) {
        Map<UUID, Set<String>> phonesByConcert = new LinkedHashMap<>();
        Set<GuestKey> seenInFile = new HashSet<>();
        Set<UUID> unsafeReconciliation = new HashSet<>();
        boolean unsafeAllReconciliation = false;
        int knownConcertRows = 0;
        int acceptedRows = 0;

        for (CsvRow row : rows) {
            ConcertRef concertRef = null;
            try {
                if (!StringUtils.hasText(row.eventCode())) {
                    log.warn("VIP import {} row {} skipped: missing event_code", fileName, row.rowNumber());
                    unsafeAllReconciliation = true;
                    summary.skipped();
                    continue;
                }

                Optional<ConcertRef> concert = resolveConcert(row.eventCode());
                if (concert.isEmpty()) {
                    log.warn("VIP import {} row {} skipped: unknown event_code {}", fileName, row.rowNumber(), row.eventCode());
                    unsafeAllReconciliation = true;
                    summary.skipped();
                    continue;
                }
                knownConcertRows++;

                concertRef = concert.get();
                if (organizerId.isPresent() && !organizerId.get().equals(concertRef.createdBy())) {
                    log.warn(
                            "VIP import {} row {} skipped: event_code {} belongs to another organizer",
                            fileName,
                            row.rowNumber(),
                            row.eventCode());
                    summary.skipped();
                    continue;
                }

                Optional<String> normalizedPhone = phoneNormalizer.normalize(row.phone());
                if (normalizedPhone.isEmpty()) {
                    log.warn("VIP import {} row {} skipped: missing or invalid phone", fileName, row.rowNumber());
                    unsafeReconciliation.add(concertRef.id());
                    summary.skipped();
                    continue;
                }

                GuestKey key = new GuestKey(concertRef.id(), normalizedPhone.get());
                if (!seenInFile.add(key)) {
                    log.warn(
                            "VIP import {} row {} skipped: duplicate guest for event_code {} and phone {}",
                            fileName,
                            row.rowNumber(),
                            row.eventCode(),
                            normalizedPhone.get());
                    summary.skipped();
                    continue;
                }

                upsertGuest(concertRef.id(), row, normalizedPhone.get(), summary);
                phonesByConcert.computeIfAbsent(concertRef.id(), ignored -> new HashSet<>()).add(normalizedPhone.get());
                acceptedRows++;
            } catch (RuntimeException ex) {
                log.warn("VIP import {} row {} failed: {}", fileName, row.rowNumber(), ex.getMessage());
                if (concertRef != null) {
                    unsafeReconciliation.add(concertRef.id());
                }
                summary.errored();
            }
        }

        if (!rows.isEmpty() && knownConcertRows == 0) {
            return new ImportMutationResult(true, "All event_code values were unresolvable; file quarantined");
        }

        int skippedReconciliations = 0;
        for (Map.Entry<UUID, Set<String>> entry : phonesByConcert.entrySet()) {
            if (unsafeAllReconciliation || unsafeReconciliation.contains(entry.getKey())) {
                skippedReconciliations++;
                continue;
            }
            summary.deactivated(reconcileConcert(entry.getKey(), entry.getValue()));
        }

        if (acceptedRows == 0) {
            return new ImportMutationResult(false, "No owned valid VIP rows were imported");
        }
        if (skippedReconciliations > 0) {
            return new ImportMutationResult(
                    false,
                    "VIP rows were imported, but snapshot deactivation was skipped for %d concert(s) because the file contains invalid or unscoped rows"
                            .formatted(skippedReconciliations));
        }
        return new ImportMutationResult(false, "VIP import completed");
    }

    private Optional<ConcertRef> resolveConcert(String eventCode) {
        List<ConcertRef> refs = jdbcTemplate.query("""
                select id, created_by
                from concerts
                where lower(event_code) = lower(?)
                """, (rs, rowNum) -> new ConcertRef(
                rs.getObject("id", UUID.class),
                rs.getObject("created_by", UUID.class)), eventCode.trim());
        return refs.stream().findFirst();
    }

    private void upsertGuest(UUID concertId, CsvRow row, String normalizedPhone, SummaryBuilder summary) {
        Optional<UUID> existing = findGuestId(concertId, normalizedPhone);
        Instant now = clock.instant();
        String name = StringUtils.hasText(row.name()) ? row.name().trim() : "VIP Guest";
        String zone = StringUtils.hasText(row.zone()) ? row.zone().trim() : "VIP";
        String sponsor = StringUtils.hasText(row.sponsor()) ? row.sponsor().trim() : null;
        if (existing.isPresent()) {
            jdbcTemplate.update("""
                    update vip_guests
                    set name = ?,
                        sponsor = ?,
                        zone = ?,
                        active = true,
                        updated_at = ?
                    where id = ?
                    """, name, sponsor, zone, Timestamp.from(now), existing.get());
            summary.updated();
            return;
        }

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
                values (?, ?, ?, ?, ?, ?, true, false, ?, ?)
                """, UUID.randomUUID(), concertId, name, normalizedPhone, sponsor, zone, Timestamp.from(now), Timestamp.from(now));
        summary.inserted();
    }

    private Optional<UUID> findGuestId(UUID concertId, String normalizedPhone) {
        List<UUID> ids = jdbcTemplate.query(
                "select id from vip_guests where concert_id = ? and phone_normalized = ?",
                (rs, rowNum) -> rs.getObject("id", UUID.class),
                concertId,
                normalizedPhone);
        return ids.stream().findFirst();
    }

    private int reconcileConcert(UUID concertId, Set<String> phonesPresent) {
        List<Object> args = new ArrayList<>();
        args.add(Timestamp.from(clock.instant()));
        args.add(concertId);
        StringBuilder sql = new StringBuilder("""
                update vip_guests
                set active = false,
                    updated_at = ?
                where concert_id = ?
                  and active = true
                """);
        if (!phonesPresent.isEmpty()) {
            sql.append(" and phone_normalized not in (");
            sql.append("?,".repeat(phonesPresent.size()));
            sql.setLength(sql.length() - 1);
            sql.append(")");
            args.addAll(phonesPresent);
        }
        return jdbcTemplate.update(sql.toString(), args.toArray());
    }

    private ParsedCsv parse(Path file) {
        try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8);
                CSVReader csvReader = new CSVReaderBuilder(reader)
                        .withCSVParser(new CSVParserBuilder().withSeparator(',').build())
                        .build()) {
            List<String[]> allRows = csvReader.readAll();
            int headerIndex = firstNonBlankRow(allRows);
            if (headerIndex < 0) {
                throw new IllegalArgumentException("CSV has no header");
            }
            Map<String, Integer> header = mapHeader(allRows.get(headerIndex));
            if (!header.containsKey("event_code") || !header.containsKey("phone")) {
                throw new IllegalArgumentException("CSV header must include event_code and phone");
            }

            List<CsvRow> rows = new ArrayList<>();
            for (int index = headerIndex + 1; index < allRows.size(); index++) {
                String[] values = allRows.get(index);
                if (blank(values)) {
                    continue;
                }
                rows.add(new CsvRow(
                        index + 1,
                        column(values, header, "event_code"),
                        column(values, header, "name"),
                        column(values, header, "phone"),
                        column(values, header, "sponsor"),
                        column(values, header, "zone")));
            }
            return new ParsedCsv(rows);
        } catch (IOException | CsvException ex) {
            throw new IllegalArgumentException("CSV could not be parsed", ex);
        }
    }

    private Map<String, Integer> mapHeader(String[] headerRow) {
        Map<String, Integer> header = new HashMap<>();
        for (int index = 0; index < headerRow.length; index++) {
            String name = headerRow[index] == null ? "" : headerRow[index].trim().toLowerCase(Locale.ROOT);
            if (StringUtils.hasText(name)) {
                header.putIfAbsent(name, index);
            }
        }
        return header;
    }

    private int firstNonBlankRow(List<String[]> rows) {
        for (int index = 0; index < rows.size(); index++) {
            if (!blank(rows.get(index))) {
                return index;
            }
        }
        return -1;
    }

    private boolean blank(String[] values) {
        if (values == null || values.length == 0) {
            return true;
        }
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return false;
            }
        }
        return true;
    }

    private String column(String[] values, Map<String, Integer> header, String name) {
        Integer index = header.get(name);
        if (index == null || index >= values.length) {
            return "";
        }
        return values[index] == null ? "" : values[index].trim();
    }

    private boolean hashSeen(String hash) {
        Boolean exists = jdbcTemplate.queryForObject(
                "select exists(select 1 from import_files where content_hash = ?)",
                Boolean.class,
                hash);
        return Boolean.TRUE.equals(exists);
    }

    private void recordImportFile(String fileName, String hash, VipGuestImportSummaryResponse summary) {
        String summaryJson = toJson(summary);
        if (postgres) {
            int inserted = jdbcTemplate.update("""
                    insert into import_files (file_name, content_hash, processed_at, summary)
                    values (?, ?, ?, ?::jsonb)
                    on conflict (content_hash) do nothing
                    """, fileName, hash, Timestamp.from(clock.instant()), summaryJson);
            if (inserted == 0) {
                log.info("VIP import {} content hash was recorded concurrently", fileName);
            }
            return;
        }
        try {
            jdbcTemplate.update(
                    "insert into import_files (file_name, content_hash, processed_at, summary) values (?, ?, ?, ?)",
                    fileName,
                    hash,
                    Timestamp.from(clock.instant()),
                    summaryJson);
        } catch (DataAccessException ex) {
            if (hashSeen(hash)) {
                log.info("VIP import {} content hash was recorded concurrently", fileName);
                return;
            }
            throw ex;
        }
    }

    private String toJson(VipGuestImportSummaryResponse summary) {
        try {
            return objectMapper.writeValueAsString(summary);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Unable to serialize VIP import summary", ex);
        }
    }

    private VipGuestImportSummaryResponse archiveError(Path file, SummaryBuilder summary) {
        VipGuestImportSummaryResponse response = summary.error().build();
        moveTo(file, errorDir());
        log.error(
                "VIP import {} moved to error archive: total={}, inserted={}, updated={}, skipped={}, errored={}",
                response.fileName(),
                response.totalRows(),
                response.inserted(),
                response.updated(),
                response.skipped(),
                response.errored());
        return response;
    }

    private void moveTo(Path file, Path archiveDir) {
        try {
            Files.createDirectories(archiveDir);
            Files.move(file, archiveDir.resolve(file.getFileName()), StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Unable to archive VIP import file", ex);
        }
    }

    private Path processedDir() {
        return properties.getVipDir().resolve("processed");
    }

    private Path errorDir() {
        return properties.getVipDir().resolve("error");
    }

    private String sha256(Path file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (DigestInputStream stream = new DigestInputStream(Files.newInputStream(file), digest)) {
                stream.transferTo(OutputStreamSink.INSTANCE);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }

    private boolean isPostgres(DataSource dataSource) {
        try (Connection connection = dataSource.getConnection()) {
            String name = connection.getMetaData().getDatabaseProductName();
            return name != null && name.toLowerCase(Locale.ROOT).contains("postgres");
        } catch (SQLException ex) {
            log.warn("Unable to detect database product for VIP import summary JSON binding", ex);
            return false;
        }
    }

    private static final class OutputStreamSink extends OutputStream {

        private static final OutputStreamSink INSTANCE = new OutputStreamSink();

        @Override
        public void write(int b) {
        }

        @Override
        public void write(byte[] bytes, int offset, int length) {
        }
    }

    private record ParsedCsv(List<CsvRow> rows) {
    }

    private record CsvRow(
            int rowNumber,
            String eventCode,
            String name,
            String phone,
            String sponsor,
            String zone) {
    }

    private record ConcertRef(UUID id, UUID createdBy) {
    }

    private record GuestKey(UUID concertId, String phoneNormalized) {
    }

    private record ImportMutationResult(boolean quarantine, String message) {
    }

    private record ProcessedImport(
            ImportMutationResult mutation,
            VipGuestImportSummaryResponse response) {
    }

    private enum ImportSource {
        SYSTEM_DIRECTORY,
        ORGANIZER_DIRECTORY,
        ORGANIZER_UPLOAD
    }

    private static class SummaryBuilder {

        private final String fileName;
        private int totalRows;
        private int inserted;
        private int updated;
        private int deactivated;
        private int skipped;
        private int errored;
        private boolean archived;
        private String archive;
        private String message = "VIP import completed";

        private SummaryBuilder(String fileName) {
            this.fileName = fileName;
        }

        static SummaryBuilder forFile(String fileName) {
            return new SummaryBuilder(fileName);
        }

        SummaryBuilder totalRows(int totalRows) {
            this.totalRows = totalRows;
            return this;
        }

        SummaryBuilder inserted() {
            this.inserted++;
            return this;
        }

        SummaryBuilder updated() {
            this.updated++;
            return this;
        }

        SummaryBuilder deactivated(int count) {
            this.deactivated += count;
            return this;
        }

        SummaryBuilder skipped() {
            this.skipped++;
            return this;
        }

        SummaryBuilder errored() {
            this.errored++;
            return this;
        }

        SummaryBuilder error() {
            this.archived = true;
            this.archive = "error";
            return this;
        }

        SummaryBuilder processed() {
            this.archived = true;
            this.archive = "processed";
            return this;
        }

        SummaryBuilder message(String message) {
            this.message = message;
            return this;
        }

        VipGuestImportSummaryResponse build() {
            return new VipGuestImportSummaryResponse(
                    fileName,
                    totalRows,
                    inserted,
                    updated,
                    deactivated,
                    skipped,
                    errored,
                    archived,
                    archive,
                    message);
        }
    }
}
