import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from "@/lib/muscle-groups";
import { formatVolume, type WeightUnit } from "@/lib/weight";
import type { MuscleShare } from "@/server/services/progress";

/** The drawing's own coordinate space. Wide enough that the side labels fit. */
const WIDTH = 360;
const HEIGHT = 290;
const CENTRE = { x: WIDTH / 2, y: 145 };
const RADIUS = 96;
/** How far outside the outer ring the axis labels sit. */
const LABEL_GAP = 18;
const RINGS = [0.25, 0.5, 0.75, 1];

/**
 * Where the work went, as a spider chart: one axis per muscle group, the
 * polygon reaching furthest on whatever took the most volume.
 *
 * Every group gets an axis, trained or not — which is the reason this shape
 * beats the row of bars it replaced. A bar chart can only draw the groups that
 * have a number; a radar draws the ones that do not as a vertex pinned at the
 * centre, so a whole side of the polygon collapsing inward *is* the finding.
 *
 * Drawn by hand rather than with a charting library (ADR 0016). A radar is a
 * polygon in polar coordinates and nothing else, and every library that offers
 * one is a client component — this card would cross the server boundary for the
 * sake of twelve points.
 *
 * Radii are shares of the **heaviest group**, not of the total: normalising by
 * the total on twelve axes leaves every polygon a small blob near the centre,
 * and the question here is proportion between groups, which the shape answers
 * either way.
 */
export function MuscleRadar({ groups, unit }: { groups: MuscleShare[]; unit: WeightUnit }) {
  const byGroup = new Map(groups.map((group) => [group.muscleGroup, group]));
  const heaviest = Math.max(...groups.map((group) => group.volume), 1);

  const axes = MUSCLE_GROUPS.map((group, index) => {
    /* Straight up is the first axis; twelve groups is a clock face at 30°. */
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / MUSCLE_GROUPS.length;
    const volume = byGroup.get(group)?.volume ?? 0;

    return {
      group,
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      /* A trained group never sits exactly on the centre: two groups a hair
         apart and one at zero must not draw as the same vertex. */
      reach: volume === 0 ? 0 : Math.max(volume / heaviest, 0.06),
    };
  });

  const at = (axis: (typeof axes)[number], reach: number) => ({
    x: CENTRE.x + axis.cos * RADIUS * reach,
    y: CENTRE.y + axis.sin * RADIUS * reach,
  });

  const polygon = (reach: (axis: (typeof axes)[number]) => number) =>
    axes
      .map((axis) => {
        const { x, y } = at(axis, reach(axis));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <figure>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={summarise(groups, unit)}
      >
        <g className="stroke-border" fill="none">
          {RINGS.map((ring) => (
            <polygon key={ring} points={polygon(() => ring)} strokeWidth="1" />
          ))}
          {axes.map((axis) => {
            const { x, y } = at(axis, 1);
            return (
              <line key={axis.group} x1={CENTRE.x} y1={CENTRE.y} x2={x} y2={y} strokeWidth="1" />
            );
          })}
        </g>

        <g className="text-brand">
          <polygon
            points={polygon((axis) => axis.reach)}
            fill="currentColor"
            fillOpacity="0.18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {axes
            .filter((axis) => axis.reach > 0)
            .map((axis) => {
              const { x, y } = at(axis, axis.reach);
              return <circle key={axis.group} cx={x} cy={y} r="3" fill="currentColor" />;
            })}
        </g>

        {axes.map((axis) => {
          const { x, y } = at(axis, 1 + LABEL_GAP / RADIUS);
          /* Labels on the left of the circle end at the axis and labels on the
             right begin at it, so none of them cross the polygon. */
          const anchor = Math.abs(axis.cos) < 0.15 ? "middle" : axis.cos > 0 ? "start" : "end";

          return (
            <text
              key={axis.group}
              x={x}
              y={y}
              textAnchor={anchor}
              /* Nudged down at the top of the circle and up at the bottom, so a
                 label never sits on the ring it belongs to. */
              dy={axis.sin < -0.9 ? "-0.1em" : axis.sin > 0.9 ? "0.9em" : "0.32em"}
              className={
                axis.reach > 0 ? "fill-foreground text-[9.5px]" : "fill-muted-foreground text-[9.5px]"
              }
              fontWeight={axis.reach > 0 ? 600 : 400}
            >
              {MUSCLE_GROUP_LABELS[axis.group]}
            </text>
          );
        })}
      </svg>

      {/* The shape carries the proportions; the numbers live underneath,
          because a radar cannot be read off to a kilogram. */}
      <figcaption className="mt-4 flex flex-col gap-2">
        {groups.map((group) => (
          <span
            key={group.muscleGroup}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="font-semibold">{MUSCLE_GROUP_LABELS[group.muscleGroup]}</span>
            <span className="tabular text-xs text-muted-foreground">
              {Math.round(group.share * 100)}% · {formatVolume(group.volume, unit)} ·{" "}
              {group.setCount} sets
            </span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** The shape in a sentence: a polygon is nothing to a screen reader otherwise. */
function summarise(groups: MuscleShare[], unit: WeightUnit): string {
  const named = groups
    .slice(0, 3)
    .map(
      (group) =>
        `${MUSCLE_GROUP_LABELS[group.muscleGroup].toLowerCase()} ${Math.round(group.share * 100)}%`,
    )
    .join(", ");
  const untouched = MUSCLE_GROUPS.filter(
    (group) => !groups.some((share) => share.muscleGroup === group),
  );

  const opening = `Volume by muscle group, ${formatVolume(
    groups.reduce((total, group) => total + group.volume, 0),
    unit,
  )} in total. Heaviest: ${named}.`;

  return untouched.length === 0
    ? opening
    : `${opening} Nothing logged for ${untouched.map((group) => MUSCLE_GROUP_LABELS[group].toLowerCase()).join(", ")}.`;
}
