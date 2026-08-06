import assert from "node:assert/strict";
import test from "node:test";
import {
  IdentityVerificationActionController,
  type IdentityVerificationActionDependencies,
  type IdentityVerificationPatchResult,
  type PendingIdentityVerificationAction,
} from "./identityVerificationAction.ts";

const APPROVE_INPUT = {
  operation: "approve" as const,
  documentId: "document-approve",
  payload: { action: "approve" as const, notes: "identidad confirmada" },
};

const REJECT_INPUT = {
  operation: "reject" as const,
  documentId: "document-reject",
  payload: { action: "reject" as const, notes: "documento ilegible" },
};

function dependencies(
  overrides: Partial<IdentityVerificationActionDependencies> = {}
): IdentityVerificationActionDependencies {
  return {
    patch: async () => ({ type: "success" }),
    challenge: async () => ({ success: true }),
    synchronize: async () => undefined,
    ...overrides,
  };
}

test("aprueba con MFA vigente usando un solo PATCH", async () => {
  const controller = new IdentityVerificationActionController();
  let patchCount = 0;
  let challengeCount = 0;

  const result = await controller.execute(
    APPROVE_INPUT,
    dependencies({
      patch: async () => {
        patchCount += 1;
        return { type: "success" };
      },
      challenge: async () => {
        challengeCount += 1;
        return { success: true };
      },
    })
  );

  assert.deepEqual(result, { status: "success", operation: "approve" });
  assert.equal(patchCount, 1);
  assert.equal(challengeCount, 0);
});

test("rechaza con MFA vigente conservando las notas", async () => {
  const controller = new IdentityVerificationActionController();
  const calls: PendingIdentityVerificationAction[] = [];

  const result = await controller.execute(
    REJECT_INPUT,
    dependencies({
      patch: async (pending) => {
        calls.push({ ...pending, payload: { ...pending.payload } });
        return { type: "success" };
      },
    })
  );

  assert.deepEqual(result, { status: "success", operation: "reject" });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].payload, REJECT_INPUT.payload);
});

test("MFA vencido ejecuta un único reintento con documentId, operación, payload y notas idénticos", async () => {
  const controller = new IdentityVerificationActionController();
  const calls: PendingIdentityVerificationAction[] = [];
  let challengeCount = 0;
  let verifiedNoticeCount = 0;

  const result = await controller.execute(
    APPROVE_INPUT,
    dependencies({
      patch: async (pending) => {
        calls.push({ ...pending, payload: { ...pending.payload } });
        return calls.length === 1 ? { type: "mfa_required" } : { type: "success" };
      },
      challenge: async () => {
        challengeCount += 1;
        return { success: true };
      },
      onMfaVerified: () => {
        verifiedNoticeCount += 1;
      },
    })
  );

  assert.equal(result.status, "success");
  assert.equal(challengeCount, 1);
  assert.equal(verifiedNoticeCount, 1);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.documentId, APPROVE_INPUT.documentId);
    assert.equal(call.operation, APPROVE_INPUT.operation);
    assert.deepEqual(call.payload, APPROVE_INPUT.payload);
  }
  assert.equal(calls[0].automaticRetryAttempted, false);
  assert.equal(calls[1].automaticRetryAttempted, true);
});

test("challenge inválido detiene la operación sin segundo PATCH", async () => {
  const controller = new IdentityVerificationActionController();
  let patchCount = 0;
  let synchronizeCount = 0;

  const result = await controller.execute(
    APPROVE_INPUT,
    dependencies({
      patch: async () => {
        patchCount += 1;
        return { type: "mfa_required" };
      },
      challenge: async () => ({ success: false, message: "Código MFA inválido." }),
      synchronize: async () => {
        synchronizeCount += 1;
      },
    })
  );

  assert.deepEqual(result, {
    status: "challenge_failed",
    message: "Código MFA inválido.",
  });
  assert.equal(patchCount, 1);
  assert.equal(synchronizeCount, 0);
});

test("un segundo MFA_REQUIRED termina sin tercer PATCH ni segundo challenge", async () => {
  const controller = new IdentityVerificationActionController();
  let patchCount = 0;
  let challengeCount = 0;

  const result = await controller.execute(
    APPROVE_INPUT,
    dependencies({
      patch: async () => {
        patchCount += 1;
        return { type: "mfa_required" };
      },
      challenge: async () => {
        challengeCount += 1;
        return { success: true };
      },
    })
  );

  assert.deepEqual(result, { status: "repeated_mfa_required" });
  assert.equal(patchCount, 2);
  assert.equal(challengeCount, 1);
});

