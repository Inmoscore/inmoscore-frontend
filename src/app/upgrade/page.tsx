'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { getToken } from '@/lib/auth';

declare global {
  interface Window {
    WidgetCheckout?: new (config: WompiWidgetConfig) => {
      open: (callback: (result: any) => void) => void;
    };
  }
}

type PlanFeature = {
  label: string;
  included: boolean;
};

type Plan = {
  planType: 'free' | 'basic' | 'pro' | 'enterprise';
  name: string;
  description: string;
  price: string;
  searches: string;
  cta: string;
  featured?: boolean;
  disabled?: boolean;
  variant: 'disabled' | 'primary' | 'outline';
  eventType?: 'plan_basic_clicked' | 'plan_pro_clicked' | 'enterprise_clicked';
  alertMessage?: string;
  features: PlanFeature[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type CheckoutPlanType = 'basic' | 'pro';

type WompiCheckoutPayload = {
  provider: 'wompi';
  mode: 'widget';
  reference: string;
  publicKey: string;
  currency: 'COP';
  amountInCents: number;
  signature: string;
  redirectUrl?: string;
};

type WompiWidgetConfig = {
  currency: string;
  amountInCents: number;
  reference: string;
  publicKey: string;
  signature: { integrity: string };
  redirectUrl?: string;
};

let wompiWidgetScriptPromise: Promise<void> | null = null;

const plans: Plan[] = [
  {
    planType: 'free',
    name: 'Free',
    description: 'Ideal para empezar y conocer la plataforma.',
    price: '$0',
    searches: '3 búsquedas diarias',
    cta: 'Plan actual',
    disabled: true,
    variant: 'disabled',
    features: [
      { label: '3 búsquedas incluidas', included: true },
      { label: 'Resultados esenciales', included: true },
      { label: 'Prioridad de soporte', included: false },
      { label: 'Uso empresarial', included: false },
    ],
  },
  {
    planType: 'basic',
    name: 'Basico',
    description: 'Para propietarios o arrendadores ocasionales que necesitan mas consultas',
    price: '$9.900 COP / mes',
    searches: '8 búsquedas diarias',
    cta: 'Solicitar Plan Basico',
    variant: 'primary',
    eventType: 'plan_basic_clicked',
    alertMessage: 'Próximamente: pagos en línea',
    features: [
      { label: '8 búsquedas incluidas', included: true },
      { label: 'Pensado para persona natural', included: true },
      { label: 'Resultados detallados', included: true },
      { label: 'Soporte prioritario', included: false },
    ],
  },
  {
    planType: 'pro',
    name: 'Pro',
    description: 'Para uso frecuente o inmobiliarias pequenas.',
    price: '$49.900 COP / mes',
    searches: '30 búsquedas diarias',
    cta: 'Solicitar Plan Pro',
    featured: true,
    variant: 'primary',
    eventType: 'plan_pro_clicked',
    alertMessage: 'Próximamente: pagos en línea',
    features: [
      { label: '30 búsquedas incluidas', included: true },
      { label: 'Resultados detallados', included: true },
      { label: 'Soporte prioritario', included: true },
      { label: 'Acompanamiento comercial dedicado', included: false },
    ],
  },
  {
    planType: 'enterprise',
    name: 'Empresa',
    description: 'Pensado para equipos con operacion intensiva.',
    price: 'A medida',
    searches: 'Busquedas ilimitadas',
    cta: 'Ventas próximamente',
    disabled: true,
    variant: 'disabled',
    features: [
      { label: 'Busquedas ilimitadas', included: true },
      { label: 'Atencion prioritaria', included: true },
      { label: 'Condiciones personalizadas', included: true },
      { label: 'Activacion inmediata de pagos', included: false },
    ],
  },
];

async function trackUpgradeEvent(payload: {
  event_type: 'plan_basic_clicked' | 'plan_pro_clicked' | 'enterprise_clicked';
  source: 'upgrade_page';
  plan_type: 'basic' | 'pro' | 'enterprise';
  metadata?: Record<string, unknown>;
}) {
  try {
    if (!API_URL) return;

    const token = getToken();
    if (!token) return;

    await fetch(`${API_URL}/api/upgrade-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...payload,
        metadata: {
          ...payload.metadata,
          timestamp_client: new Date().toISOString(),
        },
      }),
    });
  } catch (error) {
    console.warn('[trackUpgradeEvent] No se pudo registrar evento:', error);
  }
}

async function createWompiCheckout(planType: CheckoutPlanType): Promise<WompiCheckoutPayload | null> {
  try {
    if (!API_URL) {
      alert('No se pudo iniciar el pago. Intenta nuevamente.');
      return null;
    }

    const token = getToken();

    if (!token) {
      alert('Debes iniciar sesi\u00f3n para mejorar tu plan');
      return null;
    }

    const response = await fetch(`${API_URL}/api/billing/create-wompi-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan_type: planType }),
    });

    const data = await response.json().catch(() => null);
    const checkoutData = data?.data;

    if (!response.ok || !checkoutData || typeof checkoutData !== 'object') {
      alert('No se pudo iniciar el pago. Intenta nuevamente.');
      return null;
    }

    return checkoutData as WompiCheckoutPayload;
  } catch (error) {
    console.warn('[createWompiCheckout] Error:', error);
    alert('No se pudo iniciar el pago. Intenta nuevamente.');
    return null;
  }
}

function loadWompiWidgetScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Wompi widget solo esta disponible en navegador'));
  }

  if (window.WidgetCheckout) {
    return Promise.resolve();
  }

  if (wompiWidgetScriptPromise) {
    return wompiWidgetScriptPromise;
  }

  wompiWidgetScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.wompi.co/widget.js"]'
    );

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener(
        'error',
        () => reject(new Error('No se pudo cargar Wompi')),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://checkout.wompi.co/widget.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Wompi'));
    document.head.appendChild(script);
  });

  return wompiWidgetScriptPromise;
}

async function openWompiWidget(data: WompiCheckoutPayload) {
  await loadWompiWidgetScript();

  if (!window.WidgetCheckout) {
    throw new Error('WidgetCheckout no esta disponible');
  }

  const missingFields = [
    !data.currency ? 'currency' : null,
    !data.amountInCents ? 'amountInCents' : null,
    !data.reference ? 'reference' : null,
    !data.publicKey ? 'publicKey' : null,
    !data.signature ? 'signature' : null,
  ].filter(Boolean);

  if (missingFields.length > 0) {
    console.warn('[WOMPI_WIDGET_CONFIG_MISSING_FIELDS]', missingFields);
    throw new Error('Configuracion Wompi incompleta');
  }

  const config: WompiWidgetConfig = {
    currency: data.currency,
    amountInCents: data.amountInCents,
    reference: data.reference,
    publicKey: data.publicKey,
    signature: {
      integrity: data.signature,
    },
  };

  if (data.redirectUrl) {
    config.redirectUrl = data.redirectUrl;
  }

  const checkout = new window.WidgetCheckout(config);

  checkout.open(function (result) {
    console.log('[WOMPI_WIDGET_RESULT]', result?.transaction?.id || null);
  });
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 flex-none text-green-600"
      viewBox="0 0 20 20"
      fill="none"
    >
      <path
        d="M5 10.5 8.2 13.7 15 6.9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 flex-none text-gray-400"
      viewBox="0 0 20 20"
      fill="none"
    >
      <path
        d="M6 6 14 14M14 6 6 14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  const buttonClassName =
    plan.variant === 'primary'
      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20 hover:bg-blue-700'
      : plan.variant === 'outline'
        ? 'border border-slate-300 bg-white text-slate-950 hover:bg-slate-50'
        : 'cursor-not-allowed bg-slate-100 text-slate-400';

  const cardClassName = plan.featured
    ? 'border-blue-500 bg-white shadow-2xl shadow-blue-950/15 ring-2 ring-blue-500'
    : 'border-slate-200 bg-white shadow-sm';

  const handleClick = async () => {
    if (plan.disabled || !plan.eventType) return;
    if (plan.planType === 'free') return;

    void trackUpgradeEvent({
      event_type: plan.eventType,
      source: 'upgrade_page',
      plan_type: plan.planType,
      metadata: {
        cta_label: plan.cta,
      },
    });

    if (plan.planType === 'basic' || plan.planType === 'pro') {
      setIsStartingCheckout(true);
      try {
        const checkout = await createWompiCheckout(plan.planType);

        if (checkout?.mode === 'widget') {
          await openWompiWidget(checkout);
          return;
        }

        alert('No se pudo iniciar el pago. Intenta nuevamente.');
      } catch (error) {
        console.warn('[openWompiWidget] Error:', error);
        alert('No se pudo iniciar el pago. Intenta nuevamente.');
      } finally {
        setIsStartingCheckout(false);
      }

      return;
    }

    if (plan.alertMessage) {
      alert(plan.alertMessage);
    }
  };

  return (
    <article className={`relative flex h-full flex-col rounded-3xl border p-6 ${cardClassName}`}>
      {plan.featured ? (
        <span className="absolute right-6 top-6 inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
          <Sparkles className="h-3.5 w-3.5" />
          Más popular
        </span>
      ) : null}

      <div className="flex-1">
        <div className="pr-20">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">{plan.name}</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{plan.price}</h2>
          <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{plan.description}</p>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-black text-slate-950">{plan.searches}</p>
          <p className="mt-1 text-sm text-slate-600">Capacidad alineada al ritmo real de tu operación.</p>
        </div>

        <ul className="mt-6 space-y-3">
          {plan.features.map((feature) => (
            <li key={feature.label} className="flex items-start gap-3 text-sm text-slate-700">
              {feature.included ? <CheckIcon /> : <XIcon />}
              <span>{feature.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={plan.disabled || isStartingCheckout}
        className={`mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition ${buttonClassName}`}
      >
        {isStartingCheckout ? 'Abriendo Wompi...' : plan.cta}
        {!plan.disabled && !isStartingCheckout ? <ArrowRight className="h-4 w-4" /> : null}
      </button>
    </article>
  );
}

export default function UpgradePage() {
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'success' | 'canceled' | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status =
      params.get('payment_pending') === 'true'
        ? 'pending'
        : params.get('success') === 'true'
        ? 'success'
        : params.get('canceled') === 'true'
          ? 'canceled'
          : null;

    if (!status) return;

    setPaymentStatus(status);

    const timeoutId = window.setTimeout(() => {
      window.history.replaceState(null, '', '/upgrade');
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="text-2xl font-black tracking-tight text-slate-950">
            InmoScore
          </Link>

          <Link
            href="/buscar"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a buscar
          </Link>
        </header>

        <section className="mx-auto flex w-full max-w-4xl flex-col items-center py-14 text-center lg:py-20">
          {paymentStatus === 'pending' ? (
            <div className="mb-6 w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
              Pago iniciado. Cuando Wompi confirme la transacci&oacute;n, tu plan se actualizar&aacute; autom&aacute;ticamente.
            </div>
          ) : null}

          {paymentStatus === 'success' ? (
            <div className="mb-6 w-full rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
              {'Pago recibido. Tu plan se actualizar\u00e1 autom\u00e1ticamente cuando el proveedor confirme la transacci\u00f3n.'}
            </div>
          ) : null}

          {paymentStatus === 'canceled' ? (
            <div className="mb-6 w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Pago cancelado. Puedes intentarlo nuevamente.
            </div>
          ) : null}

          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">
            <ShieldCheck className="h-4 w-4" />
            Planes de busqueda
          </span>
          <h1 className="mt-6 max-w-3xl text-4xl font-black tracking-tight text-slate-950 sm:text-6xl">
            Consulta riesgo inmobiliario con capacidad profesional.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            Escala tus búsquedas sin cambiar de flujo. Los pagos de Básico y Pro siguen procesándose con el WidgetCheckout de Wompi.
          </p>
          <div className="mt-6 grid w-full gap-3 text-left sm:grid-cols-3">
            {[
              ['Score explicado', 'Clasificación y señales relevantes.'],
              ['Uso con control legal', 'Advertencias, disputas y revisión humana.'],
              ['Operación comercial', 'Planes para propietarios e inmobiliarias.'],
            ].map(([title, text]) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="mt-3 font-black text-slate-950">{title}</p>
                <p className="mt-1 text-sm leading-5 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </section>

        <section className="mt-10 rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-sm font-bold text-emerald-200">
                <Building2 className="h-4 w-4" />
                Equipo inmobiliario o operación intensiva
              </div>
              <h2 className="mt-3 text-2xl font-black">Empresa se adapta a tu volumen, soporte y proceso interno.</h2>
            </div>
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-xl bg-white/70 px-5 py-3 text-sm font-black text-slate-500"
            >
              Ventas próximamente
            </button>
          </div>
        </section>

        <footer className="mt-10 border-t border-slate-200 py-8 text-center">
          <p className="text-sm text-slate-600">Precios de referencia sujetos a cambios y validación comercial.</p>
          <p className="mt-2 text-sm font-bold text-slate-950">Pagos Basic y Pro procesados con Wompi en COP</p>
        </footer>
      </div>
    </main>
  );
}
