create extension if not exists pgcrypto;

-- Historial arrendaticio estructurado y verificable, aportado por arrendadores.
-- No habilita impacto en score por defecto; queda sujeto a flujo posterior de verificacion.
create table if not exists tenant_rental_histories (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid references tenants(id) on delete set null,
  reported_by_user_id uuid references users(id) on delete set null,

  cedula_inquilino text not null,

  lessor_name text,
  lessor_contact text,
  lessor_document text,

  city text,
  property_type text,

  contract_start_date date,
  contract_end_date date,
  contract_duration_months integer,

  monthly_rent_amount integer,
  currency text not null default 'COP',

  deposit_amount integer,

  had_late_payments boolean,
  late_payment_months integer default 0,

  had_property_damage boolean,
  property_damage_notes text,

  formal_handover boolean,
  had_debt_at_handover boolean,
  debt_amount integer,

  has_supporting_documents boolean not null default false,

  tenant_consent_status text not null default 'pending',
  status text not null default 'pending_admin_verification',

  verification_notes text,
  verified_by_admin_id uuid references users(id) on delete set null,
  verified_at timestamptz,

  rejected_by_admin_id uuid references users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,

  dispute_status text not null default 'none',
  dispute_notes text,
  disputed_at timestamptz,

  score_impact_enabled boolean not null default false,
  visibility_level text not null default 'paid_only',

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tenant_rental_histories_tenant_consent_status_check
    check (
      tenant_consent_status in (
        'pending',
        'granted',
        'denied',
        'not_required'
      )
    ),

  constraint tenant_rental_histories_status_check
    check (
      status in (
        'draft',
        'pending_tenant_consent',
        'pending_admin_verification',
        'verified',
        'rejected',
        'disputed',
        'archived'
      )
    ),

  constraint tenant_rental_histories_dispute_status_check
    check (
      dispute_status in (
        'none',
        'opened',
        'under_review',
        'resolved',
        'rejected'
      )
    ),

  constraint tenant_rental_histories_visibility_level_check
    check (
      visibility_level in (
        'private',
        'paid_only',
        'pro_only',
        'admin_only'
      )
    )
);

comment on table tenant_rental_histories is
  'Historial arrendaticio verificado con datos estructurados, soporte documental y trazabilidad administrativa.';

comment on column tenant_rental_histories.score_impact_enabled is
  'Permanece en false por defecto; cualquier impacto en score requiere flujo posterior de verificacion.';

comment on column tenant_rental_histories.visibility_level is
  'Controla exposicion operacional del historial; por defecto visible solo para usuarios pagos.';

create index if not exists idx_tenant_rental_histories_cedula_inquilino
  on tenant_rental_histories (cedula_inquilino);

create index if not exists idx_tenant_rental_histories_tenant_id
  on tenant_rental_histories (tenant_id);

create index if not exists idx_tenant_rental_histories_reported_by_user_id
  on tenant_rental_histories (reported_by_user_id);

create index if not exists idx_tenant_rental_histories_status
  on tenant_rental_histories (status);

create index if not exists idx_tenant_rental_histories_tenant_consent_status
  on tenant_rental_histories (tenant_consent_status);

create index if not exists idx_tenant_rental_histories_dispute_status
  on tenant_rental_histories (dispute_status);

create index if not exists idx_tenant_rental_histories_created_at
  on tenant_rental_histories (created_at desc);

create index if not exists idx_tenant_rental_histories_verified_at
  on tenant_rental_histories (verified_at desc);
