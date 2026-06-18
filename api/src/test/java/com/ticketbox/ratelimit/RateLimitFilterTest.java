package com.ticketbox.ratelimit;

import jakarta.servlet.FilterChain;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.assertj.core.api.Assertions.assertThat;

class RateLimitFilterTest {

    @Test
    void concurrentRequestsFromSameIpAllowExactlyConfiguredBurst() throws Exception {
        RateLimitProperties properties = new RateLimitProperties();
        RateLimitFilter filter = new RateLimitFilter(
                new InMemoryTokenBucketLimiter(),
                new RateLimitPolicy(properties));
        AtomicInteger passed = new AtomicInteger();
        FilterChain chain = (request, response) -> passed.incrementAndGet();

        int requestCount = 100;
        var executor = Executors.newFixedThreadPool(24);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            for (int i = 0; i < requestCount; i++) {
                futures.add(executor.submit(() -> {
                    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/tickets/purchase");
                    request.setRemoteAddr("10.0.0.1");
                    MockHttpServletResponse response = new MockHttpServletResponse();
                    start.await();
                    filter.doFilter(request, response, chain);
                    return response.getStatus();
                }));
            }

            start.countDown();

            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> future : futures) {
                statuses.add(future.get(10, TimeUnit.SECONDS));
            }

            assertThat(statuses.stream().filter(status -> status == 200).count()).isEqualTo(5);
            assertThat(statuses.stream().filter(status -> status == 429).count()).isEqualTo(95);
            assertThat(passed.get()).isEqualTo(5);
        } finally {
            executor.shutdownNow();
        }
    }

    private static class InMemoryTokenBucketLimiter implements TokenBucketLimiter {

        private final Map<String, BucketState> buckets = new ConcurrentHashMap<>();

        @Override
        public RateLimitDecision consume(String key, RateLimitProperties.Bucket bucket) {
            BucketState state = buckets.computeIfAbsent(
                    key,
                    ignored -> new BucketState(bucket.capacity(), Instant.now().toEpochMilli()));
            synchronized (state) {
                if (state.tokens <= 0) {
                    return RateLimitDecision.rejected(1);
                }
                state.tokens--;
                return RateLimitDecision.allowed(state.tokens);
            }
        }
    }

    private static class BucketState {

        private int tokens;
        @SuppressWarnings("unused")
        private final long updatedAt;

        BucketState(int tokens, long updatedAt) {
            this.tokens = tokens;
            this.updatedAt = updatedAt;
        }
    }
}
