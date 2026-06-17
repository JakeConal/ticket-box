package com.ticketbox.concert.dto;

import java.util.UUID;

public record TicketAvailabilityResponse(
        UUID ticketTypeId,
        String name,
        String zone,
        int remainingQuantity,
        boolean soldOut) {
}
