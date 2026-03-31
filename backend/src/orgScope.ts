import type { SupabaseClient } from '@supabase/supabase-js';

export interface ScopeContext {
  organizationId: string;
  isPlatformAdmin: boolean;
}

export interface SecurityContext {
  organizationId?: string;
  isAdmin: boolean;
}

/**
 * Consulta obligatoriamente acotada por organización.
 * Admin de plataforma (INMOSCORE_ADMIN_ORG_ID) opera sin filtro — solo para operaciones explícitas y auditadas.
 */
export function scopedTable(
  supabase: SupabaseClient,
  table: string,
  ctx: ScopeContext
) {
  if (ctx.isPlatformAdmin) {
    return supabase.from(table);
  }
  return supabase.from(table).select('*').eq('organization_id', ctx.organizationId);
}

export function assertTenantOrg(
  tenantOrgId: string | null | undefined,
  ctx: ScopeContext,
  tenantId: string
): boolean {
  if (ctx.isPlatformAdmin) return true;
  return tenantOrgId === ctx.organizationId;
}

export const scopedMutation = (
  supabase: SupabaseClient,
  table: string,
  ctx: SecurityContext
) => {
  if (ctx.isAdmin) return supabase.from(table);
  if (!ctx.organizationId) throw new Error('ORG_REQUIRED');
  return supabase.from(table);
};
