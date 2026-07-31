import type { NextFunction, Request, Response } from 'express';
import { supabase } from './supabase';
import { logSecurityEvent } from '../securityAudit';

export const EMAIL_VERIFICATION_REQUIRED_CODE = 'EMAIL_VERIFICATION_REQUIRED';

export type EmailSessionScope = 'restricted' | 'full';

export type EmailVerificationJwtUser = {
  id: string;
  email: string;
  tipo_usuario: string;
  session_scope?: EmailSessionScope;
};

export type EmailVerificationRequest = Request & {
  user?: EmailVerificationJwtUser;
};

export type PersistedEmailVerificationState = {
  id: string;
  email_verified_at: string | null;
};

type EmailVerificationPolicyDependencies = {
  loadPersistedState: (userId: string) => Promise<PersistedEmailVerificationState | null>;
  auditBlocked: (
    req: EmailVerificationRequest,
    reason: 'persisted_state_unavailable' | 'email_not_confirmed' | 'session_reissue_required'
  ) => Promise<void>;
};

const RESTRICTED_SESSION_ALLOWLIST = new Set<string>([
  'POST /api/stripe/webhook',
  'POST /api/wompi/webhook',
  'POST /api/auth/register',
  'POST /api/auth/login',
  'GET /api/account/status',
  'POST /api/auth/resend-verification',
  'POST /api/auth/password-reset',
  'POST /api/auth/password-reset/complete',
  'GET /api/legal/documents/active',
  'POST /api/legal/data-requests',
  'GET /api/legal/data-requests/my',
  'POST /api/legal/disputes',
  'GET /api/legal/disputes/my',
  'POST /api/legal/human-review-requests',
  'GET /api/legal/human-review-requests/my',
]);

export function isRestrictedSessionAllowed(method: string, path: string): boolean {
  return RESTRICTED_SESSION_ALLOWLIST.has(`${method.toUpperCase()} ${path}`);
}

export function hasPersistedEmailConfirmation(
  state: PersistedEmailVerificationState | null | undefined
): boolean {
  return Boolean(state?.email_verified_at?.trim());
}

export function getPlanActivationDecision(
  emailVerifiedAt: string | null | undefined
): 'activate' | 'defer_email_verification' {
  return emailVerifiedAt?.trim() ? 'activate' : 'defer_email_verification';
}

export function evaluateEmailVerificationAccess(params: {
  persistedState: PersistedEmailVerificationState | null;
  sessionScope?: EmailSessionScope;
}):
  | { allowed: true }
  | {
      allowed: false;
      reason: 'persisted_state_unavailable' | 'email_not_confirmed' | 'session_reissue_required';
    } {
  if (!params.persistedState) {
    return { allowed: false, reason: 'persisted_state_unavailable' };
  }

  if (!hasPersistedEmailConfirmation(params.persistedState)) {
    return { allowed: false, reason: 'email_not_confirmed' };
  }

  if (params.sessionScope !== 'full') {
    return { allowed: false, reason: 'session_reissue_required' };
  }

  return { allowed: true };
}

export function createRequireConfirmedEmailSession(
  dependencies: EmailVerificationPolicyDependencies
) {
  return async function requireConfirmedEmailSession(
    req: EmailVerificationRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const user = req.user;

    if (!user?.id) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
      return;
    }

    let persistedState: PersistedEmailVerificationState | null = null;

    try {
      persistedState = await dependencies.loadPersistedState(user.id);
    } catch {
      await dependencies.auditBlocked(req, 'persisted_state_unavailable');
      res.status(403).json({
        success: false,
        code: EMAIL_VERIFICATION_REQUIRED_CODE,
        message: 'Debes verificar tu correo e iniciar sesion nuevamente.',
      });
      return;
    }

    const decision = evaluateEmailVerificationAccess({
      persistedState,
      sessionScope: user.session_scope,
    });

    if (!decision.allowed) {
      await dependencies.auditBlocked(req, decision.reason);
      res.status(403).json({
        success: false,
        code: EMAIL_VERIFICATION_REQUIRED_CODE,
        message: 'Debes verificar tu correo e iniciar sesion nuevamente.',
      });
      return;
    }

    next();
  };
}

export const requireConfirmedEmailSession = createRequireConfirmedEmailSession({
  loadPersistedState: async (userId) => {
    const { data, error } = await supabase
      .from('users')
      .select('id, email_verified_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data as PersistedEmailVerificationState | null) || null;
  },
  auditBlocked: async (req, reason) => {
    await logSecurityEvent(
      supabase,
      'email_verification_required',
      {
        reason,
        method: req.method,
        path: req.path,
      },
      req.user?.id || null
    );
  },
});
