package com.ticketbox.payment.gateway;

import com.ticketbox.payment.PaymentProperties;
import com.ticketbox.ticket.dto.PaymentProvider;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class VNPayGatewayService implements PaymentGatewayService {

    private static final String SIGNATURE_KEY = "vnp_SecureHash";
    private static final String SIGNATURE_TYPE_KEY = "vnp_SecureHashType";
    private static final DateTimeFormatter VNPAY_DATE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final ZoneId VNPAY_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

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
        LocalDateTime now = LocalDateTime.now(VNPAY_ZONE);
        Map<String, String> params = new LinkedHashMap<>();
        params.put("vnp_Version", "2.1.0");
        params.put("vnp_Command", "pay");
        params.put("vnp_TmnCode", properties.getVnpayTmnCode());
        params.put("vnp_Amount", vnpayAmount(request.amount()));
        params.put("vnp_CreateDate", VNPAY_DATE_FORMAT.format(now));
        params.put("vnp_CurrCode", "VND");
        params.put("vnp_IpAddr", "127.0.0.1");
        params.put("vnp_Locale", "vn");
        params.put("vnp_OrderInfo", "TicketBox order " + request.orderId());
        params.put("vnp_OrderType", "other");
        params.put("vnp_ReturnUrl", properties.getVnpayReturnUrl());
        params.put("vnp_ExpireDate", VNPAY_DATE_FORMAT.format(now.plusMinutes(15)));
        params.put("vnp_TxnRef", txnRef(request.orderId()));
        params.put(SIGNATURE_KEY, signVnpay(params));
        return properties.getVnpayBaseUrl() + "?" + SignatureUtil.encodedQuery(params);
    }

    @Override
    public PaymentVerificationResult verifyCallback(Map<String, String> params) {
        String signature = params.get(SIGNATURE_KEY);
        if (signature == null || !signature.equalsIgnoreCase(signVnpay(params))) {
            return PaymentVerificationResult.invalid("Invalid VNPAY signature");
        }
        UUID orderId = parseTxnRef(params.get("vnp_TxnRef"));
        boolean success = "00".equals(params.get("vnp_ResponseCode"))
                && "00".equals(params.getOrDefault("vnp_TransactionStatus", "00"));
        return new PaymentVerificationResult(
                true,
                success,
                orderId,
                params.getOrDefault("vnp_TransactionNo", params.get("vnp_TxnRef")),
                success ? "Payment succeeded" : "Payment failed");
    }

    private String signVnpay(Map<String, String> params) {
        return SignatureUtil.hmac(
                "HmacSHA512",
                properties.getVnpaySecret(),
                vnpayCanonical(params));
    }

    private String vnpayCanonical(Map<String, String> params) {
        return params.entrySet()
                .stream()
                .filter(entry -> entry.getValue() != null)
                .filter(entry -> !SIGNATURE_KEY.equals(entry.getKey()))
                .filter(entry -> !SIGNATURE_TYPE_KEY.equals(entry.getKey()))
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> encode(entry.getKey()) + "=" + encode(entry.getValue()))
                .collect(Collectors.joining("&"));
    }

    private String vnpayAmount(BigDecimal amount) {
        return amount
                .multiply(BigDecimal.valueOf(100))
                .setScale(0, RoundingMode.HALF_UP)
                .toPlainString();
    }

    private String txnRef(UUID orderId) {
        return orderId.toString().replace("-", "");
    }

    private UUID parseTxnRef(String txnRef) {
        if (txnRef == null || txnRef.isBlank()) {
            throw new PaymentGatewayException("VNPAY transaction reference is missing");
        }
        if (txnRef.length() == 32) {
            return UUID.fromString(txnRef.replaceFirst(
                    "([0-9a-fA-F]{8})([0-9a-fA-F]{4})([0-9a-fA-F]{4})([0-9a-fA-F]{4})([0-9a-fA-F]{12})",
                    "$1-$2-$3-$4-$5"));
        }
        return UUID.fromString(txnRef);
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
