package com.ticketbox.auth.security;

import com.ticketbox.auth.model.User;
import com.ticketbox.auth.repository.UserRepository;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);

    private final AuthJwtUtil authJwtUtil;
    private final UserRepository userRepository;

    public JwtAuthenticationFilter(AuthJwtUtil authJwtUtil, UserRepository userRepository) {
        this.authJwtUtil = authJwtUtil;
        this.userRepository = userRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            Claims claims = authJwtUtil.parseAccessToken(header.substring(7));
            UUID userId = UUID.fromString(claims.getSubject());
            User user = userRepository.findById(userId).orElseThrow();
            UserPrincipal principal = UserPrincipal.from(user);
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(
                    new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
            SecurityContextHolder.setContext(context);
            log.debug("Authenticated bearer token for user {}", userId);
        } catch (Exception ex) {
            SecurityContextHolder.clearContext();
            log.debug("Failed to authenticate bearer token", ex);
        }

        filterChain.doFilter(request, response);
    }
}
