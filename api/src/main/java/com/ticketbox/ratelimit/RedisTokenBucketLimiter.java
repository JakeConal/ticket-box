package com.ticketbox.ratelimit;

import java.time.Clock;
import java.util.List;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

@Component
public class RedisTokenBucketLimiter implements TokenBucketLimiter {

    private static final String LUA = """
            local key = KEYS[1]
            local capacity = tonumber(ARGV[1])
            local window_ms = tonumber(ARGV[2])
            local now_ms = tonumber(ARGV[3])
            local ttl_seconds = math.ceil((window_ms * 2) / 1000)

            local values = redis.call('HMGET', key, 'tokens', 'updated_at')
            local tokens = tonumber(values[1])
            local updated_at = tonumber(values[2])

            if tokens == nil then
              tokens = capacity
              updated_at = now_ms
            end

            local elapsed = math.max(0, now_ms - updated_at)
            local refill = math.floor((elapsed / window_ms) * capacity)
            if refill > 0 then
              tokens = math.min(capacity, tokens + refill)
              updated_at = now_ms
            end

            if tokens <= 0 then
              local retry_after = math.ceil(window_ms / capacity / 1000)
              redis.call('HMSET', key, 'tokens', tokens, 'updated_at', updated_at)
              redis.call('EXPIRE', key, ttl_seconds)
              return {0, tokens, retry_after}
            end

            tokens = tokens - 1
            redis.call('HMSET', key, 'tokens', tokens, 'updated_at', updated_at)
            redis.call('EXPIRE', key, ttl_seconds)
            return {1, tokens, 0}
            """;

    private final StringRedisTemplate redisTemplate;
    private final Clock clock;
    private final DefaultRedisScript<List> script;

    public RedisTokenBucketLimiter(StringRedisTemplate redisTemplate, Clock clock) {
        this.redisTemplate = redisTemplate;
        this.clock = clock;
        this.script = new DefaultRedisScript<>(LUA, List.class);
    }

    @Override
    public RateLimitDecision consume(String key, RateLimitProperties.Bucket bucket) {
        try {
            List<?> result = redisTemplate.execute(
                    script,
                    List.of(key),
                    String.valueOf(bucket.capacity()),
                    String.valueOf(bucket.window().toMillis()),
                    String.valueOf(clock.millis()));
            if (result == null || result.size() < 3) {
                throw new RedisConnectionFailureException("Rate limit script returned no result");
            }
            boolean allowed = number(result.get(0)) == 1;
            long remaining = number(result.get(1));
            long retryAfter = number(result.get(2));
            return allowed
                    ? RateLimitDecision.allowed(remaining)
                    : RateLimitDecision.rejected(retryAfter);
        } catch (RuntimeException ex) {
            throw ex;
        }
    }

    private long number(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        return Long.parseLong(String.valueOf(value));
    }
}
