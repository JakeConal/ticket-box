package com.ticketbox.concert.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record ConcertStatsResponse(
        BigDecimal revenueTotal,
        long checkinCount,
        List<TicketTypeSales> ticketsSoldPerType) {

    public record TicketTypeSales(UUID ticketTypeId, String name, String zone, long soldQuantity) {
    }
}
