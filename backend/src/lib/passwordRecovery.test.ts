import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import {
  passwordResetCompleteSchema,
  synchronizeRecoveredPassword,
  verifyPasswordWithClient,
  type PasswordRecoveryDependencies,
} from "./passwordRecovery";

function createDependencies(overrides: Partial<PasswordRecoveryDependencies> = {}) {
  const calls: string[] = [];
  let storedHash = bcrypt.hashSync("OldPassword1", 4);
  const dependencies: PasswordRecoveryDependencies = {
    async validateAccessToken() {
      calls.push("validateAccessToken");
      return { id: "auth-user-1", email: "user@example.test" };
    },
    async findLocalUser() {
      calls.push("findLocalUser");
      return { id: "local-user-1" };
    },
    async verifySupabasePassword() {
      calls.push("verifySupabasePassword");
      return true;
    },
    async hashPassword(password) {
      calls.push("hashPassword");
      return bcrypt.hash(password, 4);
    },
    async updateLocalPassword(_userId, passwordHash) {
      calls.push("updateLocalPassword");
      storedHash = passwordHash;
      return true;
    },
    async audit(params) {
      calls.push(`audit:${params.status}`);
    },
    ...overrides,
  };
  return { dependencies, calls, getStoredHash: () => storedHash };
}

test("enforces the eight-character strict request contract", () => {
  assert.equal(passwordResetCompleteSchema.safeParse({ new_password: "short" }).success, false);
  assert.equal(
    passwordResetCompleteSchema.safeParse({
      new_password: "NewPassword1",
      email: "not-trusted@example.test",
    }).success,
    false
  );
  assert.equal(
    passwordResetCompleteSchema.safeParse({ new_password: "NewPassword1" }).success,
    true
  );
});

test("always discards the anonymous verification session", async () => {
  let signOutCalls = 0;
  const client = {
    auth: {
      async signInWithPassword() {
        throw new Error("network failure");
      },
      async signOut() {
        signOutCalls += 1;
      },
    },
  };

  await assert.rejects(
    verifyPasswordWithClient(client, {
      email: "user@example.test",
      password: "NewPassword1",
      expectedUserId: "auth-user-1",
    })
  );
  assert.equal(signOutCalls, 1);
});

test("rejects an invalid access token before password verification", async () => {
  const { dependencies, calls } = createDependencies({
    validateAccessToken: async () => null,
  });
  const result = await synchronizeRecoveredPassword("token", "NewPassword1", dependencies);
  assert.deepEqual(result, { ok: false, reason: "invalid_session" });
  assert.equal(calls.includes("verifySupabasePassword"), false);
});

test("does not update locally when Supabase rejects the new password", async () => {
  const { dependencies, calls } = createDependencies({
    verifySupabasePassword: async () => false,
  });
  const result = await synchronizeRecoveredPassword("token", "NewPassword1", dependencies);
  assert.deepEqual(result, { ok: false, reason: "invalid_credentials" });
  assert.equal(calls.includes("updateLocalPassword"), false);
});

test("does not report success after a partial local synchronization failure", async () => {
  const { dependencies, calls } = createDependencies({
    updateLocalPassword: async () => false,
  });
  const result = await synchronizeRecoveredPassword("token", "NewPassword1", dependencies);
  assert.deepEqual(result, { ok: false, reason: "local_sync_failed" });
  assert.equal(calls.includes("audit:success"), false);
});

test("a retry can synchronize the already-valid Supabase password", async () => {
  let attempts = 0;
  const setup = createDependencies({
    updateLocalPassword: async (_userId, passwordHash) => {
      attempts += 1;
      if (attempts === 1) return false;
      setup.dependencies.updateLocalPassword = async () => true;
      return Boolean(passwordHash);
    },
  });
  const first = await synchronizeRecoveredPassword("token", "NewPassword1", setup.dependencies);
  const second = await synchronizeRecoveredPassword("token", "NewPassword1", setup.dependencies);
  assert.equal(first.ok, false);
  assert.equal(second.ok, true);
  assert.equal(attempts, 2);
});

test("stores a hash that accepts the new password and rejects the old one", async () => {
  const { dependencies, getStoredHash } = createDependencies();
  const result = await synchronizeRecoveredPassword("token", "NewPassword1", dependencies);
  assert.deepEqual(result, { ok: true });
  assert.equal(await bcrypt.compare("NewPassword1", getStoredHash()), true);
  assert.equal(await bcrypt.compare("OldPassword1", getStoredHash()), false);
});
