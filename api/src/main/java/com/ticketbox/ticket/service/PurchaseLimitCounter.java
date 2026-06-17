package com.ticketbox.ticket.service;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class PurchaseLimitCounter {

    private static final Logger log = LoggerFactory.getLogger(PurchaseLimitCounter.class);

    private final StringRedisTemplate redisTemplate;

    public PurchaseLimitCounter(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public boolean reserve(UUID userId, UUID concertId, UUID ticketTypeId, int quantity, int limit) {
        try {
            String key = key(userId, concertId, ticketTypeId);
            Long value = redisTemplate.opsForValue().increment(key, quantity);
            if (value != null && value > limit) {
                redisTemplate.opsForValue().decrement(key, quantity);
                return false;
            }
            return true;
        } catch (Exception ex) {
            log.warn("Redis per-user limit gate unavailable; falling back to DB guard", ex);
            return true;
        }
    }

    public void release(UUID userId, UUID concertId, UUID ticketTypeId, int quantity) {
        try {
            redisTemplate.opsForValue().decrement(key(userId, concertId, ticketTypeId), quantity);
        } catch (Exception ex) {
            log.warn("Redis per-user limit release failed", ex);
        }
    }

    private String key(UUID userId, UUID concertId, UUID ticketTypeId) {
        return "limit:%s:%s:%s".formatted(userId, concertId, ticketTypeId);
    }
}
