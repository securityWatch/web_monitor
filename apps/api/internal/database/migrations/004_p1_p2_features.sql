-- P1/P2 features: OAuth, heartbeat, maintenance, alert delay, invites, pagerduty

CREATE TABLE IF NOT EXISTS oauth_identities (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider         VARCHAR(32) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_user ON oauth_identities(user_id);

DO $$ BEGIN
    ALTER TYPE monitor_type ADD VALUE 'heartbeat';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE alert_channel_type ADD VALUE 'pagerduty';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE monitors ADD COLUMN IF NOT EXISTS heartbeat_token VARCHAR(64);
ALTER TABLE monitors ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;
ALTER TABLE monitors ADD COLUMN IF NOT EXISTS pending_down_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS delay_minutes INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS maintenance_windows (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    monitor_id UUID REFERENCES monitors(id) ON DELETE CASCADE,
    name       VARCHAR(128) NOT NULL DEFAULT 'Maintenance',
    starts_at  TIMESTAMPTZ NOT NULL,
    ends_at    TIMESTAMPTZ NOT NULL,
    message    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_org ON maintenance_windows(org_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS org_invitations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email      VARCHAR(255) NOT NULL,
    role       member_role NOT NULL DEFAULT 'member',
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    invited_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON org_invitations(email);
