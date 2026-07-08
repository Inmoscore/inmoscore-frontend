import type { ComponentType, ReactNode } from 'react';

export function MetricCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-slate-500" />}
      </div>
      <p className="mt-3 text-2xl font-black text-slate-950">{value}</p>
      {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
    </div>
  );
}
