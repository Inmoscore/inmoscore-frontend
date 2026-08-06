import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import {
  WOMPI_CHECKOUT_BASE_URL,
  WompiPaymentStatus,
  WompiPlanSlug,
  buildPaymentReference,
  generateIntegritySignature,
  getPlanDescriptor,
  getWompiIntegritySecret,
  getWompiPublicKey,
} from '../lib/wompi';
import { getPlanActivationDecision } from '../lib/emailVerificationPolicy';
import {
  buildOperationalLogEntry,
  writeOperationalLog,
} from '../lib/adminOperationalSafety';

type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    email?: string;
    tipo_usuario?: string;
  };
};

type WompiPaymentRow = {
  id: string;
  user_id: string | null;
  plan_type: WompiPlanSlug;
  reference: string;
  status: WompiPaymentStatus;
  wompi_transaction_id: string | null;
  processed_at: string | null;
};

type WompiUserPlanRow = {
  id: string;
  plan_type: string | null;
  daily_search_limit: number | null;
};

type WompiUserEmailStateRow = {
  id: string;
  email_verified_at: string | null;
};

type WompiTransactionPayload = {
  id: string;
  reference: string;
  status: string;
};

const wompiCheckoutSchema = z.object({
  plan_type: z.enum(['basic', 'pro']),
});

const wompiBillingRouter = Router();

function getNestedValue(payload: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }

    return undefined;
  }, payload);
}

function getSignaturePropertyValue(body: Record<string, unknown>, property: string): unknown {
  const directValue = getNestedValue(body, property);

  if (directValue !== undefined) {
    return directValue;
  }

  return getNestedValue(body?.data, property);
}

function safeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function secureCompare(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }

  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyWompiEventSignature(payload: unknown, secret: string): boolean {
  const body = payload as Record<string, unknown>;
  const signature = body?.signature;
  const checksum =
    signature && typeof signature === 'object' && typeof (signature as Record<string, unknown>).checksum === 'string'
      ? (signature as Record<string, string>).checksum
      : typeof body?.checksum === 'string'
        ? body.checksum
        : null;
  const signatureProperties =
    signature && typeof signature === 'object'
      ? (signature as Record<string, unknown>).properties
      : null;
  const properties: string[] | null = Array.isArray(signatureProperties)
    ? signatureProperties.map((property: unknown) => String(property))
    : null;
  const timestamp = body?.timestamp;

  if (!checksum || !properties || (typeof timestamp !== 'string' && typeof timestamp !== 'number')) {
    return false;
  }

  const signedProperties = properties.map((property: string) =>
    safeString(getSignaturePropertyValue(body, property))
  );
  const expectedChecksum = sha256(`${signedProperties.join('')}${String(timestamp)}${secret}`);

  return secureCompare(expectedChecksum, checksum);
}

function canAttemptWompiSignatureVerification(payload: unknown): boolean {
  const body = payload as Record<string, unknown>;
  const signature = body?.signature;

  if (!signature || typeof signature !== 'object') {
    return false;
  }

  const signatureRecord = signature as Record<string, unknown>;
  return Boolean(signatureRecord.checksum && signatureRecord.properties && body?.timestamp);
}

function extractWompiTransaction(body: unknown): WompiTransactionPayload | null {
  const eventBody = body as Record<string, unknown>;
  const data = eventBody?.data;
  const transaction =
    data && typeof data === 'object' && 'transaction' in data
      ? (data as Record<string, unknown>).transaction
      : data;

  if (!transaction || typeof transaction !== 'object') {
    return null;
  }

  const transactionRecord = transaction as Record<string, unknown>;
  const id = transactionRecord.id;
  const reference = transactionRecord.reference;
  const status = transactionRecord.status;

  if (
    (typeof id !== 'string' && typeof id !== 'number') ||
    typeof reference !== 'string' ||
    typeof status !== 'string'
  ) {
    return null;
  }

  return {
    id: String(id),
    reference,
    status: status.toUpperCase(),
  };
}

function getPlanTypeFromReference(reference: string): WompiPlanSlug | null {
  const match = /^inmoscore_(basic|pro)(?:_|$)/.exec(reference);
  return match ? (match[1] as WompiPlanSlug) : null;
}

