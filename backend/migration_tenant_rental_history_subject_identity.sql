-- Subject identity expansion for verified rental histories.
-- These fields support natural persons, legal entities, and foreign documents
-- without breaking backward compatibility with tenant_rental_histories.cedula_inquilino.

ALTER TABLE tenant_rental_histories
  ADD COLUMN IF NOT EXISTS subject_type text NOT NULL DEFAULT 'natural_person',
  ADD COLUMN IF NOT EXISTS subject_document_type text NOT NULL DEFAULT 'CC',
  ADD COLUMN IF NOT EXISTS subject_document_number text,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'lessor_reported';

UPDATE tenant_rental_histories
SET
  subject_type = COALESCE(NULLIF(subject_type, ''), 'natural_person'),
  subject_document_type = COALESCE(NULLIF(subject_document_type, ''), 'CC'),
  source_type = COALESCE(NULLIF(source_type, ''), 'lessor_reported'),
  subject_document_number = COALESCE(NULLIF(subject_document_number, ''), cedula_inquilino)
WHERE
  subject_type IS NULL
  OR subject_type = ''
  OR subject_document_type IS NULL
  OR subject_document_type = ''
  OR source_type IS NULL
  OR source_type = ''
  OR subject_document_number IS NULL
  OR subject_document_number = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_rental_histories_subject_type_check'
  ) THEN
    ALTER TABLE tenant_rental_histories
      ADD CONSTRAINT tenant_rental_histories_subject_type_check
      CHECK (subject_type IN ('natural_person', 'legal_entity'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_rental_histories_subject_document_type_check'
  ) THEN
    ALTER TABLE tenant_rental_histories
      ADD CONSTRAINT tenant_rental_histories_subject_document_type_check
      CHECK (subject_document_type IN ('CC', 'CE', 'NIT', 'PAS', 'PEP', 'PPT', 'TI', 'OTHER'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_rental_histories_source_type_check'
  ) THEN
    ALTER TABLE tenant_rental_histories
      ADD CONSTRAINT tenant_rental_histories_source_type_check
      CHECK (source_type IN ('lessor_reported', 'tenant_self_declared', 'admin_imported'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tenant_rental_histories_subject_type
  ON tenant_rental_histories (subject_type);

CREATE INDEX IF NOT EXISTS idx_tenant_rental_histories_subject_document_lookup
  ON tenant_rental_histories (subject_document_type, subject_document_number);

CREATE INDEX IF NOT EXISTS idx_tenant_rental_histories_source_type
  ON tenant_rental_histories (source_type);

CREATE INDEX IF NOT EXISTS idx_tenant_rental_histories_subject_document_number
  ON tenant_rental_histories (subject_document_number);

COMMENT ON COLUMN tenant_rental_histories.subject_type IS
  'Subject kind for verified rental histories: natural person or legal entity, preserving cedula_inquilino compatibility.';

COMMENT ON COLUMN tenant_rental_histories.subject_document_type IS
  'Document type for Colombian, foreign, business, or other renter identities without renaming cedula_inquilino.';

COMMENT ON COLUMN tenant_rental_histories.subject_document_number IS
  'Normalized subject document number used alongside cedula_inquilino for progressive identity support.';

COMMENT ON COLUMN tenant_rental_histories.source_type IS
  'Origin of the rental history contribution: lessor reported, tenant self-declared, or future administrative import.';
