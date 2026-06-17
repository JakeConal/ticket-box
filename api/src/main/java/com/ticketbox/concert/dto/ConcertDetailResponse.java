package com.ticketbox.concert.dto;

import com.ticketbox.concert.model.Concert;
import com.ticketbox.concert.model.ConcertStatus;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ConcertDetailResponse(
        UUID id,
        String name,
        String description,
        String venue,
        Instant eventDate,
        ConcertStatus status,
        String eventCode,
        String artistBio,
        String seatMapSvg,
        List<TicketTypeResponse> ticketTypes) {

    public static ConcertDetailResponse from(Concert concert) {
        return new ConcertDetailResponse(
                concert.getId(),
                concert.getName(),
                concert.getDescription(),
                concert.getVenue(),
                concert.getEventDate(),
                concert.getStatus(),
                concert.getEventCode(),
                concert.getArtistBio(),
                concert.getSeatMapSvg(),
                concert.getTicketTypes().stream()
                        .map(TicketTypeResponse::from)
                        .toList());
    }
}
