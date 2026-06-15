package com.ticketbox.platform;

import java.time.Instant;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    @GetMapping("/api/health")
    Map<String, Object> health() {
        return Map.of(
                "status", "UP",
                "service", "ticketbox-api",
                "timestamp", Instant.now());
    }
}
