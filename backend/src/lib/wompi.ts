import crypto from 'crypto';

export type WompiPlanSlug = 'basic' | 'pro';

export type WompiPaymentStatus =
  | 'created'
  | 'pending'
  | 'approved'
  | 'declined'
  | 'voided'
  | 'error'
  | 'failed';

type WompiPlanDescriptor = {
  planType: WompiPlanSlug;
  dailySearchLimit: number;
  amountInCents: number;
  currency: 'COP';
};

export type WompiTransactionLookupResult = {
  id: string;
  status: string;
  reference?: string;
  amount_in_cents?: number;
  currency?: string;
  payment_method_type?: string;
  finalized_at?: string | null;
  created_at?: string;
};

type WompiTransactionApiResponse = {
  data?: {
    id?: unknown;
    status?: unknown;
    reference?: unknown;
    amount_in_cents?: unknown;
    currency?: unknown;
    payment_method_type?: unknown;
    finalized_at?: unknown;
    created_at?: unknown;
  };
};

export class WompiTransactionLookupError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode = 502) {
    super(message);
    this.name = 'WompiTransactionLookupError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const WOMPI_CHECKOUT_BASE_URL = 'https://checkout.wompi.co/p/';
const WOMPI_API_BASE_URL = 'https://production.wompi.co/v1';
const WOMPI_TRANSACTION_LOOKUP_TIMEOUT_MS = 8000;

const WOMPI_PLANS: Record<WompiPlanSlug, WompiPlanDescriptor> = {
  basic: {
    planType: 'basic',
    dailySearchLimit: 8,
    amountInCents: 990000,
    currency: 'COP',
  },
  pro: {
    planType: 'pro',
    dailySearchLimit: 30,
    amountInCents: 4990000,
    currency: 'COP',
  },
};

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} no esta configurado`);
  }

  return value;
}

export function getPlanDescriptor(planType: WompiPlanSlug): WompiPlanDescriptor {
  return WOMPI_PLANS[planType];
}

export function getWompiPublicKey(): string {
  return getRequiredEnv('WOMPI_PUBLIC_KEY');
}

export function getWompiPrivateKey(): string {
  return getRequiredEnv('WOMPI_PRIVATE_KEY');
}

export function getWompiIntegritySecret(): string {
  return getRequiredEnv('WOMPI_INTEGRITY_SECRET');
}

export function getWompiEventsSecret(): string {
  return getRequiredEnv('WOMPI_EVENTS_SECRET');
}

function validateWompiTransactionId(transactionId: string): string {
  const normalized = typeof transactionId === 'string' ? transactionId.trim() : '';

  if (!normalized) {
    throw new WompiTransactionLookupError(
      'transaction_id requerido',
      'INVALID_TRANSACTION_ID',
      400
    );
  }

  if (normalized.length < 6 || normalized.length > 100) {
    throw new WompiTransactionLookupError(
      'transaction_id con longitud invalida',
      'INVALID_TRANSACTION_ID',
      400
    );
  }

  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new WompiTransactionLookupError(
      'transaction_id contiene caracteres invalidos',
      'INVALID_TRANSACTION_ID',
      400
    );
  }

  return normalized;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asOptionalNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return asOptionalString(value);
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mapWompiTransactionResponse(payload: unknown): WompiTransactionLookupResult {
  const body = payload as WompiTransactionApiResponse;
  const transaction = body?.data;

  if (!transaction || typeof transaction !== 'object') {
    throw new WompiTransactionLookupError(
      'Respuesta de Wompi sin data de transaccion',
      'INVALID_WOMPI_RESPONSE'
    );
  }

  const id = asOptionalString(transaction.id);
  const status = asOptionalString(transaction.status);

  if (!id || !status) {
    throw new WompiTransactionLookupError(
      'Respuesta de Wompi incompleta',
      'INVALID_WOMPI_RESPONSE'
    );
  }

  return {
    id,
    status,
    reference: asOptionalString(transaction.reference),
    amount_in_cents: asOptionalNumber(transaction.amount_in_cents),
    currency: asOptionalString(transaction.currency),
    payment_method_type: asOptionalString(transaction.payment_method_type),
    finalized_at: asOptionalNullableString(transaction.finalized_at),
    created_at: asOptionalString(transaction.created_at),
  };
}

export async function getWompiTransactionById(
  transactionId: string
): Promise<WompiTransactionLookupResult> {
  const safeTransactionId = validateWompiTransactionId(transactionId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WOMPI_TRANSACTION_LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${WOMPI_API_BASE_URL}/transactions/${encodeURIComponent(safeTransactionId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${getWompiPublicKey()}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new WompiTransactionLookupError(
        'Wompi rechazo la consulta de transaccion',
        'WOMPI_LOOKUP_FAILED',
        response.status
      );
    }

    const payload = await response.json();
    return mapWompiTransactionResponse(payload);
  } catch (error) {
    if (error instanceof WompiTransactionLookupError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new WompiTransactionLookupError(
        'Timeout consultando transaccion Wompi',
        'WOMPI_LOOKUP_TIMEOUT',
        504
      );
    }

    throw new WompiTransactionLookupError(
      'Error consultando transaccion Wompi',
      'WOMPI_LOOKUP_ERROR'
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function buildPaymentReference(userId: string, planType: WompiPlanSlug): string {
  const userPart = userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'user';
  const randomPart = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  return `inmoscore_${planType}_${userPart}_${Date.now()}_${randomPart}`;
}

function generateWompiSignature({
  reference,
  amountInCents,
  currency,
  integritySecret,
}: {
  reference: string;
  amountInCents: number | string;
  currency: string;
  integritySecret: string;
}): string {
  const data = `${reference}${amountInCents}${currency}${integritySecret}`;

  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex');
}

export function generateIntegritySignature(params: {
  reference: string;
  amountInCents: number;
  currency: string;
  integritySecret?: string;
}): string {
  return generateWompiSignature({
    reference: params.reference,
    amountInCents: params.amountInCents,
    currency: params.currency,
    integritySecret: params.integritySecret ?? getWompiIntegritySecret(),
  });
}

function buildCheckoutQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}

export function buildCheckoutUrl(params: {
  reference: string;
  amountInCents: number;
  currency: string;
  redirectUrl?: string;
}): string {
  const checkoutParams = {
    'public-key': getWompiPublicKey(),
    currency: params.currency,
    'amount-in-cents': String(params.amountInCents),
    reference: params.reference,
    'signature:integrity': generateIntegritySignature(params),
  };

  if (params.redirectUrl) {
    Object.assign(checkoutParams, { 'redirect-url': params.redirectUrl });
  }

  return `${WOMPI_CHECKOUT_BASE_URL}?${buildCheckoutQuery(checkoutParams)}`;
}

export function buildCheckoutFields(params: {
  reference: string;
  amountInCents: number;
  currency: string;
  redirectUrl?: string;
}): Record<string, string> {
  const checkoutFields: Record<string, string> = {
    'public-key': getWompiPublicKey(),
    currency: params.currency,
    'amount-in-cents': String(params.amountInCents),
    reference: params.reference,
    'signature:integrity': generateIntegritySignature(params),
  };

  if (params.redirectUrl) {
    checkoutFields['redirect-url'] = params.redirectUrl;
  }

  return checkoutFields;
}
