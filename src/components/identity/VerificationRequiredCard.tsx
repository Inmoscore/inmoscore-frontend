'use client';

import Link from 'next/link';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { AppCard } from '@/components/ui/AppCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { IDENTITY_VERIFICATION_REQUIRED_MESSAGE } from '@/lib/identityVerification';

type VerificationRequiredCardProps = {
  title?: string;
  description?: string;
};

export function VerificationRequiredCard({
  title = 'Verificacion de identidad requerida',
  description = IDENTITY_VERIFICATION_REQUIRED_MESSAGE,
}: VerificationRequiredCardProps) {
  return (
    <AppCard className="border-amber-200 bg-amber-50">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
            <LockKeyhole className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <StatusBadge tone="warning">Identidad pendiente</StatusBadge>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-amber-950">{title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">{description}</p>
          </div>
        </div>
        <Link
          href="/legal/verificacion-identidad"
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-2 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 visited:text-white sm:w-auto"
        >
          <ShieldCheck className="h-4 w-4 text-white" aria-hidden="true" />
          <span className="whitespace-nowrap text-white">Verificar identidad</span>
        </Link>
      </div>
    </AppCard>
  );
}
