-- P0: status pages, alert channel extensions, monitor failure tracking

DO $$ BEGIN
    ALTER TYPE alert_channel_type ADD VALUE 'slack';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE alert_channel_type ADD VALUE 'discord';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE monitors ADD COLUMN IF NOT EXISTS consecutive_failures INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS status_pages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name       VARCHAR(128) NOT NULL,
    slug       VARCHAR(64) NOT NULL,
    is_public  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_status_pages_slug ON status_pages(slug);

CREATE TABLE IF NOT EXISTS status_page_monitors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_page_id  UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
    monitor_id      UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    display_name    VARCHAR(128),
    sort_order      INT NOT NULL DEFAULT 0,
    UNIQUE (status_page_id, monitor_id)
);
