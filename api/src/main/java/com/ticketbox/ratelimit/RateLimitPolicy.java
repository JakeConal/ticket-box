package com.ticketbox.ratelimit;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;

@Component
public class RateLimitPolicy {

    private final RateLimitProperties properties;

    public RateLimitPolicy(RateLimitProperties properties) {
        this.properties = properties;
    }

    public RateLimitProperties.Bucket bucketFor(HttpServletRequest request) {
        String path = request.getRequestURI();
        if ("/api/tickets/purchase".equals(path)) {
            return properties.getPurchase();
        }
        if (HttpMethod.GET.matches(request.getMethod()) && path.startsWith("/api/")) {
            return properties.getRead();
        }
        return properties.getDefaults();
    }
}
