package com.ticketbox.ticket.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record CheckerKeyBundleResponse(
        UUID concertId,
        Instant validFrom,
        Instant validUntil,
        List<VerificationKey> keys) {

    public record VerificationKey(
            String kid,
            String algorithm,
            String publicKeyPem) {
    }
}
