package com.ticketbox.notification;

import com.ticketbox.concert.event.ConcertCancelledEvent;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class NotificationEventListeners {

    private final NotificationEventFactory eventFactory;
    private final NotificationService notificationService;

    public NotificationEventListeners(
            NotificationEventFactory eventFactory,
            NotificationService notificationService) {
        this.eventFactory = eventFactory;
        this.notificationService = notificationService;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onConcertCancelled(ConcertCancelledEvent event) {
        eventFactory.cancellationEvents(event.concertId()).forEach(notificationService::send);
    }
}
