import Link from 'next/link';
import type { ComponentType } from 'react';
import { ArrowRight } from 'lucide-react';
import { StatusBadge, type StatusTone } from './StatusBadge';

export function ModuleCard({
  title,
  description,
  href,
  icon: Icon,
  status,
  statusTone = 'neutral',
}: {
  title: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  status?: string;
  statusTone?: StatusTone;
}) {
  return (
    <Link
      href={href}
      className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-2xl bg-slate-950 p-3 text-white">
          <Icon className="h-5 w-5" />
        </div>
        {status && <StatusBadge tone={statusTone}>{status}</StatusBadge>}
      </div>
      <h3 className="mt-5 text-lg font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-5 inline-flex items-center gap-2 text-sm font-black text-slate-950">
        Abrir módulo
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
