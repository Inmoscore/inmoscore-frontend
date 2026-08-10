import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  DataSubjectRequestRow,
  DataSubjectRequestStatus,
  adminDataSubjectRequestUpdateSchema,
  buildAdminDataSubjectRequestUpdatePayload,
  buildDataSubjectRequestCreatePayload,
  calculateDataSubjectRequestDueAt,
  dataSubjectRequestCreateSchema,
  evaluateDataSubjectRequestTransition,
  updateDataSubjectRequest,
} from './dataSubjectRequests';

const submittedAt = new Date('2026-08-05T12:00:00.000Z');
const requestId = '11111111-1111-4111-8111-111111111111';
const adminId = '22222222-2222-4222-8222-222222222222';

function requestRow(overrides: Partial<DataSubjectRequestRow> = {}): DataSubjectRequestRow {
  return {
    id: requestId,
    user_id: null,
    requester_email: 'persona@example.com',
    requester_name: 'Persona',
    requester_document_id: null,
    request_type: 'access',
    status: 'received',
    description: 'Solicitud valida de acceso a datos personales.',
    admin_notes: null,
    submitted_at: submittedAt.toISOString(),
    due_at: '2026-08-15T12:00:00.000Z',
    resolved_at: null,
    resolved_by: null,
    created_at: submittedAt.toISOString(),
    updated_at: submittedAt.toISOString(),
    ...overrides,
  };
}

function validCreateData() {
  return dataSubjectRequestCreateSchema.parse({
    requester_email: 'body@example.com',
    requester_name: '  Persona Solicitante  ',
    requester_document_id: '  DOC-1  ',
    request_type: 'access',
    description: 'Solicitud valida de acceso a datos personales.',
  });
}

test('los contratos son estrictos y no aceptan user_id enviado por el cliente', () => {
  assert.equal(dataSubjectRequestCreateSchema.safeParse(validCreateData()).success, true);
  assert.equal(
    dataSubjectRequestCreateSchema.safeParse({ ...validCreateData(), user_id: requestId }).success,
    false
  );
  assert.equal(adminDataSubjectRequestUpdateSchema.safeParse({ status: 'resolved' }).success, true);
  assert.equal(
    adminDataSubjectRequestUpdateSchema.safeParse({ status: 'resolved', unexpected: true }).success,
    false
  );
});

test('una identidad autenticada reemplaza correo y user_id proporcionados por el cliente', () => {
  const payload = buildDataSubjectRequestCreatePayload({
    data: validCreateData(),
    identity: { userId: requestId, email: 'Verified@Example.com' },
    submittedAt,
    ipAddress: null,
    userAgent: null,
  });
  assert.equal(payload.user_id, requestId);
  assert.equal(payload.requester_email, 'verified@example.com');
  assert.notEqual(payload.requester_email, validCreateData().requester_email);
});

test('una solicitud anonima conserva user_id nulo y el correo de contacto validado', () => {
  const payload = buildDataSubjectRequestCreatePayload({
    data: validCreateData(),
    identity: null,
    submittedAt,
    ipAddress: null,
    userAgent: null,
  });
  assert.equal(payload.user_id, null);
  assert.equal(payload.requester_email, 'body@example.com');
  assert.equal(payload.due_at, '2026-08-15T12:00:00.000Z');
  assert.equal(calculateDataSubjectRequestDueAt('correction', submittedAt), '2026-08-20T12:00:00.000Z');
});

test('/my filtra exclusivamente por user_id y no asocia solicitudes anonimas por email', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8');
  const start = source.indexOf("app.get('/api/legal/data-requests/my'");
  const end = source.indexOf("app.post('/api/legal/disputes'", start);
  const route = source.slice(start, end);
  assert.match(route, /\.eq\('user_id', req\.user\.id\)/);
  assert.doesNotMatch(route, /requester_email\.eq|\.or\(/);
});

