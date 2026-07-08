CREATE TABLE IF NOT EXISTS wompi_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('basic', 'pro')),
  reference TEXT NOT NULL UNIQUE,
  amount_in_cents INTEGER NOT NULL CHECK (amount_in_cents > 0),
  currency TEXT NOT NULL DEFAULT 'COP',
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','pending','approved','declined','voided','error','failed')),
  wompi_transaction_id TEXT,
  wompi_status TEXT,
  checkout_url TEXT,
  raw_event JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wompi_payments_user_created
ON wompi_payments(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wompi_payments_reference
ON wompi_payments(reference);

CREATE INDEX IF NOT EXISTS idx_wompi_payments_transaction
ON wompi_payments(wompi_transaction_id)
WHERE wompi_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wompi_payments_status
ON wompi_payments(status, created_at DESC);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS wompi_customer_email TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_payment_provider TEXT;
