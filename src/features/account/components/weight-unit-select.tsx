"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api";
import { WEIGHT_UNIT_LABELS, WEIGHT_UNITS, type WeightUnit } from "@/lib/weight";

/**
 * Switches the display unit. Nothing stored changes — every weight stays
 * kilograms in the database; this only decides what is rendered and what typed
 * input is converted from.
 */
export function WeightUnitSelect({ unit }: { unit: WeightUnit }) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [current, setCurrent] = useState<WeightUnit>(unit);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: string) {
    const chosen = next as WeightUnit;
    const previous = current;

    setCurrent(chosen);
    setError(null);

    try {
      await apiFetch("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({ weightUnit: chosen }),
      });
      startRefresh(() => router.refresh());
    } catch (caught) {
      /** Put the control back where it was; the preference did not change. */
      setCurrent(previous);
      setError(caught instanceof ApiError ? caught.message : "Could not change the unit.");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Select value={current} onValueChange={onChange}>
        <SelectTrigger id="weight-unit" className="w-40" aria-label="Display unit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WEIGHT_UNITS.map((value) => (
            <SelectItem key={value} value={value}>
              {WEIGHT_UNIT_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
