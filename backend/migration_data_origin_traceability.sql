-- Legal data-origin traceability for scoring-relevant records.
-- Defensive by design: every ALTER is IF EXISTS / IF NOT EXISTS and all new fields are nullable.

do $$
declare
  table_name text;
  target_tables text[] := array[
    'reports',
    'tenant_reports',
    'approved_reports',
    'legal_case_signals',
    'judicial_signals',
    'tenant_judicial_signals'
  ];
begin
  foreach table_name in array target_tables loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I add column if not exists data_origin text', table_name);
      execute format('alter table public.%I add column if not exists source_type text', table_name);
      execute format('alter table public.%I add column if not exists source_name text', table_name);
      execute format('alter table public.%I add column if not exists source_reference text', table_name);
      execute format('alter table public.%I add column if not exists source_url text', table_name);
      execute format('alter table public.%I add column if not exists legal_basis text', table_name);
      execute format('alter table public.%I add column if not exists consent_required boolean default true', table_name);
      execute format('alter table public.%I add column if not exists consent_verified boolean default false', table_name);
      execute format('alter table public.%I add column if not exists public_source_flag boolean default false', table_name);
      execute format('alter table public.%I add column if not exists impacts_scoring boolean default false', table_name);
      execute format('alter table public.%I add column if not exists dispute_status text default ''none''', table_name);
      execute format('alter table public.%I add column if not exists legal_review_status text default ''pending''', table_name);
      execute format('alter table public.%I add column if not exists legal_notes text', table_name);
      execute format('alter table public.%I add column if not exists created_by_admin_id uuid', table_name);
      execute format('alter table public.%I add column if not exists verified_by_admin_id uuid', table_name);
      execute format('alter table public.%I add column if not exists verified_at timestamptz', table_name);

      execute format(
        'alter table public.%I drop constraint if exists %I',
        table_name,
        table_name || '_source_type_check'
      );
      execute format(
        'alter table public.%I add constraint %I check (source_type is null or source_type in (''user_provided'', ''admin_provided'', ''public_registry'', ''judicial_public_source'', ''third_party_report'', ''system_generated''))',
        table_name,
        table_name || '_source_type_check'
      );

      execute format(
        'alter table public.%I drop constraint if exists %I',
        table_name,
        table_name || '_legal_basis_check'
      );
      execute format(
        'alter table public.%I add constraint %I check (legal_basis is null or legal_basis in (''consent'', ''public_source'', ''legitimate_interest'', ''contract'', ''legal_obligation''))',
        table_name,
        table_name || '_legal_basis_check'
      );

      execute format(
        'alter table public.%I drop constraint if exists %I',
        table_name,
        table_name || '_dispute_status_traceability_check'
      );
      execute format(
        'alter table public.%I add constraint %I check (dispute_status is null or dispute_status::text in (''none'', ''disputed'', ''resolved'', ''rejected''))',
        table_name,
        table_name || '_dispute_status_traceability_check'
      );

      execute format(
        'alter table public.%I drop constraint if exists %I',
        table_name,
        table_name || '_legal_review_status_check'
      );
      execute format(
        'alter table public.%I add constraint %I check (legal_review_status is null or legal_review_status in (''pending'', ''reviewed'', ''approved'', ''rejected'', ''needs_more_info''))',
        table_name,
        table_name || '_legal_review_status_check'
      );

      execute format('create index if not exists %I on public.%I (source_type)', 'idx_' || table_name || '_source_type', table_name);
      execute format('create index if not exists %I on public.%I (legal_basis)', 'idx_' || table_name || '_legal_basis', table_name);
      execute format('create index if not exists %I on public.%I (impacts_scoring)', 'idx_' || table_name || '_impacts_scoring', table_name);
      execute format('create index if not exists %I on public.%I (dispute_status)', 'idx_' || table_name || '_dispute_status', table_name);
      execute format('create index if not exists %I on public.%I (legal_review_status)', 'idx_' || table_name || '_legal_review_status', table_name);
    end if;
  end loop;
end $$;
