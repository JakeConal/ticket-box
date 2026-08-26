package com.ticketbox.payment.gateway;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.payment.PaymentProperties;
import com.ticketbox.ticket.dto.PaymentProvider;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MoMoGatewayServiceTest {

    private final PaymentProperties properties = new PaymentProperties();
    private final MoMoGatewayService service = new MoMoGatewayService(properties, new ObjectMapper());

    @Test
    void providerIsMomo() {
        assertThat(service.provider()).isEqualTo(PaymentProvider.MOMO);
    }

    @Test
    void createPaymentUrlRejectsUnconfiguredCredentials() {
        PaymentGatewayRequest request = new PaymentGatewayRequest(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                PaymentProvider.MOMO, BigDecimal.TEN);

        assertThatThrownBy(() -> service.createPaymentUrl(request))
                .isInstanceOf(PaymentGatewayException.class)
                .hasMessageContaining("MoMo sandbox credentials are not configured");
    }

    @Test
    void queryTransactionStatusRejectsUnconfiguredCredentials() {
        PaymentGatewayRequest request = new PaymentGatewayRequest(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                PaymentProvider.MOMO, BigDecimal.TEN);

        assertThatThrownBy(() -> service.queryTransactionStatus(request))
                .isInstanceOf(PaymentGatewayException.class)
                .hasMessageContaining("MoMo sandbox credentials are not configured");
    }

    @Test
    void verifyCallbackRejectsMissingSignature() {
        configureCredentials();
        Map<String, String> params = new LinkedHashMap<>();
        params.put("orderId", UUID.randomUUID().toString());
        params.put("resultCode", "0");

        PaymentVerificationResult result = service.verifyCallback(params);

        assertThat(result.valid()).isFalse();
        assertThat(result.message()).isEqualTo("Invalid MoMo signature");
    }

    @Test
    void verifyCallbackRejectsMismatchedSignature() {
        configureCredentials();
        Map<String, String> params = new LinkedHashMap<>();
        params.put("orderId", UUID.randomUUID().toString());
        params.put("resultCode", "0");
        params.put("signature", "not-the-real-signature");

        PaymentVerificationResult result = service.verifyCallback(params);

        assertThat(result.valid()).isFalse();
        assertThat(result.message()).isEqualTo("Invalid MoMo signature");
    }

    @Test
    void verifyCallbackAcceptsCorrectlySignedSuccessfulPayload() {
        configureCredentials();
        UUID orderId = UUID.randomUUID();
        Map<String, String> params = new LinkedHashMap<>();
        params.put("orderId", orderId.toString());
        params.put("resultCode", "0");
        params.put("transId", "txn-123");
        params.put("signature", callbackSignature(params));

        PaymentVerificationResult result = service.verifyCallback(params);

        assertThat(result.valid()).isTrue();
        assertThat(result.success()).isTrue();
        assertThat(result.orderId()).isEqualTo(orderId);
        assertThat(result.paymentRef()).isEqualTo("txn-123");
    }

    @Test
    void verifyCallbackReportsFailureWhenResultCodeIsNonZero() {
        configureCredentials();
        UUID orderId = UUID.randomUUID();
        Map<String, String> params = new LinkedHashMap<>();
        params.put("orderId", orderId.toString());
        params.put("resultCode", "1");
        params.put("signature", callbackSignature(params));

        PaymentVerificationResult result = service.verifyCallback(params);

        assertThat(result.valid()).isTrue();
        assertThat(result.success()).isFalse();
        assertThat(result.paymentRef()).isEqualTo(orderId.toString());
    }

    private void configureCredentials() {
        properties.getMomo().setPartnerCode("partner-code");
        properties.getMomo().setAccessKey("access-key");
        properties.getMomo().setSecretKey("secret-key");
    }

    /**
     * Mirrors MoMoGatewayService#callbackSignature: every field except accessKey
     * is read from the callback params map itself (defaulting to ""), not from
     * PaymentProperties.
     */
    private String callbackSignature(Map<String, String> params) {
        String raw = "accessKey=" + properties.getMomo().getAccessKey()
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
        return SignatureUtil.hmac("HmacSHA256", properties.getMomo().getSecretKey(), raw);
    }
}
