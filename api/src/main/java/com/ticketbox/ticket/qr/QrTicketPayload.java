package com.ticketbox.ticket.qr;

import java.time.Instant;
import java.util.UUID;

public record QrTicketPayload(
        UUID ticketId,
        UUID orderId,
        UUID userId,
        UUID concertId,
        String ticketType,
        String zone,
        Instant issuedAt) {
}
