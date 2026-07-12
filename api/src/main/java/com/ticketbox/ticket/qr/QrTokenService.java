package com.ticketbox.ticket.qr;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class QrTokenService {

    private final String keyId;
    private final PrivateKey privateKey;
    private final PublicKey publicKey;
    private final String publicKeyPem;

    public QrTokenService(QrProperties properties) {
        try {
            this.keyId = properties.keyId() == null || properties.keyId().isBlank()
                    ? "local-dev"
                    : properties.keyId();
            KeyPair keyPair = loadOrGenerateKeyPair(properties);
            this.privateKey = keyPair.getPrivate();
            this.publicKey = keyPair.getPublic();
            this.publicKeyPem = toPem("PUBLIC KEY", publicKey.getEncoded());
        } catch (Exception ex) {
            throw new IllegalStateException("Could not initialize QR signing keys", ex);
        }
    }

    public String keyId() {
        return keyId;
    }

    public String publicKeyPem() {
        return publicKeyPem;
    }

    public String issue(QrTicketPayload payload) {
        Instant now = payload.issuedAt();
        return Jwts.builder()
                .header()
                .keyId(keyId)
                .and()
                .id(payload.ticketId().toString())
                .subject(payload.ticketId().toString())
                .issuedAt(Date.from(now))
                .claim("ticketId", payload.ticketId().toString())
                .claim("orderId", payload.orderId().toString())
                .claim("userId", payload.userId().toString())
                .claim("concertId", payload.concertId().toString())
                .claim("ticketType", payload.ticketType())
                .claim("zone", payload.zone())
                .claim("issuedAt", now.toString())
                .signWith(privateKey, Jwts.SIG.RS256)
                .compact();
    }

    public QrTicketPayload verify(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(publicKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return new QrTicketPayload(
                UUID.fromString(claims.get("ticketId", String.class)),
                UUID.fromString(claims.get("orderId", String.class)),
                UUID.fromString(claims.get("userId", String.class)),
                UUID.fromString(claims.get("concertId", String.class)),
                claims.get("ticketType", String.class),
                claims.get("zone", String.class),
                Instant.parse(claims.get("issuedAt", String.class)));
    }

    public Map<String, String> activePublicKey() {
        return Map.of("kid", keyId, "algorithm", "RS256", "publicKeyPem", publicKeyPem);
    }

    private KeyPair loadOrGenerateKeyPair(QrProperties properties) throws Exception {
        Path privatePath = path(properties.privateKeyPath());
        Path publicPath = path(properties.publicKeyPath());
        if (privatePath != null && Files.exists(privatePath)) {
            PrivateKey loadedPrivateKey = readPrivateKey(privatePath);
            PublicKey loadedPublicKey = publicPath != null && Files.exists(publicPath)
                    ? readPublicKey(publicPath)
                    : derivePublicKey(loadedPrivateKey);
            return new KeyPair(loadedPublicKey, loadedPrivateKey);
        }
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair generatedKeyPair = generator.generateKeyPair();
        persistGeneratedKeyPair(generatedKeyPair, privatePath, publicPath);
        return generatedKeyPair;
    }

    private Path path(String value) {
        return value == null || value.isBlank() ? null : Path.of(value);
    }

    private PrivateKey readPrivateKey(Path path) throws Exception {
        byte[] der = readPem(path, "PRIVATE KEY");
        return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(der));
    }

    private PublicKey readPublicKey(Path path) throws Exception {
        byte[] der = readPem(path, "PUBLIC KEY");
        return KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der));
    }

    private PublicKey derivePublicKey(PrivateKey key) throws Exception {
        if (!(key instanceof RSAPrivateCrtKey rsa)) {
            throw new IllegalStateException("QR private key must be an RSA PKCS#8 key");
        }
        return KeyFactory.getInstance("RSA").generatePublic(
                new RSAPublicKeySpec(rsa.getModulus(), rsa.getPublicExponent()));
    }

    private byte[] readPem(Path path, String type) throws Exception {
        String pem = Files.readString(path, StandardCharsets.UTF_8)
                .replace("-----BEGIN " + type + "-----", "")
                .replace("-----END " + type + "-----", "")
                .replaceAll("\\s", "");
        return Base64.getDecoder().decode(pem);
    }

    private void persistGeneratedKeyPair(KeyPair keyPair, Path privatePath, Path publicPath) throws Exception {
        if (privatePath != null) {
            writePem(privatePath, "PRIVATE KEY", keyPair.getPrivate().getEncoded());
        }
        if (publicPath != null) {
            writePem(publicPath, "PUBLIC KEY", keyPair.getPublic().getEncoded());
        }
    }

    private void writePem(Path path, String type, byte[] der) throws Exception {
        Path parent = path.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        Files.writeString(path, toPem(type, der), StandardCharsets.UTF_8);
    }

    private String toPem(String type, byte[] der) {
        return "-----BEGIN " + type + "-----\n"
                + Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.UTF_8)).encodeToString(der)
                + "\n-----END " + type + "-----";
    }
}
