import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import {
  PENDING_RECOVERY_COOKIE,
  sealPendingRecovery,
} from "../../../lib/recoveryCookies.server.ts";
import {
  RECOVERY_FAILURE_REASONS,
  createRecoveryFailureResponse,
  handleConfirmGet,
  handleConfirmPost,
  renderConfirmHtml,
} from "./confirmHandlers.ts";
import { runtime } from "./route.ts";

const secret = "test-only-recovery-secret-with-at-least-32-characters";
process.env.RECOVERY_FLOW_SECRET = secret;

assert.equal(runtime, "nodejs");

function token(sessionId: string): string {
  return [
    Buffer.from("{}").toString("base64url"),
    Buffer.from(JSON.stringify({ session_id: sessionId })).toString("base64url"),
    "signature",
  ].join(".");
}

function pendingCookie(tokenHash = "sensitive-token", now = Date.now()): string {
  return sealPendingRecovery(
    { tokenHash, type: "recovery", next: "/reset-password" },
    secret,
    now
  );
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function successfulConfirmPost(headers: Record<string, string>): Promise<Response> {
  return handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: {
        origin: "https://app.test",
        ...headers,
      },
    }),
    async () => ({
      data: {
        user: { id: "user-1" } as never,
        session: { access_token: token("session-1") } as never,
      },
      error: null,
    })
  );
}

function assertSafeFailureReason(
  response: Response,
  expectedReason: (typeof RECOVERY_FAILURE_REASONS)[number]
): void {
  const location = response.headers.get("location") || "";
  const url = new URL(location);
  assert.equal(url.pathname, "/reset-password");
  assert.deepEqual(
    [...url.searchParams.entries()],
    [
      ["error", "invalid_link"],
      ["reason", expectedReason],
    ]
  );
  for (const forbidden of [
    "sensitive@example.test",
    "status=401",
    "request_id",
    "token_hash",
    "secret-value",
    "user-1",
    "session-1",
  ]) {
    assert.equal(location.includes(forbidden), false);
  }
}

test("safe failure responses expose only the allowed reason codes", () => {
  for (const reason of RECOVERY_FAILURE_REASONS) {
    const response = createRecoveryFailureResponse(
      new NextRequest("https://app.test/auth/confirm"),
      reason
    );
    assertSafeFailureReason(response, reason);
  }
});

test("GET stores the temporary HttpOnly cookie and redirects 303 to the clean URL", async () => {
  const response = await handleConfirmGet(
    new NextRequest(
      "https://app.test/auth/confirm?token_hash=sensitive-token&type=recovery&next=/reset-password"
    )
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://app.test/auth/confirm");
  const setCookie = response.headers.get("set-cookie") || "";
  assert.match(setCookie, new RegExp(`${PENDING_RECOVERY_COOKIE}=`));
  assert.match(setCookie.toLowerCase(), /httponly/);
  assert.match(setCookie.toLowerCase(), /samesite=lax/);
  assert.equal(setCookie.includes("sensitive-token"), false);
});

test("external email navigation preserves the pending cookie for the clean GET", async () => {
  const initial = await handleConfirmGet(
    new NextRequest(
      "https://app.test/auth/confirm?token_hash=email-token&type=recovery&next=/reset-password",
      { headers: { referer: "https://outlook.office.com/" } }
    )
  );
  const setCookie = initial.headers.get("set-cookie") || "";
  const cookieValue = setCookie.match(new RegExp(`${PENDING_RECOVERY_COOKIE}=([^;]+)`))?.[1];

  assert.equal(initial.status, 303);
  assert.match(setCookie.toLowerCase(), /samesite=lax/);
  assert.ok(cookieValue);

  const clean = await handleConfirmGet(
    new NextRequest("https://app.test/auth/confirm", {
      headers: { cookie: `${PENDING_RECOVERY_COOKIE}=${cookieValue}` },
    })
  );
  assert.equal(clean.status, 200);
  assert.match(await clean.text(), /Continuar con la recuperaci/);
});

test("GET and scanner-only GET never execute verifyOtp", async () => {
  const verificationCalls = 0;
  await handleConfirmGet(
    new NextRequest(
      "https://app.test/auth/confirm?token_hash=token&type=recovery&next=/reset-password"
    )
  );
  assert.equal(verificationCalls, 0);
});

test("clean interstitial HTML never contains token_hash or a hidden credential", () => {
  const html = renderConfirmHtml(true);
  assert.match(html, /Continuar con la recuperación/);
  assert.equal(html.includes("token_hash"), false);
  assert.equal(html.includes("sensitive-token"), false);
  assert.equal(/type=["']hidden/i.test(html), false);
});

test("POST with matching Origin continues the recovery flow", async () => {
  const response = await successfulConfirmPost({
    cookie: `${PENDING_RECOVERY_COOKIE}=${pendingCookie()}`,
    origin: "https://app.test",
  });
  assert.equal(response.headers.get("location"), "https://app.test/reset-password");
});

test("POST with literal null Origin and valid proxy signals continues the recovery flow", async () => {
  const response = await successfulConfirmPost({
    cookie: `${PENDING_RECOVERY_COOKIE}=${pendingCookie()}`,
    origin: "null",
    "x-forwarded-host": "app.test",
    "x-forwarded-proto": "https",
    "sec-fetch-site": "same-site",
    "sec-fetch-mode": "navigate",
  });
  assert.equal(response.headers.get("location"), "https://app.test/reset-password");
});

test("POST without Origin and with valid proxy signals continues the recovery flow", async () => {
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: {
        cookie: `${PENDING_RECOVERY_COOKIE}=${pendingCookie()}`,
        "x-forwarded-host": "app.test",
        "x-forwarded-proto": "https",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "navigate",
      },
    }),
    async () => ({
      data: {
        user: { id: "user-1" } as never,
        session: { access_token: token("session-1") } as never,
      },
      error: null,
    })
  );
  assert.equal(response.headers.get("location"), "https://app.test/reset-password");
});

