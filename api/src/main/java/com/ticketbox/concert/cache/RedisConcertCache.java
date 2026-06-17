package com.ticketbox.concert.cache;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class RedisConcertCache implements ConcertCache {

    private static final Logger log = LoggerFactory.getLogger(RedisConcertCache.class);

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public RedisConcertCache(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public <T> Optional<T> get(String key, Class<T> type) {
        try {
            String value = redisTemplate.opsForValue().get(key);
            return value == null
                    ? Optional.empty()
                    : Optional.of(objectMapper.readValue(value, type));
        } catch (Exception ex) {
            log.warn("Concert cache read failed for key {}", key, ex);
            return Optional.empty();
        }
    }

    @Override
    public void put(String key, Object value, Duration ttl) {
        try {
            redisTemplate.opsForValue().set(key, objectMapper.writeValueAsString(value), ttl);
        } catch (Exception ex) {
            log.warn("Concert cache write failed for key {}", key, ex);
        }
    }

    @Override
    public void evict(String key) {
        try {
            redisTemplate.delete(key);
        } catch (Exception ex) {
            log.warn("Concert cache eviction failed for key {}", key, ex);
        }
    }

    @Override
    public void evictByPrefix(String prefix) {
        try {
            redisTemplate.delete(redisTemplate.keys(prefix + "*"));
        } catch (Exception ex) {
            log.warn("Concert cache prefix eviction failed for prefix {}", prefix, ex);
        }
    }
}
