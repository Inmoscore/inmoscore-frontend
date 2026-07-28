type AllowedOriginsConfiguration = {
  frontendUrl: string;
  additionalAllowedOrigins?: string;
  requireHttps?: boolean;
};

function normalizeOrigin(value: string, variableName: string, requireHttps: boolean): string {
  const configured = value.trim();
  if (!configured) {
    throw new Error(`${variableName} must contain an absolute URL`);
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(`${variableName} must contain valid absolute URLs`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${variableName} only accepts HTTP or HTTPS origins`);
  }
  if (requireHttps && parsed.protocol !== 'https:') {
    throw new Error(`${variableName} must use HTTPS in production`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${variableName} must not contain credentials`);
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${variableName} entries must be origins without path, query, or fragment`);
  }

  return parsed.origin;
}

export function buildAllowedOrigins({
  frontendUrl,
  additionalAllowedOrigins,
  requireHttps = false,
}: AllowedOriginsConfiguration): ReadonlySet<string> {
  const origins = new Set<string>([
    normalizeOrigin(frontendUrl, 'FRONTEND_URL', requireHttps),
  ]);

  for (const configuredOrigin of (additionalAllowedOrigins || '').split(',')) {
    if (!configuredOrigin.trim()) continue;
    origins.add(
      normalizeOrigin(configuredOrigin, 'ADDITIONAL_ALLOWED_ORIGINS', requireHttps)
    );
  }

  return origins;
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>
): boolean {
  return origin === undefined || allowedOrigins.has(origin);
}
