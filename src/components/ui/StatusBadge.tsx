import type { ReactNode } from 'react';

export type StatusTone =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'pending'
  | 'verified'
  | 'blocked'
  | 'review'
  | 'neutral';

const toneClasses: Record<StatusTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  pending: 'border-slate-200 bg-slate-50 text-slate-700',
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  blocked: 'border-rose-200 bg-rose-50 text-rose-800',
  review: 'border-violet-200 bg-violet-50 text-violet-800',
  neutral: 'border-slate-200 bg-white text-slate-700',
};

export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}
