-- Free tier: max 10 monitors, minimum 5-minute check interval

UPDATE organizations SET monitor_quota = 10 WHERE plan_tier = 'free' AND monitor_quota > 10;

UPDATE monitors m
SET interval_seconds = 300, updated_at = now()
FROM organizations o
WHERE m.org_id = o.id AND o.plan_tier = 'free'
  AND m.interval_seconds < 300
  AND m.type NOT IN ('domain', 'heartbeat');

ALTER TABLE organizations ALTER COLUMN monitor_quota SET DEFAULT 10;
