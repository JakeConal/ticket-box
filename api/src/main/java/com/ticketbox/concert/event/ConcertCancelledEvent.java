package com.ticketbox.concert.event;

import java.util.UUID;

public record ConcertCancelledEvent(UUID concertId) {
}
