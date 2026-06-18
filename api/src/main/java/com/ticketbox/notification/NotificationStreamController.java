package com.ticketbox.notification;

import com.ticketbox.auth.security.UserPrincipal;
import com.ticketbox.auth.service.AuthenticatedUserService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/notifications")
public class NotificationStreamController {

    private final AuthenticatedUserService authenticatedUserService;
    private final InAppNotificationBroker broker;

    public NotificationStreamController(
            AuthenticatedUserService authenticatedUserService,
            InAppNotificationBroker broker) {
        this.authenticatedUserService = authenticatedUserService;
        this.broker = broker;
    }

    @GetMapping("/stream")
    SseEmitter stream() {
        UserPrincipal user = authenticatedUserService.requireCurrentUser();
        return broker.subscribe(user.id());
    }
}
