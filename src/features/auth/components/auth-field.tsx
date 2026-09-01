import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A labelled input in the doorway's own shape: the micro-label above a pill
 * that matches the button below it. The shared `Input` is a small in-card
 * control at 32px, which is under the tap target these two screens want, so the
 * height and the radius are set here rather than changed for every screen.
 *
 * The visible casing comes from `label-caps`, so the accessible name stays the
 * sentence-case text in the DOM.
 */
export function AuthField({
  id,
  label,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { id: string; label: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="label-caps">
        {label}
      </label>
      <Input
        id={id}
        className="h-12 rounded-full border-border bg-card px-5 text-base md:text-base"
        {...props}
      />
    </div>
  );
}

/** The one thing that went wrong, above the button that will try again. */
export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-center text-sm font-medium text-destructive">
      {children}
    </p>
  );
}
