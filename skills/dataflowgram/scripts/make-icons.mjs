#!/usr/bin/env node
// Turns the Lucide icon package's "icon-nodes.json" into the icon file this skill ships.
// Usage: node make-icons.mjs <path to icon-nodes.json> <version>
// Every icon is checked: only plain drawing shapes with plain number values are kept.
// An icon with anything else (a script, a link, an event handler) stops the build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED = {
  path: ['d'],
  circle: ['cx', 'cy', 'r'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
};
const SAFE_VALUE = /^[0-9a-zA-Z .,+\-]*$/;
const SAFE_NAME = /^[a-z0-9-]+$/;

export function cleanIcon(name, nodes) {
  if (!SAFE_NAME.test(name)) throw new Error(`icon name not allowed: ${name}`);
  if (!Array.isArray(nodes) || nodes.length === 0) throw new Error(`icon ${name}: no shapes`);
  return nodes.map((node) => {
    const [tag, attrs] = node;
    if (!Object.prototype.hasOwnProperty.call(ALLOWED, tag)) throw new Error(`icon ${name}: shape not allowed: ${tag}`);
    const out = {};
    for (const [key, value] of Object.entries(attrs || {})) {
      if (/^on/i.test(key) || /href/i.test(key)) throw new Error(`icon ${name}: attribute not allowed: ${key}`);
      if (!ALLOWED[tag].includes(key)) continue; // "key", "fill" and similar are dropped
      const text = String(value);
      if (!SAFE_VALUE.test(text)) throw new Error(`icon ${name}: value not allowed in ${key}`);
      out[key] = text;
    }
    return [tag, out];
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [src, version] = process.argv.slice(2);
  if (!src || !version) {
    console.error('usage: node make-icons.mjs <icon-nodes.json> <version>');
    process.exit(2);
  }
  const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
  const icons = {};
  for (const name of Object.keys(raw).sort()) icons[name] = cleanIcon(name, raw[name]);
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'lucide-icons.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ source: 'lucide-static', version, license: 'ISC, Lucide Icons and Contributors', icons }));
  console.log(`${Object.keys(icons).length} icons written to ${out}`);
}
