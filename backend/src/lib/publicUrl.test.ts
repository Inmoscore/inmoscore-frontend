import assert from "node:assert/strict";
import test from "node:test";
import { appendPublicPath, resolvePublicFrontendUrl } from "./publicUrl";

test("allows the localhost fallback only outside production", () => {
  assert.equal(resolvePublicFrontendUrl({ NODE_ENV: "development" }), "http://localhost:3000");
});

test("requires FRONTEND_URL in production", () => {
  assert.throws(() => resolvePublicFrontendUrl({ NODE_ENV: "production" }), /required/);
});

test("rejects HTTP and loopback URLs in production", () => {
  assert.throws(
    () => resolvePublicFrontendUrl({ NODE_ENV: "production", FRONTEND_URL: "http://app.test" }),
    /HTTPS/
  );
  assert.throws(
    () =>
      resolvePublicFrontendUrl({
        NODE_ENV: "production",
        FRONTEND_URL: "https://localhost:3000",
      }),
    /loopback/
  );
});

test("accepts a production HTTPS URL and appends paths", () => {
  const baseUrl = resolvePublicFrontendUrl({
    NODE_ENV: "production",
    FRONTEND_URL: "https://inmoscore-frontend.vercel.app/",
  });
  assert.equal(
    appendPublicPath(baseUrl, "/reset-password"),
    "https://inmoscore-frontend.vercel.app/reset-password"
  );
});
