CREATE TABLE IF NOT EXISTS upgrade_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'upgrade_cta_clicked',
      'plan_basic_clicked',
      'plan_pro_clicked',
      'enterprise_clicked'
    )
  ),
  source TEXT NOT NULL CHECK (
    source IN (
      'buscar_limit_card',
      'upgrade_page'
  )
  ),
  plan_type TEXT CHECK (
    plan_type IN ('free', 'basic', 'pro', 'enterprise')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'c'
      AND n.nspname = 'public'
      AND t.relname = 'upgrade_events'
      AND (
        pg_get_constraintdef(c.oid) ILIKE '%event_type%'
        OR pg_get_constraintdef(c.oid) ILIKE '%plan_type%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.upgrade_events DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.upgrade_events
DROP CONSTRAINT IF EXISTS upgrade_events_event_type_check;

ALTER TABLE public.upgrade_events
ADD CONSTRAINT upgrade_events_event_type_check
CHECK (
  event_type IN (
    'upgrade_cta_clicked',
    'plan_basic_clicked',
    'plan_pro_clicked',
    'enterprise_clicked'
  )
);

ALTER TABLE public.upgrade_events
DROP CONSTRAINT IF EXISTS upgrade_events_plan_type_check;

ALTER TABLE public.upgrade_events
ADD CONSTRAINT upgrade_events_plan_type_check
CHECK (
  plan_type IS NULL OR plan_type IN ('free', 'basic', 'pro', 'enterprise')
);

CREATE INDEX IF NOT EXISTS idx_upgrade_events_user_created
ON upgrade_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upgrade_events_type_created
ON upgrade_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upgrade_events_source_created
ON upgrade_events(source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upgrade_events_created
ON upgrade_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upgrade_events_plan_created
ON upgrade_events(plan_type, created_at DESC)
WHERE plan_type IS NOT NULL;
