package com.ticketbox.checkin.dto;

import java.time.Instant;
import java.util.UUID;

public record CheckinResultResponse(
        UUID clientScanId,
        UUID ticketId,
        String result,
        Instant checkedInAt,
        Instant winningCheckedInAt,
        String message) {
}
