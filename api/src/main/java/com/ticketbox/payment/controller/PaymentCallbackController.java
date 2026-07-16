package com.ticketbox.payment.controller;

import com.ticketbox.payment.service.PaymentOrderService;
import com.ticketbox.ticket.dto.PaymentProvider;
import java.net.URI;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
    ResponseEntity<Void> vnpayCallback(@RequestParam Map<String, String> params) {
        PaymentOrderService.PaymentCallbackResult result =
                paymentOrderService.handleCallback(PaymentProvider.VNPAY, params);
        String paymentStatus = result.success() ? "success" : "failed";
        return ResponseEntity
                .status(HttpStatus.SEE_OTHER)
                .location(URI.create("/orders/" + result.orderId() + "?payment=" + paymentStatus))
                .build();
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
        PaymentOrderService.PaymentCallbackResult result =
                paymentOrderService.handleCallback(PaymentProvider.MOMO, params);
        return Map.of(
                "status", "ok",
                "orderId", result.orderId().toString(),
                "paymentStatus", result.success() ? "success" : "failed");
    }
}
