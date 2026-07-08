import type { ComponentType, ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      {Icon && (
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <h3 className="mt-4 text-lg font-black text-slate-950">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
