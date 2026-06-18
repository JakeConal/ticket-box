package com.ticketbox.checkin.dto;

import jakarta.validation.constraints.NotBlank;

public record CheckerAssignmentStateRequest(
        @NotBlank String state,
        String activationMode,
        String reason) {
}
