package com.ticketbox.payment.gateway;

import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class SignatureUtilTest {

    @Test
    void canonicalExcludesSignatureKeyAndNullsAndSortsByKey() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("zebra", "1");
        params.put("apple", "2");
        params.put("signature", "should-be-excluded");
        params.put("nullValue", null);

        String canonical = SignatureUtil.canonical(params, "signature");

        assertThat(canonical).isEqualTo("apple=2&zebra=1");
    }

    @Test
    void canonicalOfEmptyMapIsEmptyString() {
        assertThat(SignatureUtil.canonical(Map.of(), "signature")).isEmpty();
    }

    @Test
    void encodedQuerySortsAndUrlEncodesKeysAndValues() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("b", "hello world");
        params.put("a", "x&y");

        String query = SignatureUtil.encodedQuery(params);

        assertThat(query).isEqualTo("a=x%26y&b=hello+world");
    }

    @Test
    void hmacProducesStableLowercaseHexDigestForSameInput() {
        String first = SignatureUtil.hmac("HmacSHA256", "secret", "payload");
        String second = SignatureUtil.hmac("HmacSHA256", "secret", "payload");

        assertThat(first).isEqualTo(second);
        assertThat(first).matches("[0-9a-f]{64}");
    }

    @Test
    void hmacDiffersWhenSecretDiffers() {
        String first = SignatureUtil.hmac("HmacSHA256", "secret-a", "payload");
        String second = SignatureUtil.hmac("HmacSHA256", "secret-b", "payload");

        assertThat(first).isNotEqualTo(second);
    }

    @Test
    void hmacWrapsFailureAsPaymentGatewayException() {
        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> SignatureUtil.hmac("NotARealAlgorithm", "secret", "payload"))
                .isInstanceOf(PaymentGatewayException.class)
                .hasMessage("Could not sign payment payload");
    }
}
