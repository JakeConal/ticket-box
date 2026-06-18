package com.ticketbox.checkin.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.UUID;

public record CheckerAssignmentAuditRequest(
        UUID assignmentId,
        String deviceId,
        @NotBlank String action,
        String reason) {
}
