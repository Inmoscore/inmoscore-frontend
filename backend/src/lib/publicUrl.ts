type PublicUrlEnvironment = {
  FRONTEND_URL?: string;
  NODE_ENV?: string;
};

export function resolvePublicFrontendUrl(env: PublicUrlEnvironment): string {
  const configured = String(env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
  const isProduction = env.NODE_ENV === "production";

  if (!configured) {
    if (isProduction) throw new Error("FRONTEND_URL is required in production");
    return "http://localhost:3000";
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("FRONTEND_URL must be a valid absolute URL");
  }

  if (isProduction) {
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:") {
      throw new Error("FRONTEND_URL must use HTTPS in production");
    }
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      throw new Error("FRONTEND_URL cannot use a loopback host in production");
    }
  }

  return configured;
}

export function appendPublicPath(baseUrl: string, pathname: string): string {
  return `${baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}
