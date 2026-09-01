/**
 * The animals are decoration, not information — they carry the tone the
 * references are after ("The frog has been here since 5 a.m.") and nothing a
 * person needs. Every one renders `aria-hidden`; if a screen ever needs the
 * animal to *mean* something, it needs a real label instead.
 *
 * This list is the contract between three things: a drawing at
 * `assets/<name>.png`, the rendered `public/mascots/<name>.png` that
 * `npm run mascots` writes from it, and `<Mascot name="…">`. Adding an animal
 * means all three — a name here with no drawing is a broken image.
 */
export const MASCOTS = [
  "axolotl",
  "capybara",
  "corgi",
  "duck",
  "frog",
  "goose",
  "gorilla",
  "kangaroo",
  "owl",
  "penguin",
  "pigeon",
  "raccoon",
  "sloth",
  "tortoise",
  "walrus",
] as const;

export type MascotName = (typeof MASCOTS)[number];

/**
 * The same exercise gets the same animal on every screen and every visit, which
 * is the whole point — an exercise you recognise by its raccoon stops being a
 * row of text. A hash, not `Math.random`, because this also has to render the
 * same on the server and the client.
 *
 * The assignment is over the *whole* list, so adding an animal reshuffles which
 * one a given exercise gets. That is only cosmetic, and there is nowhere the
 * pairing is written down to contradict.
 */
export function mascotFor(seed: string): MascotName {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return MASCOTS[Math.abs(hash) % MASCOTS.length];
}
