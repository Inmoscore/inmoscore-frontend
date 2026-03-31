-- Phase 2: aislamiento multi-tenant con integridad referencial y auditoría.
-- Prerrequisito: haber ejecutado migration_phase1_organization_id.sql (columnas TEXT organization_id).
-- Revisar datos: cualquier organization_id TEXT inválido se mapea al UUID legacy.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Tabla organizations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO organizations (id, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'Legacy (datos migrados — asignar org real vía onboarding)')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Auditoría obligatoria
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events (event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_org ON security_events (organization_id);

-- ---------------------------------------------------------------------------
-- 3) Helper: TEXT -> UUID (legacy-org y valores inválidos -> bucket legacy)
-- ---------------------------------------------------------------------------
-- users: permitir NULL (registro sin org hasta onboarding)
ALTER TABLE users
  ALTER COLUMN organization_id TYPE UUID
  USING (
    CASE
      WHEN organization_id IS NULL THEN NULL
      WHEN organization_id::text = 'legacy-org' THEN '00000000-0000-4000-8000-000000000001'::uuid
      WHEN organization_id::text ~ '^[0-9a-fA-F-]{36}$' THEN organization_id::text::uuid
      ELSE '00000000-0000-4000-8000-000000000001'::uuid
    END
  );

ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_organization;
ALTER TABLE users
  ADD CONSTRAINT fk_users_organization
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
  ON DELETE SET NULL;

-- tenants: NOT NULL + FK
ALTER TABLE tenants
  ALTER COLUMN organization_id TYPE UUID
  USING (
    CASE
      WHEN organization_id IS NULL OR organization_id::text = '' THEN '00000000-0000-4000-8000-000000000001'::uuid
      WHEN organization_id::text = 'legacy-org' THEN '00000000-0000-4000-8000-000000000001'::uuid
      WHEN organization_id::text ~ '^[0-9a-fA-F-]{36}$' THEN organization_id::text::uuid
      ELSE '00000000-0000-4000-8000-000000000001'::uuid
    END
  );

ALTER TABLE tenants ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS fk_tenants_org;
ALTER TABLE tenants
  ADD CONSTRAINT fk_tenants_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
  ON DELETE RESTRICT;

-- reports
ALTER TABLE reports
  ALTER COLUMN organization_id TYPE UUID
  USING (
    CASE
      WHEN organization_id IS NULL OR organization_id::text = '' THEN '00000000-0000-4000-8000-000000000001'::uuid
      WHEN organization_id::text = 'legacy-org' THEN '00000000-0000-4000-8000-000000000001'::uuid
      WHEN organization_id::text ~ '^[0-9a-fA-F-]{36}$' THEN organization_id::text::uuid
      ELSE '00000000-0000-4000-8000-000000000001'::uuid
    END
  );

ALTER TABLE reports ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS fk_reports_org;
ALTER TABLE reports
  ADD CONSTRAINT fk_reports_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
  ON DELETE RESTRICT;

-- legal_cases
ALTER TABLE legal_cases
  ALTER COLUMN organization_id TYPE UUID
  USING (
    CASE
      WHEN organization_id IS NULL OR organization_id::text = '' THEN '00000000-0000-4000-8000-000000000001'::uuid
      WHEN organization_id::text = 'legacy-org' THEN '00000000-0000-4000-8000-000000000001'::uuid
      WHEN organization_id::text ~ '^[0-9a-fA-F-]{36}$' THEN organization_id::text::uuid
      ELSE '00000000-0000-4000-8000-000000000001'::uuid
    END
  );

ALTER TABLE legal_cases ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE legal_cases DROP CONSTRAINT IF EXISTS fk_legal_cases_org;
ALTER TABLE legal_cases
  ADD CONSTRAINT fk_legal_cases_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
  ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 4) Índices de aislamiento + rendimiento
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tenants_org_cedula ON tenants (organization_id, cedula);
CREATE INDEX IF NOT EXISTS idx_reports_org_tenant ON reports (organization_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_legal_cases_org_cedula ON legal_cases (organization_id, cedula);

-- ---------------------------------------------------------------------------
-- 5) Consistencia report.tenant_id vs organization_id (defensa en profundidad DB)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_report_tenant_org_match()
RETURNS TRIGGER AS $$
DECLARE
  t_org UUID;
BEGIN
  SELECT organization_id INTO t_org FROM tenants WHERE id = NEW.tenant_id;
  IF t_org IS NULL THEN
    RAISE EXCEPTION 'tenant not found';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM t_org THEN
    RAISE EXCEPTION 'reports.organization_id must match tenants.organization_id';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reports_tenant_org ON reports;
CREATE TRIGGER trg_reports_tenant_org
  BEFORE INSERT OR UPDATE OF tenant_id, organization_id ON reports
  FOR EACH ROW
  EXECUTE PROCEDURE enforce_report_tenant_org_match();
