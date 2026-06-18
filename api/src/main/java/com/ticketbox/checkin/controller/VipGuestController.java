package com.ticketbox.checkin.controller;

import com.ticketbox.checkin.dto.VipGuestEnterResponse;
import com.ticketbox.checkin.dto.VipGuestResponse;
import com.ticketbox.checkin.service.VipGuestService;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/vip-guests")
public class VipGuestController {

    private final VipGuestService vipGuestService;

    public VipGuestController(VipGuestService vipGuestService) {
        this.vipGuestService = vipGuestService;
    }

    @GetMapping
    List<VipGuestResponse> search(
            @RequestParam UUID concertId,
            @RequestParam("q") String query) {
        return vipGuestService.search(concertId, query);
    }

    @PostMapping("/{guestId}/enter")
    VipGuestEnterResponse enter(@PathVariable UUID guestId) {
        return vipGuestService.enter(guestId);
    }
}