test("409 se trata como conflicto, sincroniza y no reintenta", async () => {
  const controller = new IdentityVerificationActionController();
  let patchCount = 0;
  let synchronizeCount = 0;
  const settled: Array<[string, string]> = [];

  const result = await controller.execute(
    REJECT_INPUT,
    dependencies({
      patch: async () => {
        patchCount += 1;
        return { type: "conflict" };
      },
      synchronize: async () => {
        synchronizeCount += 1;
      },
      onMutationSettled: (documentId, status) => settled.push([documentId, status]),
    })
  );

  assert.deepEqual(result, { status: "conflict" });
  assert.equal(patchCount, 1);
  assert.equal(synchronizeCount, 1);
  assert.deepEqual(settled, [[REJECT_INPUT.documentId, "conflict"]]);
});

test("doble clic y una operación distinta quedan bloqueados durante el challenge MFA", async () => {
  const controller = new IdentityVerificationActionController();
  let notifyChallengeStarted: (() => void) | undefined;
  let releaseChallenge: (() => void) | undefined;
  let patchCount = 0;
  const challengeStarted = new Promise<void>((resolve) => {
    notifyChallengeStarted = resolve;
  });
  const blockedChallenge = new Promise<void>((resolve) => {
    releaseChallenge = resolve;
  });
  const deps = dependencies({
    patch: async () => {
      patchCount += 1;
      return patchCount === 1 ? { type: "mfa_required" } : { type: "success" };
    },
    challenge: async () => {
      notifyChallengeStarted?.();
      await blockedChallenge;
      return { success: true };
    },
  });

  const first = controller.execute(APPROVE_INPUT, deps);
  await challengeStarted;
  const duplicate = await controller.execute(APPROVE_INPUT, deps);
  const different = await controller.execute(REJECT_INPUT, deps);

  assert.equal(duplicate.status, "busy");
  assert.equal(different.status, "busy");
  if (different.status === "busy") {
    assert.equal(different.pending.documentId, APPROVE_INPUT.documentId);
    assert.equal(different.pending.operation, "approve");
  }
  assert.equal(patchCount, 1);

  assert.ok(releaseChallenge);
  releaseChallenge();
  assert.deepEqual(await first, { status: "success", operation: "approve" });
  assert.equal(patchCount, 2);
});

test("sincroniza lista, métricas, acciones, auditoría y usuarios", async () => {
  const controller = new IdentityVerificationActionController();
  const reloads: string[] = [];
  const loaders = ["lista", "métricas", "acciones", "auditoría", "usuarios"].map(
    (name) => async () => {
      reloads.push(name);
    }
  );

  const result = await controller.execute(
    APPROVE_INPUT,
    dependencies({
      synchronize: async () => {
        await Promise.allSettled(loaders.map((loader) => loader()));
      },
    })
  );

  assert.equal(result.status, "success");
  assert.deepEqual(reloads, ["lista", "métricas", "acciones", "auditoría", "usuarios"]);
});

test("un fallo parcial de sincronización no reporta la mutación como fallida", async () => {
  const controller = new IdentityVerificationActionController();
  let successfulReloads = 0;

  const result = await controller.execute(
    REJECT_INPUT,
    dependencies({
      synchronize: async () => {
        await Promise.allSettled([
          Promise.resolve().then(() => {
            successfulReloads += 1;
          }),
          Promise.reject(new Error("métricas no disponibles")),
          Promise.resolve().then(() => {
            successfulReloads += 1;
          }),
        ]);
      },
    })
  );

  assert.deepEqual(result, { status: "success", operation: "reject" });
  assert.equal(successfulReloads, 2);
});

test("errores de red o servidor no disparan challenge, reintento ni sincronización", async () => {
  const controller = new IdentityVerificationActionController();
  let patchCount = 0;
  let challengeCount = 0;
  let synchronizeCount = 0;

  const result = await controller.execute(
    APPROVE_INPUT,
    dependencies({
      patch: async (): Promise<IdentityVerificationPatchResult> => {
        patchCount += 1;
        return { type: "error", message: "Servicio no disponible" };
      },
      challenge: async () => {
        challengeCount += 1;
        return { success: true };
      },
      synchronize: async () => {
        synchronizeCount += 1;
      },
    })
  );

  assert.deepEqual(result, { status: "error", message: "Servicio no disponible" });
  assert.equal(patchCount, 1);
  assert.equal(challengeCount, 0);
  assert.equal(synchronizeCount, 0);
});
