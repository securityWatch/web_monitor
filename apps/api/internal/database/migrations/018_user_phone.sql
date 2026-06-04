-- Add phone number column for WeChat mini program phone login
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
