package com.ticketbox.payment.dto;

import java.time.Instant;
import java.util.UUID;

public record AdminOrderResponse(
        UUID orderId,
        UUID userId,
        UUID concertId,
        String status,
        String paymentProvider,
        String paymentRef,
        String refundReason,
        Instant createdAt,
        Instant paidAt) {
}
