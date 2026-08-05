export type IdentityVerificationOperation = "approve" | "reject";

export type IdentityVerificationPayload = {
  action: IdentityVerificationOperation;
  notes?: string;
};

export type PendingIdentityVerificationAction = {
  operation: IdentityVerificationOperation;
  documentId: string;
  payload: IdentityVerificationPayload;
  phase: "submitting" | "awaiting_mfa" | "challenging_mfa" | "retrying";
  automaticRetryAttempted: boolean;
};

export type IdentityVerificationPatchResult =
  | { type: "success" }
  | { type: "mfa_required" }
  | { type: "conflict" }
  | { type: "error"; message: string };

export type IdentityVerificationChallengeResult =
  | { success: true }
  | { success: false; message: string };

export type IdentityVerificationExecutionResult =
  | { status: "success"; operation: IdentityVerificationOperation }
  | { status: "conflict" }
  | { status: "challenge_failed"; message: string }
  | { status: "repeated_mfa_required" }
  | { status: "error"; message: string }
  | { status: "busy"; pending: PendingIdentityVerificationAction };

export type IdentityVerificationActionDependencies = {
  patch: (
    action: Readonly<PendingIdentityVerificationAction>
  ) => Promise<IdentityVerificationPatchResult>;
  challenge: () => Promise<IdentityVerificationChallengeResult>;
  synchronize: () => Promise<unknown>;
  onPendingChange?: (action: PendingIdentityVerificationAction | null) => void;
  onMfaVerified?: () => void;
  onMutationSettled?: (
    documentId: string,
    result: "success" | "conflict"
  ) => void;
};

function copyPendingAction(
  action: PendingIdentityVerificationAction
): PendingIdentityVerificationAction {
  return {
    ...action,
    payload: { ...action.payload },
  };
}

export class IdentityVerificationActionController {
  private pending: PendingIdentityVerificationAction | null = null;

  getPending(): PendingIdentityVerificationAction | null {
    return this.pending ? copyPendingAction(this.pending) : null;
  }

  async execute(
    input: {
      operation: IdentityVerificationOperation;
      documentId: string;
      payload: IdentityVerificationPayload;
    },
    dependencies: IdentityVerificationActionDependencies
  ): Promise<IdentityVerificationExecutionResult> {
    if (this.pending) {
      return { status: "busy", pending: copyPendingAction(this.pending) };
    }

    this.setPending(
      {
        operation: input.operation,
        documentId: input.documentId,
        payload: { ...input.payload },
        phase: "submitting",
        automaticRetryAttempted: false,
      },
      dependencies
    );

    try {
      const firstResult = await this.runPatch(dependencies);
      if (firstResult.type !== "mfa_required") {
        return await this.finishPatchResult(firstResult, dependencies);
      }

      this.updatePending({ phase: "awaiting_mfa" }, dependencies);
      this.updatePending({ phase: "challenging_mfa" }, dependencies);

      const challengeResult = await dependencies.challenge();
      if (!challengeResult.success) {
        return { status: "challenge_failed", message: challengeResult.message };
      }

      dependencies.onMfaVerified?.();
      this.updatePending(
        { phase: "retrying", automaticRetryAttempted: true },
        dependencies
      );

      const retryResult = await this.runPatch(dependencies);
      if (retryResult.type === "mfa_required") {
        return { status: "repeated_mfa_required" };
      }

      return await this.finishPatchResult(retryResult, dependencies);
    } catch (error) {
      return {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error actualizando la verificación",
      };
    } finally {
      this.pending = null;
      dependencies.onPendingChange?.(null);
    }
  }

  private async runPatch(
    dependencies: IdentityVerificationActionDependencies
  ): Promise<IdentityVerificationPatchResult> {
    if (!this.pending) {
      return { type: "error", message: "No hay una acción pendiente" };
    }

    return dependencies.patch(copyPendingAction(this.pending));
  }

  private async finishPatchResult(
    result: IdentityVerificationPatchResult,
    dependencies: IdentityVerificationActionDependencies
  ): Promise<IdentityVerificationExecutionResult> {
    if (result.type === "error") {
      return { status: "error", message: result.message };
    }

    if (result.type === "mfa_required") {
      return { status: "repeated_mfa_required" };
    }

    if (!this.pending) {
      return { status: "error", message: "No hay una acción pendiente" };
    }

    dependencies.onMutationSettled?.(this.pending.documentId, result.type);

    // La persistencia ya terminó. Una recarga parcial nunca debe convertirla
    // retroactivamente en un error de mutación.
    try {
      await dependencies.synchronize();
    } catch {
      // El consumidor puede mostrar errores específicos de sus loaders.
    }

    return result.type === "conflict"
      ? { status: "conflict" }
      : { status: "success", operation: this.pending.operation };
  }

  private setPending(
    action: PendingIdentityVerificationAction,
    dependencies: IdentityVerificationActionDependencies
  ) {
    this.pending = action;
    dependencies.onPendingChange?.(copyPendingAction(action));
  }

  private updatePending(
    changes: Partial<PendingIdentityVerificationAction>,
    dependencies: IdentityVerificationActionDependencies
  ) {
    if (!this.pending) return;
    this.pending = {
      ...this.pending,
      ...changes,
      payload: { ...this.pending.payload },
    };
    dependencies.onPendingChange?.(copyPendingAction(this.pending));
  }
}
