-- System reports: daily and weekly notification preferences.
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_daily BOOLEAN NOT NULL DEFAULT FALSE;
