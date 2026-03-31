import type { SupabaseClient } from '@supabase/supabase-js';

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
    console.error('security_events insert failed:', err);
  }
}
