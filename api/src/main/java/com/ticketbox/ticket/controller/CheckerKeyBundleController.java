package com.ticketbox.ticket.controller;

import com.ticketbox.ticket.dto.CheckerKeyBundleResponse;
import com.ticketbox.ticket.service.CheckerKeyBundleService;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/checker")
public class CheckerKeyBundleController {

    private final CheckerKeyBundleService checkerKeyBundleService;

    public CheckerKeyBundleController(CheckerKeyBundleService checkerKeyBundleService) {
        this.checkerKeyBundleService = checkerKeyBundleService;
    }

    @GetMapping("/key-bundle")
    CheckerKeyBundleResponse getKeyBundle(@RequestParam UUID concertId) {
        return checkerKeyBundleService.getKeyBundle(concertId);
    }
}
