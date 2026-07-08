import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import {
  BillablePlanType,
  getPlanConfig,
  getPriceId,
  getStripeClient,
  isStripeConfigured,
} from '../lib/stripe';

type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    email?: string;
    tipo_usuario?: string;
  };
};

type UserPlanUpdate = {
  plan_type: 'free' | BillablePlanType;
  daily_search_limit: number;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  updated_at?: string;
};

type StripeIdObject = {
  id?: string;
};

type StripeIdValue = string | StripeIdObject | null | undefined;

type StripeMetadata = Record<string, string | undefined> | null | undefined;

type CheckoutSessionObject = {
  id: string;
  customer?: StripeIdValue;
  subscription?: StripeIdValue;
  client_reference_id?: string | null;
  metadata?: StripeMetadata;
};

type SubscriptionObject = {
  id: string;
  customer?: StripeIdValue;
  status?: string;
  metadata?: StripeMetadata;
};

type StripeEventObject = {
  id: string;
  type: string;
  data: {
    object: unknown;
  };
};

const checkoutSessionSchema = z.object({
  plan_type: z.enum(['basic', 'pro']),
});

const processedStripeEvents = new Set<string>();
const MAX_PROCESSED_EVENTS = 500;

const billingRouter = Router();

function sendStripeNotConfigured(res: Response): void {
  res.status(503).json({
    success: false,
    message: 'Stripe no está configurado. Usa Wompi.',
  });
}

function markEventProcessed(eventId: string): void {
  processedStripeEvents.add(eventId);

  if (processedStripeEvents.size > MAX_PROCESSED_EVENTS) {
    const firstEventId = processedStripeEvents.values().next().value;
    if (firstEventId) {
      processedStripeEvents.delete(firstEventId);
    }
  }
}

function isBillablePlan(planType: unknown): planType is BillablePlanType {
  return planType === 'basic' || planType === 'pro';
}

function getStripeId(value: StripeIdValue): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.id || null;
}

function getSubscriptionStatus(subscription: SubscriptionObject): string {
  return typeof subscription.status === 'string' ? subscription.status : '';
}

async function updateUserPlan(userId: string, payload: UserPlanUpdate): Promise<void> {
  const updatePayload: UserPlanUpdate = {
    ...payload,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('users').update(updatePayload).eq('id', userId);

  if (!error) return;

  const message = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();

  if (message.includes('updated_at')) {
    const { updated_at: _updatedAt, ...withoutUpdatedAt } = updatePayload;
    const retry = await supabase.from('users').update(withoutUpdatedAt).eq('id', userId);

    if (!retry.error) return;
    throw retry.error;
  }

  throw error;
}

async function findUserIdBySubscription(subscriptionId: string | null): Promise<string | null> {
  if (!subscriptionId) return null;

  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}

async function applyPaidPlan(params: {
  userId: string;
  planType: BillablePlanType;
  customerId?: string | null;
  subscriptionId?: string | null;
}): Promise<void> {
  const planConfig = getPlanConfig(params.planType);

  await updateUserPlan(params.userId, {
    plan_type: params.planType,
    daily_search_limit: planConfig.daily_search_limit,
    stripe_customer_id: params.customerId ?? undefined,
    stripe_subscription_id: params.subscriptionId ?? undefined,
  });
}

async function downgradeToFree(userId: string, subscriptionId?: string | null): Promise<void> {
  await updateUserPlan(userId, {
    plan_type: 'free',
    daily_search_limit: getPlanConfig('free').daily_search_limit,
    stripe_subscription_id: subscriptionId ? null : undefined,
  });
}

billingRouter.post('/create-checkout-session', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = checkoutSessionSchema.safeParse(req.body ?? {});

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

    const { plan_type } = parsed.data;

    if (!isStripeConfigured()) {
      sendStripeNotConfigured(res);
      return;
    }

    const priceId = getPriceId(plan_type);

    if (!priceId) {
      console.error(`[billing] Price ID faltante para plan ${plan_type}`);
      sendStripeNotConfigured(res);
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/upgrade?success=true&plan=${plan_type}`,
      cancel_url: `${frontendUrl}/upgrade?canceled=true`,
      client_reference_id: userId,
      metadata: {
        user_id: userId,
        plan_type,
      },
      subscription_data: {
        metadata: {
          user_id: userId,
          plan_type,
        },
      },
      allow_promotion_codes: true,
    });

    res.json({
      success: true,
      data: {
        url: session.url,
        session_id: session.id,
      },
    });
  } catch (error) {
    console.error('[billing] Error creando Checkout Session:', error);
    res.status(500).json({
      success: false,
      message: 'No se pudo iniciar el pago',
    });
  }
});

async function handleCheckoutSessionCompleted(session: CheckoutSessionObject): Promise<void> {
  const metadata = session.metadata ?? {};
  const userId = metadata.user_id || session.client_reference_id;
  const planType = metadata.plan_type;

  if (!userId || !isBillablePlan(planType)) {
    console.warn('[stripe_webhook] checkout.session.completed ignorado por metadata invalida');
    return;
  }

  await applyPaidPlan({
    userId,
    planType,
    customerId: getStripeId(session.customer),
    subscriptionId: getStripeId(session.subscription),
  });
}

async function handleSubscriptionUpdated(subscription: SubscriptionObject): Promise<void> {
  const metadata = subscription.metadata ?? {};
  const planType = metadata.plan_type;
  const subscriptionId = subscription.id;
  const userId = metadata.user_id || (await findUserIdBySubscription(subscriptionId));

  if (!userId) {
    console.warn('[stripe_webhook] customer.subscription.updated sin user_id resoluble');
    return;
  }

  const status = getSubscriptionStatus(subscription);

  if ((status === 'active' || status === 'trialing') && isBillablePlan(planType)) {
    await applyPaidPlan({
      userId,
      planType,
      customerId: getStripeId(subscription.customer),
      subscriptionId,
    });
    return;
  }

  await downgradeToFree(userId);
}

async function handleSubscriptionDeleted(subscription: SubscriptionObject): Promise<void> {
  const metadata = subscription.metadata ?? {};
  const subscriptionId = subscription.id;
  const userId = metadata.user_id || (await findUserIdBySubscription(subscriptionId));

  if (!userId) {
    console.warn('[stripe_webhook] customer.subscription.deleted sin user_id resoluble');
    return;
  }

  await downgradeToFree(userId, subscriptionId);
}

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const signature = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!isStripeConfigured() || !webhookSecret) {
    console.warn('[stripe_webhook] Stripe legacy no configurado');
    sendStripeNotConfigured(res);
    return;
  }

  if (!signature || Array.isArray(signature)) {
    res.status(400).json({ received: false });
    return;
  }

  let event: StripeEventObject;

  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret) as StripeEventObject;
  } catch (error) {
    console.warn('[stripe_webhook] Firma invalida:', error);
    res.status(400).json({ received: false });
    return;
  }

  if (processedStripeEvents.has(event.id)) {
    res.json({ received: true });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as CheckoutSessionObject);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as SubscriptionObject);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as SubscriptionObject);
        break;
      case 'invoice.payment_failed':
        console.warn('[stripe_webhook] invoice.payment_failed recibido:', event.id);
        break;
      default:
        break;
    }

    markEventProcessed(event.id);
  } catch (error) {
    console.error('[stripe_webhook] Error procesando evento:', error);
  }

  res.json({ received: true });
}

export default billingRouter;