function mapWompiStatus(status: string): WompiPaymentStatus {
  switch (status) {
    case 'APPROVED':
      return 'approved';
    case 'PENDING':
      return 'pending';
    case 'DECLINED':
      return 'declined';
    case 'VOIDED':
      return 'voided';
    case 'ERROR':
      return 'error';
    default:
      return 'failed';
  }
}

function isTerminalNonApprovedStatus(status: WompiPaymentStatus): boolean {
  return ['declined', 'voided', 'error', 'failed'].includes(status);
}

async function updateWompiPayment(params: {
  reference: string;
  status: WompiPaymentStatus;
  wompiStatus: string;
  transactionId: string;
  rawEvent: unknown;
  processedAt?: string | null;
}): Promise<void> {
  const updatePayload: Record<string, unknown> = {
    status: params.status,
    wompi_status: params.wompiStatus,
    wompi_transaction_id: params.transactionId,
    raw_event: params.rawEvent,
    webhook_payload: params.rawEvent,
    updated_at: new Date().toISOString(),
  };

  if (params.processedAt !== undefined) {
    updatePayload.processed_at = params.processedAt;
  }

  const { error } = await supabase
    .from('wompi_payments')
    .update(updatePayload)
    .eq('reference', params.reference);

  if (error) {
    throw error;
  }
}

async function getCurrentUserPlan(userId: string): Promise<WompiUserPlanRow> {
  const { data, error } = await supabase
    .from('users')
    .select('id, plan_type, daily_search_limit')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(`Usuario ${userId} no encontrado para activacion Wompi`);
  }

  return data as WompiUserPlanRow;
}

async function getPersistedUserEmailState(userId: string): Promise<WompiUserEmailStateRow> {
  const { data, error } = await supabase
    .from('users')
    .select('id, email_verified_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(`Usuario ${userId} no encontrado para validacion de correo`);
  }

  return data as WompiUserEmailStateRow;
}

async function activateUserPlan(payment: WompiPaymentRow, planType: WompiPlanSlug): Promise<WompiUserPlanRow> {
  if (!payment.user_id) {
    throw new Error(`Pago Wompi ${payment.reference} no tiene user_id`);
  }

  const descriptor = getPlanDescriptor(planType);
  const previousPlan = await getCurrentUserPlan(payment.user_id);
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('users')
    .update({
      plan_type: planType,
      daily_search_limit: descriptor.dailySearchLimit,
      searches_used_today: 0,
      last_search_reset: now,
      last_payment_provider: 'wompi',
    })
    .eq('id', payment.user_id);

  if (error) {
    throw error;
  }

  return previousPlan;
}

async function insertPlanChangeAudit(params: {
  payment: WompiPaymentRow;
  previousPlan: WompiUserPlanRow;
  newPlanType: WompiPlanSlug;
  newDailySearchLimit: number;
}): Promise<void> {
  try {
    const { error } = await supabase
      .from('plan_change_logs')
      .insert({
        admin_user_id: null,
        target_user_id: params.payment.user_id,
        previous_plan_type: params.previousPlan.plan_type,
        new_plan_type: params.newPlanType,
        previous_daily_search_limit: params.previousPlan.daily_search_limit,
        new_daily_search_limit: params.newDailySearchLimit,
        reason: 'wompi_webhook_auto_activation',
        payment_id: params.payment.id,
        payment_reference: params.payment.reference,
        payment_provider: 'wompi',
        metadata: {
          source: 'wompi_webhook',
          wompi_transaction_id: params.payment.wompi_transaction_id,
        },
      });

    if (error) {
      writeOperationalLog(
        'error',
        '[WOMPI_WEBHOOK_ERROR]',
        buildOperationalLogEntry({
          category: 'audit_insert_failed',
          operation: 'insert',
          endpointKey: 'wompi.webhook_audit',
          error,
        })
      );
    }
  } catch (error) {
    writeOperationalLog(
      'error',
      '[WOMPI_WEBHOOK_ERROR]',
      buildOperationalLogEntry({
        category: 'audit_insert_exception',
        operation: 'insert',
        endpointKey: 'wompi.webhook_audit',
        error,
      })
    );
  }
}

