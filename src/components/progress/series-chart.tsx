import { axisTicks, type ChartType } from "@/lib/chart";
import { cn } from "@/lib/utils";

/**
 * A point to draw. `x` is a fraction of the plot's width, 0 at the left edge
 * and 1 at the right, so the caller decides whether positions come from a clock
 * or from an index — see `strength-chart.tsx` and `volume-chart.tsx`.
 */
export type SeriesPoint = { x: number; value: number; title: string };

/** A label under the x axis, positioned the same way. */
export type AxisTick = { x: number; text: string };

/** The drawing's own coordinate space; the SVG scales to whatever width it gets. */
const WIDTH = 320;
const HEIGHT = 148;
/** Room for the y labels on the left and the x labels underneath. */
const PLOT = { left: 36, right: 318, top: 10, bottom: 122 };
/** Past this many points the per-point dots read as noise, so only the line is drawn. */
const DOT_LIMIT = 32;

/**
 * The one chart on this screen. Strength and volume differ in what they measure
 * and where their points sit, not in how a line or a bar is drawn — so the
 * scales, gridlines, axis labels and both renderings live here once, and the
 * two cards are thin adapters over it.
 *
 * Hand-drawn SVG rather than a charting library (ADR 0016), which is what keeps
 * this a server component.
 *
 * `zeroBased` is the one real difference between the two callers and it is not
 * cosmetic. Volume is a quantity: a bar half as tall is half the work, and that
 * only reads true from zero. A top set is not — nobody's squat goes to zero, so
 * a zero-based weight axis squeezes a year of progress into the top centimetre
 * of the card. That axis starts at a rounded number below the lightest point,
 * and says so by labelling both ends.
 *
 * Bars overrule it. The height of a bar *is* its value — that is the whole
 * grammar of the form — so a bar chart cut off above zero draws 128 kg as twice
 * 127.5 and is simply a lie. A reader who wants the fine movement in a top set
 * picks the line, which is framed to the data and makes no such claim.
 */
export function SeriesChart({
  points,
  type,
  ticks,
  band,
  zeroBased,
  format,
  label,
}: {
  /** Oldest first. Empty is the caller's problem: it renders its own message. */
  points: SeriesPoint[];
  type: ChartType;
  ticks: AxisTick[];
  /** Bar width as a fraction of the plot, before the gap between bars. */
  band: number;
  zeroBased: boolean;
  /** Turns a value into a y-axis label — "12k", "82 kg". */
  format: (value: number) => string;
  /** What the whole picture says, for anything that cannot see it. */
  label: string;
}) {
  const values = points.map((point) => point.value);
  const fromZero = zeroBased || type === "bar";
  const {
    ticks: gridlines,
    bottom,
    top,
  } = axisTicks(fromZero ? 0 : Math.min(...values), Math.max(...values));

  const plotWidth = PLOT.right - PLOT.left;
  const plotHeight = PLOT.bottom - PLOT.top;
  const atX = (x: number) => PLOT.left + x * plotWidth;
  const atY = (value: number) =>
    PLOT.bottom - ((value - bottom) / (top - bottom)) * plotHeight;

  /** Bars keep a hair of air between them, and never go under a pixel wide. */
  const barWidth = Math.max(band * plotWidth * 0.72, 2);

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${atX(point.x).toFixed(1)} ${atY(point.value).toFixed(1)}`)
    .join(" ");
  const area =
    points.length > 1
      ? `${line} L${atX(points[points.length - 1].x).toFixed(1)} ${PLOT.bottom} L${atX(points[0].x).toFixed(1)} ${PLOT.bottom} Z`
      : "";

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full overflow-visible"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id="series-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* The y axis: a rule and a number at every rounded step, so the height of
          anything on the chart can actually be read off it. */}
      {gridlines.map((value) => (
        <g key={value}>
          <line
            x1={PLOT.left}
            x2={PLOT.right}
            y1={atY(value)}
            y2={atY(value)}
            className="stroke-border"
            strokeWidth="1"
          />
          <text
            x={PLOT.left - 6}
            y={atY(value)}
            textAnchor="end"
            dy="0.32em"
            className="fill-muted-foreground text-[9px]"
          >
            {format(value)}
          </text>
        </g>
      ))}

      <g className={type === "bar" ? "text-primary" : "text-brand"}>
        {type === "line" ? (
          <>
            {points.length > 1 ? (
              <>
                <path d={area} fill="url(#series-area)" />
                <path
                  d={line}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            ) : null}
            {points.length <= DOT_LIMIT
              ? points.map((point, index) => (
                  <circle
                    key={point.title}
                    cx={atX(point.x)}
                    cy={atY(point.value)}
                    r={index === points.length - 1 ? 4 : 2.5}
                    fill="currentColor"
                    opacity={index === points.length - 1 ? 1 : 0.5}
                  >
                    <title>{point.title}</title>
                  </circle>
                ))
              : null}
          </>
        ) : (
          points.map((point) => {
            const height = atY(bottom) - atY(point.value);
            return (
              <rect
                key={point.title}
                x={atX(point.x) - barWidth / 2}
                /* An empty bucket keeps a hairline: "barely trained" and "not
                   trained" must not draw as the same nothing. */
                y={height <= 0 ? PLOT.bottom - 1 : atY(point.value)}
                width={barWidth}
                height={height <= 0 ? 1 : height}
                rx={Math.min(barWidth / 2, 3)}
                className={height <= 0 ? "fill-border" : "fill-current"}
              >
                <title>{point.title}</title>
              </rect>
            );
          })
        )}
      </g>

      {ticks.map((tick, index) => (
        <text
          key={tick.text}
          x={atX(tick.x)}
          y={HEIGHT - 2}
          /* The end labels are pulled inside the plot rather than centred on it,
             or the first and last would hang off the card. */
          textAnchor={index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle"}
          className={cn("fill-muted-foreground text-[9px]")}
        >
          {tick.text}
        </text>
      ))}
    </svg>
  );
}
