-- Phase 1 (SAFE): add organization_id as nullable and backfill legacy-org.
-- This migration is non-breaking: existing queries continue working.

ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS organization_id TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS organization_id TEXT;
ALTER TABLE legal_cases ADD COLUMN IF NOT EXISTS organization_id TEXT;

UPDATE users SET organization_id = 'legacy-org' WHERE organization_id IS NULL;
UPDATE tenants SET organization_id = 'legacy-org' WHERE organization_id IS NULL;
UPDATE reports SET organization_id = 'legacy-org' WHERE organization_id IS NULL;
UPDATE legal_cases SET organization_id = 'legacy-org' WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users (organization_id);
CREATE INDEX IF NOT EXISTS idx_tenants_organization_id ON tenants (organization_id);
CREATE INDEX IF NOT EXISTS idx_reports_organization_id ON reports (organization_id);
CREATE INDEX IF NOT EXISTS idx_legal_cases_organization_id ON legal_cases (organization_id);
