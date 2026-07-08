export type TurnstileVerificationResult =
  | { ok: true }
  | { ok: false; code: 'TURNSTILE_REQUIRED' | 'TURNSTILE_FAILED'; status: 400 | 403; reason: string };

type TurnstileSiteVerifyResponse = {
  success?: boolean;
  'error-codes'?: string[];
};

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstileToken(
  token: string | null | undefined,
  ip: string | null | undefined
): Promise<TurnstileVerificationResult> {
  const cleanToken = typeof token === 'string' ? token.trim() : '';

  if (!cleanToken) {
    return { ok: false, code: 'TURNSTILE_REQUIRED', status: 400, reason: 'missing_token' };
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return { ok: false, code: 'TURNSTILE_FAILED', status: 403, reason: 'missing_secret_key' };
  }

  try {
    console.log('[TURNSTILE_SECRET_DEBUG]', {
      hasSecret: Boolean(secret),
      secretLength: secret?.length || 0,
      prefix: secret?.slice(0, 4),
      suffix: secret?.slice(-2),
    });

    const formData = new URLSearchParams();
    formData.set('secret', secret);
    formData.set('response', cleanToken);

    if (ip) {
      formData.set('remoteip', ip);
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });
    const verification = (await response.json()) as TurnstileSiteVerifyResponse;

    if (!response.ok || verification.success !== true) {
      console.log('[TURNSTILE_SITEVERIFY_ERROR_CODES]', {
        status: response.status,
        errorCodes: verification['error-codes'] || [],
      });

      return {
        ok: false,
        code: 'TURNSTILE_FAILED',
        status: 403,
        reason: verification['error-codes']?.join(',') || `siteverify_status_${response.status}`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: 'TURNSTILE_FAILED',
      status: 403,
      reason: error instanceof Error ? error.message : 'siteverify_exception',
    };
  }
}
