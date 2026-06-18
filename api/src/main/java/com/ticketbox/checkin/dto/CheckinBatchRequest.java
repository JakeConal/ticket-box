package com.ticketbox.checkin.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public record CheckinBatchRequest(
        @NotEmpty @Size(max = 250) List<@Valid Item> checkins) {

    public record Item(
            UUID ticketId,
            UUID clientScanId,
            String deviceId,
            String gateId,
            String laneId,
            String zone,
            java.time.Instant scannedAtDevice) {
    }
}
