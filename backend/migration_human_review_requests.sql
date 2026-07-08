-- Human review requests for automated-result/score concerns.
-- This table records the operational review workflow only; it does not change
-- scoring inputs, score_normalized, classification, or tenant_current_scores.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS human_review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  requester_email TEXT NOT NULL,
  requester_name TEXT NULL,
  requester_document_id TEXT NULL,
  cedula_consultada TEXT NULL,
  current_score INTEGER NULL,
  current_classification TEXT NULL,
  reason TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  admin_notes TEXT NULL,
  review_summary TEXT NULL,
  resolved_at TIMESTAMPTZ NULL,
  resolved_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  ip_address TEXT NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT human_review_requests_reason_check CHECK (
    reason IN (
      'disputed_information',
      'outdated_information',
      'inaccurate_score',
      'identity_theft',
      'automated_decision_concern',
      'other'
    )
  ),
  CONSTRAINT human_review_requests_status_check CHECK (
    status IN (
      'received',
      'in_review',
      'awaiting_user_info',
      'resolved',
      'rejected'
    )
  ),
  CONSTRAINT human_review_requests_current_score_check CHECK (
    current_score IS NULL OR (current_score >= 0 AND current_score <= 100)
  )
);

CREATE INDEX IF NOT EXISTS idx_human_review_requests_user_id
  ON human_review_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_human_review_requests_requester_email
  ON human_review_requests(requester_email);

CREATE INDEX IF NOT EXISTS idx_human_review_requests_requester_document_id
  ON human_review_requests(requester_document_id);

CREATE INDEX IF NOT EXISTS idx_human_review_requests_status
  ON human_review_requests(status);

CREATE INDEX IF NOT EXISTS idx_human_review_requests_reason
  ON human_review_requests(reason);

CREATE INDEX IF NOT EXISTS idx_human_review_requests_created_at
  ON human_review_requests(created_at DESC);
