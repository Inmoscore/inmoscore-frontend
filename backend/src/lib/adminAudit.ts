import { supabase } from './supabase';

export type AdminAuditSeverity = 'low' | 'medium' | 'high' | 'critical';

type AdminAuditActor = {
  id?: string | null;
  email?: string | null;
} | null;

type AdminAuditTarget = {
  type: string;
  id?: string | null;
  reference?: string | null;
};

type AdminAuditRequestMetadata = {
  ip_address?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
};

type LogAdminActionParams = {
  admin?: AdminAuditActor;
  action_type: string;
  severity: AdminAuditSeverity;
  target: AdminAuditTarget;
  previous_state?: unknown;
  new_state?: unknown;
  reason?: string | null;
  request?: AdminAuditRequestMetadata;
};

const SENSITIVE_KEY_PATTERN =
  /(password|token|secret|authorization|cookie|apikey|api_key|private_key|service_role|jwt|payload|webhook_payload|file|binary|base64)/i;

function sanitizeText(value: string, maxLength = 600): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function sanitizeForAudit(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return sanitizeText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    if (depth >= 3) return `[array:${value.length}]`;
    return value.slice(0, 20).map((item) => sanitizeForAudit(item, depth + 1));
  }

  if (typeof value === 'object') {
    if (depth >= 3) return '[object]';

    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (acc, [key, entryValue]) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          acc[key] = '[redacted]';
          return acc;
        }

        acc[key] = sanitizeForAudit(entryValue, depth + 1);
        return acc;
      },
      {}
    );
  }

  return String(value);
}

function normalizeUuid(value?: string | null): string | null {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
    ? value
    : null;
}

export async function logAdminAction(params: LogAdminActionParams): Promise<boolean> {
  try {
    const { error } = await supabase.from('admin_audit_logs').insert({
      admin_user_id: normalizeUuid(params.admin?.id || null),
      admin_email: params.admin?.email ? sanitizeText(params.admin.email, 180) : null,
      action_type: sanitizeText(params.action_type, 160),
      severity: params.severity,
      target_type: sanitizeText(params.target.type, 100),
      target_id: normalizeUuid(params.target.id || null),
      target_reference: params.target.reference
        ? sanitizeText(params.target.reference, 250)
        : null,
      previous_state:
        params.previous_state === undefined ? null : sanitizeForAudit(params.previous_state),
      new_state: params.new_state === undefined ? null : sanitizeForAudit(params.new_state),
      reason: params.reason ? sanitizeText(params.reason, 1000) : null,
      ip_address: params.request?.ip_address ? sanitizeText(params.request.ip_address, 80) : null,
      user_agent: params.request?.user_agent ? sanitizeText(params.request.user_agent, 300) : null,
      request_id: params.request?.request_id ? sanitizeText(params.request.request_id, 120) : null,
    });

    if (error) {
      console.warn('[ADMIN_AUDIT]', {
        action: 'insert_failed',
        action_type: params.action_type,
        target_type: params.target.type,
        target_id: params.target.id || null,
        error: error.message,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.warn('[ADMIN_AUDIT]', {
      action: 'insert_exception',
      action_type: params.action_type,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}
