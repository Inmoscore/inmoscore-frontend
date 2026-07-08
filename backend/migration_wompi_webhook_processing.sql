ALTER TABLE wompi_payments
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

ALTER TABLE wompi_payments
ADD COLUMN IF NOT EXISTS webhook_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wompi_payments_processed_transaction_unique
ON wompi_payments(wompi_transaction_id)
WHERE wompi_transaction_id IS NOT NULL
  AND processed_at IS NOT NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS searches_used_today INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_search_reset TIMESTAMPTZ;
