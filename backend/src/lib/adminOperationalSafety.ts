import { randomUUID } from 'crypto';

export const MIGRATION_REQUIRED_CODE = 'MIGRATION_REQUIRED' as const;
export const MIGRATION_REQUIRED_MESSAGE = 'Módulo temporalmente no disponible.';

type CountQueryResult = {
  count: number | null;
  error: unknown;
};

type JsonResponse = {
  status(code: number): JsonResponse;
  json(body: unknown): unknown;
};

type OperationalLogLevel = 'info' | 'warn' | 'error';

export type OperationalLogEntry = {
  category: string;
  correlation_id: string;
  operation: string;
  endpoint_key?: string;
  database_error_code?: string;
  count?: number;
};

function sanitizeLogIdentifier(value: string, fallback: string, maxLength: number): string {
  const normalized = value.trim();
  return /^[a-z][a-z0-9_./:-]*$/i.test(normalized) && normalized.length <= maxLength
    ? normalized
    : fallback;
}

export function getDatabaseErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = String((error as { code?: unknown }).code || '').trim();
  return code && /^[A-Z0-9_]+$/i.test(code) ? code.slice(0, 32) : null;
}

export function isMissingSchemaError(error: unknown): boolean {
  const code = getDatabaseErrorCode(error);
  return ['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205'].includes(code || '');
}

export function buildOperationalLogEntry(input: {
  category: string;
  operation: string;
  endpointKey?: string;
  error?: unknown;
  correlationId?: string;
  count?: number;
}): OperationalLogEntry {
  const entry: OperationalLogEntry = {
    category: sanitizeLogIdentifier(input.category, 'operational_error', 80),
    correlation_id: input.correlationId || randomUUID(),
    operation: sanitizeLogIdentifier(input.operation, 'unknown', 80),
  };

  if (input.endpointKey) {
    entry.endpoint_key = sanitizeLogIdentifier(input.endpointKey, 'unknown', 160);
  }

  const databaseErrorCode = getDatabaseErrorCode(input.error);
  if (databaseErrorCode) entry.database_error_code = databaseErrorCode;
  if (typeof input.count === 'number' && Number.isFinite(input.count)) entry.count = input.count;
  return entry;
}

export function writeOperationalLog(
  level: OperationalLogLevel,
  event: string,
  entry: OperationalLogEntry,
  sink: Pick<Console, 'info' | 'warn' | 'error'> = console
): void {
  sink[level](event, entry);
}

export async function safeCount(
  label: string,
  query: PromiseLike<CountQueryResult>,
  sink: Pick<Console, 'info' | 'warn' | 'error'> = console
): Promise<number | null> {
  try {
    const { count, error } = await query;
    if (error) throw error;
    return typeof count === 'number' && Number.isFinite(count) ? count : 0;
  } catch (error) {
    writeOperationalLog(
      'error',
      '[ADMIN_METRIC_UNAVAILABLE]',
      buildOperationalLogEntry({
        category: 'metric_query_failed',
        operation: 'count',
        endpointKey: label,
        error,
      }),
      sink
    );
    return null;
  }
}

export function sendMigrationRequired(
  res: JsonResponse,
  input: {
    endpointKey: string;
    operation: string;
    error: unknown;
    sink?: Pick<Console, 'info' | 'warn' | 'error'>;
  }
): string {
  const entry = buildOperationalLogEntry({
    category: 'schema_dependency_missing',
    operation: input.operation,
    endpointKey: input.endpointKey,
    error: input.error,
  });

  writeOperationalLog('error', '[ADMIN_DEPENDENCY_UNAVAILABLE]', entry, input.sink || console);
  res.status(503).json({
    success: false,
    code: MIGRATION_REQUIRED_CODE,
    message: MIGRATION_REQUIRED_MESSAGE,
    correlation_id: entry.correlation_id,
  });
  return entry.correlation_id;
}

export function sendAvailableAdminResponse(
  res: JsonResponse,
  body: Record<string, unknown>
): void {
  res.status(200).json({ success: true, ...body });
}

export function hasUnavailableMetric(metrics: Record<string, number | null>): boolean {
  return Object.values(metrics).some((value) => value === null);
}
