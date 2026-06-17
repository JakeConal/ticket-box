package com.ticketbox.concert.repository;

import com.ticketbox.concert.model.TicketType;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TicketTypeRepository extends JpaRepository<TicketType, UUID> {

    List<TicketType> findByConcertIdOrderByPriceAsc(UUID concertId);

    long countByConcertId(UUID concertId);
}
