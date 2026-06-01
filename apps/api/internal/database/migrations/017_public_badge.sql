-- Add public badge token support for GitHub README embeds.
ALTER TABLE monitors ADD COLUMN IF NOT EXISTS public_badge_token TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_monitors_public_badge_token ON monitors(public_badge_token);
