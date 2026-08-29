/**
 * Renders every icon the app ships, from two drawings.
 *
 * Run it after changing either drawing (`npm run icons`) and commit what it
 * writes — nothing regenerates these at build time, so a stale PNG is what
 * ships.
 *
 * There are two drawings because the icons are looked at from two distances:
 *
 *   assets/icon-frog-barbell-removebg.png   the frog, for anything the size of
 *     a home-screen tile — the manifest icons and the Apple touch icon.
 *   assets/favicon.svg                      the bare barbell, for anything the
 *     size of a browser tab, where the frog is a smudge.
 *
 * What lands where:
 *   src/app/icon.png        <link rel="icon">; a tab, a bookmark, a history
 *                           row. The mark, not the frog.
 *   src/app/favicon.ico     /favicon.ico, which browsers request whether or
 *                           not anything links to it. The mark, at four sizes.
 *   src/app/apple-icon.png  <link rel="apple-touch-icon">; iOS home screen.
 *   public/icon-192.png     manifest, Android home screen.
 *   public/icon-512.png     manifest, splash screen and the install prompt.
 *
 * The two things the frog needs that a plain resize would not give it:
 *
 * 1. **Full bleed.** The drawing has a rounded-square frame of its own, with
 *    the corners outside it transparent. Shipped as-is, iOS rounds the corners
 *    a second time and the gap between the two radii renders black, which is
 *    exactly the ugly icon this replaces. So the artwork is flattened onto an
 *    opaque square of its own ground colour: the frame's corners fill in, the
 *    seam is invisible because it is the same olive, and each platform applies
 *    its own mask to a square that has something in every corner.
 *
 *    The background removal left a rim of semi-transparent near-black along
 *    the frame, which over the ground reads as a dark rounded outline — the
 *    frame showing through the thing meant to hide it. `erode` throws that rim
 *    away before the composite.
 *
 * 2. **Safe-zone scaling.** Android crops a maskable icon to a circle 80% of
 *    the square. Measured, the frog and barbell reach 42.6% of the width from
 *    the centre, which is outside that circle — the plates would lose their
 *    ends. FROG_SCALE pulls the far corner of the artwork inside it.
 *
 * The mark needs neither: it is drawn full-bleed already, and nothing masks a
 * favicon.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

/** The frog drawing's own background, sampled from it. Also the ground it flattens onto. */
const GROUND = { r: 82, g: 90, b: 53, alpha: 1 };

/**
 * Frog width as a fraction of the square. At 1.0 the barbell reaches 42.6% of
 * the width from the centre; the maskable circle stops at 40%. 0.92 leaves the
 * far pixel at 39.2%, which is inside it with a little to spare for a launcher
 * that crops slightly harder than the spec.
 */
const FROG_SCALE = 0.92;

const FROG = "assets/icon-frog-barbell-removebg.png";
const MARK = "assets/favicon.svg";

/** Sizes inside favicon.ico. 16 and 32 are the tab; 48 is a Windows shortcut. */
const ICO_SIZES = [16, 32, 48, 256];

/**
 * Clears every pixel within `radius` of a transparent one, so the partly
 * transparent edge left by a background removal cannot tint what it is
 * composited over. Cheap and square rather than circular: this runs once, over
 * a 500px source, and the shape it eats into is a straight-edged frame.
 */
async function erode(png: Buffer, radius: number): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = data[i * c + 3] === 255 ? 1 : 0;

  const out = Buffer.from(data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid[y * w + x]) continue;
      let keep = true;
      for (let dy = -radius; dy <= radius && keep; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || !solid[ny * w + nx]) {
            keep = false;
            break;
          }
        }
      }
      if (!keep) out[(y * w + x) * c + 3] = 0;
    }
  }
  // A pixel that was already partly transparent stays that way in `out`; zero
  // those too, or the rim survives one pixel further in.
  for (let i = 0; i < w * h; i++) if (!solid[i]) out[i * c + 3] = 0;

  return sharp(out, { raw: { width: w, height: h, channels: c } }).png().toBuffer();
}

/**
 * Packs PNGs into a multi-image ICO, one entry per size. Every browser still
 * in use reads a PNG inside an ICO, which is the only reason this is a header
 * and an offset table rather than a bitmap encoder.
 *
 * Shipping 16 and 32 as their own images rather than one 256 is the point of
 * the format here: the browser picks the entry that matches and draws it
 * pixel for pixel, instead of downscaling a detailed square into porridge.
 * A 0 in the width or height byte means 256.
 */
function toIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // no palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

// Paths are relative to the repository root, which is where npm runs a script
// from; there is no other supported way to invoke this.
async function main(): Promise<void> {
  // Flattened onto the ground *before* any resize: resampling a hard alpha
  // edge makes lanczos overshoot, and the halo that leaves is a visible
  // hairline where the frame used to be. Once it is opaque there is no edge to
  // ring, and an opaque olive border composited onto olive is seamless.
  const frog = await sharp(await erode(await readFile(FROG), 4))
    .flatten({ background: GROUND })
    .png()
    .toBuffer();

  const renderFrog = async (size: number): Promise<Buffer> => {
    const inner = Math.round(size * FROG_SCALE);
    const artwork = await sharp(frog).resize(inner, inner, { fit: "fill" }).png().toBuffer();
    const offset = Math.round((size - inner) / 2);
    return sharp({ create: { width: size, height: size, channels: 4, background: GROUND } })
      .composite([{ input: artwork, left: offset, top: offset }])
      // The icon must be opaque: a transparent apple-touch-icon composites
      // onto black on iOS.
      .flatten({ background: GROUND })
      .png()
      .toBuffer();
  };

  const mark = await readFile(MARK);
  // `density` is what stops sharp rasterising the SVG at its 512 header size
  // and then scaling down. At 16 that difference is the whole mark.
  const renderMark = (size: number): Promise<Buffer> =>
    sharp(mark, { density: (72 * size) / 512 })
      .resize(size, size)
      .flatten({ background: GROUND })
      // `flatten` drops the alpha channel, and Turbopack's ICO decoder rejects
      // a PNG inside an ICO that is not RGBA. Put an opaque one back.
      .ensureAlpha()
      .png()
      .toBuffer();

  const outputs: { file: string; size: number; png: Buffer }[] = [
    { file: "src/app/icon.png", size: 512, png: await renderMark(512) },
    { file: "src/app/apple-icon.png", size: 180, png: await renderFrog(180) },
    { file: "public/icon-192.png", size: 192, png: await renderFrog(192) },
    { file: "public/icon-512.png", size: 512, png: await renderFrog(512) },
  ];

  for (const { file, size, png } of outputs) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, png);
    console.log(`${file}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
  }

  const ico = toIco(
    await Promise.all(ICO_SIZES.map(async (size) => ({ size, png: await renderMark(size) }))),
  );
  await writeFile("src/app/favicon.ico", ico);
  console.log(`src/app/favicon.ico  ${ICO_SIZES.join("/")}  ${(ico.length / 1024).toFixed(1)} kB`);
}

void main();
