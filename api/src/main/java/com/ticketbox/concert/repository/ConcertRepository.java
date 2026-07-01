package com.ticketbox.concert.repository;

import com.ticketbox.concert.model.Concert;
import com.ticketbox.concert.model.ConcertStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ConcertRepository extends JpaRepository<Concert, UUID> {

    Page<Concert> findByStatusOrderByEventDateAsc(ConcertStatus status, Pageable pageable);

    List<Concert> findByCreatedByOrderByEventDateAsc(UUID createdBy);

    @Override
    @EntityGraph(attributePaths = "ticketTypes")
    Optional<Concert> findById(UUID id);

    @Modifying
    @Query("""
            update Concert c
            set c.bioStatus = com.ticketbox.concert.model.BioStatus.FAILED,
                c.bioError = 'Generation interrupted - please retry',
                c.updatedAt = :updatedAt
            where c.bioStatus = com.ticketbox.concert.model.BioStatus.GENERATING
              and c.updatedAt < :cutoff
            """)
    int markStuckGeneratingFailed(Instant cutoff, Instant updatedAt);
}
