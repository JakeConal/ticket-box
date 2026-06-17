package com.ticketbox.payment.gateway;

import com.ticketbox.ticket.dto.PaymentProvider;
import java.math.BigDecimal;
import java.util.UUID;

public record PaymentGatewayRequest(
        UUID orderId,
        UUID userId,
        UUID concertId,
        PaymentProvider provider,
        BigDecimal amount) {
}
