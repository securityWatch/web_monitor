-- Email OTP for registration and password reset (5 min validity; rate limit in app layer)

CREATE TABLE IF NOT EXISTS email_otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('register', 'password_reset')),
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_otp_lookup
    ON email_otp_codes (email, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_otp_rate
    ON email_otp_codes (email, purpose, created_at DESC)
    WHERE used_at IS NULL;
