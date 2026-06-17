package com.ticketbox.payment.gateway;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.payment.PaymentProperties;
import com.ticketbox.ticket.dto.PaymentProvider;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;

@Service
public class MoMoGatewayService implements PaymentGatewayService {

    private static final String CAPTURE_WALLET = "captureWallet";
    private static final String SIGNATURE_KEY = "signature";

    private final PaymentProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public MoMoGatewayService(PaymentProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    @Override
    public PaymentProvider provider() {
        return PaymentProvider.MOMO;
    }

    @Override
    public String createPaymentUrl(PaymentGatewayRequest request) {
        PaymentProperties.Momo momo = properties.getMomo();
        requireConfigured(momo);
        String amount = request.amount().setScale(0, RoundingMode.HALF_UP).toPlainString();
        String orderId = request.orderId().toString();
        String requestId = orderId;
        String orderInfo = "TicketBox order " + orderId;
        String extraData = "";

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("partnerCode", momo.getPartnerCode());
        body.put("requestType", CAPTURE_WALLET);
        body.put("ipnUrl", momo.getIpnUrl());
        body.put("redirectUrl", momo.getReturnUrl());
        body.put("orderId", orderId);
        body.put("amount", Long.parseLong(amount));
        body.put("orderInfo", orderInfo);
        body.put("requestId", requestId);
        body.put("extraData", extraData);
        body.put("lang", "en");
        body.put(SIGNATURE_KEY, createSignature(
                momo.getAccessKey(),
                amount,
                extraData,
                momo.getIpnUrl(),
                orderId,
                orderInfo,
                momo.getPartnerCode(),
                momo.getReturnUrl(),
                requestId,
                CAPTURE_WALLET,
                momo.getSecretKey()));

        JsonNode response = postJson(momo.getEndpoint(), body);
        int resultCode = response.path("resultCode").asInt(-1);
        if (resultCode != 0) {
            throw new PaymentGatewayException("MoMo create payment failed: " + response.path("message").asText());
        }
        String payUrl = response.path("payUrl").asText();
        if (payUrl == null || payUrl.isBlank()) {
            throw new PaymentGatewayException("MoMo response did not include payUrl");
        }
        return payUrl;
    }

    @Override
    public PaymentVerificationResult verifyCallback(Map<String, String> params) {
        PaymentProperties.Momo momo = properties.getMomo();
        String signature = params.get(SIGNATURE_KEY);
        String expected = callbackSignature(params, momo.getAccessKey(), momo.getSecretKey());
        if (signature == null || !signature.equals(expected)) {
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

    @Override
    public PaymentVerificationResult queryTransactionStatus(PaymentGatewayRequest request) {
        PaymentProperties.Momo momo = properties.getMomo();
        requireConfigured(momo);
        String orderId = request.orderId().toString();
        String requestId = UUID.randomUUID().toString();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("partnerCode", momo.getPartnerCode());
        body.put("requestId", requestId);
        body.put("orderId", orderId);
        body.put("lang", "en");
        body.put(SIGNATURE_KEY, querySignature(
                momo.getAccessKey(),
                orderId,
                momo.getPartnerCode(),
                requestId,
                momo.getSecretKey()));

        JsonNode response = postJson(momo.getQueryEndpoint(), body);
        boolean success = response.path("resultCode").asInt(-1) == 0;
        return new PaymentVerificationResult(
                true,
                success,
                request.orderId(),
                response.path("transId").asText(orderId),
                response.path("message").asText());
    }

    private JsonNode postJson(String endpoint, Map<String, Object> body) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new PaymentGatewayException("MoMo HTTP " + response.statusCode());
            }
            return objectMapper.readTree(response.body());
        } catch (PaymentGatewayException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new PaymentGatewayException("MoMo request failed", ex);
        }
    }

    private void requireConfigured(PaymentProperties.Momo momo) {
        if (isBlank(momo.getPartnerCode()) || isBlank(momo.getAccessKey()) || isBlank(momo.getSecretKey())) {
            throw new PaymentGatewayException("MoMo sandbox credentials are not configured");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private String createSignature(
            String accessKey,
            String amount,
            String extraData,
            String ipnUrl,
            String orderId,
            String orderInfo,
            String partnerCode,
            String redirectUrl,
            String requestId,
            String requestType,
            String secretKey) {
        String raw = "accessKey=" + accessKey
                + "&amount=" + amount
                + "&extraData=" + extraData
                + "&ipnUrl=" + ipnUrl
                + "&orderId=" + orderId
                + "&orderInfo=" + orderInfo
                + "&partnerCode=" + partnerCode
                + "&redirectUrl=" + redirectUrl
                + "&requestId=" + requestId
                + "&requestType=" + requestType;
        return SignatureUtil.hmac("HmacSHA256", secretKey, raw);
    }

    private String callbackSignature(Map<String, String> params, String accessKey, String secretKey) {
        String raw = "accessKey=" + accessKey
                + "&amount=" + params.getOrDefault("amount", "")
                + "&extraData=" + params.getOrDefault("extraData", "")
                + "&message=" + params.getOrDefault("message", "")
                + "&orderId=" + params.getOrDefault("orderId", "")
                + "&orderInfo=" + params.getOrDefault("orderInfo", "")
                + "&orderType=" + params.getOrDefault("orderType", "")
                + "&partnerCode=" + params.getOrDefault("partnerCode", "")
                + "&payType=" + params.getOrDefault("payType", "")
                + "&requestId=" + params.getOrDefault("requestId", "")
                + "&responseTime=" + params.getOrDefault("responseTime", "")
                + "&resultCode=" + params.getOrDefault("resultCode", "")
                + "&transId=" + params.getOrDefault("transId", "");
        return SignatureUtil.hmac("HmacSHA256", secretKey, raw);
    }

    private String querySignature(
            String accessKey,
            String orderId,
            String partnerCode,
            String requestId,
            String secretKey) {
        String raw = "accessKey=" + accessKey
                + "&orderId=" + orderId
                + "&partnerCode=" + partnerCode
                + "&requestId=" + requestId;
        return SignatureUtil.hmac("HmacSHA256", secretKey, raw);
    }
}
