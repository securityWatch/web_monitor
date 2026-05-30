-- API/JSON monitor type + 5-minute rollups for retention

DO $$ BEGIN
    ALTER TYPE monitor_type ADD VALUE 'api_json';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS check_results_rollup_5m (
    org_id          UUID NOT NULL,
    monitor_id      UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    region          VARCHAR(32) NOT NULL DEFAULT 'us-east',
    bucket_at       TIMESTAMPTZ NOT NULL,
    total_count     INT NOT NULL,
    up_count        INT NOT NULL,
    avg_response_ms INT,
    min_response_ms INT,
    max_response_ms INT,
    PRIMARY KEY (monitor_id, region, bucket_at)
);

CREATE INDEX IF NOT EXISTS idx_check_rollup_org_time ON check_results_rollup_5m (org_id, bucket_at DESC);