test("POST with another Origin host exposes only origin_mismatch", async () => {
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: { origin: "https://external.test" },
    })
  );
  assertSafeFailureReason(response, "origin_mismatch");
});

test("POST with HTTP Origin exposes only origin_mismatch", async () => {
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: { origin: "http://app.test" },
    })
  );
  assertSafeFailureReason(response, "origin_mismatch");
});

test("POST with a different forwarded host exposes only forwarded_host_mismatch", async () => {
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: {
        origin: "https://app.test",
        "x-forwarded-host": "external.test",
        "x-forwarded-proto": "https",
      },
    })
  );
  assertSafeFailureReason(response, "forwarded_host_mismatch");
});

test("POST with HTTP forwarded proto exposes only insecure_forwarded_proto", async () => {
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: {
        origin: "null",
        "x-forwarded-host": "app.test",
        "x-forwarded-proto": "http",
      },
    })
  );
  assertSafeFailureReason(response, "insecure_forwarded_proto");
});

test("POST with cross-site Fetch Metadata exposes only cross_site_request", async () => {
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: {
        origin: "null",
        "x-forwarded-host": "app.test",
        "x-forwarded-proto": "https",
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "navigate",
      },
    })
  );
  assertSafeFailureReason(response, "cross_site_request");
});

test("POST with non-navigation Fetch Metadata exposes only cross_site_request", async () => {
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: {
        origin: "null",
        "x-forwarded-host": "app.test",
        "x-forwarded-proto": "https",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
      },
    })
  );
  assertSafeFailureReason(response, "cross_site_request");
});

test("POST with malformed non-null Origin exposes only malformed_origin", async () => {
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: { origin: "not a valid origin" },
    })
  );
  assertSafeFailureReason(response, "malformed_origin");
});

test("origin rejection logs only the safe classification", async () => {
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };

  try {
    const response = await handleConfirmPost(
      new NextRequest(
        "https://app.test/auth/confirm?diagnostic_query=private-query-value",
        {
          method: "POST",
          headers: {
            cookie: "diagnostic_cookie=private-cookie-value; token_hash=private-token-value",
            origin: "https://external.test",
            "x-forwarded-host": "app.test",
            "x-forwarded-proto": "https",
          },
        }
      )
    );

    assertSafeFailureReason(response, "origin_mismatch");
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], "[RECOVERY_CONFIRM_ORIGIN_MISMATCH]");
  const metadata = warnings[0][1] as Record<string, unknown>;
  assert.deepEqual(Object.keys(metadata), [
    "request_id",
    "stage",
    "timestamp",
  ]);
  assert.equal(metadata.stage, "RECOVERY_CONFIRM_ORIGIN_MISMATCH");

  const serializedWarnings = JSON.stringify(warnings);
  for (const forbidden of [
    "token_hash",
    "private-token-value",
    "private-cookie-value",
    "private-query-value",
    "external.test",
    "app.test",
    "x-forwarded-host",
    "origin",
    "cookie",
  ]) {
    assert.equal(serializedWarnings.includes(forbidden), false);
  }
});

