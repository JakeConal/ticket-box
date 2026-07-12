package com.ticketbox.notification;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.notification.config.NotificationPubSubConfig;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Component
public class InAppNotificationBroker {

    private final Map<UUID, CopyOnWriteArrayList<SseEmitter>> emitters = new ConcurrentHashMap<>();
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public InAppNotificationBroker(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    public SseEmitter subscribe(UUID userId) {
        SseEmitter emitter = new SseEmitter(0L);
        emitters.computeIfAbsent(userId, ignored -> new CopyOnWriteArrayList<>()).add(emitter);
        emitter.onCompletion(() -> remove(userId, emitter));
        emitter.onTimeout(() -> remove(userId, emitter));
        emitter.onError(ignored -> remove(userId, emitter));
        return emitter;
    }

    public void send(NotificationEvent event) {
        try {
            String jsonPayload = objectMapper.writeValueAsString(event);
            redisTemplate.convertAndSend(NotificationPubSubConfig.CHANNEL_NAME, jsonPayload);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to publish event to Redis topic", ex);
        }
    }

    public void sendLocal(NotificationEvent event) {
        List<SseEmitter> userEmitters = emitters.getOrDefault(event.recipientUserId(), new CopyOnWriteArrayList<>());
        for (SseEmitter emitter : userEmitters) {
            try {
                emitter.send(SseEmitter.event()
                        .name(event.eventType())
                        .data(Map.of(
                                "title", event.title(),
                                "body", event.body(),
                                "deepLink", event.deepLink() == null ? "" : event.deepLink(),
                                "metadata", event.metadata())));
            } catch (IOException | IllegalStateException ex) {
                remove(event.recipientUserId(), emitter);
            }
        }
    }

    private void remove(UUID userId, SseEmitter emitter) {
        List<SseEmitter> userEmitters = emitters.get(userId);
        if (userEmitters != null) {
            userEmitters.remove(emitter);
        }
    }
}
