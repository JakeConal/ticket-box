package com.ticketbox.payment.dto;

import java.time.Instant;
import java.util.UUID;

public record OrderStatusResponse(
        UUID orderId,
        UUID concertId,
        String status,
        String paymentProvider,
        String paymentRef,
        Instant createdAt,
        Instant paidAt) {
}
