package com.ticketbox.ratelimit;

public interface TokenBucketLimiter {

    RateLimitDecision consume(String key, RateLimitProperties.Bucket bucket);
}
