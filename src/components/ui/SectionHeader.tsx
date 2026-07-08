import type { ReactNode } from 'react';

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow && (
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">{title}</h2>
        {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}
