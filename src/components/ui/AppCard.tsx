import type { ReactNode } from 'react';

export function AppCard({
  children,
  className = '',
  muted = false,
}: {
  children: ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <section
      className={`rounded-3xl border border-slate-200 ${
        muted ? 'bg-slate-50' : 'bg-white'
      } p-5 shadow-sm sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}