test('la creacion publica usa rate limit dedicado y rechaza credenciales invalidas', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8');
  assert.match(source, /const dataSubjectRequestCreateLimiter = rateLimit\(\{[\s\S]*?max: 5/);
  assert.match(
    source,
    /app\.post\([\s\S]*?'\/api\/legal\/data-requests',[\s\S]*?dataSubjectRequestCreateLimiter/
  );
  assert.match(source, /hasAuthorizationHeader && !optionalUser/);
});

test('la matriz acepta unicamente las transiciones aprobadas', () => {
  const allowed: Record<DataSubjectRequestStatus, DataSubjectRequestStatus[]> = {
    received: ['received', 'in_review', 'awaiting_user_info', 'resolved', 'rejected'],
    in_review: ['in_review', 'awaiting_user_info', 'resolved', 'rejected'],
    awaiting_user_info: ['awaiting_user_info', 'in_review', 'resolved', 'rejected'],
    resolved: ['resolved', 'in_review'],
    rejected: ['rejected', 'in_review'],
  };
  const statuses = Object.keys(allowed) as DataSubjectRequestStatus[];

  for (const currentStatus of statuses) {
    for (const nextStatus of statuses) {
      const result = evaluateDataSubjectRequestTransition({
        currentStatus,
        nextStatus,
        adminNotes: 'Justificacion de reapertura',
      });
      assert.equal(result.valid, allowed[currentStatus].includes(nextStatus), `${currentStatus} -> ${nextStatus}`);
    }
  }
});

test('el mismo estado es idempotente y no reemplaza datos de resolucion', () => {
  const transition = evaluateDataSubjectRequestTransition({
    currentStatus: 'resolved',
    nextStatus: 'resolved',
  });
  assert.deepEqual(transition, { valid: true, operation: 'update', idempotent: true });

  const payload = buildAdminDataSubjectRequestUpdatePayload({
    data: { status: 'resolved' },
    currentStatus: 'resolved',
    adminUserId: adminId,
    updatedAt: submittedAt,
  });
  assert.equal('status' in payload, false);
  assert.equal('resolved_at' in payload, false);
  assert.equal('resolved_by' in payload, false);
});

test('reabrir exige justificacion y limpia los metadatos de resolucion', async () => {
  let writes = 0;
  const rejected = await updateDataSubjectRequest({
    id: requestId,
    data: { status: 'in_review', admin_notes: '   ' },
    adminUserId: adminId,
    findById: async () => ({ id: requestId, status: 'resolved' }),
    updateById: async () => {
      writes += 1;
      return requestRow();
    },
  });
  assert.deepEqual(rejected, { kind: 'invalid_transition', reason: 'reopen_note_required' });
  assert.equal(writes, 0);

  const persistedPayloads: Record<string, unknown>[] = [];
  const reopened = await updateDataSubjectRequest({
    id: requestId,
    data: { status: 'in_review', admin_notes: 'Reapertura justificada' },
    adminUserId: adminId,
    updatedAt: submittedAt,
    findById: async () => ({ id: requestId, status: 'rejected' }),
    updateById: async (_id, payload) => {
      persistedPayloads.push(payload);
      return requestRow({ status: 'in_review', admin_notes: 'Reapertura justificada' });
    },
  });
  assert.equal(reopened.kind, 'updated');
  if (reopened.kind !== 'updated') return;
  assert.equal(reopened.operation, 'reopen');
  assert.equal(persistedPayloads[0].resolved_at, null);
  assert.equal(persistedPayloads[0].resolved_by, null);
});

test('una transicion invalida no ejecuta escritura', async () => {
  let writes = 0;
  const result = await updateDataSubjectRequest({
    id: requestId,
    data: { status: 'received' },
    adminUserId: adminId,
    findById: async () => ({ id: requestId, status: 'in_review' }),
    updateById: async () => {
      writes += 1;
      return requestRow();
    },
  });
  assert.deepEqual(result, { kind: 'invalid_transition', reason: 'not_allowed' });
  assert.equal(writes, 0);
});

test('un cambio concurrente del estado se convierte en conflicto sin sobrescribirlo', async () => {
  let expectedStatus: DataSubjectRequestStatus | null = null;
  const result = await updateDataSubjectRequest({
    id: requestId,
    data: { status: 'resolved' },
    adminUserId: adminId,
    findById: async () => ({ id: requestId, status: 'in_review' }),
    updateById: async (_id, _payload, currentStatus) => {
      expectedStatus = currentStatus;
      return null;
    },
  });
  assert.deepEqual(result, { kind: 'state_conflict' });
  assert.equal(expectedStatus, 'in_review');
});

test('la integracion conserva operacion, estado anterior y una sola escritura', async () => {
  const calls: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const result = await updateDataSubjectRequest({
    id: requestId,
    data: { status: 'rejected', admin_notes: 'No procede' },
    adminUserId: adminId,
    updatedAt: submittedAt,
    findById: async () => ({ id: requestId, status: 'in_review' }),
    updateById: async (id, payload) => {
      calls.push({ id, payload });
      return requestRow({ status: 'rejected', admin_notes: 'No procede' });
    },
  });
  assert.equal(result.kind, 'updated');
  if (result.kind !== 'updated') return;
  assert.equal(result.previousStatus, 'in_review');
  assert.equal(result.operation, 'reject');
  assert.equal(calls.length, 1);
});

test('una solicitud inexistente no ejecuta ninguna escritura', async () => {
  let writes = 0;
  const result = await updateDataSubjectRequest({
    id: requestId,
    data: { status: 'resolved' },
    adminUserId: null,
    findById: async () => null,
    updateById: async () => {
      writes += 1;
      return requestRow();
    },
  });
  assert.deepEqual(result, { kind: 'not_found' });
  assert.equal(writes, 0);
});

test('la auditoria del modulo minimiza PII y registra reaperturas', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8');
  const routePath = source.indexOf("'/api/admin/data-requests/:id'");
  const start = source.lastIndexOf('app.patch(', routePath);
  const end = source.indexOf("'/api/admin/human-review-requests'", routePath);
  const route = source.slice(start, end);
  assert.match(route, /data_request\.\$\{result\.operation\}/);
  assert.match(route, /res\.status\(409\)\.json\(\{[\s\S]*?code: 'INVALID_STATUS_TRANSITION'/);
  assert.match(route, /operation: result\.operation/);
  assert.doesNotMatch(route, /reference: updatedRequest\.requester_email/);
  assert.doesNotMatch(route, /reason: updatedRequest\.admin_notes/);
  assert.doesNotMatch(route, /buildAdminAuditContext\(req\)/);
});

test('la migracion aplica un modelo backend-only explicito', () => {
  const sql = readFileSync(resolve(process.cwd(), 'migration_data_subject_requests.sql'), 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /revoke all on table public\.data_subject_requests from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete[\s\S]*to service_role/i);
  assert.match(sql, /service_role must have BYPASSRLS/i);
  assert.match(sql, /grant usage on type public\.data_subject_request_type to service_role/i);
  assert.doesNotMatch(sql, /create policy/i);
});

test('la migracion es transaccional, repetible y repara columnas faltantes seguras', () => {
  const sql = readFileSync(resolve(process.cwd(), 'migration_data_subject_requests.sql'), 'utf8');
  assert.match(sql, /^begin;/i);
  assert.match(sql, /commit;\s*$/i);
  assert.match(sql, /create table if not exists public\.data_subject_requests/i);
  assert.match(sql, /add column if not exists requester_email/i);
  assert.match(sql, /create or replace function public\.set_data_subject_request_due_at/i);
  assert.doesNotMatch(sql, /drop table|drop column|drop type/i);
});

test('la migracion rechaza esquemas parciales poblados y objetos incompatibles', () => {
  const sql = readFileSync(resolve(process.cwd(), 'migration_data_subject_requests.sql'), 'utf8');
  assert.match(sql, /populated data_subject_requests lacks required columns/i);
  assert.match(sql, /unexpected definition/i);
  assert.match(sql, /unexpected primary key/i);
  assert.match(sql, /unexpected foreign key/i);
  assert.match(sql, /object % exists but is not an index/i);
  assert.match(sql, /unexpected nullability/i);
  assert.match(sql, /backend-only data_subject_requests must not have direct-client policies/i);
});

test('la inspeccion de enums normaliza enumlabel a text antes de agregar', () => {
  const sql = readFileSync(resolve(process.cwd(), 'migration_data_subject_requests.sql'), 'utf8');
  const typeSafeAggregations = sql.match(
    /array_agg\(e\.enumlabel::text order by e\.enumsortorder\)/g
  );
  assert.equal(typeSafeAggregations?.length, 2);
  assert.doesNotMatch(sql, /array_agg\(e\.enumlabel order by e\.enumsortorder\)/);
});

test('due_at queda etiquetado como SLA provisional pendiente de validacion legal', () => {
  const sql = readFileSync(resolve(process.cwd(), 'migration_data_subject_requests.sql'), 'utf8');
  assert.match(sql, /provisional product SLA indicator/i);
  assert.match(sql, /does not claim automatic legal compliance/i);
  assert.match(sql, /requires validation by qualified legal counsel/i);
});
