import { supabase } from './supabase';

type LegalReportAuditRequestMetadata = {
  ip_address?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
};

export type LegalReportAuditParams = {
  tenant_id?: string | null;
  report_id?: string | null;
  admin_action_id?: string | null;
  actor_user_id?: string | null;
  actor_role?: string | null;
  event_type: string;
  event_status: string;
  report_status_before?: string | null;
  report_status_after?: string | null;
  review_status_before?: string | null;
  review_status_after?: string | null;
  subject_document_number?: string | null;
  subject_document_type?: string | null;
  report_type?: string | null;
  legal_basis?: string | null;
  legal_version_id?: string | null;
  evidence_count?: number | null;
  evidence_hashes?: unknown[] | null;
  error_code?: string | null;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
  request?: LegalReportAuditRequestMetadata;
};

const SENSITIVE_KEY_PATTERN =
  /(password|token|secret|authorization|cookie|apikey|api_key|private_key|service_role|jwt|file|binary|base64|storage_path|path|url|payload|body|content)/i;

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

function normalizeEvidenceHashes(value?: unknown[] | null): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry) => /^[a-f0-9]{64}$/.test(entry))
    .slice(0, 50);
}

export async function logLegalReportAudit(
  params: LegalReportAuditParams
): Promise<boolean> {
  try {
    const { error } = await supabase.from('legal_report_audit_logs').insert({
      tenant_id: normalizeUuid(params.tenant_id || null),
      report_id: normalizeUuid(params.report_id || null),
      admin_action_id: normalizeUuid(params.admin_action_id || null),
      actor_user_id: normalizeUuid(params.actor_user_id || null),
      actor_role: params.actor_role ? sanitizeText(params.actor_role, 80) : null,
      event_type: sanitizeText(params.event_type, 140),
      event_status: sanitizeText(params.event_status, 80),
      report_status_before: params.report_status_before
        ? sanitizeText(params.report_status_before, 80)
        : null,
      report_status_after: params.report_status_after
        ? sanitizeText(params.report_status_after, 80)
        : null,
      review_status_before: params.review_status_before
        ? sanitizeText(params.review_status_before, 80)
        : null,
      review_status_after: params.review_status_after
        ? sanitizeText(params.review_status_after, 80)
        : null,
      subject_document_number: params.subject_document_number
        ? sanitizeText(params.subject_document_number, 80)
        : null,
      subject_document_type: params.subject_document_type
        ? sanitizeText(params.subject_document_type, 40)
        : null,
      report_type: params.report_type ? sanitizeText(params.report_type, 160) : null,
      legal_basis: params.legal_basis ? sanitizeText(params.legal_basis, 120) : null,
      legal_version_id: normalizeUuid(params.legal_version_id || null),
      evidence_count:
        typeof params.evidence_count === 'number' && Number.isFinite(params.evidence_count)
          ? params.evidence_count
          : null,
      evidence_hashes: normalizeEvidenceHashes(params.evidence_hashes),
      ip_address: params.request?.ip_address ? sanitizeText(params.request.ip_address, 80) : null,
      user_agent: params.request?.user_agent ? sanitizeText(params.request.user_agent, 300) : null,
      request_id: params.request?.request_id ? sanitizeText(params.request.request_id, 120) : null,
      error_code: params.error_code ? sanitizeText(params.error_code, 120) : null,
      error_message: params.error_message ? sanitizeText(params.error_message, 600) : null,
      metadata: sanitizeForAudit(params.metadata || {}),
    });

    if (error) {
      console.warn('[LEGAL_REPORT_AUDIT_FAILED]', {
        action: 'insert_failed',
        event_type: params.event_type,
        report_id: params.report_id || null,
        error: error.message,
      });
      return false;
    }

    console.log('[LEGAL_REPORT_AUDIT_LOGGED]', {
      event_type: params.event_type,
      event_status: params.event_status,
      report_id: params.report_id || null,
    });
    return true;
  } catch (error) {
    console.warn('[LEGAL_REPORT_AUDIT_FAILED]', {
      action: 'insert_exception',
      event_type: params.event_type,
      report_id: params.report_id || null,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}
