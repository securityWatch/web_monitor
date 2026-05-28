-- PulseWatch initial schema (PostgreSQL only, no ClickHouse)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE member_role AS ENUM ('owner', 'admin', 'member', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE monitor_type AS ENUM ('http', 'tcp', 'ping', 'keyword', 'ssl');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE monitor_status AS ENUM ('up', 'down', 'paused', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE incident_status AS ENUM ('open', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE alert_channel_type AS ENUM ('email', 'webhook');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE api_key_scope AS ENUM ('read', 'write', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email             VARCHAR(255) NOT NULL UNIQUE,
    password_hash     VARCHAR(255),
    display_name      VARCHAR(64),
    avatar_url        TEXT,
    timezone          VARCHAR(64) NOT NULL DEFAULT 'UTC',
    email_verified_at TIMESTAMPTZ,
    notify_incidents  BOOLEAN NOT NULL DEFAULT TRUE,
    notify_weekly     BOOLEAN NOT NULL DEFAULT TRUE,
    notify_product    BOOLEAN NOT NULL DEFAULT FALSE,
    notify_ssl        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(128) NOT NULL,
    slug            VARCHAR(64) NOT NULL UNIQUE,
    plan_tier       VARCHAR(32) NOT NULL DEFAULT 'free',
    monitor_quota   INT NOT NULL DEFAULT 15,
    seat_quota      INT NOT NULL DEFAULT 1,
    founding_member BOOLEAN NOT NULL DEFAULT FALSE,
    stripe_customer_id VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role       member_role NOT NULL DEFAULT 'member',
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, org_id)
);

CREATE TABLE IF NOT EXISTS sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_hash VARCHAR(255) NOT NULL,
    user_agent   TEXT,
    ip_address   INET,
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_change_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_email  VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monitors (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name             VARCHAR(128) NOT NULL,
    type             monitor_type NOT NULL DEFAULT 'http',
    target_url       TEXT NOT NULL,
    interval_seconds INT NOT NULL DEFAULT 300,
    status           monitor_status NOT NULL DEFAULT 'pending',
    config           JSONB NOT NULL DEFAULT '{}',
    regions          JSONB NOT NULL DEFAULT '["us-east"]',
    last_checked_at  TIMESTAMPTZ,
    last_response_ms INT,
    next_run_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monitors_org ON monitors(org_id);
CREATE INDEX IF NOT EXISTS idx_monitors_next_run ON monitors(next_run_at) WHERE status != 'paused';

CREATE TABLE IF NOT EXISTS check_results (
    id            UUID NOT NULL DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL,
    monitor_id    UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    checked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    region        VARCHAR(32) NOT NULL DEFAULT 'us-east',
    status_code   INT,
    response_ms   INT,
    is_up         BOOLEAN NOT NULL,
    error_message TEXT,
    metadata      JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (id, checked_at)
) PARTITION BY RANGE (checked_at);

CREATE TABLE IF NOT EXISTS check_results_default PARTITION OF check_results DEFAULT;

CREATE INDEX IF NOT EXISTS idx_check_results_monitor_time ON check_results(monitor_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_check_results_org_time ON check_results(org_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    monitor_id  UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    status      incident_status NOT NULL DEFAULT 'open',
    severity    VARCHAR(32) NOT NULL DEFAULT 'critical',
    message     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_org ON incidents(org_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_monitor ON incidents(monitor_id, started_at DESC);

CREATE TABLE IF NOT EXISTS alert_channels (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name       VARCHAR(128) NOT NULL,
    type       alert_channel_type NOT NULL,
    config     JSONB NOT NULL DEFAULT '{}',
    enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_rules (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    monitor_id UUID REFERENCES monitors(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES alert_channels(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL DEFAULT 'down',
    enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_deliveries (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID NOT NULL,
    incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
    channel_id UUID NOT NULL REFERENCES alert_channels(id) ON DELETE CASCADE,
    status     VARCHAR(32) NOT NULL DEFAULT 'pending',
    payload    JSONB,
    sent_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name         VARCHAR(128) NOT NULL,
    key_prefix   VARCHAR(16) NOT NULL,
    key_hash     VARCHAR(255) NOT NULL,
    scope        api_key_scope NOT NULL DEFAULT 'read',
    last_used_at TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ,
    created_by   UUID REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS founding_counter (
    id    INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    count INT NOT NULL DEFAULT 3847
);

INSERT INTO founding_counter (id, count) VALUES (1, 3847) ON CONFLICT (id) DO NOTHING;
