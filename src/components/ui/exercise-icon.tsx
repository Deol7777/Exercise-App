import type { ReactNode } from "react";

import { Mascot } from "@/components/ui/mascot";
import { cn } from "@/lib/utils";

/**
 * A line mark for an exercise, drawn from the movement rather than the muscle.
 *
 * Only some exercises have one; everything else keeps its mascot, so this is
 * additive — a screen swaps `Mascot` for `ExerciseIcon` and the rows with no
 * drawing look exactly as they did. The marks are inline SVG, not files under
 * `public/`, because `currentColor` is the point: the same mark is ink on a
 * card and brand on a record, and an `<img>` cannot be tinted.
 *
 * Marks are matched on the catalog name, not the id, because ids differ per
 * environment and a user's own "Incline Dumbbell Press" deserves the drawing as
 * much as the seeded one does.
 *
 * The grammar the chest set establishes, worth keeping for any mark added
 * later: a 48×48 grid with everything inside 8–41, outline only, no fill,
 * round caps, stroke 5 for equipment a body rests on, 4 for plates, 3 for
 * everything else. The load sits above the bench, and what tells two marks
 * apart is one shape difference — flat pad vs angled backrest, one long bar vs
 * two separate bells — never a detail that dissolves at 40px.
 */

/** The load: one long bar with a plate at each end. */
const barbell = (
  <>
    <path d="M16 13h16" strokeWidth="3" />
    <path d="M13 8v10M35 8v10" strokeWidth="4" />
  </>
);

/** The load: two bells with a gap between them, which is the whole tell. */
const dumbbells = (
  <>
    <path d="M13 13h5M30 13h5" strokeWidth="3" />
    <path d="M11 9v8M20 9v8M28 9v8M37 9v8" strokeWidth="4" />
  </>
);

/** A flat bench, seen from the side. */
const flatBench = (
  <>
    <path d="M11 31h26" strokeWidth="5" />
    <path d="M16 33v8M32 33v8" strokeWidth="3" />
  </>
);

/** An incline bench: the backrest falls right into the seat. */
const inclineBench = (
  <>
    <path d="M11 27 28 35h11" strokeWidth="5" />
    <path d="M17 32v9M37 38v3" strokeWidth="3" />
  </>
);

/** The ground, for the marks whose whole point is that the load starts on it. */
const floor = <path d="M8 40h32" strokeWidth="3" />;

/** A body bent over a bar: head, back, one leg, one arm hanging to the bar. */
const bentOver = (
  <>
    <circle cx="12" cy="15" r="3.5" strokeWidth="3" />
    <path d="M15 18 30 23" strokeWidth="5" />
    <path d="M30 23 33 38" strokeWidth="3" />
    <path d="M22 21v10" strokeWidth="3" />
  </>
);

/** Hanging from a fixed bar; the grip width is what separates pull from chin. */
const hanging = (
  <>
    <circle cx="24" cy="22" r="3.5" strokeWidth="3" />
    <path d="M24 27v8" strokeWidth="4" />
    <path d="M24 35 20 41M24 35 28 39" strokeWidth="3" />
  </>
);

/** A bar anchored at one end with a plate at the other: the T-bar itself. */
const tBar = (
  <>
    <path d="M12 37 32 26" strokeWidth="3.5" />
    <circle cx="35" cy="24" r="6" strokeWidth="3.5" />
  </>
);

/** A single small bell, for marks where the load hangs at arm's length. */
function bell(cx: number, cy: number) {
  return (
    <>
      <path d={`M${cx - 2} ${cy}h4`} strokeWidth="3" />
      <path d={`M${cx - 3} ${cy - 3}v6M${cx + 3} ${cy - 3}v6`} strokeWidth="4" />
    </>
  );
}

/** Motion, where equipment alone cannot say which way the load travels. */
function chevronUp(cy: number) {
  return <path d={`M17 ${cy} 24 ${cy - 7} 31 ${cy}`} strokeWidth="3" />;
}

function chevronDown(cy: number) {
  return <path d={`M17 ${cy} 24 ${cy + 7} 31 ${cy}`} strokeWidth="3" />;
}

