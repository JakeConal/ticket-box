package com.ticketbox.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetCheckerPasswordRequest(
        @NotBlank @Size(min = 8, max = 128) String password) {
}