wompiBillingRouter.post('/create-wompi-checkout', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = wompiCheckoutSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Datos invalidos',
      });
      return;
    }

    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
      return;
    }

    const planType = parsed.data.plan_type;
    const descriptor = getPlanDescriptor(planType);
    const reference = buildPaymentReference(userId, planType);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const shouldSendRedirectUrl =
      frontendUrl.startsWith('https://') &&
      !frontendUrl.includes('localhost') &&
      !frontendUrl.includes('127.0.0.1');
    const redirectUrl = shouldSendRedirectUrl
      ? `${frontendUrl}/upgrade?payment_pending=true&plan=${planType}`
      : undefined;
    const publicKey = getWompiPublicKey();
    const integritySecret = getWompiIntegritySecret();
    const signature = generateIntegritySignature({
      reference,
      amountInCents: descriptor.amountInCents,
      currency: descriptor.currency,
      integritySecret,
    });

    const { error } = await supabase.from('wompi_payments').insert({
      user_id: userId,
      plan_type: planType,
      reference,
      amount_in_cents: descriptor.amountInCents,
      currency: descriptor.currency,
      status: 'created',
      checkout_url: WOMPI_CHECKOUT_BASE_URL,
    });

    if (error) {
      throw error;
    }

    console.log('[WOMPI_CHECKOUT_CREATED]', {
      reference,
      planType,
      amountInCents: descriptor.amountInCents,
    });

    console.log('[WOMPI_CHECKOUT_DEBUG]', {
      reference,
      amountInCents: descriptor.amountInCents,
      currency: descriptor.currency,
      hasPublicKey: Boolean(publicKey),
      hasIntegritySecret: Boolean(integritySecret),
      signatureGenerated: Boolean(signature),
      hasRedirectUrl: Boolean(redirectUrl),
    });

    res.json({
      success: true,
      data: {
        provider: 'wompi',
        mode: 'widget',
        reference,
        publicKey,
        currency: descriptor.currency,
        amountInCents: descriptor.amountInCents,
        signature,
        ...(redirectUrl ? { redirectUrl } : {}),
      },
    });
  } catch (error) {
    writeOperationalLog(
      'error',
      '[WOMPI_CHECKOUT_ERROR]',
      buildOperationalLogEntry({
        category: 'checkout_create_failed',
        operation: 'create',
        endpointKey: 'wompi.checkout',
        error,
      })
    );
    res.status(500).json({
      success: false,
      message: 'No se pudo iniciar el pago. Intenta nuevamente.',
    });
  }
});

