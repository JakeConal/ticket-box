package com.ticketbox.payment.gateway;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class PaymentGatewayExceptionTest {

    @Test
    void messageOnlyConstructorSetsMessage() {
        PaymentGatewayException ex = new PaymentGatewayException("boom");

        assertThat(ex.getMessage()).isEqualTo("boom");
        assertThat(ex.getCause()).isNull();
    }

    @Test
    void messageAndCauseConstructorSetsBoth() {
        RuntimeException cause = new RuntimeException("root cause");
        PaymentGatewayException ex = new PaymentGatewayException("boom", cause);

        assertThat(ex.getMessage()).isEqualTo("boom");
        assertThat(ex.getCause()).isSameAs(cause);
    }
}
