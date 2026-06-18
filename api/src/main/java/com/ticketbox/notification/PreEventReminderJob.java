package com.ticketbox.notification;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class PreEventReminderJob {

    private final NotificationEventFactory eventFactory;
    private final NotificationService notificationService;
    private final Clock clock;
    private final Set<UUID> sentOrderIds = ConcurrentHashMap.newKeySet();

    public PreEventReminderJob(
            NotificationEventFactory eventFactory,
            NotificationService notificationService,
            Clock clock) {
        this.eventFactory = eventFactory;
        this.notificationService = notificationService;
        this.clock = clock;
    }

    @Scheduled(cron = "${ticketbox.notifications.reminder-cron:0 0 * * * *}")
    public void dispatchUpcomingReminders() {
        Instant now = Instant.now(clock);
        Instant windowStart = now.plus(Duration.ofHours(22));
        Instant windowEnd = now.plus(Duration.ofHours(26));
        for (NotificationEvent event : eventFactory.reminderEvents(windowStart, windowEnd)) {
            if (event.orderId() != null && sentOrderIds.add(event.orderId())) {
                notificationService.send(event);
            }
        }
    }
}
