package com.ticketbox.payment;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "ticketbox.payments")
public class PaymentProperties {

    private Vnpay vnpay = new Vnpay();
    private Momo momo = new Momo();

    public Vnpay getVnpay() {
        return vnpay;
    }

    public void setVnpay(Vnpay vnpay) {
        this.vnpay = vnpay;
    }

    public Momo getMomo() {
        return momo;
    }

    public void setMomo(Momo momo) {
        this.momo = momo;
    }

    public String getVnpayBaseUrl() {
        return vnpay.payUrl;
    }

    public String getVnpayTmnCode() {
        return vnpay.tmnCode == null || vnpay.tmnCode.isBlank()
                ? "DEVTMN01"
                : vnpay.tmnCode;
    }

    public String getVnpaySecret() {
        return vnpay.hashSecret == null || vnpay.hashSecret.isBlank()
                ? "dev-vnpay-secret"
                : vnpay.hashSecret;
    }

    public String getVnpayReturnUrl() {
        return vnpay.returnUrl;
    }

    public String getVnpayIpnUrl() {
        return vnpay.ipnUrl == null || vnpay.ipnUrl.isBlank() ? vnpay.returnUrl : vnpay.ipnUrl;
    }

    public static class Vnpay {

        private String tmnCode = "";
        private String hashSecret = "dev-vnpay-secret";
        private String payUrl = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
        private String returnUrl = "http://localhost:8088/api/payments/vnpay/callback";
        private String ipnUrl = "http://localhost:8088/api/payments/vnpay/ipn";

        public String getTmnCode() {
            return tmnCode;
        }

        public void setTmnCode(String tmnCode) {
            this.tmnCode = tmnCode;
        }

        public String getHashSecret() {
            return hashSecret;
        }

        public void setHashSecret(String hashSecret) {
            this.hashSecret = hashSecret;
        }

        public String getPayUrl() {
            return payUrl;
        }

        public void setPayUrl(String payUrl) {
            this.payUrl = payUrl;
        }

        public String getReturnUrl() {
            return returnUrl;
        }

        public void setReturnUrl(String returnUrl) {
            this.returnUrl = returnUrl;
        }

        public String getIpnUrl() {
            return ipnUrl;
        }

        public void setIpnUrl(String ipnUrl) {
            this.ipnUrl = ipnUrl;
        }
    }

    public static class Momo {

        private String partnerCode = "";
        private String accessKey = "";
        private String secretKey = "";
        private String endpoint = "https://test-payment.momo.vn/v2/gateway/api/create";
        private String queryEndpoint = "https://test-payment.momo.vn/v2/gateway/api/query";
        private String returnUrl = "http://localhost:8088/api/payments/momo/callback";
        private String ipnUrl = "http://localhost:8088/api/payments/momo/callback";

        public String getPartnerCode() {
            return partnerCode;
        }

        public void setPartnerCode(String partnerCode) {
            this.partnerCode = partnerCode;
        }

        public String getAccessKey() {
            return accessKey;
        }

        public void setAccessKey(String accessKey) {
            this.accessKey = accessKey;
        }

        public String getSecretKey() {
            return secretKey;
        }

        public void setSecretKey(String secretKey) {
            this.secretKey = secretKey;
        }

        public String getEndpoint() {
            return endpoint;
        }

        public void setEndpoint(String endpoint) {
            this.endpoint = endpoint;
        }

        public String getQueryEndpoint() {
            return queryEndpoint;
        }

        public void setQueryEndpoint(String queryEndpoint) {
            this.queryEndpoint = queryEndpoint;
        }

        public String getReturnUrl() {
            return returnUrl;
        }

        public void setReturnUrl(String returnUrl) {
            this.returnUrl = returnUrl;
        }

        public String getIpnUrl() {
            return ipnUrl == null || ipnUrl.isBlank() ? returnUrl : ipnUrl;
        }

        public void setIpnUrl(String ipnUrl) {
            this.ipnUrl = ipnUrl;
        }
    }
}
