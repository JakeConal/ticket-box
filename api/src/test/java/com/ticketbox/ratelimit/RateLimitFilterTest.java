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

/**
 * Tests for {@link RateLimitFilter} using an in-memory token bucket instead of Redis,
 * so the filter's concurrency behavior can be verified without external infrastructure.
 */
class RateLimitFilterTest {

    /**
     * Fires many purchase requests concurrently from the same client IP and verifies that
     * exactly the configured burst capacity is allowed through.
     *
     * <p>The default purchase bucket allows 5 requests per window (see
     * {@link RateLimitProperties}), so out of 100 concurrent requests from one IP:
     * <ul>
     *   <li>exactly 5 must reach the downstream filter chain (HTTP 200)</li>
     *   <li>the remaining 95 must be rejected with HTTP 429</li>
     * </ul>
     *
     * <p>This guards against race conditions in the limiter: if token consumption were not
     * atomic, concurrent requests could overdraw the bucket and let more than 5 through.
     */
    @Test
    void concurrentRequestsFromSameIpAllowExactlyConfiguredBurst() throws Exception {
        // Wire the filter with default properties (purchase bucket: 5 requests per 10s)
        // and the in-memory limiter defined below.
        RateLimitProperties properties = new RateLimitProperties();
        RateLimitFilter filter = new RateLimitFilter(
                new InMemoryTokenBucketLimiter(),
                new RateLimitPolicy(properties));

        // Counts how many requests actually reach the downstream filter chain,
        // i.e. were not rejected by the rate limiter.
        AtomicInteger passed = new AtomicInteger();
        FilterChain chain = (request, response) -> passed.incrementAndGet();

        int requestCount = 100;
        var executor = Executors.newFixedThreadPool(24);
        // All worker threads block on this latch so the requests hit the filter
        // at (almost) the same instant, maximizing contention on the bucket.
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            for (int i = 0; i < requestCount; i++) {
                futures.add(executor.submit(() -> {
                    // All requests share the same client IP, so they compete for
                    // a single per-IP bucket keyed by "ip:10.0.0.1".
                    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/tickets/purchase");
                    request.setRemoteAddr("10.0.0.1");
                    MockHttpServletResponse response = new MockHttpServletResponse();
                    start.await();
                    filter.doFilter(request, response, chain);
                    return response.getStatus();
                }));
            }

            // Release all threads at once.
            start.countDown();

            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> future : futures) {
                statuses.add(future.get(10, TimeUnit.SECONDS));
            }

            // Exactly the bucket capacity (5) must be allowed; everything else is throttled.
            assertThat(statuses.stream().filter(status -> status == 200).count()).isEqualTo(5);
            assertThat(statuses.stream().filter(status -> status == 429).count()).isEqualTo(95);
            assertThat(passed.get()).isEqualTo(5);
        } finally {
            executor.shutdownNow();
        }
    }

    /**
     * Thread-safe in-memory stand-in for the Redis-backed {@link TokenBucketLimiter}.
     *
     * <p>It models the simplest possible bucket: each key starts with the configured
     * capacity and tokens are never refilled. That is sufficient for this test because
     * the whole test runs well inside one window and only cares that no more than
     * {@code capacity} requests are admitted.
     */
    private static class InMemoryTokenBucketLimiter implements TokenBucketLimiter {

        private final Map<String, BucketState> buckets = new ConcurrentHashMap<>();

        @Override
        public RateLimitDecision consume(String key, RateLimitProperties.Bucket bucket) {
            // Lazily create one bucket per rate-limit key (e.g. "rate-limit:ip:10.0.0.1").
            BucketState state = buckets.computeIfAbsent(
                    key,
                    ignored -> new BucketState(bucket.capacity(), Instant.now().toEpochMilli()));
            // Synchronize on the bucket so concurrent consume() calls cannot overdraw it;
            // this mirrors the atomicity the real Redis implementation provides via Lua.
            synchronized (state) {
                if (state.tokens <= 0) {
                    return RateLimitDecision.rejected(1);
                }
                state.tokens--;
                return RateLimitDecision.allowed(state.tokens);
            }
        }
    }

    /** Mutable per-key bucket state. {@code updatedAt} is unused because tokens never refill in this stub. */
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
