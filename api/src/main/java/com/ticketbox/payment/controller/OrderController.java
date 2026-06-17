package com.ticketbox.payment.controller;

import com.ticketbox.payment.dto.OrderStatusResponse;
import com.ticketbox.payment.service.PaymentOrderService;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final PaymentOrderService paymentOrderService;

    public OrderController(PaymentOrderService paymentOrderService) {
        this.paymentOrderService = paymentOrderService;
    }

    @GetMapping("/{id}")
    OrderStatusResponse getOrder(@PathVariable UUID id) {
        return paymentOrderService.getOwnedOrder(id);
    }
}
