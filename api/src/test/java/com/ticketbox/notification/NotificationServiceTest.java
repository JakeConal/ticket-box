package com.ticketbox.notification;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThat;

class NotificationServiceTest {

    @Test
    void channelFailureDoesNotPropagateToCaller() {
        NotificationService service = new NotificationService(List.of(event -> {
            throw new IllegalStateException("mail down");
        }));
        NotificationEvent event = new NotificationEvent(
                "PURCHASE_CONFIRMATION",
                UUID.randomUUID(),
                "buyer@ticketbox.vn",
                UUID.randomUUID(),
                UUID.randomUUID(),
                "Ticket confirmed",
                "Body",
                "/orders/1",
                List.of(),
                java.util.Map.of());

        assertThatCode(() -> service.send(event)).doesNotThrowAnyException();
    }

    @Test
    void sendInAppDoesNotCallEmailChannel() {
        AtomicInteger inAppCalls = new AtomicInteger();
        AtomicInteger emailCalls = new AtomicInteger();
        NotificationService service = new NotificationService(List.of(
                new RecordingInAppNotificationChannel(inAppCalls),
                event -> emailCalls.incrementAndGet()));

        service.sendInApp(event());

        assertThat(inAppCalls.get()).isEqualTo(1);
        assertThat(emailCalls.get()).isZero();
    }

    private NotificationEvent event() {
        return new NotificationEvent(
                "ORDER_PAID",
                UUID.randomUUID(),
                "buyer@ticketbox.vn",
                UUID.randomUUID(),
                UUID.randomUUID(),
                "Payment confirmed",
                "Body",
                "/orders/1",
                List.of(),
                java.util.Map.of());
    }

    private static class RecordingInAppNotificationChannel extends InAppNotificationChannel {

        private final AtomicInteger calls;

        RecordingInAppNotificationChannel(AtomicInteger calls) {
            super(new InAppNotificationBroker(null, new ObjectMapper()));
            this.calls = calls;
        }

        @Override
        public void send(NotificationEvent event) {
            calls.incrementAndGet();
        }
    }
}
