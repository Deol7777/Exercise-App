import Image from "next/image";

import { MASCOTS, type MascotName, mascotFor } from "@/lib/mascots";
import { cn } from "@/lib/utils";

export { MASCOTS, mascotFor };
export type { MascotName };

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
