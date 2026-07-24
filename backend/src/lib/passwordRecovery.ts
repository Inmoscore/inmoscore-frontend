import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const passwordResetCompleteSchema = z
  .object({
    new_password: z.string().min(8).max(128),
  })
  .strict();

export type ValidatedSupabaseIdentity = {
  id: string;
  email: string;
};

export type LocalPasswordUser = {
  id: string;
};

export type PasswordRecoveryDependencies = {
  validateAccessToken: (accessToken: string) => Promise<ValidatedSupabaseIdentity | null>;
  findLocalUser: (authUserId: string) => Promise<LocalPasswordUser | null>;
  verifySupabasePassword: (params: {
    email: string;
    password: string;
    expectedUserId: string;
  }) => Promise<boolean>;
  hashPassword: (password: string) => Promise<string>;
  updateLocalPassword: (userId: string, passwordHash: string) => Promise<boolean>;
  audit: (params: {
    userId: string | null;
    email: string | null;
    status: "success" | "failed";
    failureReason?: string;
  }) => Promise<void>;
};

export type PasswordRecoveryResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "invalid_session"
        | "invalid_credentials"
        | "local_user_not_found"
        | "local_sync_failed";
    };

type PasswordVerificationClient = {
  auth: {
    signInWithPassword: (credentials: {
      email: string;
      password: string;
    }) => Promise<{ data: { user: { id: string } | null }; error: unknown | null }>;
    signOut: (options: { scope: "local" }) => Promise<unknown>;
  };
};

export async function verifyPasswordWithClient(
  verificationClient: PasswordVerificationClient,
  params: { email: string; password: string; expectedUserId: string }
): Promise<boolean> {
  try {
    const { data, error } = await verificationClient.auth.signInWithPassword({
      email: params.email,
      password: params.password,
    });
    return !error && Boolean(data.user?.id) && data.user?.id === params.expectedUserId;
  } finally {
    await verificationClient.auth.signOut({ scope: "local" }).catch(() => null);
  }
}

export async function verifyPasswordWithAnonymousClient(params: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  email: string;
  password: string;
  expectedUserId: string;
}): Promise<boolean> {
  const verificationClient = createClient(params.supabaseUrl, params.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return verifyPasswordWithClient(verificationClient, params);
}

export async function synchronizeRecoveredPassword(
  accessToken: string,
  newPassword: string,
  dependencies: PasswordRecoveryDependencies
): Promise<PasswordRecoveryResult> {
  const identity = await dependencies.validateAccessToken(accessToken);
  if (!identity) {
    await dependencies.audit({
      userId: null,
      email: null,
      status: "failed",
      failureReason: "invalid_supabase_access_token",
    });
    return { ok: false, reason: "invalid_session" };
  }

  const localUser = await dependencies.findLocalUser(identity.id);
  if (!localUser) {
    await dependencies.audit({
      userId: null,
      email: identity.email,
      status: "failed",
      failureReason: "local_user_not_found",
    });
    return { ok: false, reason: "local_user_not_found" };
  }

  const passwordIsValid = await dependencies.verifySupabasePassword({
    email: identity.email,
    password: newPassword,
    expectedUserId: identity.id,
  });
  if (!passwordIsValid) {
    await dependencies.audit({
      userId: localUser.id,
      email: identity.email,
      status: "failed",
      failureReason: "supabase_password_verification_failed",
    });
    return { ok: false, reason: "invalid_credentials" };
  }

  const passwordHash = await dependencies.hashPassword(newPassword);
  const localUpdated = await dependencies.updateLocalPassword(localUser.id, passwordHash);
  if (!localUpdated) {
    await dependencies.audit({
      userId: localUser.id,
      email: identity.email,
      status: "failed",
      failureReason: "local_password_sync_failed",
    });
    return { ok: false, reason: "local_sync_failed" };
  }

  await dependencies.audit({
    userId: localUser.id,
    email: identity.email,
    status: "success",
  });
  return { ok: true };
}
