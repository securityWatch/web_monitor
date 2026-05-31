-- AI productization: usage ledger for billing, controls, and diagnostics.
CREATE TABLE IF NOT EXISTS ai_usage (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID REFERENCES organizations(id) ON DELETE CASCADE,
    feature    VARCHAR(64) NOT NULL,
    status     VARCHAR(16) NOT NULL DEFAULT 'ok',
    detail     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_org_feature ON ai_usage(org_id, feature, created_at DESC);
