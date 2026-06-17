package com.ticketbox.ticket.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record PurchaseRequest(
        @NotNull UUID ticketTypeId,
        @Min(1) int quantity,
        @NotNull PaymentProvider paymentProvider,
        String admissionToken) {
}
