package com.ticketbox.ratelimit;

public record RateLimitDecision(boolean allowed, long remainingTokens, long retryAfterSeconds) {

    public static RateLimitDecision allowed(long remainingTokens) {
        return new RateLimitDecision(true, remainingTokens, 0);
    }

    public static RateLimitDecision rejected(long retryAfterSeconds) {
        return new RateLimitDecision(false, 0, Math.max(1, retryAfterSeconds));
    }
}
