ALTER TABLE users
    ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_users_role_enabled_created_at
    ON users (role, enabled, created_at DESC);
