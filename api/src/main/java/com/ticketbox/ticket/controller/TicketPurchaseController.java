package com.ticketbox.ticket.controller;

import com.ticketbox.ticket.dto.PurchaseRequest;
import com.ticketbox.ticket.dto.PurchaseResponse;
import com.ticketbox.ticket.service.TicketPurchaseService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tickets")
public class TicketPurchaseController {

    private final TicketPurchaseService ticketPurchaseService;

    public TicketPurchaseController(TicketPurchaseService ticketPurchaseService) {
        this.ticketPurchaseService = ticketPurchaseService;
    }

    @PostMapping("/purchase")
    PurchaseResponse purchase(
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody PurchaseRequest request,
            HttpServletResponse response) {
        TicketPurchaseService.PurchaseResult result = ticketPurchaseService.purchase(idempotencyKey, request);
        response.setHeader("Idempotency-Key", result.idempotencyKey());
        response.setHeader(HttpHeaders.LOCATION, result.response().paymentUrl());
        return result.response();
    }
}
