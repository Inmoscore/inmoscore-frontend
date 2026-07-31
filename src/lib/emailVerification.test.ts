import assert from "node:assert/strict";
import test from "node:test";
import {
  EMAIL_VERIFICATION_PENDING_PATH,
  handleEmailVerificationRequiredResponse,
  isEmailVerificationRequiredResponse,
} from "./emailVerification.ts";

test("detects only 403 EMAIL_VERIFICATION_REQUIRED", async () => {
  const required = new Response(
    JSON.stringify({ code: "EMAIL_VERIFICATION_REQUIRED" }),
    {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }
  );
  const unrelated = new Response(JSON.stringify({ code: "MFA_REQUIRED" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });

  assert.equal(await isEmailVerificationRequiredResponse(required), true);
  assert.equal(await isEmailVerificationRequiredResponse(unrelated), false);
});

test("central handler redirects a direct API denial to the pending email screen", async () => {
  const response = new Response(
    JSON.stringify({ code: "EMAIL_VERIFICATION_REQUIRED" }),
    {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }
  );
  const navigations: string[] = [];

  const handled = await handleEmailVerificationRequiredResponse(response, (path) => {
    navigations.push(path);
  });

  assert.equal(handled, true);
  assert.deepEqual(navigations, [EMAIL_VERIFICATION_PENDING_PATH]);
});

test("central handler leaves unrelated forbidden responses in place", async () => {
  const response = new Response(JSON.stringify({ code: "MFA_REQUIRED" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
  const navigations: string[] = [];

  const handled = await handleEmailVerificationRequiredResponse(response, (path) => {
    navigations.push(path);
  });

  assert.equal(handled, false);
  assert.deepEqual(navigations, []);
});
