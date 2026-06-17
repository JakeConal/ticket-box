package com.ticketbox.payment.controller;

import com.ticketbox.payment.dto.OrderStatusResponse;
import com.ticketbox.payment.service.PaymentOrderService;
import com.ticketbox.ticket.dto.OrderTicketResponse;
import com.ticketbox.ticket.service.TicketIssuanceService;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final PaymentOrderService paymentOrderService;
    private final TicketIssuanceService ticketIssuanceService;

    public OrderController(PaymentOrderService paymentOrderService, TicketIssuanceService ticketIssuanceService) {
        this.paymentOrderService = paymentOrderService;
        this.ticketIssuanceService = ticketIssuanceService;
    }

    @GetMapping("/{id}")
    OrderStatusResponse getOrder(@PathVariable UUID id) {
        return paymentOrderService.getOwnedOrder(id);
    }

    @GetMapping("/{id}/tickets")
    List<OrderTicketResponse> getOrderTickets(@PathVariable UUID id) {
        return ticketIssuanceService.getOwnedOrderTickets(id);
    }
}
