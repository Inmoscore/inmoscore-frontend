import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { buildAllowedOrigins, isCorsOriginAllowed } from './corsOrigins';

test('accepts the production frontend origin', () => {
  const allowedOrigins = buildAllowedOrigins({
    frontendUrl: 'https://app.inmoscore.com',
    requireHttps: true,
  });

  assert.equal(isCorsOriginAllowed('https://app.inmoscore.com', allowedOrigins), true);
});

test('accepts only explicitly configured preview origins', () => {
  const allowedOrigins = buildAllowedOrigins({
    frontendUrl: 'https://app.inmoscore.com',
    additionalAllowedOrigins:
      'https://inmoscore-feature-a.vercel.app, https://inmoscore-feature-b.vercel.app',
    requireHttps: true,
  });

  assert.equal(
    isCorsOriginAllowed('https://inmoscore-feature-a.vercel.app', allowedOrigins),
    true
  );
  assert.equal(
    isCorsOriginAllowed('https://untrusted-project.vercel.app', allowedOrigins),
    false
  );
});

test('accepts requests without Origin for non-browser clients and health checks', () => {
  const allowedOrigins = buildAllowedOrigins({
    frontendUrl: 'https://app.inmoscore.com',
    requireHttps: true,
  });

  assert.equal(isCorsOriginAllowed(undefined, allowedOrigins), true);
});

test('rejects missing, malformed, or insecure production origins', () => {
  assert.throws(
    () => buildAllowedOrigins({ frontendUrl: '', requireHttps: true }),
    /FRONTEND_URL/
  );
  assert.throws(
    () =>
      buildAllowedOrigins({
        frontendUrl: 'https://app.inmoscore.com',
        additionalAllowedOrigins: 'not-a-url',
        requireHttps: true,
      }),
    /ADDITIONAL_ALLOWED_ORIGINS/
  );
  assert.throws(
    () =>
      buildAllowedOrigins({
        frontendUrl: 'https://app.inmoscore.com',
        additionalAllowedOrigins: 'http://preview.example.com',
        requireHttps: true,
      }),
    /HTTPS/
  );
});

test('source contains no Turnstile secret-fragment diagnostics', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/lib/turnstile.ts'), 'utf8');

  assert.doesNotMatch(
    source,
    /TURNSTILE_SECRET_DEBUG|secretLength|secret\??\.slice\(|prefix:\s*secret|suffix:\s*secret/
  );
});

test('source contains no dotenv loading diagnostics', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8');

  assert.doesNotMatch(
    source,
    /ENV PATH:|ENV exists:|DOTENV error:|DOTENV parsed keys:|envExists|envResult/
  );
});

test('source logs no Wompi secret or signature fragments', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/routes/wompiBilling.ts'), 'utf8');

  assert.doesNotMatch(
    source,
    /(?:integritySecret|eventsSecret|privateKey|signature)\s*\.\s*(?:slice|substring)\s*\(|(?:integrity|events|privateKey|signature)(?:Prefix|Suffix|Length)\s*:/i
  );
});
