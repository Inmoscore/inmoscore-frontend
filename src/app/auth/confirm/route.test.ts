import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import {
  PENDING_RECOVERY_COOKIE,
  sealPendingRecovery,
} from "../../../lib/recoveryCookies.server.ts";
import {
  createRecoveryFailureResponse,
  handleConfirmGet,
  handleConfirmPost,
  renderConfirmHtml,
  validateRecoveryRequestOrigin,
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

function assertSafeFailureResponse(response: Response): void {
  const location = response.headers.get("location") || "";
  const url = new URL(location);
  assert.equal(url.pathname, "/reset-password");
  assert.deepEqual(
    [...url.searchParams.entries()],
    [["error", "invalid_link"]]
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

test("failure responses expose only the generic invalid-link error", () => {
  const response = createRecoveryFailureResponse(
    new NextRequest("https://app.test/auth/confirm")
  );
  assertSafeFailureResponse(response);
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

test("POST with another Origin host is rejected generically", async () => {
  const request = new NextRequest("https://app.test/auth/confirm", {
    method: "POST",
    headers: { origin: "https://external.test" },
  });
  assert.deepEqual(validateRecoveryRequestOrigin(request), {
    status: "origin_mismatch",
  });
  const response = await handleConfirmPost(request);
  assertSafeFailureResponse(response);
});

test("POST with HTTP Origin is rejected generically", async () => {
  const request = new NextRequest("https://app.test/auth/confirm", {
    method: "POST",
    headers: { origin: "http://app.test" },
  });
  assert.deepEqual(validateRecoveryRequestOrigin(request), {
    status: "origin_mismatch",
  });
  const response = await handleConfirmPost(request);
  assertSafeFailureResponse(response);
});

test("POST with a different forwarded host is rejected generically", async () => {
  const request = new NextRequest("https://app.test/auth/confirm", {
    method: "POST",
    headers: {
      origin: "https://app.test",
      "x-forwarded-host": "external.test",
      "x-forwarded-proto": "https",
    },
  });
  assert.deepEqual(validateRecoveryRequestOrigin(request), {
    status: "forwarded_host_mismatch",
  });
  const response = await handleConfirmPost(request);
  assertSafeFailureResponse(response);
});

test("POST with HTTP forwarded proto is rejected generically", async () => {
  const request = new NextRequest("https://app.test/auth/confirm", {
    method: "POST",
    headers: {
      origin: "null",
      "x-forwarded-host": "app.test",
      "x-forwarded-proto": "http",
    },
  });
  assert.deepEqual(validateRecoveryRequestOrigin(request), {
    status: "insecure_forwarded_proto",
  });
  const response = await handleConfirmPost(request);
  assertSafeFailureResponse(response);
});

test("POST with cross-site Fetch Metadata is rejected generically", async () => {
  const request = new NextRequest("https://app.test/auth/confirm", {
    method: "POST",
    headers: {
      origin: "null",
      "x-forwarded-host": "app.test",
      "x-forwarded-proto": "https",
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "navigate",
    },
  });
  assert.deepEqual(validateRecoveryRequestOrigin(request), {
    status: "cross_site_request",
  });
  const response = await handleConfirmPost(request);
  assertSafeFailureResponse(response);
});

test("POST with non-navigation Fetch Metadata is rejected generically", async () => {
  const request = new NextRequest("https://app.test/auth/confirm", {
    method: "POST",
    headers: {
      origin: "null",
      "x-forwarded-host": "app.test",
      "x-forwarded-proto": "https",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
    },
  });
  assert.deepEqual(validateRecoveryRequestOrigin(request), {
    status: "cross_site_request",
  });
  const response = await handleConfirmPost(request);
  assertSafeFailureResponse(response);
});

test("POST with malformed non-null Origin is rejected generically", async () => {
  const request = new NextRequest("https://app.test/auth/confirm", {
    method: "POST",
    headers: { origin: "not a valid origin" },
  });
  assert.deepEqual(validateRecoveryRequestOrigin(request), {
    status: "malformed_origin",
  });
  const response = await handleConfirmPost(request);
  assertSafeFailureResponse(response);
});

test("origin rejection emits no temporary diagnostic log", async () => {
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

    assertSafeFailureResponse(response);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 0);

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
  assertSafeFailureResponse(response);
  assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/i);
});

test("invalid pending cookie returns the generic invalid-link error", async () => {
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
  assertSafeFailureResponse(response);
});

test("invalid recovery secret returns the generic invalid-link error", async () => {
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
    assertSafeFailureResponse(response);
  } finally {
    restoreEnv("RECOVERY_FLOW_SECRET", originalSecret);
  }
});

test("invalid Supabase configuration returns the generic invalid-link error", async () => {
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
    assertSafeFailureResponse(response);
  } finally {
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", originalUrl);
    restoreEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", originalAnonKey);
  }
});

test("Supabase client initialization failure returns the generic invalid-link error", async () => {
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
    assertSafeFailureResponse(response);
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
  assertSafeFailureResponse(response);
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
  assertSafeFailureResponse(response);
});

test("thrown OTP verification returns the generic invalid-link error", async () => {
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
  assertSafeFailureResponse(response);
});

test("null or undefined verifyOtp data returns the generic invalid-link error", async () => {
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
    assertSafeFailureResponse(response);
  }
});

test("missing user id returns the generic invalid-link error", async () => {
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
  assertSafeFailureResponse(response);
});

test("missing session access token returns the generic invalid-link error", async () => {
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
  assertSafeFailureResponse(response);
});

test("missing session id returns the generic invalid-link error", async () => {
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
  assertSafeFailureResponse(response);
});

test("grant creation failure returns the generic invalid-link error", async () => {
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
    assertSafeFailureResponse(response);
  } finally {
    Date.now = originalDateNow;
  }
});

test("unexpected failure after client initialization returns the generic invalid-link error", async () => {
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
  assertSafeFailureResponse(response);
});