test("POST without pending cookie is rejected and expires the pending cookie", async () => {
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: { origin: "https://app.test" },
    }),
    async () => {
      throw new Error("must not execute");
    }
  );
  assert.equal(response.status, 303);
  assertSafeFailureReason(response, "cookie_missing");
  assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/i);
});

test("invalid pending cookie exposes only cookie_decrypt_failed", async () => {
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: {
        cookie: `${PENDING_RECOVERY_COOKIE}=not-a-valid-cookie`,
        origin: "https://app.test",
      },
    }),
    async () => {
      throw new Error("must not execute");
    }
  );
  assertSafeFailureReason(response, "cookie_decrypt_failed");
});

test("invalid recovery secret exposes only secret_configuration_failed", async () => {
  const sealedPendingCookie = pendingCookie();
  const originalSecret = process.env.RECOVERY_FLOW_SECRET;
  process.env.RECOVERY_FLOW_SECRET = "invalid";

  try {
    const response = await handleConfirmPost(
      new NextRequest("https://app.test/auth/confirm", {
        method: "POST",
        headers: {
          cookie: `${PENDING_RECOVERY_COOKIE}=${sealedPendingCookie}`,
          origin: "https://app.test",
        },
      }),
      async () => {
        throw new Error("must not execute");
      }
    );
    assertSafeFailureReason(response, "secret_configuration_failed");
  } finally {
    restoreEnv("RECOVERY_FLOW_SECRET", originalSecret);
  }
});

test("invalid Supabase configuration exposes only supabase_configuration_failed", async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-only-anon-key";

  try {
    const response = await handleConfirmPost(
      new NextRequest("https://app.test/auth/confirm", {
        method: "POST",
        headers: {
          cookie: `${PENDING_RECOVERY_COOKIE}=${pendingCookie()}`,
          origin: "https://app.test",
        },
      })
    );
    assertSafeFailureReason(response, "supabase_configuration_failed");
  } finally {
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", originalUrl);
    restoreEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", originalAnonKey);
  }
});

test("Supabase client initialization failure exposes only supabase_client_init_failed", async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://[.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-only-anon-key";

  try {
    const response = await handleConfirmPost(
      new NextRequest("https://app.test/auth/confirm", {
        method: "POST",
        headers: {
          cookie: `${PENDING_RECOVERY_COOKIE}=${pendingCookie()}`,
          origin: "https://app.test",
        },
      })
    );
    assertSafeFailureReason(response, "supabase_client_init_failed");
  } finally {
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", originalUrl);
    restoreEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", originalAnonKey);
  }
});

test("expired pending cookie is rejected without executing verifyOtp", async () => {
  let verificationCalls = 0;
  const expired = pendingCookie(
    "expired-token",
    Date.now() - (2 * 60 + 1) * 1000
  );
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: {
        cookie: `${PENDING_RECOVERY_COOKIE}=${expired}`,
        origin: "https://app.test",
      },
    }),
    async () => {
      verificationCalls += 1;
      throw new Error("must not execute");
    }
  );
  assert.equal(verificationCalls, 0);
  assertSafeFailureReason(response, "cookie_expired");
});

test("valid POST executes verifyOtp once, deletes pending cookie and creates grant", async () => {
  let verificationCalls = 0;
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: {
        cookie: `${PENDING_RECOVERY_COOKIE}=${pendingCookie()}`,
        origin: "https://app.test",
      },
    }),
    async (params) => {
      verificationCalls += 1;
      assert.deepEqual(params, { token_hash: "sensitive-token", type: "recovery" });
      return {
        data: {
          user: { id: "user-1" } as never,
          session: { access_token: token("session-1") } as never,
        },
        error: null,
      };
    }
  );
  assert.equal(verificationCalls, 1);
  assert.equal(response.headers.get("location"), "https://app.test/reset-password");
  const setCookie = response.headers.get("set-cookie") || "";
  assert.match(setCookie, /Max-Age=0/i);
  assert.match(setCookie, /inmoscore_recovery_grant=/);
  assert.equal(setCookie.includes("sensitive-token"), false);
});

