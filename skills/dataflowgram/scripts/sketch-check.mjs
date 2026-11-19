// Checks a text sketch before it is shown in a chat.
// On screen an emoji is a little wider than 2 letters, so it pushes everything after it on the same row.
// A line or box edge stays straight only if every row it passes through has the same number of emoji to its left.
// Usage: node sketch-check.mjs sketch.txt   (exit 1 and a list of faults if a line would look bent)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EDGE = new Set(['│', '▲', '▼', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴']);
const WIDE = /\p{Extended_Pictographic}|[❓✅❌➕⭐]/u;

// cell width of one character: emoji and other wide marks take 2 cells
function cellWidth(ch) {
  const cp = ch.codePointAt(0);
  if (cp === 0xfe0f || cp === 0x200d) return 0;
  if (WIDE.test(ch) && cp > 0x2000) return 2;
  return 1;
}

// For one row: each edge character's column, and how many emoji sit to its left
export function edgesOf(rowText) {
  const out = [];
  let col = 0;
  let emoji = 0;
  for (const ch of rowText) {
    if (EDGE.has(ch)) out.push({ col, emoji, ch });
    const w = cellWidth(ch);
    if (w === 2) emoji += 1;
    col += w;
  }
  return out;
}

// Faults: an edge that continues from the row above at the same column but with a different emoji count
export function checkSketch(text) {
  const rows = text.split('\n').map(edgesOf);
  const faults = [];
  for (let r = 1; r < rows.length; r += 1) {
    for (const e of rows[r]) {
      const above = rows[r - 1].find((a) => a.col === e.col);
      if (above && above.emoji !== e.emoji) {
        faults.push({ row: r + 1, col: e.col, above: above.emoji, here: e.emoji });
      }
    }
  }
  return faults;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const faults = checkSketch(readFileSync(process.argv[2], 'utf8'));
  for (const f of faults) {
    console.log(`row ${f.row}, column ${f.col}: ${f.here} emoji to the left here, ${f.above} on the row above, so the line will look bent`);
  }
  if (faults.length) process.exit(1);
  console.log('straight: every line has the same number of emoji to its left on every row');
}
