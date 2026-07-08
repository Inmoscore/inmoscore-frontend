import type { ReactNode } from 'react';
import { SectionHeader } from './SectionHeader';

export function DataTableShell({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5 sm:p-6">
        <SectionHeader title={title} description={description} action={action} />
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}
