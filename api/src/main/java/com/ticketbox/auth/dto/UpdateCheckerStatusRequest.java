package com.ticketbox.auth.dto;

import jakarta.validation.constraints.NotNull;

public record UpdateCheckerStatusRequest(@NotNull Boolean enabled) {
}
