import type { ReactNode } from 'react';

type BannerTone = 'dark' | 'info' | 'warning' | 'success' | 'neutral';

const toneClasses: Record<BannerTone, string> = {
  dark: 'border-slate-950 bg-slate-950 text-white',
  info: 'border-blue-200 bg-blue-50 text-blue-950',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  neutral: 'border-slate-200 bg-white text-slate-950',
};

export function ActionBanner({
  title,
  description,
  action,
  tone = 'neutral',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: BannerTone;
}) {
  return (
    <section className={`rounded-3xl border p-5 shadow-sm sm:p-6 ${toneClasses[tone]}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight">{title}</h2>
          {description && <p className="mt-2 max-w-3xl text-sm leading-6 opacity-80">{description}</p>}
        </div>
        {action}
      </div>
    </section>
  );
}
