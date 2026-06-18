package com.ticketbox.ticket.service;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ticketbox.queue")
public class QueueProperties {

    private boolean enabled = true;
    private Duration admissionTokenTtl = Duration.ofMinutes(3);
    private Duration activeWindowBefore = Duration.ofMinutes(5);
    private Duration activeWindowAfter = Duration.ofMinutes(30);
    private int admitBatchSize = 10;
    private Duration admissionDelay = Duration.ofSeconds(1);
    private Duration queueTtl = Duration.ofHours(2);

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public Duration getAdmissionTokenTtl() {
        return admissionTokenTtl;
    }

    public void setAdmissionTokenTtl(Duration admissionTokenTtl) {
        this.admissionTokenTtl = admissionTokenTtl;
    }

    public Duration getActiveWindowBefore() {
        return activeWindowBefore;
    }

    public void setActiveWindowBefore(Duration activeWindowBefore) {
        this.activeWindowBefore = activeWindowBefore;
    }

    public Duration getActiveWindowAfter() {
        return activeWindowAfter;
    }

    public void setActiveWindowAfter(Duration activeWindowAfter) {
        this.activeWindowAfter = activeWindowAfter;
    }

    public int getAdmitBatchSize() {
        return admitBatchSize;
    }

    public void setAdmitBatchSize(int admitBatchSize) {
        this.admitBatchSize = admitBatchSize;
    }

    public Duration getAdmissionDelay() {
        return admissionDelay;
    }

    public void setAdmissionDelay(Duration admissionDelay) {
        this.admissionDelay = admissionDelay;
    }

    public Duration getQueueTtl() {
        return queueTtl;
    }

    public void setQueueTtl(Duration queueTtl) {
        this.queueTtl = queueTtl;
    }
}
