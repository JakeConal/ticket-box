package com.ticketbox.payment.gateway;

import java.util.UUID;

public record PaymentVerificationResult(
        boolean valid,
        boolean success,
        UUID orderId,
        String paymentRef,
        String message) {

    public static PaymentVerificationResult invalid(String message) {
        return new PaymentVerificationResult(false, false, null, null, message);
    }
}
