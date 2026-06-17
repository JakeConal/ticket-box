package com.ticketbox.payment;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "ticketbox.payment")
public class PaymentProperties {

    private String vnpayBaseUrl = "https://sandbox.vnpay.test/pay";
    private String vnpaySecret = "dev-vnpay-secret";
    private String momoBaseUrl = "https://sandbox.momo.test/pay";
    private String momoSecret = "dev-momo-secret";

    public String getVnpayBaseUrl() {
        return vnpayBaseUrl;
    }

    public void setVnpayBaseUrl(String vnpayBaseUrl) {
        this.vnpayBaseUrl = vnpayBaseUrl;
    }

    public String getVnpaySecret() {
        return vnpaySecret;
    }

    public void setVnpaySecret(String vnpaySecret) {
        this.vnpaySecret = vnpaySecret;
    }

    public String getMomoBaseUrl() {
        return momoBaseUrl;
    }

    public void setMomoBaseUrl(String momoBaseUrl) {
        this.momoBaseUrl = momoBaseUrl;
    }

    public String getMomoSecret() {
        return momoSecret;
    }

    public void setMomoSecret(String momoSecret) {
        this.momoSecret = momoSecret;
    }
}
