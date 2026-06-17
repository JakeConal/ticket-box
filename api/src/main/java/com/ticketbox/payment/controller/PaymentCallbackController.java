package com.ticketbox.payment.controller;

import com.ticketbox.payment.service.PaymentOrderService;
import com.ticketbox.ticket.dto.PaymentProvider;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/payments")
public class PaymentCallbackController {

    private final PaymentOrderService paymentOrderService;

    public PaymentCallbackController(PaymentOrderService paymentOrderService) {
        this.paymentOrderService = paymentOrderService;
    }

    @GetMapping("/vnpay/callback")
    Map<String, String> vnpayCallback(@RequestParam Map<String, String> params) {
        return paymentOrderService.handleCallback(PaymentProvider.VNPAY, params);
    }

    @PostMapping("/momo/callback")
    Map<String, String> momoCallback(@RequestBody Map<String, String> params) {
        return paymentOrderService.handleCallback(PaymentProvider.MOMO, params);
    }
}
