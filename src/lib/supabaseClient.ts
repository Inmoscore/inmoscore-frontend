"use client";

import { createClient } from "@supabase/supabase-js";

let browserClient: ReturnType<typeof createClient> | null = null;

const isDevelopment = process.env.NODE_ENV === "development";

export function getSupabaseBrowserClient(): ReturnType<typeof createClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase frontend no configurado");
  }

  const normalizedSupabaseUrl = supabaseUrl.trim().replace(/\/+$/, "");

  if (isDevelopment) {
    console.log("Supabase frontend URL:", normalizedSupabaseUrl);
  }

  if (
    !normalizedSupabaseUrl.startsWith("https://") ||
    !normalizedSupabaseUrl.endsWith(".supabase.co")
  ) {
    throw new Error(
      "Supabase frontend URL invalida: debe empezar con https:// y terminar en .supabase.co"
    );
  }

  if (!browserClient) {
    browserClient = createClient(normalizedSupabaseUrl, supabaseAnonKey, {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return browserClient;
}
