package com.ticketbox.payment.gateway;

import com.ticketbox.payment.PaymentProperties;
import com.ticketbox.ticket.dto.PaymentProvider;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class MoMoGatewayService implements PaymentGatewayService {

    private static final String SIGNATURE_KEY = "signature";

    private final PaymentProperties properties;

    public MoMoGatewayService(PaymentProperties properties) {
        this.properties = properties;
    }

    @Override
    public PaymentProvider provider() {
        return PaymentProvider.MOMO;
    }

    @Override
    public String createPaymentUrl(PaymentGatewayRequest request) {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("orderId", request.orderId().toString());
        params.put("amount", request.amount().setScale(0, RoundingMode.HALF_UP).toPlainString());
        params.put("orderInfo", "TicketBox order " + request.orderId());
        params.put("resultCode", "0");
        params.put(SIGNATURE_KEY, sign(params));
        return properties.getMomoBaseUrl() + "?" + SignatureUtil.encodedQuery(params);
    }

    @Override
    public PaymentVerificationResult verifyCallback(Map<String, String> params) {
        String signature = params.get(SIGNATURE_KEY);
        if (signature == null || !signature.equals(sign(params))) {
            return PaymentVerificationResult.invalid("Invalid MoMo signature");
        }
        UUID orderId = UUID.fromString(params.get("orderId"));
        boolean success = "0".equals(params.get("resultCode"));
        return new PaymentVerificationResult(
                true,
                success,
                orderId,
                params.getOrDefault("transId", params.get("orderId")),
                success ? "Payment succeeded" : "Payment failed");
    }

    private String sign(Map<String, String> params) {
        return SignatureUtil.hmac(
                "HmacSHA256",
                properties.getMomoSecret(),
                SignatureUtil.canonical(params, SIGNATURE_KEY));
    }
}
