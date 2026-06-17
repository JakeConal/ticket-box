package com.ticketbox.ticket.qr;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ticketbox.qr")
public record QrProperties(
        String keyId,
        String privateKeyPath,
        String publicKeyPath) {
}
