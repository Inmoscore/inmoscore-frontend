-- Non-destructive extension for approved payments whose plan activation is deferred
-- until the owning user has a canonical users.email_verified_at timestamp.

BEGIN;

ALTER TABLE wompi_payments
DROP CONSTRAINT IF EXISTS wompi_payments_status_check;

ALTER TABLE wompi_payments
ADD CONSTRAINT wompi_payments_status_check
CHECK (
  status IN (
    'created',
    'pending',
    'approved',
    'approved_pending_email_verification',
    'declined',
    'voided',
    'error',
    'failed'
  )
);

COMMIT;
