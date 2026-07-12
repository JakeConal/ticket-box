package com.ticketbox.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class SmsNotificationChannel implements NotificationChannel {

    private static final Logger log = LoggerFactory.getLogger(SmsNotificationChannel.class);

    @Override
    public void send(NotificationEvent event) {
        log.info("Sending SMS notification via SMS Gateway to user: {}. Title: '{}', Body: '{}'",
                event.recipientUserId(), event.title(),
                event.body().substring(0, Math.min(event.body().length(), 40)));
    }
}
