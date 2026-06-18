package com.ticketbox.notification;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Component
public class InAppNotificationBroker {

    private final Map<UUID, CopyOnWriteArrayList<SseEmitter>> emitters = new ConcurrentHashMap<>();

    public SseEmitter subscribe(UUID userId) {
        SseEmitter emitter = new SseEmitter(0L);
        emitters.computeIfAbsent(userId, ignored -> new CopyOnWriteArrayList<>()).add(emitter);
        emitter.onCompletion(() -> remove(userId, emitter));
        emitter.onTimeout(() -> remove(userId, emitter));
        emitter.onError(ignored -> remove(userId, emitter));
        return emitter;
    }

    public void send(NotificationEvent event) {
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
