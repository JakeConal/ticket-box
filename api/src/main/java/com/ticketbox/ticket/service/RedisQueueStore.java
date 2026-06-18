package com.ticketbox.ticket.service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.stereotype.Component;

@Component
public class RedisQueueStore implements QueueStore {

    private final StringRedisTemplate redisTemplate;

    public RedisQueueStore(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public Optional<Double> score(String key, String member) {
        return Optional.ofNullable(redisTemplate.opsForZSet().score(key, member));
    }

    @Override
    public void add(String key, String member, double score) {
        redisTemplate.opsForZSet().add(key, member, score);
    }

    @Override
    public Optional<Long> rank(String key, String member) {
        return Optional.ofNullable(redisTemplate.opsForZSet().rank(key, member));
    }

    @Override
    public List<String> popMin(String key, int count) {
        Set<ZSetOperations.TypedTuple<String>> values = redisTemplate.opsForZSet().popMin(key, count);
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        List<String> members = new ArrayList<>();
        for (ZSetOperations.TypedTuple<String> value : values) {
            if (value.getValue() != null) {
                members.add(value.getValue());
            }
        }
        return members;
    }

    @Override
    public void setValue(String key, String value, Duration ttl) {
        redisTemplate.opsForValue().set(key, value, ttl);
    }

    @Override
    public Optional<String> getValue(String key) {
        return Optional.ofNullable(redisTemplate.opsForValue().get(key));
    }

    @Override
    public void expire(String key, Duration ttl) {
        redisTemplate.expire(key, ttl);
    }
}
