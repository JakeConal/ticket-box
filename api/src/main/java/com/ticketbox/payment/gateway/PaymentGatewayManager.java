package com.ticketbox.payment.gateway;

import com.ticketbox.ticket.dto.PaymentProvider;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import java.time.Duration;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PaymentGatewayManager {

    private final Map<PaymentProvider, PaymentGatewayService> gateways = new EnumMap<>(PaymentProvider.class);
    private final Map<PaymentProvider, CircuitBreaker> circuitBreakers = new EnumMap<>(PaymentProvider.class);

    public PaymentGatewayManager(List<PaymentGatewayService> services) {
        CircuitBreakerConfig config = CircuitBreakerConfig.custom()
                .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.TIME_BASED)
                .slidingWindowSize(10)
                .minimumNumberOfCalls(5)
                .failureRateThreshold(50.0f)
                .waitDurationInOpenState(Duration.ofSeconds(30))
                .permittedNumberOfCallsInHalfOpenState(1)
                .build();
        for (PaymentGatewayService service : services) {
            gateways.put(service.provider(), service);
            circuitBreakers.put(service.provider(), CircuitBreaker.of(service.provider().name(), config));
        }
    }

    public void ensureAvailable(PaymentProvider provider) {
        if (circuit(provider).getState() == CircuitBreaker.State.OPEN) {
            throw paymentUnavailable();
        }
    }

    public String createPaymentUrl(PaymentGatewayRequest request) {
        try {
            return circuit(request.provider()).executeSupplier(() -> gateway(request.provider()).createPaymentUrl(request));
        } catch (CallNotPermittedException ex) {
            throw paymentUnavailable();
        } catch (PaymentGatewayException ex) {
            throw paymentUnavailable();
        }
    }

    public PaymentVerificationResult verifyCallback(PaymentProvider provider, Map<String, String> params) {
        return gateway(provider).verifyCallback(params);
    }

    public PaymentVerificationResult queryTransactionStatus(PaymentGatewayRequest request) {
        try {
            return circuit(request.provider()).executeSupplier(() ->
                    gateway(request.provider()).queryTransactionStatus(request));
        } catch (RuntimeException ex) {
            return PaymentVerificationResult.invalid("Transaction status query failed");
        }
    }

    CircuitBreaker.State state(PaymentProvider provider) {
        return circuit(provider).getState();
    }

    private PaymentGatewayService gateway(PaymentProvider provider) {
        PaymentGatewayService gateway = gateways.get(provider);
        if (gateway == null) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Unsupported payment provider");
        }
        return gateway;
    }

    private CircuitBreaker circuit(PaymentProvider provider) {
        return circuitBreakers.get(provider);
    }

    private ResponseStatusException paymentUnavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Payment temporarily unavailable");
    }
}
