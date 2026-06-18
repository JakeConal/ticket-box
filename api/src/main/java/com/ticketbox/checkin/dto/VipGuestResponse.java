package com.ticketbox.checkin.dto;

import java.time.Instant;
import java.util.UUID;

public record VipGuestResponse(
        UUID id,
        UUID concertId,
        String name,
        String phoneMasked,
        String sponsor,
        String zone,
        boolean entered,
        Instant enteredAt) {
}
