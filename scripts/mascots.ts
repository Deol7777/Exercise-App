/**
 * Renders every mascot drawing in `assets/` down to the one size the app
 * serves, `public/mascots/<name>.png`.
 *
 * Run it after adding or redrawing an animal (`npm run mascots`) and commit
 * what it writes — like the icons, nothing regenerates these at build time, so
 * a missing file is a broken image in production.
 *
 * The list of animals lives in `src/lib/mascots.ts`, which is also what the
 * component renders from: a name there with no drawing fails here, loudly,
 * rather than at 2 a.m. in someone's browser.
 *
 * The drawings are 1024px squares with a transparent background already, so
 * there is nothing to remove and nothing to flatten onto — a mascot sits on a
 * themed surface and must not bring a white square with it. All this does is
 * resize.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { MASCOTS } from "../src/lib/mascots";

/**
 * Twice the largest size any screen asks for (`xl`, 128px), which covers a
 * 2× display and leaves the file small enough that a screen full of them is
 * not a download.
 */
const SIZE = 320;

const SOURCE_DIR = "assets";
const OUT_DIR = "public/mascots";

// Paths are relative to the repository root, which is where npm runs a script
// from; there is no other supported way to invoke this.
async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  for (const name of MASCOTS) {
    const source = path.join(SOURCE_DIR, `${name}.png`);
    const png = await sharp(await readFile(source))
      .ensureAlpha()
      .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();

    const file = path.join(OUT_DIR, `${name}.png`);
    await writeFile(file, png);
    console.log(`${file}  ${SIZE}x${SIZE}  ${(png.length / 1024).toFixed(1)} kB`);
  }
}

void main();
