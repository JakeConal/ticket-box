package com.ticketbox.ticket.dto;

import java.time.Instant;
import java.util.UUID;

public record OrderTicketResponse(
        UUID id,
        UUID orderId,
        UUID ticketTypeId,
        String concertName,
        String ticketType,
        String zone,
        String qrToken,
        String qrPngBase64,
        Instant issuedAt) {
}
