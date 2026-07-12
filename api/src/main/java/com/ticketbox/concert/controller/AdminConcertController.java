package com.ticketbox.concert.controller;

import com.ticketbox.concert.dto.ConcertDetailResponse;
import com.ticketbox.concert.dto.ConcertRequest;
import com.ticketbox.concert.dto.ConcertStatsResponse;
import com.ticketbox.concert.dto.ConcertSummaryResponse;
import com.ticketbox.concert.dto.TicketTypeRequest;
import com.ticketbox.concert.dto.TicketTypeResponse;
import com.ticketbox.concert.service.ConcertService;
import com.ticketbox.auth.service.OrganizerOwnershipService;
import com.ticketbox.checkin.dto.VipGuestResponse;
import com.ticketbox.checkin.service.VipGuestService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/concerts")
public class AdminConcertController {

    private final ConcertService concertService;
    private final VipGuestService vipGuestService;
    private final OrganizerOwnershipService organizerOwnershipService;

    public AdminConcertController(
            ConcertService concertService,
            VipGuestService vipGuestService,
            OrganizerOwnershipService organizerOwnershipService) {
        this.concertService = concertService;
        this.vipGuestService = vipGuestService;
        this.organizerOwnershipService = organizerOwnershipService;
    }

    @GetMapping
    List<ConcertSummaryResponse> listOwned() {
        return concertService.listOwned();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    ConcertDetailResponse create(@Valid @RequestBody ConcertRequest request) {
        return concertService.createConcert(request);
    }

    @PutMapping("/{id}")
    ConcertDetailResponse update(@PathVariable UUID id, @Valid @RequestBody ConcertRequest request) {
        return concertService.updateConcert(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cancel(@PathVariable UUID id) {
        concertService.cancelConcert(id);
    }

    @DeleteMapping("/{id}/purge")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteConcert(@PathVariable UUID id) {
        concertService.deleteConcert(id);
    }

    @DeleteMapping("/{id}/ticket-types/{typeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteTicketType(@PathVariable UUID id, @PathVariable UUID typeId) {
        concertService.deleteTicketType(id, typeId);
    }

    @PostMapping("/{id}/ticket-types")
    @ResponseStatus(HttpStatus.CREATED)
    TicketTypeResponse createTicketType(
            @PathVariable UUID id,
            @Valid @RequestBody TicketTypeRequest request) {
        return concertService.createTicketType(id, request);
    }

    @PutMapping("/{id}/ticket-types/{typeId}")
    TicketTypeResponse updateTicketType(
            @PathVariable UUID id,
            @PathVariable UUID typeId,
            @Valid @RequestBody TicketTypeRequest request) {
        return concertService.updateTicketType(id, typeId, request);
    }

    @GetMapping("/{id}/stats")
    ConcertStatsResponse stats(@PathVariable UUID id) {
        return concertService.getStats(id);
    }

    @PostMapping("/{id}/publish")
    ConcertDetailResponse publish(@PathVariable UUID id) {
        return concertService.publish(id);
    }

    @GetMapping("/{id}/vip-guests")
    List<VipGuestResponse> listVipGuests(@PathVariable UUID id) {
        organizerOwnershipService.requireOwnedConcert(id);
        return vipGuestService.getVipGuestsByConcert(id);
    }

    @DeleteMapping("/{id}/vip-guests/{guestId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removeVipGuest(@PathVariable UUID id, @PathVariable UUID guestId) {
        organizerOwnershipService.requireOwnedConcert(id);
        vipGuestService.deleteVipGuest(id, guestId);
    }
}
