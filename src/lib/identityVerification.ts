'use client';

import { getToken } from '@/lib/auth';

export type IdentityVerificationStatus =
  | 'unverified'
  | 'pending_review'
  | 'verified'
  | 'rejected'
  | string;

export type IdentityAwareUser = {
  id?: string;
  email?: string;
  nombre?: string;
  fullName?: string;
  tipo_usuario?: string;
  plan_type?: string;
  daily_search_limit?: number | null;
  bonus_credits_available?: number | null;
  identity_verification_status?: IdentityVerificationStatus | null;
  reporting_eligibility_status?: string | null;
  [key: string]: unknown;
};

type IdentityStatusResponse = {
  success?: boolean;
  identity?: IdentityAwareUser;
  reporting_eligibility_status?: string | null;
};

export const IDENTITY_VERIFICATION_REQUIRED_CODE = 'IDENTITY_VERIFICATION_REQUIRED';
export const IDENTITY_VERIFICATION_REQUIRED_MESSAGE =
  'Debes verificar tu identidad antes de reportar o aportar historial.';

export function isIdentityVerified(user?: IdentityAwareUser | null): boolean {
  return user?.identity_verification_status === 'verified';
}

export function getStoredIdentityUser(): IdentityAwareUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('user') || localStorage.getItem('inmoscore_user');
  if (!raw) return null;

  try {
    return JSON.parse(raw) as IdentityAwareUser;
  } catch {
    return null;
  }
}

export function mergeStoredIdentityUser(identity: IdentityAwareUser): IdentityAwareUser {
  if (typeof window === 'undefined') return identity;

  const current = getStoredIdentityUser() || {};
  const merged = {
    ...current,
    ...identity,
    reporting_eligibility_status:
      identity.reporting_eligibility_status ?? current.reporting_eligibility_status ?? null,
  };

  localStorage.setItem('user', JSON.stringify(merged));
  return merged;
}

export async function fetchCurrentIdentityUser(apiUrl?: string): Promise<IdentityAwareUser | null> {
  const token = getToken();
  if (!token || !apiUrl) return getStoredIdentityUser();

  const response = await fetch(`${apiUrl}/api/legal/identity-verification/my`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return getStoredIdentityUser();

  const data = (await response.json().catch(() => null)) as IdentityStatusResponse | null;
  if (!data?.success || !data.identity) return getStoredIdentityUser();

  return mergeStoredIdentityUser({
    ...data.identity,
    reporting_eligibility_status:
      data.identity.reporting_eligibility_status ?? data.reporting_eligibility_status ?? null,
  });
}
