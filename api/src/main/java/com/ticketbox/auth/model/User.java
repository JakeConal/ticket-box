package com.ticketbox.auth.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserRole role;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "auth_version", nullable = false)
    private int authVersion;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected User() {
    }

    public User(UUID id, String email, String passwordHash, UserRole role, Instant createdAt) {
        this.id = id;
        this.email = email;
        this.passwordHash = passwordHash;
        this.role = role;
        this.enabled = true;
        this.authVersion = 0;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public UserRole getRole() {
        return role;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public int getAuthVersion() {
        return authVersion;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public void invalidateSessions() {
        this.authVersion++;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
