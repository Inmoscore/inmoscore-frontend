"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileWidgetProps = {
  siteKey?: string;
  resetKey?: number;
  onTokenChange: (token: string) => void;
  onError?: () => void;
};

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
    }
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = "cloudflare-turnstile-script";

function ensureTurnstileScript() {
  if (typeof window === "undefined") return;
  if (document.getElementById(SCRIPT_ID)) return;

  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

export function TurnstileWidget({
  siteKey,
  resetKey = 0,
  onTokenChange,
  onError,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const onErrorRef = useRef(onError);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
    onErrorRef.current = onError;
  }, [onTokenChange, onError]);

  useEffect(() => {
    ensureTurnstileScript();

    const interval = window.setInterval(() => {
      if (window.turnstile) {
        setScriptReady(true);
        window.clearInterval(interval);
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!siteKey || !scriptReady || !containerRef.current || !window.turnstile) return;

    if (widgetIdRef.current) {
      window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token) => onTokenChangeRef.current(token),
      "error-callback": () => {
        onTokenChangeRef.current("");
        onErrorRef.current?.();
      },
      "expired-callback": () => onTokenChangeRef.current(""),
    });

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, scriptReady, resetKey]);

  if (!siteKey) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        La verificacion anti-bot no esta configurada.
      </div>
    );
  }

  return <div ref={containerRef} className="min-h-[65px]" />;
}
