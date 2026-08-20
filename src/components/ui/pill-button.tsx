import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * The full-bleed call to action: START WORKOUT, COMPLETE SET. Distinct from
 * shadcn's `Button`, which is the small in-card control — this one is a
 * destination in its own right, so it is 56px tall, fully rounded, and set in
 * the display face with the same uppercase tracking as the micro-labels.
 *
 * Charcoal is "begin". Sage is "that counted". Nothing else gets this shape.
 */
const pillButtonVariants = cva(
  cn(
    "font-display inline-flex h-14 w-full items-center justify-center rounded-full px-6",
    "text-sm font-bold uppercase transition-[background-color,transform,opacity]",
    "outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50",
    "active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45",
  ),
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        confirm: "bg-brand text-brand-foreground hover:bg-brand-deep",
        outline: "border border-border bg-card text-foreground hover:bg-secondary",
      },
      size: {
        default: "h-14",
        sm: "h-12 text-[0.8125rem]",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export function PillButton({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof pillButtonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="pill-button"
      className={cn(pillButtonVariants({ variant, size }), className)}
      style={{ letterSpacing: "var(--tracking-label)" }}
      {...props}
    />
  );
}

export { pillButtonVariants };
