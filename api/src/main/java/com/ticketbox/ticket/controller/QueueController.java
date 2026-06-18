package com.ticketbox.ticket.controller;

import com.ticketbox.auth.security.UserPrincipal;
import com.ticketbox.ticket.dto.QueueStatusResponse;
import com.ticketbox.ticket.service.QueueAdmissionService;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/queue")
public class QueueController {

    private final QueueAdmissionService queueAdmissionService;

    public QueueController(QueueAdmissionService queueAdmissionService) {
        this.queueAdmissionService = queueAdmissionService;
    }

    @PostMapping("/{concertId}/enter")
    QueueStatusResponse enter(@PathVariable UUID concertId, @AuthenticationPrincipal UserPrincipal user) {
        return queueAdmissionService.enterQueue(concertId, user);
    }

    @GetMapping("/{concertId}/status")
    QueueStatusResponse status(@PathVariable UUID concertId, @AuthenticationPrincipal UserPrincipal user) {
        return queueAdmissionService.status(concertId, user);
    }
}
