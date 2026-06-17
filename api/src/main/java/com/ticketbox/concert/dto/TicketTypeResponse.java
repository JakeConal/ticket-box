package com.ticketbox.concert.dto;

import com.ticketbox.concert.model.TicketType;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record TicketTypeResponse(
        UUID id,
        String name,
        String zone,
        BigDecimal price,
        int totalQuantity,
        int remainingQuantity,
        Instant saleOpensAt,
        int perUserLimit) {

    public static TicketTypeResponse from(TicketType ticketType) {
        return new TicketTypeResponse(
                ticketType.getId(),
                ticketType.getName(),
                ticketType.getZone(),
                ticketType.getPrice(),
                ticketType.getTotalQuantity(),
                ticketType.getRemainingQuantity(),
                ticketType.getSaleOpensAt(),
                ticketType.getPerUserLimit());
    }
}
