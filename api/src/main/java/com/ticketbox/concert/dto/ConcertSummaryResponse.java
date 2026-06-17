package com.ticketbox.concert.dto;

import com.ticketbox.concert.model.Concert;
import com.ticketbox.concert.model.ConcertStatus;
import java.time.Instant;
import java.util.UUID;

public record ConcertSummaryResponse(
        UUID id,
        String name,
        String venue,
        Instant eventDate,
        ConcertStatus status,
        String eventCode,
        String artistBio) {

    public static ConcertSummaryResponse from(Concert concert) {
        return new ConcertSummaryResponse(
                concert.getId(),
                concert.getName(),
                concert.getVenue(),
                concert.getEventDate(),
                concert.getStatus(),
                concert.getEventCode(),
                concert.getArtistBio());
    }
}
