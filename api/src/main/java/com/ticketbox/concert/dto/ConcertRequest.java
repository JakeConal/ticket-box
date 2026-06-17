package com.ticketbox.concert.dto;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;

public record ConcertRequest(
        @NotBlank String name,
        String description,
        @NotBlank String venue,
        @NotNull @Future Instant eventDate,
        @NotBlank String eventCode,
        String artistBio,
        @NotBlank String seatMapSvg) {
}
