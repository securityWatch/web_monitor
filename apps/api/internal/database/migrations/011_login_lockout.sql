-- Login lockout: 5 failed attempts per (email, IP) → 15 minute lockout (PRD / USER-MANAGEMENT §7.2)

CREATE TABLE IF NOT EXISTS login_lockouts (
    email         VARCHAR(255) NOT NULL,
    ip_address    INET NOT NULL,
    failed_count  INT NOT NULL DEFAULT 0,
    locked_until  TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (email, ip_address)
);

CREATE INDEX IF NOT EXISTS idx_login_lockouts_locked_until ON login_lockouts (locked_until)
    WHERE locked_until IS NOT NULL;
