package com.ticketbox.auth.dto;

import java.time.Instant;
import java.util.UUID;

public record AuthResponse(
        UUID userId,
        String email,
        String role,
        String accessToken,
        Instant accessTokenExpiresAt,
        String refreshToken,
        Instant refreshTokenExpiresAt) {
}
