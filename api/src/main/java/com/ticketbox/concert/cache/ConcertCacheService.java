package com.ticketbox.concert.cache;

import com.ticketbox.concert.dto.ConcertDetailResponse;
import com.ticketbox.concert.dto.ConcertPageResponse;
import com.ticketbox.concert.dto.TicketAvailabilityResponse;
import java.time.Duration;
import java.util.UUID;
import java.util.function.Predicate;
import java.util.function.Supplier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class ConcertCacheService {

    private static final String LIST_PREFIX = "concerts:list:";
    private static final Duration LIST_TTL = Duration.ofMinutes(5);
    private static final Duration DETAIL_TTL = Duration.ofSeconds(60);
    private static final Duration AVAILABILITY_TTL = Duration.ofSeconds(10);

    private final ConcertCache concertCache;

    public ConcertCacheService(ConcertCache concertCache) {
        this.concertCache = concertCache;
    }

    public ConcertPageResponse getListing(int page, int size, Supplier<ConcertPageResponse> loader) {
        String key = listingKey(page, size);
        return concertCache.get(key, ConcertPageResponse.class)
                .orElseGet(() -> {
                    ConcertPageResponse response = loader.get();
                    concertCache.put(key, response, LIST_TTL);
                    return response;
                });
    }

    public ConcertDetailResponse getDetail(
            UUID concertId,
            Supplier<ConcertDetailResponse> loader,
            Predicate<ConcertDetailResponse> cacheable) {
        String key = detailKey(concertId);
        return concertCache.get(key, ConcertDetailResponse.class)
                .orElseGet(() -> {
                    ConcertDetailResponse response = loader.get();
                    if (cacheable.test(response)) {
                        concertCache.put(key, response, DETAIL_TTL);
                    }
                    return response;
                });
    }

    public TicketAvailabilityResponse getAvailability(
            UUID ticketTypeId,
            Supplier<TicketAvailabilityResponse> loader) {
        String key = availabilityKey(ticketTypeId);
        return concertCache.get(key, TicketAvailabilityResponse.class)
                .orElseGet(() -> {
                    TicketAvailabilityResponse response = loader.get();
                    concertCache.put(key, response, AVAILABILITY_TTL);
                    return response;
                });
    }

    public void invalidateConcert(UUID concertId) {
        afterCommit(() -> concertCache.evict(detailKey(concertId)));
    }

    public void invalidateConcertAndListings(UUID concertId) {
        invalidateConcert(concertId);
        invalidateListings();
    }

    public void invalidateListings() {
        afterCommit(() -> concertCache.evictByPrefix(LIST_PREFIX));
    }

    public void invalidateTicketAvailability(UUID ticketTypeId) {
        afterCommit(() -> concertCache.evict(availabilityKey(ticketTypeId)));
    }

    private String listingKey(int page, int size) {
        return LIST_PREFIX + "page:%d:size:%d".formatted(page, size);
    }

    private String detailKey(UUID concertId) {
        return "concerts:detail:" + concertId;
    }

    private String availabilityKey(UUID ticketTypeId) {
        return "tickets:available:" + ticketTypeId;
    }

    private void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }
}
