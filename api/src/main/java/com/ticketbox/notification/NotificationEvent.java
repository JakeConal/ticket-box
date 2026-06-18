package com.ticketbox.notification;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public record NotificationEvent(
        String eventType,
        UUID recipientUserId,
        String recipientEmail,
        UUID orderId,
        UUID concertId,
        String title,
        String body,
        String deepLink,
        List<Attachment> attachments,
        Map<String, Object> metadata) {

    public NotificationEvent {
        attachments = attachments == null ? List.of() : List.copyOf(attachments);
        metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
    }

    public record Attachment(String fileName, String contentType, String base64Content) {
    }
}
