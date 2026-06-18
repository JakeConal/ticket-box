package com.ticketbox.checkin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public record CheckerAssignmentRequest(
        @NotNull UUID checkerId,
        String deviceId,
        @NotBlank String gateId,
        String laneId,
        @NotEmpty @Size(max = 20) List<@NotBlank String> allowedZones,
        @NotBlank String state) {
}
