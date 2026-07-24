import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

export type SupabaseCookie = {
  name: string;
  value: string;
  options?: CookieOptions;
};

type CookieAdapter = {
  getAll: () => { name: string; value: string }[];
  setAll?: (cookies: SupabaseCookie[]) => void;
};

function getSupabaseConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey || !url.startsWith("https://") || !url.endsWith(".supabase.co")) {
    throw new Error("Supabase server configuration is invalid");
  }
  return { url, anonKey };
}

export function createSupabaseServerClient(adapter: CookieAdapter) {
  const { url, anonKey } = getSupabaseConfiguration();
  return createServerClient(url, anonKey, {
    auth: {
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: false,
    },
    cookies: {
      getAll: adapter.getAll,
      setAll: adapter.setAll,
    },
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    },
  });
}
