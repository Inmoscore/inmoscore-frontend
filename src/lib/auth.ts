'use client';

export const INMOSCORE_TOKEN_COOKIE = 'inmoscore_token';

const STORAGE_TOKEN = 'token';
const STORAGE_USER = 'user';

/** Max-Age en segundos para la cookie (ajustable; el JWT sigue validándose en backend). */
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;

function writeTokenCookie(token: string): void {
  document.cookie = `${INMOSCORE_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
}

function eraseTokenCookie(): void {
  document.cookie = `${INMOSCORE_TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function setSession(token: string, user: unknown): void {
  if (typeof window === 'undefined') return;
  const normalized = token.replace(/^Bearer\s+/i, '').trim();
  localStorage.setItem(STORAGE_TOKEN, normalized);
  localStorage.setItem(STORAGE_USER, JSON.stringify(user));
  writeTokenCookie(normalized);
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_TOKEN);
  localStorage.removeItem(STORAGE_USER);
  eraseTokenCookie();
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_TOKEN);
  const t = raw?.replace(/^Bearer\s+/i, '').trim() ?? '';
  return t || null;
}

export function hasSession(): boolean {
  return getToken() !== null;
}
