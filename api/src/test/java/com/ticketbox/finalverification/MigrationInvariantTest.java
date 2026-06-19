package com.ticketbox.finalverification;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class MigrationInvariantTest {

    @Test
    void migrationsDeclareRequiredUniquenessAndAuditColumns() throws Exception {
        String tickets = migration("V7__create_tickets.sql");
        String checkins = migration("V8__create_checkins.sql");
        String vipGuests = migration("V9__create_vip_guests.sql");
        String indexes = migration("V10__add_phase2_indexes.sql");
        String conflicts = migration("V11__create_checkin_conflicts.sql");
        String idempotency = migration("V12__create_idempotency_keys.sql");
        String outbox = migration("V13__create_notification_outbox.sql");
        String checkerAssignments = migration("V15__create_checker_gate_assignments.sql");
        String checkerAudit = migration("V16__create_checker_assignment_audit.sql");

        assertThat(tickets).contains("qr_token text not null", "issued_at timestamptz not null");
        assertThat(indexes).contains(
                "create unique index ux_tickets_qr_token",
                "on tickets(qr_token)",
                "create unique index ux_vip_guests_concert_id_phone_normalized",
                "on vip_guests(concert_id, phone_normalized)");
        assertThat(checkins).contains(
                "client_scan_id uuid not null",
                "constraint uq_checkins_client_scan_id unique (client_scan_id)",
                "constraint uq_checkins_ticket_id unique (ticket_id)",
                "lane_id text",
                "scanned_at_device timestamptz");
        assertThat(vipGuests).contains(
                "active boolean not null default true",
                "entered boolean not null default false");
        assertThat(conflicts).contains(
                "lane_id text",
                "winning_checked_in_at timestamptz not null",
                "create index idx_checkin_conflicts_lane_id");
        assertThat(idempotency).contains("key text primary key");
        assertThat(outbox).contains(
                "event_type varchar(120) not null",
                "payload jsonb not null",
                "status varchar(32) not null",
                "attempts integer not null default 0");
        assertThat(checkerAssignments).contains(
                "allowed_zones text[] not null",
                "activation_mode varchar(32) not null",
                "activated_at timestamptz");
        assertThat(checkerAudit).contains(
                "action varchar(64) not null",
                "reason text",
                "created_at timestamptz not null default now()");
    }

    @Test
    void migrationsAndSeedsKeepPhase18StatusAndFixtureContracts() throws Exception {
        String concerts = migration("V3__create_concerts.sql");
        String orders = migration("V5__create_orders.sql");
        String seedAccounts = migration("V17__seed_auth_accounts.sql");
        String demoSeed = migration("V18__seed_demo_data.sql");
        String assignmentSeed = migration("V19__seed_checker_assignments.sql");

        assertThat(concerts).contains(
                "artist_bio text",
                "artist_bio_draft text",
                "bio_status varchar(32)",
                "bio_error text",
                "bio_generation_id bigint not null default 0",
                "artist_pdf_uri text");
        assertThat(orders).contains(
                "pending_confirmation",
                "refund_required",
                "refunded",
                "payment_provider varchar(32)",
                "refund_reason text",
                "refunded_at timestamptz",
                "refunded_by uuid");
        assertThat(seedAccounts).contains(
                "organizer@ticketbox.vn",
                "checker1@ticketbox.vn",
                "checker2@ticketbox.vn");
        assertThat(demoSeed).contains(
                "audience1@ticketbox.vn",
                "audience2@ticketbox.vn",
                "audience3@ticketbox.vn",
                "atsh-hcm-2026",
                "atvncg-hn-2026",
                "exsh-hcm-2026",
                "cddg-hn-2026",
                "svip",
                "3500000",
                "200",
                "published");
        assertThat(assignmentSeed).contains(
                "checker_gate_assignments",
                "checker_assignment_audit",
                "checker1-device",
                "checker2-device",
                "active",
                "standby");
    }

    private String migration(String fileName) throws Exception {
        return Files.readString(Path.of("src/main/resources/db/migration", fileName))
                .toLowerCase(Locale.ROOT);
    }
}
