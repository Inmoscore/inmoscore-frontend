import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const migrationFiles = {
  disputes: 'migration_phase2b_data_disputes_hardened.sql',
  humanReview: 'migration_phase2b_human_review_requests_hardened.sql',
  inventory: 'migration_phase2b_data_inventory_hardened.sql',
  signals: 'migration_phase2b_legal_case_signals_reconciliation.sql',
} as const;

const legalSignalsAclFiles = {
  migration: 'migration_phase2b_legal_case_signals_acl_hardening.sql',
  postcheck: 'postcheck_legal_case_signals_acl_hardening.sql',
  rollback: 'rollback_legal_case_signals_acl_hardening.sql',
} as const;

function sql(fileName: string): string {
  return readFileSync(resolve(process.cwd(), fileName), 'utf8');
}

function withoutComments(value: string): string {
  return value.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function withoutCommentsOrStrings(value: string): string {
  return withoutComments(value).replace(/'(?:''|[^'])*'/g, "''");
}

const hardenedBackendOnly = [
  migrationFiles.disputes,
  migrationFiles.humanReview,
  migrationFiles.inventory,
] as const;

test('las cuatro migraciones son transaccionales y nunca reparan destructivamente', () => {
  for (const fileName of Object.values(migrationFiles)) {
    const source = withoutComments(sql(fileName));
    assert.match(source, /^begin;/i, fileName);
    assert.match(source, /commit;\s*$/i, fileName);
    assert.doesNotMatch(source, /\bdrop\s+(table|column|type|constraint|index|trigger)\b/i, fileName);
    assert.match(source, /INCOMPATIBLE_SCHEMA|PREREQUISITE_FAILURE/i, fileName);
  }
});

test('segunda ejecucion converge mediante validacion y clausulas repetibles', () => {
  for (const fileName of hardenedBackendOnly) {
    const source = sql(fileName);
    assert.match(source, /create table if not exists public\./i, fileName);
    assert.match(source, /add column if not exists/i, fileName);
    assert.match(source, /create or replace function public\./i, fileName);
    assert.match(source, /unexpected definition/i, fileName);
  }
  const signals = sql(migrationFiles.signals);
  assert.match(signals, /add column if not exists data_origin/i);
  assert.match(signals, /unexpected default/i);
});

test('esquema parcial vacio puede converger y esquema parcial poblado incompleto aborta', () => {
  for (const fileName of hardenedBackendOnly) {
    const source = sql(fileName);
    assert.match(source, /table_has_rows boolean/i, fileName);
    assert.match(source, /missing_required_columns text\[\]/i, fileName);
    assert.match(source, /if table_has_rows and missing_required_columns is not null/i, fileName);
    assert.match(source, /populated .* lacks required columns/i, fileName);
  }
});

test('enums preexistentes se agregan como text y una definicion incompatible aborta', () => {
  for (const fileName of [migrationFiles.disputes, migrationFiles.inventory]) {
    const source = sql(fileName);
    assert.match(source, /array_agg\(e\.enumlabel::text order by e\.enumsortorder\)/i, fileName);
    assert.doesNotMatch(source, /array_agg\(e\.enumlabel order by e\.enumsortorder\)/i, fileName);
    assert.match(source, /existing_kind <> 'e' or existing_labels is distinct from/i, fileName);
  }
});

test('objetos homonimos de tipo incorrecto y columnas incompatibles abortan', () => {
  for (const fileName of Object.values(migrationFiles)) {
    const source = sql(fileName);
    assert.match(source, /is not a regular table/i, fileName);
    assert.match(source, /column .* has an unexpected type/i, fileName);
    assert.match(source, /unexpected nullability/i, fileName);
  }
  for (const fileName of hardenedBackendOnly) {
    assert.match(sql(fileName), /object % exists but is not an index/i, fileName);
  }
});

test('PK FK CHECK e indices homonimos incompatibles se rechazan', () => {
  for (const fileName of [migrationFiles.disputes, migrationFiles.humanReview, migrationFiles.inventory]) {
    const source = sql(fileName);
    assert.match(source, /unexpected primary key/i, fileName);
    assert.match(source, /unexpected definition/i, fileName);
    assert.match(source, /index % has an unexpected definition/i, fileName);
    assert.match(source, /index_has_predicate/i, fileName);
  }
  assert.match(sql(migrationFiles.disputes), /unexpected foreign key/i);
  assert.match(sql(migrationFiles.humanReview), /unexpected foreign key/i);
  assert.match(sql(migrationFiles.humanReview), /CHECK constraint .* unexpected definition/i);
  assert.match(sql(migrationFiles.inventory), /UNIQUE constraint .* unexpected definition/i);
  assert.match(sql(migrationFiles.inventory), /CHECK constraint .* unexpected definition/i);
  assert.match(sql(migrationFiles.signals), /CHECK constraint .* unexpected definition/i);
});

