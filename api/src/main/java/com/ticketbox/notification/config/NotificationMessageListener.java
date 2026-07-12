package com.ticketbox.notification.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.notification.InAppNotificationBroker;
import com.ticketbox.notification.NotificationEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class NotificationMessageListener {

    private static final Logger log = LoggerFactory.getLogger(NotificationMessageListener.class);

    private final InAppNotificationBroker broker;
    private final ObjectMapper objectMapper;

    public NotificationMessageListener(InAppNotificationBroker broker, ObjectMapper objectMapper) {
        this.broker = broker;
        this.objectMapper = objectMapper;
    }

    public void receiveMessage(String message) {
        try {
            NotificationEvent event = objectMapper.readValue(message, NotificationEvent.class);
            log.info("Received broadcasted in-app notification event for user: {}", event.recipientUserId());
            broker.sendLocal(event);
        } catch (Exception ex) {
            log.error("Failed to parse or distribute broadcasted in-app notification event", ex);
        }
    }
}
