-- Phase 5: distributed probes, artifacts, announcements, on-call ack, SSO, opsgenie/voice

DO $$ BEGIN ALTER TYPE alert_channel_type ADD VALUE 'voice'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE alert_channel_type ADD VALUE 'opsgenie'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Distributed probe task queue
CREATE TABLE IF NOT EXISTS probe_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id      UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    monitor_type    VARCHAR(32) NOT NULL,
    target_url      TEXT NOT NULL,
    interval_seconds INT NOT NULL,
    prev_status     VARCHAR(32) NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}',
    regions         JSONB NOT NULL DEFAULT '[]',
    plan_tier       VARCHAR(32) NOT NULL DEFAULT 'free',
    last_heartbeat_at TIMESTAMPTZ,
    status          VARCHAR(32) NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_probe_runs_status ON probe_runs(status, created_at);

CREATE TABLE IF NOT EXISTS probe_tasks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id      UUID NOT NULL REFERENCES probe_runs(id) ON DELETE CASCADE,
    region      VARCHAR(64) NOT NULL,
    status      VARCHAR(32) NOT NULL DEFAULT 'pending',
    worker_id   VARCHAR(128),
    result      JSONB,
    claimed_at  TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_probe_tasks_claim ON probe_tasks(status, region, created_at);

-- Check artifacts (screenshots)
CREATE TABLE IF NOT EXISTS check_artifacts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    monitor_id  UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    check_id    UUID,
    kind        VARCHAR(32) NOT NULL DEFAULT 'screenshot',
    storage_url TEXT,
    content_type VARCHAR(64) NOT NULL DEFAULT 'image/png',
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_check_artifacts_monitor ON check_artifacts(monitor_id, created_at DESC);

-- Status page manual announcements
CREATE TABLE IF NOT EXISTS status_announcements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_page_id  UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL,
    body            TEXT NOT NULL DEFAULT '',
    kind            VARCHAR(32) NOT NULL DEFAULT 'info',
    is_published    BOOLEAN NOT NULL DEFAULT true,
    starts_at       TIMESTAMPTZ,
    ends_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_status_announcements ON status_announcements(status_page_id, created_at DESC);

-- On-call incident ack / escalation
CREATE TABLE IF NOT EXISTS on_call_alerts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    incident_id     UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    schedule_id     UUID REFERENCES on_call_schedules(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    escalation_level INT NOT NULL DEFAULT 1,
    acked_at        TIMESTAMPTZ,
    escalated_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_on_call_alerts_pending ON on_call_alerts(org_id, acked_at) WHERE acked_at IS NULL;

-- Org SSO OIDC (Business)
CREATE TABLE IF NOT EXISTS org_sso (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    provider        VARCHAR(32) NOT NULL DEFAULT 'oidc',
    issuer_url      TEXT NOT NULL,
    client_id       TEXT NOT NULL,
    client_secret   TEXT NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
