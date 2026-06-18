package com.ticketbox.notification;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.assertThat;

class NotificationWorkflowTest {

    private static final Instant NOW = Instant.parse("2026-06-18T00:00:00Z");

    private JdbcTemplate jdbcTemplate;
    private NotificationEventFactory eventFactory;
    private RecordingChannel recordingChannel;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource();
        dataSource.setDriverClassName("org.h2.Driver");
        dataSource.setUrl("jdbc:h2:mem:notification-test-" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1");
        dataSource.setUsername("sa");
        dataSource.setPassword("");
        jdbcTemplate = new JdbcTemplate(dataSource);
        eventFactory = new NotificationEventFactory(jdbcTemplate);
        recordingChannel = new RecordingChannel();
        createTables();
    }

    @Test
    void reminderJobDispatchesOnlyConcertsInTheReminderWindow() {
        UUID buyerId = insertUser("reminder-buyer@ticketbox.vn");
        UUID inWindowConcertId = insertConcert("Reminder Concert", NOW.plus(Duration.ofHours(24)), "PUBLISHED");
        UUID outsideWindowConcertId = insertConcert("Future Concert", NOW.plus(Duration.ofHours(30)), "PUBLISHED");
        UUID cancelledConcertId = insertConcert("Cancelled Concert", NOW.plus(Duration.ofHours(24)), "CANCELLED");
        insertOrder(buyerId, inWindowConcertId, "PAID");
        insertOrder(buyerId, outsideWindowConcertId, "PAID");
        insertOrder(buyerId, cancelledConcertId, "PAID");

        PreEventReminderJob job = new PreEventReminderJob(
                eventFactory,
                new NotificationService(List.of(recordingChannel)),
                Clock.fixed(NOW, ZoneOffset.UTC));

        job.dispatchUpcomingReminders();

        assertThat(recordingChannel.events()).hasSize(1);
        assertThat(recordingChannel.events().get(0).eventType()).isEqualTo("PRE_EVENT_REMINDER");
        assertThat(recordingChannel.events().get(0).concertId()).isEqualTo(inWindowConcertId);
    }

    @Test
    void outboxRowSurvivesUntilWorkerDeliversIt() {
        UUID buyerId = insertUser("outbox-buyer@ticketbox.vn");
        UUID concertId = insertConcert("Outbox Concert", NOW.plus(Duration.ofDays(3)), "PUBLISHED");
        UUID orderId = insertOrder(buyerId, concertId, "PAID");
        insertTicket(orderId, buyerId);
        NotificationOutboxService outboxService = new NotificationOutboxService(
                jdbcTemplate,
                new ObjectMapper(),
                eventFactory);
        NotificationOutboxWorker worker = new NotificationOutboxWorker(
                jdbcTemplate,
                new ObjectMapper(),
                recordingChannel);

        outboxService.enqueuePurchaseConfirmation(orderId);

        assertThat(jdbcTemplate.queryForObject(
                "select status from notification_outbox where order_id = ?",
                String.class,
                orderId)).isEqualTo("PENDING");

        int delivered = worker.processBatch(10);

        assertThat(delivered).isEqualTo(1);
        assertThat(recordingChannel.events()).hasSize(1);
        assertThat(recordingChannel.events().get(0).attachments()).hasSize(1);
        assertThat(jdbcTemplate.queryForObject(
                "select status from notification_outbox where order_id = ?",
                String.class,
                orderId)).isEqualTo("SENT");
    }

    private UUID insertUser(String email) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
                insert into users (id, email, password_hash, role, created_at)
                values (?, ?, 'hash', 'AUDIENCE', ?)
                """, id, email, NOW);
        return id;
    }

    private UUID insertConcert(String name, Instant eventDate, String status) {
        UUID id = UUID.randomUUID();
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
                    updated_at
                )
                values (?, ?, 'HCMC Stadium', ?, ?, ?, ?, ?, ?)
                """, id, name, eventDate, status, "EVT-" + id, UUID.randomUUID(), NOW, NOW);
        return id;
    }

    private UUID insertOrder(UUID userId, UUID concertId, String status) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
                insert into orders (id, user_id, concert_id, status, created_at, paid_at)
                values (?, ?, ?, ?, ?, ?)
                """, id, userId, concertId, status, NOW, NOW);
        return id;
    }

    private void insertTicket(UUID orderId, UUID userId) {
        UUID ticketTypeId = UUID.randomUUID();
        UUID concertId = jdbcTemplate.queryForObject(
                "select concert_id from orders where id = ?",
                UUID.class,
                orderId);
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
                values (?, ?, 'SVIP', 'SVIP', 3500000, 10, 9, ?, 2, ?)
                """, ticketTypeId, concertId, NOW.minus(Duration.ofDays(1)), NOW);
        jdbcTemplate.update("""
                insert into tickets (id, order_id, ticket_type_id, user_id, qr_token, issued_at)
                values (?, ?, ?, ?, 'qr-token', ?)
                """, UUID.randomUUID(), orderId, ticketTypeId, userId, NOW);
    }

    private void createTables() {
        jdbcTemplate.execute("""
                create table users (
                    id uuid primary key,
                    email varchar(320) not null,
                    password_hash varchar(255) not null,
                    role varchar(32) not null,
                    created_at timestamp not null
                )
                """);
        jdbcTemplate.execute("""
                create table concerts (
                    id uuid primary key,
                    name varchar(255) not null,
                    venue varchar(255) not null,
                    event_date timestamp not null,
                    status varchar(32) not null,
                    event_code varchar(64) not null,
                    created_by uuid not null,
                    created_at timestamp not null,
                    updated_at timestamp not null
                )
                """);
        jdbcTemplate.execute("""
                create table orders (
                    id uuid primary key,
                    user_id uuid not null,
                    concert_id uuid not null,
                    status varchar(32) not null,
                    created_at timestamp not null,
                    paid_at timestamp
                )
                """);
        jdbcTemplate.execute("""
                create table ticket_types (
                    id uuid primary key,
                    concert_id uuid not null,
                    name varchar(80) not null,
                    zone varchar(80) not null,
                    price numeric(12, 2) not null,
                    total_quantity integer not null,
                    remaining_quantity integer not null,
                    sale_opens_at timestamp not null,
                    per_user_limit integer not null,
                    created_at timestamp not null
                )
                """);
        jdbcTemplate.execute("""
                create table tickets (
                    id uuid primary key,
                    order_id uuid not null,
                    ticket_type_id uuid not null,
                    user_id uuid not null,
                    qr_token varchar(4000) not null,
                    issued_at timestamp not null
                )
                """);
        jdbcTemplate.execute("""
                create table notification_outbox (
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

    private static class RecordingChannel implements NotificationChannel {

        private final List<NotificationEvent> events = new ArrayList<>();

        @Override
        public void send(NotificationEvent event) {
            events.add(event);
        }

        List<NotificationEvent> events() {
            return events;
        }
    }
}
