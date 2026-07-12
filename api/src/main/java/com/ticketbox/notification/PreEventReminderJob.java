package com.ticketbox.notification;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class PreEventReminderJob {

    private final NotificationEventFactory eventFactory;
    private final NotificationService notificationService;
    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public PreEventReminderJob(
            NotificationEventFactory eventFactory,
            NotificationService notificationService,
            JdbcTemplate jdbcTemplate,
            Clock clock) {
        this.eventFactory = eventFactory;
        this.notificationService = notificationService;
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
    }

    @Scheduled(cron = "${ticketbox.notifications.reminder-cron:0 0 * * * *}")
    @Transactional
    public void dispatchUpcomingReminders() {
        Instant now = Instant.now(clock);
        Instant windowStart = now.plus(Duration.ofHours(22));
        Instant windowEnd = now.plus(Duration.ofHours(26));
        for (NotificationEvent event : eventFactory.reminderEvents(windowStart, windowEnd)) {
            if (event.orderId() != null) {
                int updated = jdbcTemplate.update("""
                        update orders
                        set reminder_sent_at = ?
                        where id = ?
                          and reminder_sent_at is null
                        """, Timestamp.from(now), event.orderId());
                if (updated == 1) {
                    notificationService.send(event);
                }
            }
        }
    }
}
