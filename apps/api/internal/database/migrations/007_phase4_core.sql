-- Phase 4: domain/pagespeed monitors, Teams/SMS, incident workflow, on-call, status incidents

DO $$ BEGIN ALTER TYPE monitor_type ADD VALUE 'domain'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE monitor_type ADD VALUE 'pagespeed'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE alert_channel_type ADD VALUE 'teams'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE alert_channel_type ADD VALUE 'sms'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(32) NOT NULL DEFAULT 'investigating';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS post_mortem TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sync_status_page BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS title VARCHAR(255);

CREATE TABLE IF NOT EXISTS incident_timeline (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    kind        VARCHAR(32) NOT NULL,
    message     TEXT NOT NULL,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incident_timeline ON incident_timeline(incident_id, created_at DESC);

CREATE TABLE IF NOT EXISTS incident_monitors (
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    monitor_id  UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    PRIMARY KEY (incident_id, monitor_id)
);

CREATE TABLE IF NOT EXISTS on_call_schedules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                VARCHAR(100) NOT NULL,
    timezone            VARCHAR(50) NOT NULL DEFAULT 'UTC',
    escalation_minutes  INT NOT NULL DEFAULT 15,
    enabled             BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS on_call_rotations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id      UUID NOT NULL REFERENCES on_call_schedules(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position         INT NOT NULL DEFAULT 0,
    escalation_level INT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_on_call_rotations ON on_call_rotations(schedule_id, position);

CREATE TABLE IF NOT EXISTS status_page_incidents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_page_id  UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
    incident_id     UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL,
    impact          VARCHAR(32) NOT NULL DEFAULT 'minor',
    is_public       BOOLEAN NOT NULL DEFAULT true,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sms_usage (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    month      DATE NOT NULL,
    sms_count  INT NOT NULL DEFAULT 0,
    UNIQUE (org_id, month)
);
