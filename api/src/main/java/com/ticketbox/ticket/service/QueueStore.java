package com.ticketbox.ticket.service;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

public interface QueueStore {

    Optional<Double> score(String key, String member);

    void add(String key, String member, double score);

    boolean remove(String key, String member);

    Optional<Long> rank(String key, String member);

    List<String> popMin(String key, int count);

    void setValue(String key, String value, Duration ttl);

    Optional<String> getValue(String key);

    void deleteValue(String key);

    void expire(String key, Duration ttl);
}
