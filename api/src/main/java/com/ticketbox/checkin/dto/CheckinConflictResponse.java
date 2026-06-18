package com.ticketbox.checkin.dto;

import java.time.Instant;
import java.util.UUID;

public record CheckinConflictResponse(
        UUID id,
        UUID clientScanId,
        UUID ticketId,
        UUID attemptedBy,
        Instant attemptedAt,
        String deviceId,
        String gateId,
        String laneId,
        String zone,
        Instant winningCheckedInAt,
        long timeDeltaSeconds,
        Instant createdAt) {
}
