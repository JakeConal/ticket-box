package com.ticketbox.checkin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

public record CheckinRequest(
        @NotNull UUID clientScanId,
        @NotBlank String deviceId,
        @NotBlank String gateId,
        String laneId,
        @NotBlank String zone,
        Instant scannedAtDevice) {
}
