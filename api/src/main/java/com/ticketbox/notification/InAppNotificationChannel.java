package com.ticketbox.notification;

import org.springframework.stereotype.Component;

@Component
public class InAppNotificationChannel implements NotificationChannel {

    private final InAppNotificationBroker broker;

    public InAppNotificationChannel(InAppNotificationBroker broker) {
        this.broker = broker;
    }

    @Override
    public void send(NotificationEvent event) {
        broker.send(event);
    }
}
