package com.ticketbox.ticket.service;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

@Component
public class PurchaseLockRegistry {

    private final Map<String, ReentrantLock> locks = new ConcurrentHashMap<>();

    public <T> T withUserTicketTypeLock(UUID userId, UUID ticketTypeId, Supplier<T> operation) {
        String key = userId + ":" + ticketTypeId;
        ReentrantLock lock = locks.computeIfAbsent(key, ignored -> new ReentrantLock());
        lock.lock();
        try {
            return operation.get();
        } finally {
            lock.unlock();
            if (!lock.hasQueuedThreads()) {
                locks.remove(key, lock);
            }
        }
    }
}
