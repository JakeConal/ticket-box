package com.ticketbox.payment.controller;

import com.ticketbox.payment.service.PaymentOrderService;
import com.ticketbox.ticket.dto.PaymentProvider;
import java.util.Map;
import org.springframework.web.server.ResponseStatusException;
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

    @GetMapping("/vnpay/ipn")
    Map<String, String> vnpayIpn(@RequestParam Map<String, String> params) {
        try {
            paymentOrderService.handleCallback(PaymentProvider.VNPAY, params);
            return Map.of("RspCode", "00", "Message", "Confirm Success");
        } catch (ResponseStatusException ex) {
            return Map.of("RspCode", "97", "Message", "Invalid Checksum");
        }
    }

    @PostMapping("/momo/callback")
    Map<String, String> momoCallback(@RequestBody Map<String, String> params) {
        return paymentOrderService.handleCallback(PaymentProvider.MOMO, params);
    }
}
