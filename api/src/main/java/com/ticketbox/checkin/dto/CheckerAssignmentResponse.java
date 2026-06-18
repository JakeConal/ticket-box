package com.ticketbox.checkin.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record CheckerAssignmentResponse(
        UUID id,
        UUID concertId,
        UUID checkerId,
        String deviceId,
        String gateId,
        String laneId,
        List<String> allowedZones,
        String state,
        String activationMode,
        Instant activatedAt,
        Instant createdAt) {
}
