import { stepTitle } from '../lib/journeyPlan';
import { useFormSession } from '../session/FormSession';

/** "Form 1 of 2 · Debit card reissue" while a planner plan is being filled. Hidden for a single form. */
export function PlanProgress() {
  const { plan, planStep } = useFormSession();
  if (!plan || plan.steps.length < 2) return null;
  const current = plan.steps[planStep];
  if (!current) return null;
  return (
    <div
      role="status"
      aria-label="Plan progress"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-foreground bg-primary/10 px-4 py-2 text-xs sm:px-6"
    >
      <span className="font-semibold text-primary">
        Form {planStep + 1} of {plan.steps.length}
      </span>
      <span className="font-semibold">{stepTitle(current)}</span>
      <span className="flex items-center gap-1" aria-hidden="true">
        {plan.steps.map((step, index) => (
          <span
            key={step.journey}
            className={`h-1.5 w-6 ${index < planStep ? 'bg-primary' : index === planStep ? 'bg-foreground' : 'bg-foreground/20'}`}
          />
        ))}
      </span>
      {plan.steps[planStep + 1] ? (
        <span className="text-muted-foreground">Next: {stepTitle(plan.steps[planStep + 1])}</span>
      ) : (
        <span className="text-muted-foreground">Last form in your plan</span>
      )}
    </div>
  );
}
