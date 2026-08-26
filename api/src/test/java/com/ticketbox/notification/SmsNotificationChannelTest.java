package com.ticketbox.notification;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThatCode;

class SmsNotificationChannelTest {

    private final SmsNotificationChannel channel = new SmsNotificationChannel();

    @Test
    void sendLogsWithoutThrowingForShortBody() {
        NotificationEvent event = new NotificationEvent(
                "TEST_EVENT",
                UUID.randomUUID(),
                "user@example.com",
                null,
                null,
                "Title",
                "short body",
                null,
                null,
                null);

        assertThatCode(() -> channel.send(event)).doesNotThrowAnyException();
    }

    @Test
    void sendTruncatesBodyLongerThanFortyCharactersWithoutThrowing() {
        NotificationEvent event = new NotificationEvent(
                "TEST_EVENT",
                UUID.randomUUID(),
                "user@example.com",
                null,
                null,
                "Title",
                "a".repeat(100),
                null,
                null,
                null);

        assertThatCode(() -> channel.send(event)).doesNotThrowAnyException();
    }
}
