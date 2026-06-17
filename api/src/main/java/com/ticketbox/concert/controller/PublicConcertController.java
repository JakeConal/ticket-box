package com.ticketbox.concert.controller;

import com.ticketbox.concert.dto.ConcertDetailResponse;
import com.ticketbox.concert.dto.ConcertPageResponse;
import com.ticketbox.concert.dto.TicketAvailabilityResponse;
import com.ticketbox.concert.service.ConcertService;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/concerts")
public class PublicConcertController {

    private final ConcertService concertService;

    public PublicConcertController(ConcertService concertService) {
        this.concertService = concertService;
    }

    @GetMapping
    ConcertPageResponse list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return concertService.listPublished(page, size);
    }

    @GetMapping("/{id}")
    ConcertDetailResponse detail(@PathVariable UUID id) {
        return concertService.getPublicDetail(id);
    }

    @GetMapping("/{id}/availability")
    List<TicketAvailabilityResponse> availability(@PathVariable UUID id) {
        return concertService.getAvailability(id);
    }
}
