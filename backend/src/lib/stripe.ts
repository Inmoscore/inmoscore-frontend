import Stripe from 'stripe';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

let stripeClient: ReturnType<typeof createStripeClient> | null = null;

function createStripeClient(secretKey: string) {
  return new Stripe(secretKey, {
    apiVersion: '2024-12-18.acacia' as any,
  });
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY no esta configurado');
  }

  if (!stripeClient) {
    stripeClient = createStripeClient(secretKey);
  }

  return stripeClient;
}

export const PLAN_CONFIG = {
  free: { daily_search_limit: 5 },
  basic: { daily_search_limit: 12 },
  pro: { daily_search_limit: 30 },
} as const;

export type BillablePlanType = 'basic' | 'pro';
export type PlanType = keyof typeof PLAN_CONFIG;

export function getPlanConfig(planType: string) {
  if (planType === 'basic') return PLAN_CONFIG.basic;
  if (planType === 'pro') return PLAN_CONFIG.pro;
  return PLAN_CONFIG.free;
}

export function getPriceId(planType: string): string | null {
  if (planType === 'basic') return process.env.STRIPE_BASIC_PRICE_ID || null;
  if (planType === 'pro') return process.env.STRIPE_PRO_PRICE_ID || null;
  return null;
}
