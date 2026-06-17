package com.ticketbox.payment.gateway;

import com.ticketbox.ticket.dto.PaymentProvider;
import java.util.Map;

public interface PaymentGatewayService {

    PaymentProvider provider();

    String createPaymentUrl(PaymentGatewayRequest request);

    PaymentVerificationResult verifyCallback(Map<String, String> params);

    default PaymentVerificationResult queryTransactionStatus(PaymentGatewayRequest request) {
        return PaymentVerificationResult.invalid("Transaction status is unknown");
    }
}
