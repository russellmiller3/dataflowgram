// Takes the README pictures with headless Chrome, and builds the moving demo image from one frame per step.
// Usage: node tools/shoot.mjs   (needs Google Chrome; the moving image also needs the gifenc and pngjs packages)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = path.join(root, 'docs/images');
fs.mkdirSync(out, { recursive: true });

function shot(page, link, file, { width = 1180, height = 940, scale = 2 } = {}) {
  const url = 'file://' + path.join(root, 'docs/examples', page + '.html') + (link ? '#df=' + link : '');
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-prefers-reduced-motion',
    `--force-device-scale-factor=${scale}`, `--window-size=${width},${height}`,
    '--virtual-time-budget=1500', `--screenshot=${file}`, url,
  ], { stdio: 'ignore', timeout: 60000 });
  return file;
}

// one still picture per example, at the step that shows the most
const STILLS = [
  ['online-order', 'paid.2'],
  ['notes-inbox', 'file.7', 1110],
  ['support-triage', 'urgent.3', 960],
  ['sign-up', 'signup.5'],
];
for (const [page, link, height] of STILLS) {
  shot(page, link, path.join(out, page + '.png'), { height: height || 940 });
  console.log('picture:', page, link);
}

// the moving demo: every step of the online order, 1 frame each
const FRAMES = 7;
let gif;
try {
  const { GIFEncoder, quantize, applyPalette } = await import(process.env.GIFENC || 'gifenc');
  const { PNG } = await import(process.env.PNGJS || 'pngjs');
  gif = GIFEncoder();
  for (let k = 1; k <= FRAMES; k++) {
    const f = shot('online-order', 'paid.' + k, path.join(out, `frame-${k}.png`), { width: 1180, height: 900, scale: 1 });
    const png = PNG.sync.read(fs.readFileSync(f));
    const palette = quantize(png.data, 256);
    const index = applyPalette(png.data, palette);
    gif.writeFrame(index, png.width, png.height, { palette, delay: k === FRAMES ? 3500 : 2200 });
    fs.unlinkSync(f);
  }
  gif.finish();
  fs.writeFileSync(path.join(out, 'demo.gif'), gif.bytes());
  console.log('moving demo:', FRAMES, 'frames');
} catch (e) {
  console.log('moving demo skipped:', e.message);
}
