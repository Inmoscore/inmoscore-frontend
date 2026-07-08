create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'data_inventory_domain') then
    create type data_inventory_domain as enum (
      'users',
      'reports',
      'judicial_signals',
      'searches',
      'payments',
      'scoring',
      'admin_audit',
      'legal_requests'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'data_inventory_category') then
    create type data_inventory_category as enum (
      'identification',
      'contact',
      'financial',
      'behavioral',
      'judicial',
      'transactional',
      'technical',
      'legal',
      'derived_score'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'data_inventory_sensitivity') then
    create type data_inventory_sensitivity as enum (
      'low',
      'medium',
      'high',
      'sensitive'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'data_inventory_source_type') then
    create type data_inventory_source_type as enum (
      'user_provided',
      'admin_provided',
      'public_registry',
      'third_party_report',
      'system_generated',
      'payment_provider'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'data_inventory_legal_basis') then
    create type data_inventory_legal_basis as enum (
      'consent',
      'contract',
      'legal_obligation',
      'public_source',
      'legitimate_interest'
    );
  end if;
end $$;

create table if not exists public.data_inventory_items (
  id uuid primary key default gen_random_uuid(),
  data_domain data_inventory_domain not null,
  field_name text not null,
  description text not null,
  data_category data_inventory_category not null,
  sensitivity_level data_inventory_sensitivity not null,
  source_type data_inventory_source_type not null,
  legal_basis data_inventory_legal_basis not null,
  purpose text not null,
  retention_policy text not null,
  retention_days integer,
  impacts_scoring boolean not null default false,
  requires_consent boolean not null default true,
  is_public_source boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_inventory_items_retention_days_check
    check (retention_days is null or retention_days >= 0),
  constraint data_inventory_items_domain_field_unique
    unique (data_domain, field_name)
);

create index if not exists idx_data_inventory_items_domain
  on public.data_inventory_items (data_domain);

create index if not exists idx_data_inventory_items_category
  on public.data_inventory_items (data_category);

create index if not exists idx_data_inventory_items_sensitivity
  on public.data_inventory_items (sensitivity_level);

create index if not exists idx_data_inventory_items_legal_basis
  on public.data_inventory_items (legal_basis);

create index if not exists idx_data_inventory_items_impacts_scoring
  on public.data_inventory_items (impacts_scoring);

create or replace function set_data_inventory_items_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_data_inventory_items_updated_at on public.data_inventory_items;

create trigger trg_data_inventory_items_updated_at
before update on public.data_inventory_items
for each row
execute function set_data_inventory_items_updated_at();

