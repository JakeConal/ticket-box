package com.ticketbox.payment.controller;

import com.ticketbox.payment.dto.AdminOrderResponse;
import com.ticketbox.payment.service.PaymentOrderService;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/orders")
public class AdminOrderController {

    private final PaymentOrderService paymentOrderService;

    public AdminOrderController(PaymentOrderService paymentOrderService) {
        this.paymentOrderService = paymentOrderService;
    }

    @GetMapping
    List<AdminOrderResponse> listOrders(
            @RequestParam UUID concertId,
            @RequestParam(required = false) String status) {
        return paymentOrderService.listOwnedConcertOrders(concertId, status);
    }

    @PostMapping("/{id}/mark-refunded")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void markRefunded(@PathVariable UUID id) {
        paymentOrderService.markRefunded(id);
    }
}
