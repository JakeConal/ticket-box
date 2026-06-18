package com.ticketbox.ratelimit;

import com.ticketbox.auth.security.UserPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

    private final TokenBucketLimiter tokenBucketLimiter;
    private final RateLimitPolicy rateLimitPolicy;

    public RateLimitFilter(TokenBucketLimiter tokenBucketLimiter, RateLimitPolicy rateLimitPolicy) {
        this.tokenBucketLimiter = tokenBucketLimiter;
        this.rateLimitPolicy = rateLimitPolicy;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        RateLimitProperties.Bucket bucket = rateLimitPolicy.bucketFor(request);
        RateLimitDecision ipDecision = check("ip:" + clientIp(request), bucket);
        if (!ipDecision.allowed()) {
            reject(response, ipDecision);
            return;
        }

        Optional<String> userId = currentUserId();
        if (userId.isPresent()) {
            RateLimitDecision userDecision = check("user:" + userId.get(), bucket);
            if (!userDecision.allowed()) {
                reject(response, userDecision);
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private RateLimitDecision check(String key, RateLimitProperties.Bucket bucket) {
        try {
            return tokenBucketLimiter.consume("rate-limit:" + key, bucket);
        } catch (RuntimeException ex) {
            log.warn("Rate limit backend unavailable; allowing request", ex);
            return RateLimitDecision.allowed(-1);
        }
    }

    private void reject(HttpServletResponse response, RateLimitDecision decision) throws IOException {
        response.setStatus(429);
        response.setHeader("Retry-After", String.valueOf(decision.retryAfterSeconds()));
        response.setContentType("application/json");
        response.getWriter().write("{\"message\":\"Too many requests\"}");
    }

    private Optional<String> currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof UserPrincipal principal)) {
            return Optional.empty();
        }
        return Optional.of(principal.id().toString());
    }

    private String clientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }
}
