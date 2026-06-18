package com.ticketbox.ticket.dto;

import java.time.Instant;
import java.util.UUID;

public record QueueStatusResponse(
        UUID concertId,
        boolean active,
        Long position,
        Long estimatedWaitSeconds,
        boolean admitted,
        String admissionToken,
        Instant admissionExpiresAt) {
}
