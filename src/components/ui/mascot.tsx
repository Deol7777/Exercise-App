import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The animals are decoration, not information — they carry the tone the
 * references are after ("The frog has been here since 5 a.m.") and nothing a
 * person needs. Every one is rendered `aria-hidden`; if a screen ever needs the
 * animal to *mean* something, it needs a real label instead.
 */
export const MASCOTS = ["duck", "frog", "goose", "gorilla", "raccoon", "sloth"] as const;

export type MascotName = (typeof MASCOTS)[number];

/**
 * The same exercise gets the same animal on every screen and every visit, which
 * is the whole point — an exercise you recognise by its raccoon stops being a
 * row of text. A hash, not `Math.random`, because this also has to render the
 * same on the server and the client.
 */
export function mascotFor(seed: string): MascotName {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return MASCOTS[Math.abs(hash) % MASCOTS.length];
}

const SIZES = {
  sm: 36,
  md: 56,
  lg: 96,
  xl: 128,
} as const;

export function Mascot({
  seed,
  name,
  size = "md",
  className,
}: {
  /** Anything stable about the thing being decorated — an exercise id or name. */
  seed?: string;
  /** Pins a specific animal, for the one-off decorations in the references. */
  name?: MascotName;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const chosen = name ?? mascotFor(seed ?? "");
  const px = SIZES[size];

  return (
    <Image
      aria-hidden
      alt=""
      src={`/mascots/${chosen}.png`}
      width={px}
      height={px}
      className={cn("select-none object-contain", className)}
      /* Decoration must never delay the statistic next to it. */
      loading="lazy"
      draggable={false}
    />
  );
}
