import { supabase } from './supabase';

type AuthenticationAuditRequestMetadata = {
  ip_address?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
};

export type AuthenticationAuditParams = {
  user_id?: string | null;
  email?: string | null;
  event_type: string;
  event_status: string;
  failure_reason?: string | null;
  request?: AuthenticationAuditRequestMetadata;
};

function normalizeUuid(value?: string | null): string | null {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
    ? value
    : null;
}

function sanitizeText(value: string, maxLength = 600): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function sanitizeEmail(value?: string | null): string | null {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized ? sanitizeText(normalized, 320) : null;
}

export async function logAuthenticationAudit(
  params: AuthenticationAuditParams
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('authentication_audit_logs')
      .insert({
        user_id: normalizeUuid(params.user_id || null),
        email: sanitizeEmail(params.email || null),
        event_type: sanitizeText(params.event_type, 140),
        event_status: sanitizeText(params.event_status, 80),
        failure_reason: params.failure_reason ? sanitizeText(params.failure_reason, 300) : null,
        ip_address: params.request?.ip_address ? sanitizeText(params.request.ip_address, 80) : null,
        user_agent: params.request?.user_agent ? sanitizeText(params.request.user_agent, 300) : null,
        request_id: params.request?.request_id ? sanitizeText(params.request.request_id, 120) : null,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[AUTH_AUDIT_FAILED]', {
        action: 'insert_failed',
        event_type: params.event_type,
        event_status: params.event_status,
        user_id: params.user_id || null,
        error: error.message,
      });
      return false;
    }

    console.log('[AUTH_AUDIT_LOGGED]', {
      audit_id: data?.id ?? null,
      event_type: params.event_type,
      event_status: params.event_status,
      user_id: params.user_id || null,
    });
    return true;
  } catch (error) {
    console.warn('[AUTH_AUDIT_FAILED]', {
      action: 'insert_exception',
      event_type: params.event_type,
      event_status: params.event_status,
      user_id: params.user_id || null,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}
