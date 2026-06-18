package com.ticketbox.notification;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThatCode;

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
}
