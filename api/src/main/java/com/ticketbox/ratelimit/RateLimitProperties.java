package com.ticketbox.ratelimit;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "ticketbox.rate-limit")
public class RateLimitProperties {

    private Bucket purchase = new Bucket(5, Duration.ofSeconds(10));
    private Bucket read = new Bucket(60, Duration.ofMinutes(1));
    private Bucket defaults = new Bucket(30, Duration.ofSeconds(10));

    public Bucket getPurchase() {
        return purchase;
    }

    public void setPurchase(Bucket purchase) {
        this.purchase = purchase;
    }

    public Bucket getRead() {
        return read;
    }

    public void setRead(Bucket read) {
        this.read = read;
    }

    public Bucket getDefaults() {
        return defaults;
    }

    public void setDefaults(Bucket defaults) {
        this.defaults = defaults;
    }

    public record Bucket(int capacity, Duration window) {
    }
}
