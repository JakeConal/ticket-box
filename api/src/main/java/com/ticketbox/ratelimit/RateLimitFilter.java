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

/**
 * Servlet filter that enforces per-client rate limits on all {@code /api/**} endpoints
 * using a token bucket algorithm.
 *
 * <p>Each request is checked against two independent buckets:
 * <ol>
 *   <li><b>IP bucket</b> — keyed by client IP, always checked. Protects against
 *       anonymous abuse and distributed traffic from a single source.</li>
 *   <li><b>User bucket</b> — keyed by authenticated user id, checked only when a
 *       {@link UserPrincipal} is present. Prevents a single account from exhausting
 *       the limit regardless of which IP it comes from.</li>
 * </ol>
 *
 * <p>The bucket size and refill window depend on the endpoint and are resolved by
 * {@link RateLimitPolicy} (purchase endpoints get a tight burst, reads a generous one).
 *
 * <p>Fail-open: if the limiter backend (Redis) throws, the request is allowed through
 * rather than failing every API call because of a rate-limit outage.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

    private final TokenBucketLimiter tokenBucketLimiter;
    private final RateLimitPolicy rateLimitPolicy;

    public RateLimitFilter(TokenBucketLimiter tokenBucketLimiter, RateLimitPolicy rateLimitPolicy) {
        this.tokenBucketLimiter = tokenBucketLimiter;
        this.rateLimitPolicy = rateLimitPolicy;
    }

    /** Rate limiting only applies to API endpoints; static resources and pages pass through untouched. */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        // Pick the bucket configuration (capacity + window) matching this endpoint.
        RateLimitProperties.Bucket bucket = rateLimitPolicy.bucketFor(request);

        // 1) Per-IP check: applies to every request, authenticated or not.
        RateLimitDecision ipDecision = check("ip:" + clientIp(request), bucket);
        if (!ipDecision.allowed()) {
            reject(response, ipDecision);
            return;
        }

        // 2) Per-user check: only when the request carries an authenticated principal.
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

    /**
     * Consumes one token from the bucket identified by {@code key}.
     *
     * <p>Fail-open: any runtime exception from the limiter backend (e.g. Redis down)
     * is logged and treated as "allowed", so a rate-limit infrastructure failure does
     * not take down the whole API.
     */
    private RateLimitDecision check(String key, RateLimitProperties.Bucket bucket) {
        try {
            return tokenBucketLimiter.consume("rate-limit:" + key, bucket);
        } catch (RuntimeException ex) {
            log.warn("Rate limit backend unavailable; allowing request", ex);
            return RateLimitDecision.allowed(-1);
        }
    }

    /** Writes a 429 response with a Retry-After hint and a small JSON error body. */
    private void reject(HttpServletResponse response, RateLimitDecision decision) throws IOException {
        response.setStatus(429);
        response.setHeader("Retry-After", String.valueOf(decision.retryAfterSeconds()));
        response.setContentType("application/json");
        response.getWriter().write("{\"message\":\"Too many requests\"}");
    }

    /** Extracts the authenticated user's id from the security context, if any. */
    private Optional<String> currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof UserPrincipal principal)) {
            return Optional.empty();
        }
        return Optional.of(principal.id().toString());
    }

    /**
     * Resolves the real client IP, honoring proxy headers set by the reverse proxy
     * (nginx): {@code X-Forwarded-For} (first hop = original client) first, then
     * {@code X-Real-IP}, falling back to the socket address for direct connections.
     */
    private String clientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            // X-Forwarded-For is a comma-separated chain; the leftmost entry is the client.
            return forwardedFor.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }
}
