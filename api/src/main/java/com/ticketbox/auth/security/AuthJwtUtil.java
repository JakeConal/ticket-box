package com.ticketbox.auth.security;

import com.ticketbox.auth.AuthProperties;
import com.ticketbox.auth.model.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;
import java.util.Map;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;

@Service
public class AuthJwtUtil {

    private static final String TOKEN_TYPE = "type";
    private static final String ACCESS = "access";
    private static final String REFRESH = "refresh";
    private static final String ADMISSION = "admission";

    private final AuthProperties properties;
    private final SecretKey authKey;
    private final Clock clock;

    public AuthJwtUtil(AuthProperties properties, Clock clock) {
        this.properties = properties;
        this.authKey = keyFromSecret(properties.jwtSecret());
        this.clock = clock;
    }

    public TokenPair issueTokenPair(User user) {
        Instant now = clock.instant();
        Instant accessExpiresAt = now.plus(properties.accessTokenTtl());
        Instant refreshExpiresAt = now.plus(properties.refreshTokenTtl());
        return new TokenPair(
                issue(user, ACCESS, accessExpiresAt, Map.of()),
                accessExpiresAt,
                issue(user, REFRESH, refreshExpiresAt, Map.of()),
                refreshExpiresAt);
    }

    public String issueAdmissionToken(User user, String concertId, Instant expiresAt) {
        return issue(user, ADMISSION, expiresAt, Map.of("concertId", concertId));
    }

    public Claims parseAccessToken(String token) {
        Claims claims = parse(token);
        requireType(claims, ACCESS);
        return claims;
    }

    public Claims parseRefreshToken(String token) {
        Claims claims = parse(token);
        requireType(claims, REFRESH);
        return claims;
    }

    public Claims parseAdmissionToken(String token) {
        Claims claims = parse(token);
        requireType(claims, ADMISSION);
        return claims;
    }

    public String hashToken(String token) {
        byte[] digest = sha256(token.getBytes(StandardCharsets.UTF_8));
        StringBuilder builder = new StringBuilder(digest.length * 2);
        for (byte value : digest) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }

    private String issue(User user, String type, Instant expiresAt, Map<String, Object> extraClaims) {
        Instant now = clock.instant();
        JwtBuilder builder = Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(user.getId().toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiresAt))
                .claim(TOKEN_TYPE, type)
                .claim("email", user.getEmail())
                .claim("role", user.getRole().name())
                .claim("authVersion", user.getAuthVersion());
        extraClaims.forEach(builder::claim);
        return builder.signWith(authKey).compact();
    }

    private Claims parse(String token) {
        return Jwts.parser()
                .clock(() -> Date.from(clock.instant()))
                .verifyWith(authKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private void requireType(Claims claims, String expected) {
        if (!expected.equals(claims.get(TOKEN_TYPE, String.class))) {
            throw new IllegalArgumentException("Unexpected token type");
        }
    }

    private SecretKey keyFromSecret(String secret) {
        return Keys.hmacShaKeyFor(sha256(secret.getBytes(StandardCharsets.UTF_8)));
    }

    private byte[] sha256(byte[] input) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(input);
        } catch (Exception ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }

    public record TokenPair(
            String accessToken,
            Instant accessTokenExpiresAt,
            String refreshToken,
            Instant refreshTokenExpiresAt) {
    }
}
