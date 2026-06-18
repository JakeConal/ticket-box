package com.ticketbox.notification;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final List<NotificationChannel> channels;

    public NotificationService(List<NotificationChannel> channels) {
        this.channels = channels;
    }

    public void send(NotificationEvent event) {
        for (NotificationChannel channel : channels) {
            sendToChannel(channel, event);
        }
    }

    public void sendInApp(NotificationEvent event) {
        for (NotificationChannel channel : channels) {
            if (channel instanceof InAppNotificationChannel) {
                sendToChannel(channel, event);
            }
        }
    }

    private void sendToChannel(NotificationChannel channel, NotificationEvent event) {
        try {
            channel.send(event);
        } catch (Exception ex) {
            log.warn(
                    "Notification channel {} failed for event {}",
                    channel.getClass().getSimpleName(),
                    event.eventType(),
                    ex);
        }
    }
}
