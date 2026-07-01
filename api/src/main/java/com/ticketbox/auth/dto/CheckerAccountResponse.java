package com.ticketbox.auth.dto;

import com.ticketbox.auth.model.User;
import java.time.Instant;
import java.util.UUID;

public record CheckerAccountResponse(
        UUID id,
        String email,
        boolean enabled,
        Instant createdAt) {

    public static CheckerAccountResponse from(User user) {
        return new CheckerAccountResponse(
                user.getId(),
                user.getEmail(),
                user.isEnabled(),
                user.getCreatedAt());
    }
}
