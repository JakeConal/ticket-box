package com.ticketbox.payment.gateway;

import com.ticketbox.payment.PaymentProperties;
import com.ticketbox.ticket.dto.PaymentProvider;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class VNPayGatewayService implements PaymentGatewayService {

    private static final String SIGNATURE_KEY = "vnp_SecureHash";

    private final PaymentProperties properties;

    public VNPayGatewayService(PaymentProperties properties) {
        this.properties = properties;
    }

    @Override
    public PaymentProvider provider() {
        return PaymentProvider.VNPAY;
    }

    @Override
    public String createPaymentUrl(PaymentGatewayRequest request) {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("vnp_TxnRef", request.orderId().toString());
        params.put("vnp_Amount", request.amount().setScale(0, RoundingMode.HALF_UP).toPlainString());
        params.put("vnp_OrderInfo", "TicketBox order " + request.orderId());
        params.put("vnp_ResponseCode", "00");
        params.put(SIGNATURE_KEY, sign(params));
        return properties.getVnpayBaseUrl() + "?" + SignatureUtil.encodedQuery(params);
    }

    @Override
    public PaymentVerificationResult verifyCallback(Map<String, String> params) {
        String signature = params.get(SIGNATURE_KEY);
        if (signature == null || !signature.equals(sign(params))) {
            return PaymentVerificationResult.invalid("Invalid VNPAY signature");
        }
        UUID orderId = UUID.fromString(params.get("vnp_TxnRef"));
        boolean success = "00".equals(params.get("vnp_ResponseCode"));
        return new PaymentVerificationResult(
                true,
                success,
                orderId,
                params.getOrDefault("vnp_TransactionNo", params.get("vnp_TxnRef")),
                success ? "Payment succeeded" : "Payment failed");
    }

    private String sign(Map<String, String> params) {
        return SignatureUtil.hmac(
                "HmacSHA512",
                properties.getVnpaySecret(),
                SignatureUtil.canonical(params, SIGNATURE_KEY));
    }
}
