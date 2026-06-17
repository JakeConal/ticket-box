package com.ticketbox.payment.gateway;

import com.ticketbox.ticket.dto.PaymentProvider;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

class PaymentGatewayManagerTest {

    @Test
    void circuitBreakerOpensAfterRepeatedGatewayFailures() {
        PaymentGatewayManager manager = new PaymentGatewayManager(List.of(new FailingGateway()));
        PaymentGatewayRequest request = new PaymentGatewayRequest(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                PaymentProvider.VNPAY,
                BigDecimal.TEN);

        for (int i = 0; i < 5; i++) {
            Throwable failure = catchThrowable(() -> manager.createPaymentUrl(request));
            assertThat(failure)
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                    .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        }

        assertThat(manager.state(PaymentProvider.VNPAY)).isEqualTo(CircuitBreaker.State.OPEN);
        Throwable blocked = catchThrowable(() -> manager.ensureAvailable(PaymentProvider.VNPAY));
        assertThat(blocked)
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }

    private static class FailingGateway implements PaymentGatewayService {

        @Override
        public PaymentProvider provider() {
            return PaymentProvider.VNPAY;
        }

        @Override
        public String createPaymentUrl(PaymentGatewayRequest request) {
            throw new PaymentGatewayException("gateway down");
        }

        @Override
        public PaymentVerificationResult verifyCallback(Map<String, String> params) {
            return PaymentVerificationResult.invalid("unused");
        }
    }
}
