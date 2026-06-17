package com.ticketbox.concert.repository;

import com.ticketbox.concert.model.Concert;
import com.ticketbox.concert.model.ConcertStatus;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConcertRepository extends JpaRepository<Concert, UUID> {

    Page<Concert> findByStatusOrderByEventDateAsc(ConcertStatus status, Pageable pageable);

    @Override
    @EntityGraph(attributePaths = "ticketTypes")
    Optional<Concert> findById(UUID id);
}
