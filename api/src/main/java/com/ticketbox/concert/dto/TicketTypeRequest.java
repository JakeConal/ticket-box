package com.ticketbox.concert.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.Instant;

public record TicketTypeRequest(
        @NotBlank String name,
        @NotBlank String zone,
        @NotNull @DecimalMin("0.00") BigDecimal price,
        @Min(1) int totalQuantity,
        Integer remainingQuantity,
        @NotNull Instant saleOpensAt,
        @Min(1) int perUserLimit) {
}