/** A bell turned on its end: the neutral grip, which is the hammer curl. */
function bellUpright(cx: number, cy: number) {
  return (
    <>
      <path d={`M${cx} ${cy - 2}v4`} strokeWidth="3" />
      <path d={`M${cx - 3} ${cy - 3}h6M${cx - 3} ${cy + 3}h6`} strokeWidth="4" />
    </>
  );
}

/** The quarter turn a curl travels, arrowed so it reads as a direction. */
const curlArc = (
  <>
    <path d="M12 32a13 13 0 0 1 13-13" strokeWidth="3" />
    <path d="M25 19 21 18M25 19 24 23" strokeWidth="3" />
  </>
);

type Mark = { key: string; match: (name: string) => boolean; draw: ReactNode };

/**
 * Order matters: the first match wins, so "incline" is asked before the flat
 * press it would otherwise be read as.
 */
const MARKS: Mark[] = [
  {
    key: "incline-dumbbell-press",
    match: (name) => name.includes("incline") && name.includes("dumbbell"),
    draw: (
      <>
        {dumbbells}
        {inclineBench}
      </>
    ),
  },
  {
    key: "incline-barbell-press",
    match: (name) => name.includes("incline"),
    draw: (
      <>
        {barbell}
        {inclineBench}
      </>
    ),
  },
  {
    key: "dumbbell-bench-press",
    match: (name) =>
      name.includes("dumbbell") && name.includes("press") && !name.includes("shoulder"),
    draw: (
      <>
        {dumbbells}
        {flatBench}
      </>
    ),
  },
  {
    key: "barbell-bench-press",
    match: (name) =>
      (name.includes("bench press") || name.includes("barbell press")) &&
      !name.includes("close-grip") &&
      !name.includes("close grip"),
    draw: (
      <>
        {barbell}
        {flatBench}
      </>
    ),
  },
  {
    key: "cable-fly",
    /* Two stacks, two cables, hands meeting in the middle. */
    match: (name) => name.includes("cable fly") || name.includes("chest fly"),
    draw: (
      <>
        <circle cx="24" cy="11" r="3.5" strokeWidth="3" />
        <path d="M24 16v18" strokeWidth="5" />
        <path d="M22 19q-9 2-11 12M26 19q9 2 11 12" strokeWidth="3" />
        <circle cx="10" cy="33" r="2.5" strokeWidth="2.5" />
        <circle cx="38" cy="33" r="2.5" strokeWidth="2.5" />
      </>
    ),
  },
  {
    key: "dip",
    /* Head-on: two parallel bars, a body hanging between them. */
    match: (name) => name === "dip" || name.startsWith("dip ") || name.includes("dips"),
    draw: (
      <>
        <path d="M9 25h11M28 25h11" strokeWidth="4" />
        <path d="M12 27v12M36 27v12" strokeWidth="3" />
        <circle cx="24" cy="12" r="3" strokeWidth="3" />
        <path d="M24 16v13" strokeWidth="3" />
        <path d="M21 18 18 25M27 18 30 25" strokeWidth="3" />
        <path d="M24 29 20 36M24 29 28 34" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "push-up",
    /* Side on: the floor, the body's line, one arm holding it up. */
    match: (name) => name.includes("push-up") || name.includes("push up") || name.includes("pushup"),
    draw: (
      <>
        <path d="M9 39h30" strokeWidth="3" />
        <path d="M18 26 35 34" strokeWidth="5" />
        <circle cx="13" cy="23" r="3" strokeWidth="3" />
        <path d="M18 26 17 38" strokeWidth="3" />
        <path d="M35 34 38 39" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "deadlift",
    /* The bar on the floor, plates on, hands on it — no bench, no machine. */
    match: (name) =>
      name.includes("deadlift") && !name.includes("romanian") && !name.includes("stiff"),
    draw: (
      <>
        {floor}
        <path d="M13 30h22" strokeWidth="3" />
        <circle cx="13" cy="30" r="6" strokeWidth="3.5" />
        <circle cx="35" cy="30" r="6" strokeWidth="3.5" />
      </>
    ),
  },
  {
    key: "pendlay-row",
    /* A barbell row that resets on the floor between reps, so: the floor. */
    match: (name) => name.includes("pendlay"),
    draw: (
      <>
        {bentOver}
        <g transform="translate(0,19)">{barbell}</g>
        {floor}
      </>
    ),
  },
  {
    key: "barbell-row",
    match: (name) => name.includes("barbell row") || name.includes("bent-over row"),
    draw: (
      <>
        {bentOver}
        <g transform="translate(0,19)">{barbell}</g>
      </>
    ),
  },
  {
    key: "dumbbell-row",
    /* One bell, one bench to brace on — the tell against a two-bell press. */
    match: (name) => name.includes("dumbbell row") || name.includes("single-arm row"),
    draw: (
      <>
        {bentOver}
        <path d="M19 33h6" strokeWidth="3" />
        <path d="M17 30v7M27 30v7" strokeWidth="4" />
      </>
    ),
  },
  {
    key: "pull-up",
    /* Wide hands. The chin-up below is the same body with narrow hands. */
    match: (name) => name.includes("pull-up") || name.includes("pull up") || name.includes("pullup"),
    draw: (
      <>
        <path d="M9 11h30" strokeWidth="4" />
        <path d="M16 12v5M32 12v5" strokeWidth="3" />
        <path d="M16 17 22 26M32 17 26 26" strokeWidth="3" />
        {hanging}
      </>
    ),
  },
  {
    key: "chin-up",
    match: (name) => name.includes("chin-up") || name.includes("chin up") || name.includes("chinup"),
    draw: (
      <>
        <path d="M9 11h30" strokeWidth="4" />
        <path d="M20 12v5M28 12v5" strokeWidth="3" />
        <path d="M20 17 22 26M28 17 26 26" strokeWidth="3" />
        {hanging}
      </>
    ),
  },
  {
    key: "plate-loaded-lat-pulldown",
    /* Asked before the cable pulldown, whose name it contains. */
    match: (name) => name.includes("plate loaded") && name.includes("pulldown"),
    draw: (
      <>
        <path d="M11 8v32" strokeWidth="4" />
        <path d="M13 12h14" strokeWidth="3" />
        <path d="M27 12v7" strokeWidth="3" />
        <path d="M23 19h8" strokeWidth="3" />
        <circle cx="20" cy="30" r="5" strokeWidth="3" />
        <path d="M26 34h13" strokeWidth="5" />
      </>
    ),
  },
  {
    key: "plate-loaded-row",
    /* The plate on the peg is what says loaded-by-hand rather than cabled. */
    match: (name) => name.includes("plate loaded") || name.includes("plate-loaded"),
    draw: (
      <>
        <path d="M11 10v30" strokeWidth="4" />
        <path d="M13 17 27 21" strokeWidth="3" />
        <path d="M27 21v6" strokeWidth="3" />
        <circle cx="20" cy="31" r="5" strokeWidth="3" />
        <path d="M27 34h12" strokeWidth="5" />
        <path d="M34 36v5" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "t-bar-row-machine",
    /* The chest pad over the bar: asked before the free-standing T-bar. */
    match: (name) => name.includes("t-bar") && name.includes("machine"),
    draw: (
      <>
        {floor}
        {tBar}
        <path d="M9 22 24 15" strokeWidth="5" />
        <path d="M14 24v13" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "t-bar-row",
    match: (name) => name.includes("t-bar") || name.includes("t bar"),
    draw: (
      <>
        {floor}
        <circle cx="11" cy="38" r="2" strokeWidth="3" />
        {tBar}
        <path d="M20 29 24 34" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "lat-pulldown",
    /* Cabled: a housing, a cable, a wide bar, and someone seated under it. */
    match: (name) => name.includes("pulldown") || name.includes("pull-down"),
    draw: (
      <>
        <path d="M13 9h22" strokeWidth="4" />
        <path d="M24 11v6" strokeWidth="2.5" />
        <path d="M13 18h22" strokeWidth="3.5" />
        <path d="M15 19v4M33 19v4" strokeWidth="3" />
        <circle cx="24" cy="27" r="3.5" strokeWidth="3" />
        <path d="M24 31v6" strokeWidth="4" />
        <path d="M16 38h16" strokeWidth="4" />
      </>
    ),
  },
  {
    key: "seated-cable-row",
    match: (name) => name.includes("cable row") || name.includes("seated row"),
    draw: (
      <>
        <path d="M9 18v22" strokeWidth="4" />
        <path d="M11 30h10" strokeWidth="2.5" />
        <path d="M21 27v6" strokeWidth="3" />
        <circle cx="31" cy="20" r="3.5" strokeWidth="3" />
        <path d="M31 24v8" strokeWidth="4" />
        <path d="M29 28 22 30" strokeWidth="3" />
        <path d="M25 34h14" strokeWidth="4" />
      </>
    ),
  },
  {
    key: "face-pull",
    /* A rope from a high pulley, split at the end, arriving at the face. */
    match: (name) => name.includes("face pull"),
    draw: (
      <>
        <circle cx="11" cy="13" r="3" strokeWidth="3" />
        <path d="M13 15 20 19" strokeWidth="2.5" />
        <path d="M20 19 26 14M20 19 26 24" strokeWidth="2.5" />
        <circle cx="32" cy="19" r="5" strokeWidth="3" />
        <path d="M32 24v12" strokeWidth="4" />
      </>
    ),
  },
  {
    key: "arnold-press",
    /* The rotation is the movement, so the arc is the mark. */
    match: (name) => name.includes("arnold"),
    draw: (
      <>
        {dumbbells}
        <path d="M13 34a11 11 0 0 1 22 0" strokeWidth="3" />
        <path d="M35 34 31 31M35 34 38 30" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "seated-shoulder-press",
    match: (name) => name.includes("shoulder press"),
    draw: (
      <>
        {dumbbells}
        <path d="M13 23v15" strokeWidth="5" />
        <path d="M15 36h17" strokeWidth="5" />
        <path d="M20 38v4M30 38v4" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "overhead-press",
    /* Bar at the top, the press underneath it. */
    match: (name) => name.includes("overhead press") || name === "military press",
    draw: (
      <>
        {barbell}
        {chevronUp(30)}
        {chevronUp(40)}
      </>
    ),
  },
  {
    key: "upright-row",
    /* The mirror of the overhead press: bar low, the pull above it. */
    match: (name) => name.includes("upright row"),
    draw: (
      <>
        <g transform="translate(0,19)">{barbell}</g>
        {chevronUp(22)}
      </>
    ),
  },
  {
    key: "cable-lateral-raise",
    /* Asked before the dumbbell raise, whose name it contains. */
    match: (name) => name.includes("cable") && name.includes("lateral"),
    draw: (
      <>
        <path d="M10 10v24" strokeWidth="4" />
        <circle cx="10" cy="37" r="2.5" strokeWidth="2.5" />
        <path d="M12 35q12-2 18-13" strokeWidth="2.5" />
        <path d="M27 19 34 25" strokeWidth="3.5" />
      </>
    ),
  },
  {
    key: "lateral-raise",
    /* Two bells swept out to the sides. */
    match: (name) => name.includes("lateral raise") || name.includes("side raise"),
    draw: (
      <>
        <path d="M24 36q-11 0-13-11M24 36q11 0 13-11" strokeWidth="3" />
        {bell(11, 21)}
        {bell(37, 21)}
      </>
    ),
  },
  {
    key: "machine-rear-delt-fly",
    /* A pad to lean into and two arms that swing back behind it. */
    match: (name) => name.includes("rear delt") && name.includes("machine"),
    draw: (
      <>
        <path d="M24 11v17" strokeWidth="5" />
        <path d="M24 18q-9 1-12 9M24 18q9 1 12 9" strokeWidth="3" />
        <path d="M12 27v7M36 27v7" strokeWidth="3.5" />
        <path d="M17 38h14" strokeWidth="5" />
      </>
    ),
  },
  {
    key: "rear-delt-fly",
    /* Chest-supported: the pad is what says this is not a lateral raise. */
    match: (name) => name.includes("rear delt") || name.includes("reverse fly"),
    draw: (
      <>
        <path d="M13 15 33 23" strokeWidth="5" />
        <path d="M21 25v8" strokeWidth="3" />
        {bell(11, 32)}
        {bell(37, 32)}
      </>
    ),
  },
  {
    key: "close-grip-bench-press",
    /* A bench press with the hands together: the grip ticks are the mark. */
    match: (name) => name.includes("close-grip") || name.includes("close grip"),
    draw: (
      <>
        {barbell}
        <path d="M21 15v5M27 15v5" strokeWidth="3" />
        {flatBench}
      </>
    ),
  },
  {
    key: "triceps-pushdown",
    /* Cabled from above, pushed down — the chevron says which way. */
    match: (name) => name.includes("pushdown") || name.includes("push-down"),
    draw: (
      <>
        <path d="M13 9h22" strokeWidth="4" />
        <path d="M24 11v9" strokeWidth="2.5" />
        <path d="M16 21h16" strokeWidth="3.5" />
        {chevronDown(30)}
      </>
    ),
  },
  {
    key: "overhead-cable-triceps-extension",
    /* Asked before the dumbbell version, whose name it contains. */
    match: (name) =>
      name.includes("cable") && name.includes("overhead") && name.includes("extension"),
    draw: (
      <>
        <path d="M9 9v28" strokeWidth="4" />
        <path d="M11 12q15 1 17 12" strokeWidth="2.5" />
        <path d="M27 24 33 33" strokeWidth="3.5" />
      </>
    ),
  },
  {
    key: "overhead-triceps-extension",
    match: (name) => name.includes("triceps extension") || name.includes("tricep extension"),
    draw: (
      <>
        {bell(24, 12)}
        <path d="M21 17q-9 6-9 19" strokeWidth="3" />
        <path d="M12 36 9 32M12 36 16 34" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "skull-crusher",
    /* A bench press whose bar travels back over the head, hence the arc. */
    match: (name) => name.includes("skull"),
    draw: (
      <>
        {barbell}
        {flatBench}
        <path d="M13 20q-7 4-4 12" strokeWidth="2.5" />
        <path d="M9 32 8 27M9 32 14 30" strokeWidth="2.5" />
      </>
    ),
  },
  {
    key: "preacher-curl",
    /* The pad is the whole exercise; the bar hangs under its low edge. */
    match: (name) => name.includes("preacher"),
    draw: (
      <>
        <path d="M11 14 30 24" strokeWidth="5" />
        <path d="M20 26v7" strokeWidth="3" />
        <g transform="translate(0,22)">{barbell}</g>
      </>
    ),
  },
  {
    key: "hammer-curl",
    /* Same curl, bell turned on its end. */
    match: (name) => name.includes("hammer curl"),
    draw: (
      <>
        {bellUpright(12, 34)}
        {curlArc}
      </>
    ),
  },
  {
    key: "cable-curl",
    match: (name) => name.includes("cable") && name.includes("curl"),
    draw: (
      <>
        <path d="M9 10v28" strokeWidth="4" />
        <path d="M11 36h9" strokeWidth="2.5" />
        <path d="M20 33v6" strokeWidth="3.5" />
        <path d="M22 34a12 12 0 0 1 12-12" strokeWidth="3" />
        <path d="M34 22 30 21M34 22 33 26" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "dumbbell-curl",
    match: (name) => name.includes("dumbbell curl") || name === "curl",
    draw: (
      <>
        {bell(12, 34)}
        {curlArc}
      </>
    ),
  },
  {
    key: "barbell-curl",
    match: (name) => name.includes("curl") && name.includes("barbell"),
    draw: (
      <>
        <g transform="translate(0,21)">{barbell}</g>
        {curlArc}
      </>
    ),
  },
  {
    key: "hack-squat",
    /* Asked before the generic squat: a back pad on rails, plates at the foot. */
    match: (name) => name.includes("hack"),
    draw: (
      <>
        <path d="M12 13 27 32" strokeWidth="5" />
        <path d="M24 37h15" strokeWidth="4" />
        <circle cx="34" cy="21" r="5.5" strokeWidth="3.5" />
      </>
    ),
  },
  {
    key: "leg-press",
    /* A sled on an angled rail, loaded at the top. */
    match: (name) => name.includes("leg press"),
    draw: (
      <>
        <path d="M11 33 33 20" strokeWidth="5" />
        <path d="M13 39 37 25" strokeWidth="3" />
        <circle cx="33" cy="13" r="5.5" strokeWidth="3.5" />
      </>
    ),
  },
  {
    key: "bulgarian-split-squat",
    /* A bench with the rear foot on its edge, and one bell for the load. */
    match: (name) => name.includes("bulgarian") || name.includes("split squat"),
    draw: (
      <>
        <path d="M22 30h17" strokeWidth="5" />
        <path d="M26 32v8M36 32v8" strokeWidth="3" />
        <path d="M22 28 17 33" strokeWidth="3" />
        {bell(11, 22)}
      </>
    ),
  },
  {
    key: "walking-lunge",
    /* Two bells and a direction: this one goes somewhere. */
    match: (name) => name.includes("lunge"),
    draw: (
      <>
        {bell(12, 22)}
        {bell(36, 22)}
        <path d="M17 39 24 29 31 39" strokeWidth="3.5" />
        {floor}
      </>
    ),
  },
  {
    key: "leg-extension",
    /* Seat, shin pad, and the arc the pad swings through. */
    match: (name) => name.includes("leg extension"),
    draw: (
      <>
        <path d="M11 10v14" strokeWidth="5" />
        <path d="M12 25h14" strokeWidth="5" />
        <path d="M26 27v6" strokeWidth="3" />
        <circle cx="26" cy="35" r="3.5" strokeWidth="3" />
        <path d="M30 34q6-3 6-11" strokeWidth="3" />
        <path d="M36 23 33 26M36 23 39 27" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "sissy-squat",
    /* The bench: a rail to lean back along, rollers to hook the ankles under. */
    match: (name) => name.includes("sissy"),
    draw: (
      <>
        {floor}
        <path d="M13 13 26 33" strokeWidth="5" />
        <circle cx="31" cy="30" r="3" strokeWidth="3" />
        <circle cx="31" cy="37" r="3" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "front-squat",
    /* Same rack as the back squat; the elbows-up ticks are the front rack. */
    match: (name) => name.includes("front squat"),
    draw: (
      <>
        <path d="M11 15v26M37 15v26" strokeWidth="4" />
        <path d="M11 22h26" strokeWidth="3.5" />
        <path d="M18 22 15 16M30 22 33 16" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "back-squat",
    match: (name) => name.includes("squat"),
    draw: (
      <>
        <path d="M11 15v26M37 15v26" strokeWidth="4" />
        <path d="M11 22h26" strokeWidth="3.5" />
        {chevronDown(30)}
      </>
    ),
  },
  {
    key: "hip-thrust",
    /* Back on a bench, bar over the hips. */
    match: (name) => name.includes("hip thrust"),
    draw: (
      <>
        <path d="M8 20h16" strokeWidth="5" />
        <path d="M12 22v9M22 22v9" strokeWidth="3" />
        <path d="M26 30h6" strokeWidth="3" />
        <circle cx="34" cy="30" r="6" strokeWidth="3.5" />
      </>
    ),
  },
  {
    key: "glute-bridge",
    /* No equipment at all: the floor, and the arch off it. */
    match: (name) => name.includes("bridge"),
    draw: (
      <>
        {floor}
        <path d="M12 37q12-19 24 0" strokeWidth="5" />
      </>
    ),
  },
  {
    key: "cable-kickback",
    /* A low pulley, an ankle cuff, and the arc the leg drives back through. */
    match: (name) => name.includes("kickback"),
    draw: (
      <>
        <path d="M9 12v24" strokeWidth="4" />
        <circle cx="9" cy="38" r="2.5" strokeWidth="2.5" />
        <path d="M11 37h8" strokeWidth="2.5" />
        <circle cx="22" cy="37" r="3" strokeWidth="3" />
        <path d="M26 35q7-2 9-9" strokeWidth="3" />
        <path d="M35 26 31 27M35 26 36 30" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "seated-calf-raise",
    /* Asked before the standing one: the pad sits on the knees, not the back. */
    match: (name) => name.includes("calf") && name.includes("seated"),
    draw: (
      <>
        <path d="M9 15h13" strokeWidth="5" />
        <path d="M15 17v6" strokeWidth="4" />
        <path d="M9 26h16" strokeWidth="5" />
        <path d="M22 36h15" strokeWidth="5" />
        <path d="M22 36v-4" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "standing-calf-raise",
    match: (name) => name.includes("calf"),
    draw: (
      <>
        <path d="M12 14h24" strokeWidth="5" />
        <path d="M24 16v14" strokeWidth="4" />
        <path d="M14 36h20" strokeWidth="5" />
        <path d="M14 36v-4" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "romanian-deadlift",
    /* A hinge, not a pull: the bar stops at the shins, so there is no floor. */
    match: (name) => name.includes("romanian") || name.includes("stiff"),
    draw: (
      <>
        <path d="M13 22h22" strokeWidth="3" />
        <circle cx="13" cy="22" r="5.5" strokeWidth="3.5" />
        <circle cx="35" cy="22" r="5.5" strokeWidth="3.5" />
        {chevronDown(32)}
      </>
    ),
  },
  {
    key: "lying-leg-curl",
    /* Face-down pad, roller at the ankles, heel travelling up. */
    match: (name) => name.includes("leg curl") && !name.includes("seated"),
    draw: (
      <>
        <path d="M9 24h20" strokeWidth="5" />
        <path d="M13 26v7M25 26v7" strokeWidth="3" />
        <circle cx="34" cy="30" r="3.5" strokeWidth="3" />
        <path d="M37 27q3-6 0-11" strokeWidth="3" />
        <path d="M37 16 34 19M37 16 40 20" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "seated-leg-curl",
    /* Same roller, seated, and the heel travels the other way. */
    match: (name) => name.includes("leg curl"),
    draw: (
      <>
        <path d="M11 10v14" strokeWidth="5" />
        <path d="M12 25h15" strokeWidth="5" />
        <circle cx="31" cy="26" r="3.5" strokeWidth="3" />
        <path d="M34 29q4 4 2 9" strokeWidth="3" />
        <path d="M36 38 33 35M36 38 39 34" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "good-morning",
    /* Bar stays on the back; the hinge in front of it is the movement. */
    match: (name) => name.includes("good morning"),
    draw: (
      <>
        {barbell}
        <path d="M24 19v6" strokeWidth="4" />
        <path d="M24 25q1 11 11 12" strokeWidth="3" />
        <path d="M35 37 31 35M35 37 33 32" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "sit-up",
    /* Knees up off the floor, torso arcing off it. */
    match: (name) => name.includes("sit-up") || name.includes("sit up") || name.includes("situp"),
    draw: (
      <>
        {floor}
        <path d="M28 38 33 28 38 38" strokeWidth="3" />
        <path d="M10 37q2-13 13-16" strokeWidth="4" />
        <path d="M23 21 19 21M23 21 22 26" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "hanging-leg-raise",
    /* Hanging from a bar, so the mark starts at the bar. */
    match: (name) => name.includes("hanging") && name.includes("raise"),
    draw: (
      <>
        <path d="M9 11h30" strokeWidth="4" />
        <path d="M20 13v16" strokeWidth="4" />
        <path d="M20 29h12" strokeWidth="3.5" />
        <path d="M28 23 32 29 27 33" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "lying-leg-raise",
    /* The same legs, off the floor instead of off a bar. */
    match: (name) => name.includes("leg raise"),
    draw: (
      <>
        {floor}
        <path d="M9 36h14" strokeWidth="4" />
        <path d="M23 36 33 25" strokeWidth="3.5" />
        <path d="M31 20 34 24 30 27" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "cable-crunch",
    /* A rope from a high pulley, and the crunch under it. */
    match: (name) => name.includes("crunch"),
    draw: (
      <>
        <path d="M13 9h22" strokeWidth="4" />
        <path d="M24 11v7" strokeWidth="2.5" />
        <path d="M24 18 20 23M24 18 28 23" strokeWidth="2.5" />
        <path d="M24 24q-8 4-9 13" strokeWidth="3" />
        <path d="M15 37 13 33M15 37 19 35" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "ab-wheel-rollout",
    /* The wheel, and the ground it rolls along. */
    match: (name) => name.includes("ab wheel") || name.includes("rollout"),
    draw: (
      <>
        {floor}
        <circle cx="16" cy="30" r="7" strokeWidth="3.5" />
        <circle cx="16" cy="30" r="1.5" strokeWidth="3" />
        <path d="M26 30h9" strokeWidth="3" />
        <path d="M32 26 37 30 32 34" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "russian-twist",
    /* A weight held at the chest, turning from side to side. */
    match: (name) => name.includes("twist"),
    draw: (
      <>
        <circle cx="24" cy="26" r="6" strokeWidth="3.5" />
        <path d="M12 20q-2 8 3 13" strokeWidth="3" />
        <path d="M36 20q2 8-3 13" strokeWidth="3" />
        <path d="M12 20 10 24M12 20 16 21M36 20 32 21M36 20 38 24" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "dumbbell-side-bend",
    /* One bell down one side, and the lean it pulls. */
    match: (name) => name.includes("side bend"),
    draw: (
      <>
        <path d="M18 11 26 31" strokeWidth="5" />
        {bell(31, 36)}
        <path d="M14 14q-4 5-3 10" strokeWidth="3" />
        <path d="M11 26 9 22M11 26 15 25" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "plank",
    /* One straight line off the ground, on two points of contact. */
    match: (name) => name.includes("plank"),
    draw: (
      <>
        {floor}
        <path d="M10 24 36 29" strokeWidth="5" />
        <path d="M13 26 11 38" strokeWidth="3" />
        <path d="M35 31 38 38" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "clean-and-jerk",
    /* Two bars because it is two lifts: floor to shoulder, shoulder to overhead. */
    match: (name) => name.includes("jerk"),
    draw: (
      <>
        <g transform="translate(0,-3)">{barbell}</g>
        {chevronUp(24)}
        <g transform="translate(0,16)">{barbell}</g>
        {floor}
      </>
    ),
  },
  {
    key: "power-clean",
    /* Floor to the shoulders in one pull. */
    match: (name) => name.includes("clean"),
    draw: (
      <>
        <g transform="translate(0,16)">{barbell}</g>
        {chevronUp(22)}
        {floor}
      </>
    ),
  },
  {
    key: "snatch",
    /* Floor to overhead in one, so: one long arrow. */
    match: (name) => name.includes("snatch"),
    draw: (
      <>
        <g transform="translate(0,16)">{barbell}</g>
        <path d="M24 26v-14" strokeWidth="3.5" />
        <path d="M19 17 24 11 29 17" strokeWidth="3.5" />
        {floor}
      </>
    ),
  },
  {
    key: "kettlebell-swing",
    /* The bell itself — handle and body — and the arc it swings through. */
    match: (name) => name.includes("kettlebell") || name.includes("swing"),
    draw: (
      <>
        <circle cx="26" cy="31" r="7" strokeWidth="3.5" />
        <path d="M22 25q4-6 8 0" strokeWidth="3" />
        <path d="M11 32q1-13 11-17" strokeWidth="3" />
        <path d="M22 15 18 14M22 15 21 20" strokeWidth="3" />
      </>
    ),
  },
  {
    key: "burpee",
    /* Down to the floor, then up off it. */
    match: (name) => name.includes("burpee"),
    draw: (
      <>
        {floor}
        <path d="M12 35h20" strokeWidth="4" />
        {chevronUp(27)}
        {chevronUp(18)}
      </>
    ),
  },
  {
    key: "wrist-curl",
    /* Forearms braced on a pad, the bell past its edge, the wrist doing the work. */
    match: (name) => name.includes("wrist"),
    draw: (
      <>
        <path d="M8 28h18" strokeWidth="5" />
        <path d="M12 30v8M24 30v8" strokeWidth="3" />
        {bell(33, 34)}
        <path d="M27 25q6-4 11 0" strokeWidth="2.5" />
        <path d="M38 25 34 24M38 25 37 29" strokeWidth="2.5" />
      </>
    ),
  },
  {
    key: "farmers-walk",
    /* Two bells carried at arm's length, and somewhere to carry them to. */
    match: (name) => name.includes("farmer") || name.includes("carry"),
    draw: (
      <>
        <path d="M12 13v8M36 13v8" strokeWidth="3" />
        {bell(12, 25)}
        {bell(36, 25)}
        <path d="M16 34h11" strokeWidth="3" />
        <path d="M25 30 30 34 25 38" strokeWidth="3" />
        {floor}
      </>
    ),
  },
];

export function exerciseMark(name: string) {
  const needle = name.toLowerCase();
  return MARKS.find((mark) => mark.match(needle));
}

export function ExerciseIcon({
  name,
  seed,
  className,
}: {
  /** The catalog name, which is what a mark is matched on. */
  name: string;
  /** Falls through to the mascot when nothing is drawn for this exercise. */
  seed?: string;
  className?: string;
}) {
  const mark = exerciseMark(name);
  if (!mark) return <Mascot seed={seed ?? name} size="md" className={className} />;

  return (
    <svg
      aria-hidden
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-10 text-rose", className)}
    >
      {mark.draw}
    </svg>
  );
}
