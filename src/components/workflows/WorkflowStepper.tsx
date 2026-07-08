export type WorkflowStepState = 'complete' | 'current' | 'upcoming' | 'warning' | 'review';

export type WorkflowStepItem = {
  key: string;
  title: string;
  description?: string;
  state?: WorkflowStepState;
};

const stateClasses: Record<WorkflowStepState, string> = {
  complete: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  current: 'border-slate-950 bg-slate-950 text-white',
  upcoming: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  review: 'border-violet-200 bg-violet-50 text-violet-950',
};

export function WorkflowStepper({
  steps,
  currentStep,
  onStepChange,
}: {
  steps: WorkflowStepItem[];
  currentStep: string;
  onStepChange?: (step: string) => void;
}) {
  const currentIndex = Math.max(steps.findIndex((step) => step.key === currentStep), 0);
  const progressPercent = ((currentIndex + 1) / steps.length) * 100;

  return (
    <div>
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-950 transition-all" style={{ width: `${progressPercent}%` }} />
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        {steps.map((step, index) => {
          const derivedState: WorkflowStepState =
            step.state || (step.key === currentStep ? 'current' : index < currentIndex ? 'complete' : 'upcoming');

          return (
            <button
              key={step.key}
              type="button"
              onClick={() => onStepChange?.(step.key)}
              className={`rounded-2xl border p-3 text-left transition ${stateClasses[derivedState]}`}
            >
              <span className="text-xs font-black">{String(index + 1).padStart(2, '0')}</span>
              <span className="mt-1 block text-sm font-black">{step.title}</span>
              {step.description && <span className="mt-1 hidden text-xs opacity-70 lg:block">{step.description}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