test("reused token is rejected when Supabase reports it consumed", async () => {
  let verificationCalls = 0;
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: {
        cookie: `${PENDING_RECOVERY_COOKIE}=${pendingCookie("reused-token")}`,
        origin: "https://app.test",
      },
    }),
    async () => {
      verificationCalls += 1;
      return {
        data: { user: null, session: null },
        error: new Error("already consumed"),
      };
    }
  );
  assert.equal(verificationCalls, 1);
  assertSafeFailureReason(response, "otp_rejected");
});

test("thrown OTP verification exposes only otp_rejected", async () => {
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: {
        cookie: `${PENDING_RECOVERY_COOKIE}=${pendingCookie()}`,
        origin: "https://app.test",
      },
    }),
    async () => {
      throw new Error(
        "sensitive@example.test status=401 request_id=req-1 token_hash=secret"
      );
    }
  );
  assertSafeFailureReason(response, "otp_rejected");
});

test("null or undefined verifyOtp data exposes only verifyotp_null_data", async () => {
  for (const data of [null, undefined]) {
    const response = await handleConfirmPost(
      new NextRequest("https://app.test/auth/confirm", {
        method: "POST",
        headers: {
          cookie: `${PENDING_RECOVERY_COOKIE}=${pendingCookie()}`,
          origin: "https://app.test",
        },
      }),
      async () => ({
        data,
        error: null,
      })
    );
    assertSafeFailureReason(response, "verifyotp_null_data");
  }
});

test("missing user id exposes only verifyotp_user_missing", async () => {
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: {
        cookie: `${PENDING_RECOVERY_COOKIE}=${pendingCookie()}`,
        origin: "https://app.test",
      },
    }),
    async () => ({
      data: {
        user: null,
        session: { access_token: token("session-1") } as never,
      },
      error: null,
    })
  );
  assertSafeFailureReason(response, "verifyotp_user_missing");
});

test("missing session access token exposes only verifyotp_session_missing", async () => {
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: {
        cookie: `${PENDING_RECOVERY_COOKIE}=${pendingCookie()}`,
        origin: "https://app.test",
      },
    }),
    async () => ({
      data: {
        user: { id: "user-1" } as never,
        session: null,
      },
      error: null,
    })
  );
  assertSafeFailureReason(response, "verifyotp_session_missing");
});

test("missing session id exposes only verifyotp_session_id_missing", async () => {
  const accessTokenWithoutSessionId = [
    Buffer.from("{}").toString("base64url"),
    Buffer.from("{}").toString("base64url"),
    "signature",
  ].join(".");
  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: {
        cookie: `${PENDING_RECOVERY_COOKIE}=${pendingCookie()}`,
        origin: "https://app.test",
      },
    }),
    async () => ({
      data: {
        user: { id: "user-1" } as never,
        session: { access_token: accessTokenWithoutSessionId } as never,
      },
      error: null,
    })
  );
  assertSafeFailureReason(response, "verifyotp_session_id_missing");
});

test("grant creation failure exposes only grant_failed", async () => {
  const sealedPendingCookie = pendingCookie();
  const originalDateNow = Date.now;
  let dateNowCalls = 0;
  Date.now = () => {
    dateNowCalls += 1;
    if (dateNowCalls === 1) return originalDateNow();
    throw new Error("sensitive grant failure");
  };

  try {
    const response = await handleConfirmPost(
      new NextRequest("https://app.test/auth/confirm", {
        method: "POST",
        headers: {
          cookie: `${PENDING_RECOVERY_COOKIE}=${sealedPendingCookie}`,
          origin: "https://app.test",
        },
      }),
      async () => ({
        data: {
          user: { id: "user-1" } as never,
          session: { access_token: token("session-1") } as never,
        },
        error: null,
      })
    );
    assertSafeFailureReason(response, "grant_failed");
  } finally {
    Date.now = originalDateNow;
  }
});

test("unexpected failure after client initialization exposes only unexpected_after_client_init", async () => {
  const data = { user: { id: "user-1" } } as {
    user: { id: string };
    session?: never;
  };
  Object.defineProperty(data, "session", {
    get() {
      throw new Error("sensitive@example.test request_id=req-1");
    },
  });

  const response = await handleConfirmPost(
    new NextRequest("https://app.test/auth/confirm", {
      method: "POST",
      headers: {
        cookie: `${PENDING_RECOVERY_COOKIE}=${pendingCookie()}`,
        origin: "https://app.test",
      },
    }),
    async () => ({
      data: data as never,
      error: null,
    })
  );
  assertSafeFailureReason(response, "unexpected_after_client_init");
});