insert into public.data_inventory_items (
  data_domain,
  field_name,
  description,
  data_category,
  sensitivity_level,
  source_type,
  legal_basis,
  purpose,
  retention_policy,
  retention_days,
  impacts_scoring,
  requires_consent,
  is_public_source,
  is_active
) values
  (
    'users',
    'users.cedula',
    'Documento de identificacion del usuario o titular cuando exista en el modelo de usuarios; si el campo fisico varia, mantener este item como referencia conceptual.',
    'identification',
    'high',
    'user_provided',
    'consent',
    'Identificar al titular y soportar consultas, reportes y solicitudes legales.',
    'Conservar mientras exista relacion activa y durante el termino legal o contractual aplicable.',
    null,
    false,
    true,
    false,
    true
  ),
  (
    'users',
    'users.email',
    'Correo electronico de cuenta para autenticacion, comunicaciones operativas y trazabilidad.',
    'contact',
    'medium',
    'user_provided',
    'contract',
    'Gestion de cuenta, seguridad, notificaciones y solicitudes del titular.',
    'Conservar mientras exista la cuenta y durante el termino legal aplicable.',
    null,
    false,
    true,
    false,
    true
  ),
  (
    'users',
    'users.nombre',
    'Nombre del usuario registrado.',
    'identification',
    'medium',
    'user_provided',
    'contract',
    'Identificacion basica de cuenta y soporte administrativo.',
    'Conservar mientras exista la cuenta y durante el termino legal aplicable.',
    null,
    false,
    true,
    false,
    true
  ),
  (
    'searches',
    'search_logs.cedula_consultada',
    'Documento consultado en busquedas de riesgo arrendaticio.',
    'identification',
    'high',
    'user_provided',
    'legitimate_interest',
    'Auditoria de consultas, control de limites y trazabilidad de acceso a informacion.',
    'Conservar para auditoria y defensa legal segun politica interna aprobada.',
    null,
    false,
    true,
    false,
    true
  ),
  (
    'searches',
    'search_logs.ip_address',
    'Direccion IP asociada a una consulta.',
    'technical',
    'medium',
    'system_generated',
    'legitimate_interest',
    'Seguridad, prevencion de abuso, rate limiting y auditoria.',
    'Conservar por periodo limitado de seguridad y auditoria.',
    null,
    false,
    false,
    false,
    true
  ),
  (
    'payments',
    'wompi_payments.reference',
    'Referencia interna/externa de pago Wompi para conciliacion.',
    'transactional',
    'medium',
    'payment_provider',
    'contract',
    'Conciliacion de pagos y activacion de planes.',
    'Conservar conforme a obligaciones contables, tributarias y contractuales.',
    null,
    false,
    false,
    false,
    true
  ),
  (
    'payments',
    'wompi_payments.amount_in_cents',
    'Valor transaccional del pago expresado en centavos.',
    'financial',
    'medium',
    'payment_provider',
    'contract',
    'Conciliacion financiera, facturacion y soporte de plan.',
    'Conservar conforme a obligaciones contables, tributarias y contractuales.',
    null,
    false,
    false,
    false,
    true
  ),
  (
    'scoring',
    'tenant_current_scores.score_normalized',
    'Puntaje normalizado derivado del motor de scoring; no modifica el calculo en esta fase.',
    'derived_score',
    'high',
    'system_generated',
    'legitimate_interest',
    'Mostrar resultado de riesgo y mantener trazabilidad de version de score.',
    'Conservar mientras el resultado sea vigente y durante el periodo de auditoria aplicable.',
    null,
    true,
    true,
    false,
    true
  ),
  (
    'scoring',
    'tenant_current_scores.classification',
    'Clasificacion derivada del score actual del arrendatario.',
    'derived_score',
    'high',
    'system_generated',
    'legitimate_interest',
    'Comunicar nivel de riesgo arrendaticio derivado.',
    'Conservar mientras el resultado sea vigente y durante el periodo de auditoria aplicable.',
    null,
    true,
    true,
    false,
    true
  ),
  (
    'reports',
    'reports.descripcion',
    'Descripcion del reporte aprobado; equivalente conceptual a approved_reports.description si se materializa una vista aprobada.',
    'behavioral',
    'high',
    'third_party_report',
    'legitimate_interest',
    'Documentar antecedentes arrendaticios reportados y moderados.',
    'Conservar conforme a politica de reporte, disputa y defensa legal.',
    null,
    true,
    true,
    false,
    true
  ),
  (
    'judicial_signals',
    'legal_case_signals.status',
    'Estado administrativo de la senal judicial; equivalente conceptual a judicial_signals.status.',
    'judicial',
    'sensitive',
    'public_registry',
    'public_source',
    'Trazabilidad de verificacion administrativa de senales judiciales.',
    'Conservar mientras exista finalidad de evaluacion y soporte de auditoria legal.',
    null,
    true,
    false,
    true,
    true
  ),
  (
    'judicial_signals',
    'legal_case_signals.relevance_for_rental_risk',
    'Marcador administrativo de relevancia para riesgo arrendaticio; equivalente conceptual a judicial_signals.relevance.',
    'judicial',
    'sensitive',
    'public_registry',
    'public_source',
    'Distinguir senales judiciales relevantes para la finalidad arrendaticia.',
    'Conservar mientras exista finalidad de evaluacion y soporte de auditoria legal.',
    null,
    true,
    false,
    true,
    true
  )
on conflict (data_domain, field_name) do update set
  description = excluded.description,
  data_category = excluded.data_category,
  sensitivity_level = excluded.sensitivity_level,
  source_type = excluded.source_type,
  legal_basis = excluded.legal_basis,
  purpose = excluded.purpose,
  retention_policy = excluded.retention_policy,
  retention_days = excluded.retention_days,
  impacts_scoring = excluded.impacts_scoring,
  requires_consent = excluded.requires_consent,
  is_public_source = excluded.is_public_source,
  is_active = excluded.is_active;