test('funciones y triggers preexistentes incompatibles no se reemplazan silenciosamente', () => {
  for (const fileName of hardenedBackendOnly) {
    const source = sql(fileName);
    assert.match(source, /unexpected signature or language/i, fileName);
    assert.match(source, /function_arguments/i, fileName);
    assert.match(source, /function_kind/i, fileName);
    assert.match(source, /trigger_type/i, fileName);
    assert.match(source, /trigger_function/i, fileName);
    assert.match(source, /trigger_arguments/i, fileName);
    assert.match(source, /trigger_has_condition/i, fileName);
    assert.match(source, /has an unexpected definition/i, fileName);
    assert.doesNotMatch(source, /drop trigger/i, fileName);
  }
});

test('los tres modulos nuevos son backend-only sin policies ni DELETE', () => {
  const tables = ['data_disputes', 'human_review_requests', 'data_inventory_items'];
  hardenedBackendOnly.forEach((fileName, index) => {
    const source = sql(fileName);
    const table = tables[index];
    assert.match(source, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(source, new RegExp(`alter table public\\.${table} force row level security`, 'i'));
    assert.match(source, new RegExp(`revoke all on table public\\.${table} from public, ?anon, ?authenticated, ?service_role`, 'i'));
    assert.match(source, new RegExp(`grant select, ?insert, ?update on table public\\.${table} to service_role`, 'i'));
    assert.doesNotMatch(source, /grant[^;]*\bdelete\b/i, fileName);
    assert.doesNotMatch(source, /create policy/i, fileName);
    assert.match(source, /must not have direct-client policies/i, fileName);
    assert.match(source, /service_role must have BYPASSRLS/i, fileName);
  });
});

test('policies inesperadas y roles Supabase inseguros provocan rollback por excepcion', () => {
  for (const fileName of hardenedBackendOnly) {
    const source = sql(fileName);
    assert.match(source, /exists\s*\(select 1 from pg_policy/i, fileName);
    assert.match(source, /required Supabase roles are missing/i, fileName);
    assert.match(source, /service_role must have BYPASSRLS/i, fileName);
    assert.match(source, /raise exception/i, fileName);
  }
});

test('inventario excluye por completo los doce seeds historicos', () => {
  const source = withoutComments(sql(migrationFiles.inventory));
  assert.doesNotMatch(source, /\binsert\s+into\b/i);
  assert.doesNotMatch(source, /\bon\s+conflict\b/i);
  assert.doesNotMatch(source, /\bupsert\b/i);
  assert.match(sql(migrationFiles.inventory), /empty inventory is a valid structural state/i);
});

test('signals reconcilia exactamente once columnas y conserva ACL y objetos existentes', () => {
  const source = withoutComments(sql(migrationFiles.signals));
  const additions = [...source.matchAll(/add column if not exists\s+(\w+)/gi)].map(match => match[1]);
  assert.deepEqual(additions, [
    'data_origin','source_type','source_name','legal_basis','consent_required','consent_verified',
    'public_source_flag','impacts_scoring','legal_review_status','legal_notes','created_by_admin_id',
  ]);
  assert.doesNotMatch(source, /create table/i);
  assert.doesNotMatch(source, /alter table public\.(?!legal_case_signals\b)/i);
  assert.doesNotMatch(source, /\b(grant|revoke)\b/i);
  assert.doesNotMatch(source, /\b(insert|update|delete|truncate)\b/i);
  assert.match(source, /ACL unchanged/i);
  assert.match(source, /tenant_id must reference public\.tenants\(id\)/i);
  assert.match(source, /must have RLS enabled/i);
});

test('preflight y post-check son copiables y estrictamente READ ONLY', () => {
  for (const fileName of ['preflight_phase2b_legal_modules.sql', 'postcheck_phase2b_legal_modules.sql']) {
    const source = withoutCommentsOrStrings(sql(fileName));
    assert.match(source, /^begin transaction read only;/i, fileName);
    assert.match(source, /commit;\s*$/i, fileName);
    assert.match(source, /to_regclass\(/i, fileName);
    assert.doesNotMatch(source, /::regclass/i, fileName);
    assert.doesNotMatch(source, /\b(create|alter|drop|truncate|insert|update|delete|grant|revoke)\b/i, fileName);
  }
});

test('todas las inspecciones de enum son type-safe', () => {
  for (const fileName of [
    migrationFiles.disputes,
    migrationFiles.inventory,
    'preflight_phase2b_legal_modules.sql',
    'postcheck_phase2b_legal_modules.sql',
  ]) {
    const source = sql(fileName);
    assert.match(source, /array_agg\(e\.enumlabel::text order by e\.enumsortorder\)/i, fileName);
    assert.doesNotMatch(source, /array_agg\(e\.enumlabel order by e\.enumsortorder\)/i, fileName);
  }
});

test('post-check reporta cada modulo por separado aunque los demas no esten instalados', () => {
  const source = sql('postcheck_phase2b_legal_modules.sql');
  for (const moduleName of ['data_disputes','human_review_requests','data_inventory','legal_case_signals']) {
    assert.match(source, new RegExp(`'${moduleName}'`));
  }
  assert.match(source, /'NOT_INSTALLED'/);
  assert.match(source, /'VERIFIED'/);
  assert.match(source, /Each module is independent/i);
});

test('hardening ACL de signals es transaccional, defensivo e idempotente', () => {
  const source = withoutComments(sql(legalSignalsAclFiles.migration));
  assert.match(source, /^begin;/i);
  assert.match(source, /commit;\s*$/i);
  assert.match(source, /service_role\.rolbypassrls must be true/i);
  assert.match(source, /active inherited privileges prevent exact ACL enforcement/i);
  assert.match(source, /unexplained effective privileges prevent exact ACL enforcement/i);
  assert.match(source, /must have exactly zero policies/i);
  assert.match(source, /enable row level security/i);
  assert.match(source, /force row level security/i);
  assert.match(
    source,
    /revoke all privileges on table public\.legal_case_signals from public, anon, authenticated, service_role/i
  );
  assert.match(
    source,
    /grant select, insert, update on table public\.legal_case_signals to service_role/i
  );
  assert.doesNotMatch(source, /grant[^;]*\bdelete\b[^;]*to service_role/i);
  assert.doesNotMatch(source, /create policy/i);
});

test('hardening ACL no muta datos ni estructura de signals', () => {
  const source = withoutCommentsOrStrings(sql(legalSignalsAclFiles.migration));
  assert.doesNotMatch(source, /\binsert\s+into\b/i);
  assert.doesNotMatch(source, /\bupdate\s+public\.legal_case_signals\s+set\b/i);
  assert.doesNotMatch(source, /\bdelete\s+from\b/i);
  assert.doesNotMatch(source, /\btruncate\s+(table\s+)?public\.legal_case_signals\b/i);
  assert.doesNotMatch(source, /\balter\s+table\s+public\.legal_case_signals\s+(add|drop|alter\s+column)\b/i);
  assert.doesNotMatch(source, /\b(add|drop)\s+constraint\b|\bcreate\s+(unique\s+)?index\b/i);
});

test('post-check ACL de signals es read-only y exige el estado exacto', () => {
  const source = withoutCommentsOrStrings(sql(legalSignalsAclFiles.postcheck));
  assert.match(source, /^begin transaction read only;/i);
  assert.match(source, /commit;\s*$/i);
  assert.doesNotMatch(source, /\b(create|alter|drop|grant|revoke|insert|update|delete|truncate)\b/i);

  const rawSource = sql(legalSignalsAclFiles.postcheck);
  assert.match(rawSource, /'VERIFIED'/);
  assert.match(rawSource, /SERVICE_ROLE_FORBIDDEN_PRIVILEGE/);
  assert.match(rawSource, /'MAINTAIN'/);
  assert.match(rawSource, /service_role_rolbypassrls/);
});

test('rollback ACL restaura exclusivamente el baseline productivo confirmado', () => {
  const source = withoutComments(sql(legalSignalsAclFiles.rollback));
  assert.match(source, /^begin;/i);
  assert.match(source, /commit;\s*$/i);
  assert.match(source, /no force row level security/i);
  assert.match(source, /enable row level security/i);
  assert.match(
    source,
    /grant select, insert, update, delete, truncate, references, trigger, maintain[\s\S]*?to postgres, anon, authenticated, service_role/i
  );
  assert.match(source, /arwdDxtm baseline/i);
  assert.match(source, /must leave exactly zero policies/i);
  assert.doesNotMatch(source, /create policy/i);
});

test('SQL de hardening ACL no contiene secretos ni credenciales', () => {
  for (const fileName of Object.values(legalSignalsAclFiles)) {
    const source = sql(fileName);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|JWT_SECRET/i, fileName);
    assert.doesNotMatch(source, /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/, fileName);
    assert.doesNotMatch(source, /https:\/\/[a-z0-9-]+\.supabase\.co/i, fileName);
  }
});
