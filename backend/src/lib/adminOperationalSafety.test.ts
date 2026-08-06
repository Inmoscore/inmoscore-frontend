import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOperationalLogEntry,
  hasUnavailableMetric,
  isMissingSchemaError,
  safeCount,
  sendAvailableAdminResponse,
  sendMigrationRequired,
} from './adminOperationalSafety';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function captureSink() {
  const calls: unknown[][] = [];
  return {
    calls,
    sink: {
      info: (...args: unknown[]) => calls.push(args),
      warn: (...args: unknown[]) => calls.push(args),
      error: (...args: unknown[]) => calls.push(args),
    },
  };
}

test('un conteo real de cero permanece disponible como cero', async () => {
  const result = await safeCount('empty_table', Promise.resolve({ count: 0, error: null }));
  assert.equal(result, 0);
});

test('un conteo fallido queda no disponible y nunca se convierte en cero', async () => {
  const captured = captureSink();
  const result = await safeCount(
    'missing_metric',
    Promise.resolve({ count: null, error: { code: '42P01', message: 'sensitive table name' } }),
    captured.sink
  );
  assert.equal(result, null);
  assert.equal(captured.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(captured.calls), /sensitive table name/i);
});

test('esquema faltante responde 503 MIGRATION_REQUIRED sin detalles internos', () => {
  const captured = captureSink();
  let statusCode = 0;
  let body: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return value;
    },
  };

  sendMigrationRequired(response, {
    endpointKey: 'admin.data_requests',
    operation: 'select',
    error: {
      code: 'PGRST205',
      message: 'Could not find public.private_table in schema cache',
      details: 'select secret_column from private_table',
      hint: 'contains@example.com document 123456789',
    },
    sink: captured.sink,
  });

  assert.equal(statusCode, 503);
  assert.deepEqual(Object.keys(body as object).sort(), [
    'code',
    'correlation_id',
    'message',
    'success',
  ]);
  assert.equal((body as { code: string }).code, 'MIGRATION_REQUIRED');
  const serialized = JSON.stringify({ body, logs: captured.calls });
  assert.doesNotMatch(serialized, /private_table|secret_column|contains@example|123456789/i);
});

test('solo codigos conocidos se clasifican como dependencia de esquema faltante', () => {
  for (const code of ['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205']) {
    assert.equal(isMissingSchemaError({ code }), true, code);
  }

  assert.equal(
    isMissingSchemaError({ code: '42501', message: 'permission denied for missing relationship' }),
    false
  );
  assert.equal(
    isMissingSchemaError({ code: 'ECONNRESET', message: 'schema cache connection interrupted' }),
    false
  );
  assert.equal(isMissingSchemaError(new Error('relation does not exist')), false);
});

test('una tabla válida vacía responde 200 con lista vacía', () => {
  let statusCode = 0;
  let body: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return value;
    },
  };
  sendAvailableAdminResponse(response, { items: [] });
  assert.equal(statusCode, 200);
  assert.deepEqual(body, { success: true, items: [] });
});

test('el contrato parcial depende exclusivamente de valores null', () => {
  assert.equal(hasUnavailableMetric({ empty_count: 0, active_count: 2 }), false);
  assert.equal(hasUnavailableMetric({ empty_count: 0, failed_count: null }), true);
});

test('logs operacionales conservan correlacion y eliminan objetos crudos', () => {
  const entry = buildOperationalLogEntry({
    category: 'query failed',
    operation: 'select users where email=person@example.com',
    endpointKey: 'admin.users',
    error: {
      code: '42703',
      message: 'JWT cookie MFA 123456 note private payload',
    },
    correlationId: 'correlation-safe',
  });
  assert.equal(entry.correlation_id, 'correlation-safe');
  assert.equal(entry.database_error_code, '42703');
  const serialized = JSON.stringify(entry);
  assert.doesNotMatch(serialized, /person@example|JWT|cookie|MFA|123456|private payload/i);
});

test('el código fuente no restaura logs sensibles conocidos', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8');
  const billingSource = readFileSync(resolve(process.cwd(), 'src/routes/billing.ts'), 'utf8');
  const wompiSource = readFileSync(resolve(process.cwd(), 'src/routes/wompiBilling.ts'), 'utf8');
  const securityAuditSource = readFileSync(resolve(process.cwd(), 'src/securityAudit.ts'), 'utf8');
  assert.doesNotMatch(source, /RENTAL_HISTORY_INSERT_PAYLOAD/);
  assert.doesNotMatch(
    source,
    /console\.(?:info|warn)\('\[AUTH_LOGIN_DEBUG\]'[\s\S]{0,180}email:\s*cleanEmail/
  );
  assert.doesNotMatch(source, /cedula=\$\{cleanCedula\}/);
  assert.doesNotMatch(source, /console\.error\('\[RENTAL_HISTORY_ADMIN_LIST\]'/);
  assert.doesNotMatch(source, /attempted_update:\s*updatePayload/);
  assert.doesNotMatch(source, /supabase_error:\s*[a-zA-Z]/);
  assert.doesNotMatch(billingSource, /console\.(?:error|warn)\([^;]*,\s*error\s*\)/s);
  assert.doesNotMatch(wompiSource, /console\.error\([^;]*,\s*error\s*\)/s);
  assert.doesNotMatch(securityAuditSource, /console\.error\([^;]*,\s*err\s*\)/s);
});
