"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Picks the lift the whole screen is about.
 *
 * One control for every card that can be narrowed to a single exercise — the
 * strength chart and the volume chart both read `?exercise=`. They used to have
 * a dropdown each, which allowed the two charts above and below one another to
 * be showing different lifts: the same picture, read as one, said something
 * that was not true of either.
 *
 * The choice lives in the URL, not in component state: the page is a server
 * component and the charts are rendered on the server, so changing the lift is
 * a navigation. That keeps the back button meaningful and means a link to
 * `/progress?exercise=<id>` shows what the sender was looking at.
 *
 * `query` is the page's whole selection, not just this control's — the range
 * and the two chart-type toggles write to their own parameters, and this one
 * has to carry their values forward or picking a lift would reset them.
 *
 * The current value arrives as a prop rather than from `useSearchParams`. The
 * server has already resolved it (an unknown id falls back to a real one), so
 * reading the raw query string here would let the two disagree about which lift
 * is selected.
 */
export function ExerciseSelect({
  value,
  options,
  query,
  label,
}: {
  value: string;
  options: { id: string; name: string }[];
  /** Every parameter the page reads, at its current value. */
  query: Record<string, string>;
  /** The accessible name; there is no visible label beside this. */
  label: string;
}) {
  const router = useRouter();
  const [pending, startNavigation] = useTransition();

  function onChange(next: string) {
    const params = new URLSearchParams({ ...query, exercise: next });
    startNavigation(() => {
      /* Without `scroll: false` the page jumps to the top on every change. It
         is at the top already, but the charts below would still flick. */
      router.push(`/progress?${params}`, { scroll: false });
    });
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        data-pending={pending ? "" : undefined}
        className="w-full data-pending:opacity-60"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
