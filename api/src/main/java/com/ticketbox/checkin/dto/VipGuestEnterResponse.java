package com.ticketbox.checkin.dto;

import java.time.Instant;
import java.util.UUID;

public record VipGuestEnterResponse(
        UUID id,
        String status,
        Instant enteredAt,
        String message) {
}
