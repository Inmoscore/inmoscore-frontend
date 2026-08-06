import type { SupabaseClient } from '@supabase/supabase-js';
import { buildOperationalLogEntry, writeOperationalLog } from './lib/adminOperationalSafety';

export async function logSecurityEvent(
  supabase: SupabaseClient,
  type: string,
  metadata: Record<string, unknown>,
  userId?: string | null,
  organizationId?: string | null
): Promise<void> {
  try {
    await supabase.from('security_events').insert({
      event_type: type,
      metadata,
      user_id: userId ?? null,
      organization_id: organizationId ?? null
    });
  } catch (err) {
    writeOperationalLog(
      'error',
      '[SECURITY_AUDIT_ERROR]',
      buildOperationalLogEntry({
        category: 'audit_insert_failed',
        operation: 'insert',
        endpointKey: 'security_events',
        error: err,
      })
    );
  }
}
