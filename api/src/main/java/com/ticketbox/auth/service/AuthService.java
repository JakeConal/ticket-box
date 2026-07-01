package com.ticketbox.auth.service;

import com.ticketbox.auth.dto.AuthResponse;
import com.ticketbox.auth.dto.LoginRequest;
import com.ticketbox.auth.dto.RefreshRequest;
import com.ticketbox.auth.dto.RegisterRequest;
import com.ticketbox.auth.model.RefreshToken;
import com.ticketbox.auth.model.User;
import com.ticketbox.auth.model.UserRole;
import com.ticketbox.auth.repository.RefreshTokenRepository;
import com.ticketbox.auth.repository.UserRepository;
import com.ticketbox.auth.security.AuthJwtUtil;
import com.ticketbox.auth.security.UserPrincipal;
import io.jsonwebtoken.Claims;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final AuthJwtUtil authJwtUtil;

    public AuthService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            PasswordEncoder passwordEncoder,
            AuthenticationManager authenticationManager,
            AuthJwtUtil authJwtUtil) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.authJwtUtil = authJwtUtil;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email is already registered");
        }

        User user = new User(
                UUID.randomUUID(),
                email,
                passwordEncoder.encode(request.password()),
                UserRole.AUDIENCE,
                Instant.now());
        userRepository.save(user);
        return issueAndStoreTokens(user);
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(normalizeEmail(request.email()), request.password()));
        UserPrincipal principal = (UserPrincipal) authentication.getPrincipal();
        User user = userRepository.findById(principal.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));
        return issueAndStoreTokens(user);
    }

    @Transactional(noRollbackFor = ResponseStatusException.class)
    public AuthResponse refresh(RefreshRequest request) {
        Claims claims;
        try {
            claims = authJwtUtil.parseRefreshToken(request.refreshToken());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid refresh token");
        }

        UUID userId = UUID.fromString(claims.getSubject());
        String tokenHash = authJwtUtil.hashToken(request.refreshToken());
        RefreshToken token = refreshTokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid refresh token"));

        if (token.isRevoked()) {
            refreshTokenRepository.revokeAllForUser(userId);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token reuse detected");
        }
        if (token.getExpiresAt().isBefore(Instant.now())) {
            token.revoke();
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token expired");
        }
        if (!token.getUser().isEnabled()) {
            refreshTokenRepository.revokeAllForUser(userId);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Account is disabled");
        }

        token.revoke();
        return issueAndStoreTokens(token.getUser());
    }

    private AuthResponse issueAndStoreTokens(User user) {
        AuthJwtUtil.TokenPair tokenPair = authJwtUtil.issueTokenPair(user);
        refreshTokenRepository.save(new RefreshToken(
                UUID.randomUUID(),
                user,
                authJwtUtil.hashToken(tokenPair.refreshToken()),
                tokenPair.refreshTokenExpiresAt(),
                Instant.now()));
        return new AuthResponse(
                user.getId(),
                user.getEmail(),
                user.getRole().name(),
                tokenPair.accessToken(),
                tokenPair.accessTokenExpiresAt(),
                tokenPair.refreshToken(),
                tokenPair.refreshTokenExpiresAt());
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
