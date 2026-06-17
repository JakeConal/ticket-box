package com.ticketbox.ticket.dto;

import java.util.UUID;

public record PurchaseResponse(
        UUID orderId,
        String paymentUrl) {
}
