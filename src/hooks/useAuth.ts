"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface User {
  id: string;
  email: string;
  tipo_usuario: "admin" | "propietario" | "arrendador" | "arrendatario" | string;
  nombre?: string;
  fullName?: string;
  exp?: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const STORAGE_KEYS = {
  tokenPrimary: "token",
  userPrimary: "user",
  tokenLegacy: "inmoscore_token",
  userLegacy: "inmoscore_user",
};

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function readToken(): string | null {
  if (typeof window === "undefined") return null;

  return (
    localStorage.getItem(STORAGE_KEYS.tokenPrimary) ||
    localStorage.getItem(STORAGE_KEYS.tokenLegacy)
  );
}

function readUser(): User | null {
  if (typeof window === "undefined") return null;

  return (
    safeJsonParse<User>(localStorage.getItem(STORAGE_KEYS.userPrimary)) ||
    safeJsonParse<User>(localStorage.getItem(STORAGE_KEYS.userLegacy))
  );
}

function clearSessionStorage() {
  if (typeof window === "undefined") return;

  localStorage.removeItem(STORAGE_KEYS.tokenPrimary);
  localStorage.removeItem(STORAGE_KEYS.userPrimary);
  localStorage.removeItem(STORAGE_KEYS.tokenLegacy);
  localStorage.removeItem(STORAGE_KEYS.userLegacy);

  document.cookie =
    "inmoscore_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
  document.cookie =
    "token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
}

function normalizeSession(token: string, user: User) {
  if (typeof window === "undefined") return;

  localStorage.setItem(STORAGE_KEYS.tokenPrimary, token);
  localStorage.setItem(STORAGE_KEYS.userPrimary, JSON.stringify(user));

  localStorage.setItem(STORAGE_KEYS.tokenLegacy, token);
  localStorage.setItem(STORAGE_KEYS.userLegacy, JSON.stringify(user));
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "="
    );

    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;

  const exp = payload.exp;
  if (typeof exp !== "number") return true;

  return exp * 1000 <= Date.now();
}

export function useAuth(options?: { requireAdmin?: boolean }) {
  const requireAdmin = options?.requireAdmin ?? false;
  const router = useRouter();

  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const logout = useCallback(
    (redirectTo: string = "/login") => {
      clearSessionStorage();
      setState({
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
      });
      router.replace(redirectTo);
    },
    [router]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const token = readToken();
    const user = readUser();

    if (!token || !user) {
      logout("/login");
      return;
    }

    if (isTokenExpired(token)) {
      logout("/login");
      return;
    }

    if (requireAdmin && user.tipo_usuario !== "admin") {
      setState({
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
      });
      router.replace("/buscar");
      return;
    }

    normalizeSession(token, user);

    setState({
      user,
      token,
      isLoading: false,
      isAuthenticated: true,
    });
  }, [requireAdmin, logout, router]);

  useEffect(() => {
    if (!state.isAuthenticated) return;

    const interval = window.setInterval(() => {
      const token = readToken();
      if (!token || isTokenExpired(token)) {
        logout("/login");
      }
    }, 60000);

    return () => window.clearInterval(interval);
  }, [state.isAuthenticated, logout]);

  const helpers = useMemo(
    () => ({
      isAdmin: state.user?.tipo_usuario === "admin",
    }),
    [state.user]
  );

  return {
    ...state,
    ...helpers,
    logout,
  };
}