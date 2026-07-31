import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMAIL_VERIFICATION_REQUIRED_CODE,
  createRequireConfirmedEmailSession,
  evaluateEmailVerificationAccess,
  getPlanActivationDecision,
  isRestrictedSessionAllowed,
} from './emailVerificationPolicy';

function createResponseRecorder() {
  const record: {
    statusCode: number | null;
    payload: Record<string, unknown> | null;
  } = {
    statusCode: null,
    payload: null,
  };

  return {
    record,
    response: {
      status(code: number) {
        record.statusCode = code;
        return this;
      },
      json(payload: Record<string, unknown>) {
        record.payload = payload;
        return this;
      },
    },
  };
}

test('restricted allowlist matches exact method and path only', () => {
  assert.equal(isRestrictedSessionAllowed('GET', '/api/account/status'), true);
  assert.equal(isRestrictedSessionAllowed('POST', '/api/auth/resend-verification'), true);
  assert.equal(isRestrictedSessionAllowed('POST', '/api/auth/password-reset'), true);
  assert.equal(isRestrictedSessionAllowed('POST', '/api/auth/password-reset/complete'), true);
  assert.equal(isRestrictedSessionAllowed('GET', '/api/auth/resend-verification'), false);
  assert.equal(isRestrictedSessionAllowed('POST', '/api/auth/change-password'), false);
  assert.equal(isRestrictedSessionAllowed('GET', '/api/account/status/extra'), false);
  assert.equal(isRestrictedSessionAllowed('POST', '/api/legal/identity-verification/request'), false);
});

test('persisted unconfirmed state blocks even a full session claim', () => {
  assert.deepEqual(
    evaluateEmailVerificationAccess({
      persistedState: { id: 'user-1', email_verified_at: null },
      sessionScope: 'full',
    }),
    { allowed: false, reason: 'email_not_confirmed' }
  );
});

test('approved payment activation is deferred without canonical confirmation timestamp', () => {
  assert.equal(getPlanActivationDecision(null), 'defer_email_verification');
  assert.equal(getPlanActivationDecision(''), 'defer_email_verification');
  assert.equal(
    getPlanActivationDecision('2026-07-30T12:00:00.000Z'),
    'activate'
  );
});

test('confirmed persisted state authorizes only a reissued full session', () => {
  assert.deepEqual(
    evaluateEmailVerificationAccess({
      persistedState: { id: 'user-1', email_verified_at: '2026-07-30T12:00:00.000Z' },
      sessionScope: 'restricted',
    }),
    { allowed: false, reason: 'session_reissue_required' }
  );
  assert.deepEqual(
    evaluateEmailVerificationAccess({
      persistedState: { id: 'user-1', email_verified_at: '2026-07-30T12:00:00.000Z' },
      sessionScope: 'full',
    }),
    { allowed: true }
  );
});

test('direct API middleware call cannot bypass persisted unconfirmed state', async () => {
  const audited: string[] = [];
  const middleware = createRequireConfirmedEmailSession({
    loadPersistedState: async () => ({ id: 'user-1', email_verified_at: null }),
    auditBlocked: async (_req, reason) => {
      audited.push(reason);
    },
  });
  const { record, response } = createResponseRecorder();
  let nextCalled = false;

  await middleware(
    {
      method: 'GET',
      path: '/api/tenants/search',
      user: {
        id: 'user-1',
        email: 'hidden@example.invalid',
        tipo_usuario: 'propietario',
        session_scope: 'full',
      },
    } as never,
    response as never,
    (() => {
      nextCalled = true;
    }) as never
  );

  assert.equal(nextCalled, false);
  assert.equal(record.statusCode, 403);
  assert.equal(record.payload?.code, EMAIL_VERIFICATION_REQUIRED_CODE);
  assert.deepEqual(audited, ['email_not_confirmed']);
});

test('unconfirmed admin is blocked before administrative handlers', async () => {
  const middleware = createRequireConfirmedEmailSession({
    loadPersistedState: async () => ({ id: 'admin-1', email_verified_at: null }),
    auditBlocked: async () => undefined,
  });
  const { record, response } = createResponseRecorder();
  let nextCalled = false;

  await middleware(
    {
      method: 'GET',
      path: '/api/admin/users',
      user: {
        id: 'admin-1',
        email: 'hidden@example.invalid',
        tipo_usuario: 'admin',
        session_scope: 'full',
      },
    } as never,
    response as never,
    (() => {
      nextCalled = true;
    }) as never
  );

  assert.equal(nextCalled, false);
  assert.equal(record.statusCode, 403);
});

test('confirmed full session reaches the protected handler', async () => {
  const middleware = createRequireConfirmedEmailSession({
    loadPersistedState: async () => ({
      id: 'user-1',
      email_verified_at: '2026-07-30T12:00:00.000Z',
    }),
    auditBlocked: async () => undefined,
  });
  const { response } = createResponseRecorder();
  let nextCalled = false;

  await middleware(
    {
      method: 'GET',
      path: '/api/tenants/search',
      user: {
        id: 'user-1',
        email: 'hidden@example.invalid',
        tipo_usuario: 'propietario',
        session_scope: 'full',
      },
    } as never,
    response as never,
    (() => {
      nextCalled = true;
    }) as never
  );

  assert.equal(nextCalled, true);
});
