package com.ticketbox.concert.dto;

import java.util.List;

public record ConcertPageResponse(
        List<ConcertSummaryResponse> content,
        int page,
        int size,
        long totalElements,
        int totalPages) {
}
