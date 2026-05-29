-- Phase 2: DNS monitor, flapping tracking, alert dedup index

DO $$ BEGIN
    ALTER TYPE monitor_type ADD VALUE 'dns';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE monitors ADD COLUMN IF NOT EXISTS flap_suppressed_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_alert_deliveries_dedup
    ON alert_deliveries (org_id, channel_id, created_at DESC);
