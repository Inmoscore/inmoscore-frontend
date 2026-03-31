/** UUID reservado para datos migrados desde Phase 1 (TEXT legacy-org). Bloqueado para API hasta onboarding real. */
export const LEGACY_ORG_UUID = '00000000-0000-4000-8000-000000000001';
export const LEGACY_ORG_TEXT = 'legacy-org';

export function isBlockedOrganizationId(id?: string | null): boolean {
  if (id == null || id === '') return true;
  if (id === LEGACY_ORG_TEXT) return true;
  if (id === LEGACY_ORG_UUID) return true;
  return false;
}