export async function wompiWebhookHandler(req: Request, res: Response): Promise<void> {
  const body = req.body ?? {};

  try {
    console.log('[WOMPI_WEBHOOK]', { received: true });

    const eventsSecret = process.env.WOMPI_EVENTS_SECRET?.trim();

    if (!eventsSecret) {
      console.error('[WOMPI_WEBHOOK_ERROR]', { reason: 'missing_events_secret' });
      res.status(400).json({ success: false, message: 'Invalid webhook configuration' });
      return;
    }

    if (!canAttemptWompiSignatureVerification(body)) {
      console.warn('[WOMPI_WEBHOOK_ERROR]', { reason: 'missing_signature_structure' });
      res.status(400).json({ success: false, message: 'Invalid webhook payload' });
      return;
    }

    const signatureVerified = verifyWompiEventSignature(body, eventsSecret);

    if (!signatureVerified) {
      console.warn('[WOMPI_WEBHOOK_ERROR]', { reason: 'invalid_signature' });
      res.status(401).json({ success: false, message: 'Invalid signature' });
      return;
    }

    const transaction = extractWompiTransaction(body);

    if (!transaction) {
      console.warn('[WOMPI_WEBHOOK_ERROR]', { reason: 'invalid_transaction_payload' });
      res.status(400).json({ success: false, message: 'Invalid transaction payload' });
      return;
    }

    const { id: transactionId, reference, status } = transaction;
    const planTypeFromReference = getPlanTypeFromReference(reference);

    if (!planTypeFromReference) {
      console.warn('[WOMPI_WEBHOOK_ERROR]', { reason: 'invalid_reference' });
      res.status(400).json({ success: false, message: 'Invalid reference' });
      return;
    }

    const mappedStatus = mapWompiStatus(status);

    const { data: duplicatePayment, error: duplicateError } = await supabase
      .from('wompi_payments')
      .select('id, status, processed_at')
      .eq('wompi_transaction_id', transactionId)
      .not('processed_at', 'is', null)
      .maybeSingle();

    if (duplicateError) {
      throw duplicateError;
    }

    if (duplicatePayment) {
      console.log('[WOMPI_WEBHOOK_DUPLICATE]', {
        transactionId,
        paymentId: duplicatePayment.id,
        status: duplicatePayment.status,
      });
      res.status(200).json({ success: true, duplicate: true });
      return;
    }

    const { data: payment, error: paymentError } = await supabase
      .from('wompi_payments')
      .select('id, user_id, plan_type, reference, status, wompi_transaction_id, processed_at')
      .eq('reference', reference)
      .maybeSingle();

    if (paymentError) {
      throw paymentError;
    }

    if (!payment) {
      console.warn('[WOMPI_WEBHOOK_ERROR]', { reason: 'payment_not_found', reference });
      res.status(200).json({ success: true, received: true });
      return;
    }

    const existingPayment = payment as WompiPaymentRow;

    if (
      existingPayment.processed_at ||
      existingPayment.status === 'approved' ||
      existingPayment.status === 'approved_pending_email_verification'
    ) {
      console.log('[WOMPI_WEBHOOK_DUPLICATE]', {
        transactionId,
        paymentId: existingPayment.id,
        status: existingPayment.status,
      });
      res.status(200).json({ success: true, duplicate: true });
      return;
    }

    if (existingPayment.plan_type !== planTypeFromReference) {
      console.warn('[WOMPI_WEBHOOK_ERROR]', {
        reason: 'reference_plan_mismatch',
        paymentId: existingPayment.id,
      });
      res.status(400).json({ success: false, message: 'Invalid payment reference' });
      return;
    }

    const processedAt = new Date().toISOString();

    await updateWompiPayment({
      reference,
      status: mappedStatus,
      wompiStatus: status,
      transactionId,
      rawEvent: body,
      processedAt: isTerminalNonApprovedStatus(mappedStatus) ? processedAt : null,
    });

    if (mappedStatus !== 'approved') {
      res.status(200).json({ success: true, received: true });
      return;
    }

    if (!existingPayment.user_id) {
      throw new Error(`Pago Wompi ${existingPayment.reference} no tiene user_id`);
    }

    const emailState = await getPersistedUserEmailState(existingPayment.user_id);

    if (getPlanActivationDecision(emailState.email_verified_at) === 'defer_email_verification') {
      await updateWompiPayment({
        reference,
        status: 'approved_pending_email_verification',
        wompiStatus: status,
        transactionId,
        rawEvent: body,
        processedAt: null,
      });

      console.log('[WOMPI_WEBHOOK_APPROVED_PENDING_EMAIL_VERIFICATION]', {
        paymentId: existingPayment.id,
        transactionId,
        planType: planTypeFromReference,
      });

      res.status(200).json({
        success: true,
        received: true,
        plan_activation: 'pending_email_verification',
      });
      return;
    }

    const descriptor = getPlanDescriptor(planTypeFromReference);
    const previousPlan = await activateUserPlan(existingPayment, planTypeFromReference);

    await insertPlanChangeAudit({
      payment: existingPayment,
      previousPlan,
      newPlanType: planTypeFromReference,
      newDailySearchLimit: descriptor.dailySearchLimit,
    });

    await updateWompiPayment({
      reference,
      status: mappedStatus,
      wompiStatus: status,
      transactionId,
      rawEvent: body,
      processedAt,
    });

    console.log('[WOMPI_WEBHOOK_APPROVED]', {
      paymentId: existingPayment.id,
      transactionId,
      planType: planTypeFromReference,
    });

    res.status(200).json({ success: true, received: true });
  } catch (error) {
    writeOperationalLog(
      'error',
      '[WOMPI_WEBHOOK_ERROR]',
      buildOperationalLogEntry({
        category: 'webhook_processing_failed',
        operation: 'process',
        endpointKey: 'wompi.webhook',
        error,
      })
    );
    res.status(500).json({ success: false, message: 'Internal webhook error' });
  }
}

export default wompiBillingRouter;
