#!/usr/bin/env node
// Builds an interactive data-flow diagram from a short description of parts, lines and steps.
//   node dataflow.mjs build <spec.json> <out.html>          a whole page
//   node dataflow.mjs fragment <spec.json> <out.html> [id]  a block to paste into another page
//   node dataflow.mjs check <spec.json>                     checks the description only
//   node dataflow.mjs icons <word>                          lists icon names that contain the word
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICONS = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'assets', 'lucide-icons.json'), 'utf8')).icons;

// A kind is what a part is. Each kind has one colour and one default icon.
export const KINDS = {
  person: { label: 'A person', color: '#1D4ED8', tint: '#EEF3FF', icon: 'user' },
  mail: { label: 'A mailbox', color: '#B45309', tint: '#FFF4DE', icon: 'inbox' },
  program: { label: 'Our program', color: '#334155', tint: '#EEF2F6', icon: 'cpu' },
  ai: { label: 'An AI model', color: '#7C3AED', tint: '#F3ECFF', icon: 'sparkles' },
  store: { label: 'Stored rows', color: '#15803D', tint: '#E8F6EC', icon: 'table-2' },
  files: { label: 'Stored files', color: '#0F766E', tint: '#E3F5F2', icon: 'folder-open' },
  outside: { label: "Another company's system", color: '#BE123C', tint: '#FDEBEF', icon: 'landmark' },
  web: { label: 'The public web', color: '#0E7490', tint: '#E4F4F9', icon: 'globe' },
  output: { label: 'What a person receives', color: '#4338CA', tint: '#ECEEFF', icon: 'file-text' },
  time: { label: 'A clock or calendar', color: '#A16207', tint: '#FBF3D5', icon: 'calendar-clock' },
};

// An action is what happens in a step. Each action has one colour and one icon.
export const ACTIONS = {
  start: { label: 'Start', color: '#A16207', icon: 'play' },
  send: { label: 'Send', color: '#2563EB', icon: 'send' },
  check: { label: 'Check', color: '#475569', icon: 'shield-check' },
  read: { label: 'Read', color: '#0E7490', icon: 'book-open' },
  search: { label: 'Search', color: '#0369A1', icon: 'search' },
  think: { label: 'Think', color: '#7C3AED', icon: 'sparkles' },
  write: { label: 'Write', color: '#15803D', icon: 'pen-line' },
  save: { label: 'Save', color: '#0F766E', icon: 'save' },
  reply: { label: 'Reply', color: '#C2410C', icon: 'reply' },
};

const PAD = 10;
const GAPX = 56;
const BOX_W = { 1: 240, 2: 200, 3: 160 }; // box width by how many share a row
const NODE_H = 86;
const ROW_GAP = 104;
const ZONE_TOP = 12;
const ZONE_BOTTOM = 24;
// The longest label and second line that fit a box, by how many boxes share the row.
// Average width of one character, in drawing units: [label, second line], by row size (row of 3 uses smaller type).
const CHAR_W = { 1: [9.2, 7.2], 2: [9.2, 7.2], 3: [8.7, 6.9] };
const BOX_MAX = { 1: 320, 2: 280, 3: 220 }; // the widest a box may grow
const BOX_PAD = 28; // room inside a box, left and right together
// The longest words that fit the widest box: a row of 1 fits a 31-character label, 2 fits 27, 3 fits 22.
const LIMITS = Object.fromEntries([1, 2, 3].map((n) => [n, {
  label: Math.floor((BOX_MAX[n] - BOX_PAD) / CHAR_W[n][0]),
  sub: Math.floor((BOX_MAX[n] - BOX_PAD) / CHAR_W[n][1]),
}]));

// The width of every box in a row of n: wide enough for the longest label and second line in any such row.
export function boxWidth(n, labels, subs) {
  const needL = Math.max(0, ...labels.map((s) => String(s).length)) * CHAR_W[n][0] + BOX_PAD;
  const needS = Math.max(0, ...subs.map((s) => String(s || '').length)) * CHAR_W[n][1] + BOX_PAD;
  return Math.min(BOX_MAX[n], Math.max(BOX_W[n], Math.ceil(needL), Math.ceil(needS)));
}
const ID = /^[a-z][a-z0-9-]*$/;
// The credit in the lower right of every diagram. The licence requires it; only holders of a
// commercial licence from Russell Miller may turn it off with "credit": false.
const CREDIT = {
  site: 'https://russellmiller.io',
  repo: 'https://github.com/russellmiller3/dataflowgram',
  email: 'rmiller@zavient.com',
  linkedin: 'https://www.linkedin.com/in/russellmiller',
};
const CARRY_MAX = 22;
// Kinds of part that sit outside the owner's own system unless a part says otherwise.
const OUTSIDE_KINDS = ['outside', 'web'];
const ITEM_LIMITS = { title: 60, fields: 8, key: 24, value: 140, body: 600, time: 30, ifNot: 160 };

class SpecError extends Error {}
function fail(message) {
  throw new SpecError('dataflow spec: ' + message);
}
export function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function num(v) {
  return (Math.round(v * 10) / 10).toString();
}

function iconShapes(name) {
  const nodes = ICONS[name];
  if (!nodes) fail(`icon "${name}" is not in the Lucide set. Run: node dataflow.mjs icons <word>`);
  return nodes
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}/>`)
    .join('');
}
// An icon for use in ordinary page text.
export function iconSvg(name) {
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    `stroke-linejoin="round" aria-hidden="true">${iconShapes(name)}</svg>`
  );
}

function roundPath(points, radius = 6) {
  const pts = points.filter((p, k) => k === 0 || p[0] !== points[k - 1][0] || p[1] !== points[k - 1][1]);
  let d = `M${num(pts[0][0])} ${num(pts[0][1])}`;
  for (let k = 1; k < pts.length; k += 1) {
    const [x, y] = pts[k];
    const [px, py] = pts[k - 1];
    if (k < pts.length - 1) {
      const [nx, ny] = pts[k + 1];
      const l1 = Math.hypot(x - px, y - py);
      const l2 = Math.hypot(nx - x, ny - y);
      const r = Math.min(radius, l1 / 2, l2 / 2);
      const ax = x - ((x - px) / l1) * r;
      const ay = y - ((y - py) / l1) * r;
      const bx = x + ((nx - x) / l2) * r;
      const by = y + ((ny - y) / l2) * r;
      d += ` L${num(ax)} ${num(ay)} Q${num(x)} ${num(y)} ${num(bx)} ${num(by)}`;
    } else {
      d += ` L${num(x)} ${num(y)}`;
    }
  }
  return d;
}

// Checks the description and works out where every box and line goes.
// The space between 2 boxes in one row: just wide enough to read the data moving across it, and no wider,
// so the whole diagram can be taken in at a glance. It fits the longest tag on the diagram (with its
// direction arrow) plus a visible stretch of line and arrowhead on each side. 'longest' is the longest
// tag in characters; 'n' is how many boxes share the row. A row of 3 is capped so the drawing stays compact.
export function gapFor(longest, n) {
  const LINE_EACH_SIDE = 32;
  const tag = longest * 7.7 + 34 + 14 + 30; // 30 for the step-number badge
  const want = Math.max(160, Math.min(320, Math.round(tag + 2 * LINE_EACH_SIDE)));
  return n >= 3 ? Math.min(want, 170) : want;
}

// The box that holds every part outside the owner's system, when no inside part falls within it.
// Takes parts with x, y, w, h and outside (true or false). Returns { x, y, w, h } that hugs the boxes,
// or null when there are no outside parts or an inside part sits among them.
export function regionOf(parts) {
  const out = parts.filter((n) => n.outside);
  if (out.length === 0) return null;
  const M = 7;
  const x0 = Math.min(...out.map((n) => n.x)) - M;
  const y0 = Math.min(...out.map((n) => n.y)) - M;
  const x1 = Math.max(...out.map((n) => n.x + n.w)) + M;
  const y1 = Math.max(...out.map((n) => n.y + n.h)) + M;
  const inside = parts.some((n) => !n.outside && n.x < x1 && n.x + n.w > x0 && n.y < y1 && n.y + n.h > y0);
  return inside ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Gives every part its own colour so that data, which takes its sender's colour, can be told apart.
// Rule (map colouring): two parts joined by a line never share a colour, and where the palette allows,
// neither do two parts that are joined to the same part. A part keeps its kind's colour when that is free.
// 'order' lists part ids; 'kindOf' maps id to kind; 'pairs' lists [a, b] for every line.
export function colourParts(order, kindOf, pairs) {
  const palette = Object.values(KINDS).map((k) => ({ color: k.color, tint: k.tint }));
  const near = {};
  order.forEach((id) => { near[id] = new Set(); });
  pairs.forEach(([a, b]) => { near[a].add(b); near[b].add(a); });
  const out = {};
  order.forEach((id) => {
    const own = KINDS[kindOf[id]];
    const beside = new Set(); // colours of parts joined to this one
    const around = new Set(); // colours of parts one step further away
    near[id].forEach((n) => {
      if (out[n]) beside.add(out[n].color);
      near[n].forEach((m) => { if (m !== id && out[m]) around.add(out[m].color); });
    });
    const wanted = [{ color: own.color, tint: own.tint }].concat(palette.filter((c) => c.color !== own.color));
    out[id] = wanted.find((c) => !beside.has(c.color) && !around.has(c.color))
      || wanted.find((c) => !beside.has(c.color))
      || wanted[0];
  });
  return out;
}

export function compile(spec) {
  if (!spec || typeof spec !== 'object') fail('the description must be an object');
  const { rows, parts, lines = [], zones = [], scenarios } = spec;
  if (!Array.isArray(rows) || rows.length === 0) fail('"rows" must list at least 1 row of part names');
  if (!parts || typeof parts !== 'object') fail('"parts" must describe each part');
  if (!Array.isArray(scenarios) || scenarios.length === 0) fail('"scenarios" must hold at least 1 scenario');

  // ---- parts and their place
  let longest = 0; // the longest tag on the diagram, in characters
  scenarios.forEach((s) => ((s && s.steps) || []).forEach((st) => {
    if (st && st.carry && st.carry.label) longest = Math.max(longest, String(st.carry.label).length);
  }));
  // one box width per row size, from the words in every row of that size
  const boxW = {};
  [1, 2, 3].forEach((n) => {
    const ids = rows.filter((row) => Array.isArray(row) && row.length === n).flat();
    const ps = ids.map((id) => (parts && parts[id]) || {});
    boxW[n] = boxWidth(n, ps.map((x) => x.label || ''), ps.map((x) => x.sub || ''));
  });
  // the drawing is as wide as its widest row needs, and no wider
  const width = Math.max(420, ...rows.map((row) => {
    const n = Math.max(1, Math.min(3, Array.isArray(row) ? row.length : 1));
    return 2 * PAD + n * boxW[n] + (n - 1) * gapFor(longest, n);
  }));
  const nodes = {};
  rows.forEach((row, r) => {
    if (!Array.isArray(row) || row.length < 1 || row.length > 3) fail(`row ${r + 1} must hold 1 to 3 parts; it holds ${Array.isArray(row) ? row.length : 0}`);
    const n = row.length;
    // Boxes stay only as wide as their text needs; the rest of the row goes to the gap, where the lines run.
    const w = boxW[n];
    const gap = n === 1 ? 0 : gapFor(longest, n);
    const rowLeft = (width - (n * w + (n - 1) * gap)) / 2; // each row sits in the middle of the drawing
    row.forEach((id, c) => {
      if (!ID.test(String(id))) fail(`part name "${id}" must be lower-case letters, digits and hyphens`);
      if (nodes[id]) fail(`part "${id}" is placed twice in "rows"`);
      const part = parts[id];
      if (!part) fail(`row ${r + 1} names "${id}", but "parts" does not describe it`);
      if (!part.label) fail(`part "${id}" needs a "label"`);
      if (!KINDS[part.kind]) fail(`part "${id}" has kind "${part.kind}"; use one of: ${Object.keys(KINDS).join(', ')}`);
      const lim = LIMITS[n];
      if (part.label.length > lim.label) fail(`part "${id}": the label "${part.label}" has ${part.label.length} characters; a row of ${n} fits ${lim.label}`);
      if ((part.sub || '').length > lim.sub) fail(`part "${id}": the second line "${part.sub}" has ${part.sub.length} characters; a row of ${n} fits ${lim.sub}`);
      const icon = part.icon || KINDS[part.kind].icon;
      if (!ICONS[icon]) fail(`part "${id}": icon "${icon}" is not in the Lucide set. Run: node dataflow.mjs icons <word>`);
      const x = rowLeft + c * (w + gap);
      if (part.outside !== undefined && typeof part.outside !== 'boolean') fail(`part "${id}": "outside" must be true or false`);
      const outside = part.outside === undefined ? OUTSIDE_KINDS.includes(part.kind) : part.outside;
      nodes[id] = { id, label: part.label, sub: part.sub || '', kind: part.kind, icon, info: part.info || '', outside, row: r, col: c, n, x, w, h: NODE_H };
    });
  });
  Object.keys(parts).forEach((id) => {
    if (!nodes[id]) fail(`part "${id}" is described but not placed in "rows"`);
  });

  // ---- zones (a dashed frame around some rows)
  const zoneList = zones.map((z, k) => {
    if (!z.label) fail(`zone ${k + 1} needs a "label"`);
    if (z.label.length > 44) fail(`zone "${z.label}" has ${z.label.length} characters; 44 fit`);
    const [from, to] = Array.isArray(z.rows) ? z.rows : [];
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > rows.length) {
      fail(`zone "${z.label}": "rows" must be [first row, last row], counted from 1`);
    }
    return { label: z.label, from: from - 1, to: to - 1 };
  });
  const y0 = PAD + (zoneList.some((z) => z.from === 0) ? ZONE_TOP : 0);
  const rowY = rows.map((_, r) => y0 + r * (NODE_H + ROW_GAP));
  Object.values(nodes).forEach((n) => {
    n.y = rowY[n.row];
    n.cx = n.x + n.w / 2;
  });
  const lastBottom = rowY[rows.length - 1] + NODE_H;
  const height = lastBottom + PAD + (zoneList.some((z) => z.to === rows.length - 1) ? ZONE_BOTTOM : 0);

  // ---- lines
  const edges = [];
  const seen = new Set();
  lines.forEach((line, k) => {
    if (!Array.isArray(line) || line.length !== 2) fail(`line ${k + 1} must be [part, part]`);
    const [a, b] = line;
    if (!nodes[a]) fail(`line ${k + 1} names "${a}", which is not a part`);
    if (!nodes[b]) fail(`line ${k + 1} names "${b}", which is not a part`);
    if (a === b) fail(`line ${k + 1} joins "${a}" to itself`);
    const key = [a, b].sort().join('|');
    if (seen.has(key)) fail(`"${a}" and "${b}" are joined twice in "lines"`);
    seen.add(key);
    const A = nodes[a];
    const B = nodes[b];
    const dr = Math.abs(A.row - B.row);
    if (dr > 1) fail(`the line "${a}" to "${b}" joins rows ${A.row + 1} and ${B.row + 1}; put the 2 parts in the same row or in neighbouring rows`);
    if (dr === 0 && Math.abs(A.col - B.col) !== 1) fail(`the line "${a}" to "${b}" crosses another part in row ${A.row + 1}; put the 2 parts side by side`);
    edges.push({ id: 'e' + k, from: a, to: b, key, sameRow: dr === 0 });
  });

  // where each line meets its boxes: lines that share a side of a box are spread along it
  const slots = {};
  const sideOf = (edge, id) => {
    const me = nodes[id];
    const other = nodes[edge.from === id ? edge.to : edge.from];
    return other.row > me.row ? 'bottom' : 'top';
  };
  edges.filter((e) => !e.sameRow).forEach((e) => {
    [e.from, e.to].forEach((id) => {
      const k = id + ':' + sideOf(e, id);
      (slots[k] = slots[k] || []).push(e);
    });
  });
  Object.entries(slots).forEach(([k, list]) => {
    const id = k.split(':')[0];
    const me = nodes[id];
    list.sort((p, q) => nodes[p.from === id ? p.to : p.from].cx - nodes[q.from === id ? q.to : q.from].cx);
    list.forEach((e, j) => {
      (e.attach = e.attach || {})[id] = me.x + (me.w * (j + 1)) / (list.length + 1);
    });
  });
  // lines with a bend share the space between 2 rows, each at its own height
  const lanes = {};
  edges.filter((e) => !e.sameRow).forEach((e) => {
    const upper = nodes[e.from].row < nodes[e.to].row ? e.from : e.to;
    const lower = upper === e.from ? e.to : e.from;
    e.upper = upper;
    e.lower = lower;
    if (Math.abs(e.attach[upper] - e.attach[lower]) > 0.5) (lanes[nodes[upper].row] = lanes[nodes[upper].row] || []).push(e);
  });
  Object.values(lanes).forEach((list) => {
    list.forEach((e, k) => {
      e.lane = nodes[e.upper].y + NODE_H + 14 + ((ROW_GAP - 28) * (k + 0.5)) / list.length;
    });
  });
  edges.forEach((e) => {
    const A = nodes[e.from];
    const B = nodes[e.to];
    let pts;
    if (e.sameRow) {
      const y = A.y + NODE_H / 2;
      pts = A.col < B.col ? [[A.x + A.w, y], [B.x, y]] : [[A.x, y], [B.x + B.w, y]];
    } else {
      const U = nodes[e.upper];
      const L = nodes[e.lower];
      const ux = e.attach[e.upper];
      const lx = e.attach[e.lower];
      const down = e.lane === undefined ? [[ux, U.y + NODE_H], [lx, L.y]] : [[ux, U.y + NODE_H], [ux, e.lane], [lx, e.lane], [lx, L.y]];
      pts = e.upper === e.from ? down : down.slice().reverse();
    }
    e.start = pts[0];
    e.end = pts[pts.length - 1];
    e.d = roundPath(pts);
    if (e.sameRow) e.tag = [(pts[0][0] + pts[1][0]) / 2, A.row === 0 ? A.y + NODE_H + 22 : A.y - 22];
  });

  // ---- scenarios and steps
  const ids = new Set();
  // Steps that move data but name nothing: the reader sees a line light up with no idea what moved.
  const warnings = [];
  // A person belongs at the top: the reader starts where the person starts (19 November 2026).
  const people = Object.keys(parts).filter((id) => parts[id].kind === 'person');
  if (people.length && !rows[0].some((id) => parts[id] && parts[id].kind === 'person')) {
    warnings.push(`no person is in the top row: move ${people.map((id) => `"${id}"`).join(' or ')} to row 1, so the reader starts where the person starts`);
  }
  const scns = scenarios.map((s, si) => {
    if (!s.id || !ID.test(s.id)) fail(`scenario ${si + 1} needs an "id" of lower-case letters, digits and hyphens`);
    if (ids.has(s.id)) fail(`scenario id "${s.id}" is used twice`);
    ids.add(s.id);
    if (!s.label) fail(`scenario "${s.id}" needs a "label"`);
    if (!Array.isArray(s.steps) || s.steps.length === 0) fail(`scenario "${s.id}" needs at least 1 step`);
    const steps = s.steps.map((st, k) => {
      const where = `scenario "${s.id}", step ${k + 1}`;
      if (!ACTIONS[st.action]) fail(`${where}: action "${st.action}" is not known; use one of: ${Object.keys(ACTIONS).join(', ')}`);
      if (!st.text || !String(st.text).trim()) fail(`${where}: needs "text"`);
      const stepEdges = [];
      const flows = []; // who sends to whom, on which line
      const lit = [];
      let focus = null; // the part whose colour the step takes: the one that SENDS the data
      (st.flow || []).forEach((f) => {
        const m = /^([a-z][a-z0-9-]*)\s*(<>|>)\s*([a-z][a-z0-9-]*)$/.exec(String(f));
        if (!m) fail(`${where}: flow "${f}" must read "part>part" (one way) or "part<>part" (both ways)`);
        const [, a, op, b] = m;
        if (!nodes[a]) fail(`${where}: flow "${f}" names "${a}", which is not a part`);
        if (!nodes[b]) fail(`${where}: flow "${f}" names "${b}", which is not a part`);
        const edge = edges.find((e) => e.key === [a, b].sort().join('|'));
        if (!edge) fail(`${where}: no line joins "${a}" and "${b}"; add ["${a}", "${b}"] to "lines"`);
        const way = op === '<>' ? 'x' : edge.from === a ? 'f' : 'b';
        stepEdges.push([edge.id, way]);
        flows.push({ edge: edge.id, from: a, to: b, dir: way });
        [a, b].forEach((id) => { if (!lit.includes(id)) lit.push(id); });
        if (!focus) focus = a;
      });
      (st.at || []).forEach((id) => {
        if (!nodes[id]) fail(`${where}: "at" names "${id}", which is not a part`);
        if (!lit.includes(id)) lit.push(id);
        if (!focus) focus = id;
      });
      if (lit.length === 0) fail(`${where}: give "flow" (data that moves) or "at" (the part that works)`);
      if (stepEdges.length > 0 && st.carry === undefined) warnings.push(`${where} moves data but names nothing: add "carry" ({ "icon": "...", "label": "..." })`);
      let carry = null;
      if (st.carry !== undefined) {
        const cy = st.carry;
        if (!cy || typeof cy !== 'object' || !cy.label) fail(`${where}: "carry" must be { "icon": "...", "label": "..." }`);
        if (String(cy.label).length > CARRY_MAX) fail(`${where}: the carry label "${cy.label}" has ${String(cy.label).length} characters; ${CARRY_MAX} fit`);
        const ci = cy.icon || 'package';
        if (!ICONS[ci]) fail(`${where}: icon "${ci}" is not in the Lucide set. Run: node dataflow.mjs icons <word>`);
        if (stepEdges.length === 0) fail(`${where}: "carry" needs a "flow" for the tag to ride on`);
        carry = { label: String(cy.label), icon: ci };
      }
      // data that goes from a part inside the owner's system to a part outside it
      const leaves = [];
      (st.flow || []).forEach((f) => {
        const [, a, op, b] = /^([a-z][a-z0-9-]*)\s*(<>|>)\s*([a-z][a-z0-9-]*)$/.exec(String(f));
        const pairs = op === '<>' ? [[a, b], [b, a]] : [[a, b]];
        pairs.forEach(([from, to]) => {
          if (!nodes[from].outside && nodes[to].outside && !leaves.includes(nodes[to].label)) leaves.push(nodes[to].label);
        });
      });
      let item = null;
      if (st.item !== undefined) {
        const it = st.item;
        if (!it || typeof it !== 'object' || !it.title) fail(`${where}: "item" must have a "title"`);
        if (String(it.title).length > ITEM_LIMITS.title) fail(`${where}: the item title has ${String(it.title).length} characters; ${ITEM_LIMITS.title} fit`);
        const fields = it.fields || [];
        if (!Array.isArray(fields) || fields.length > ITEM_LIMITS.fields) fail(`${where}: "item.fields" must be a list of at most ${ITEM_LIMITS.fields} [name, value] pairs`);
        fields.forEach((pair, j) => {
          if (!Array.isArray(pair) || pair.length !== 2) fail(`${where}: item field ${j + 1} must be [name, value]`);
          if (String(pair[0]).length > ITEM_LIMITS.key) fail(`${where}: item field name "${pair[0]}" has ${String(pair[0]).length} characters; ${ITEM_LIMITS.key} fit`);
          if (String(pair[1]).length > ITEM_LIMITS.value) fail(`${where}: the value of item field "${pair[0]}" has ${String(pair[1]).length} characters; ${ITEM_LIMITS.value} fit`);
        });
        const body = Array.isArray(it.body) ? it.body.join('\n') : String(it.body || '');
        if (body.length > ITEM_LIMITS.body) fail(`${where}: the item body has ${body.length} characters; ${ITEM_LIMITS.body} fit`);
        const ii = it.icon || (carry ? carry.icon : 'file-text');
        if (!ICONS[ii]) fail(`${where}: icon "${ii}" is not in the Lucide set. Run: node dataflow.mjs icons <word>`);
        item = { title: String(it.title), icon: ii, fields: fields.map((pair) => [String(pair[0]), String(pair[1])]), body };
      }
      const time = st.time === undefined ? '' : String(st.time);
      if (time.length > ITEM_LIMITS.time) fail(`${where}: "time" has ${time.length} characters; ${ITEM_LIMITS.time} fit`);
      const ifNot = st.ifNot === undefined ? '' : String(st.ifNot);
      if (ifNot.length > ITEM_LIMITS.ifNot) fail(`${where}: "ifNot" has ${ifNot.length} characters; ${ITEM_LIMITS.ifNot} fit`);
      return { action: st.action, text: String(st.text), edges: stepEdges, flows, nodes: lit, focus, carry, leaves, item, time, ifNot };
    });
    return { id: s.id, label: s.label, steps };
  });

  if (spec.credit !== undefined && typeof spec.credit !== 'boolean') fail('"credit" must be true or false');
  // Where the parts outside the owner's system sit together, with no inside part among them, one shaded
  // region is drawn around them. Otherwise each outside part carries its own small mark.
  const outsideRegion = regionOf(Object.values(nodes));
  let fullHeight = height;
  if (outsideRegion) fullHeight = Math.max(height, outsideRegion.y + outsideRegion.h + 4);
  const order = Object.values(nodes).sort((a, b) => a.row - b.row || a.col - b.col).map((n) => n.id);
  const kindOf = {};
  order.forEach((id) => { kindOf[id] = nodes[id].kind; });
  const tones = colourParts(order, kindOf, edges.map((e) => [e.from, e.to]));
  order.forEach((id) => { nodes[id].color = tones[id].color; nodes[id].tint = tones[id].tint; });
  // The system a person talks to goes directly below them, so the eye drops straight down (19 November 2026).
  for (const [pid, p] of Object.entries(nodes)) {
    if (p.kind !== 'person') continue;
    const first = scenarios.flatMap((s) => s.steps).flatMap((st) => st.flow || [])
      .map((f) => f.split(/<>|>|</)).find(([a, b]) => a === pid && b && nodes[b]);
    if (!first) continue;
    const t = nodes[first[1]];
    if (t.row !== p.row + 1 || Math.abs(t.cx - p.cx) > 1) {
      warnings.push(`"${first[1]}", the first thing "${pid}" talks to, is not directly below them: put it in the next row, in the same column (the middle of the row when "${pid}" is alone at the top)`);
    }
  }
  return { title: spec.title || '', intro: spec.intro || '', credit: spec.credit !== false, width, height: fullHeight, nodes, edges, zones: zoneList, outsideRegion, rowY, scenarios: scns, warnings };
}

// The data the page's own script needs. "<" is written as a code so text can never close the script early.
function pageData(c) {
  const usedActions = {};
  c.scenarios.forEach((s) => s.steps.forEach((st) => {
    const a = ACTIONS[st.action];
    usedActions[st.action] = { label: a.label, color: a.color, icon: iconSvg(a.icon) };
  }));
  const nodes = {};
  Object.values(c.nodes).forEach((n) => { nodes[n.id] = { label: n.label, info: n.info }; });
  const scenarios = c.scenarios.map((s) => ({
    ...s,
    steps: s.steps.map((st) => ({
      ...st,
      carry: st.carry ? { label: st.carry.label, icon: iconShapes(st.carry.icon) } : null,
      item: st.item ? { ...st.item, icon: iconShapes(st.item.icon) } : null,
    })),
  }));
  const ui = { play: iconSvg('play'), pause: iconSvg('pause'), clock: iconSvg('clock'), branch: iconSvg('git-branch'), out: iconSvg('external-link') };
  return JSON.stringify({ nodes, actions: usedActions, scenarios, ui })
    .replace(/</g, '\\u003c')
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');
}

const CSS = `
.df{--df-ink:#14233A;--df-ink2:#51627A;--df-line:#C9D4E2;--df-card:#fff;--df-head:#F3F6FA;color:var(--df-ink)}
.df-grid{display:grid;grid-template-columns:minmax(0,var(--df-w,2.1fr)) minmax(320px,440px);justify-content:start;gap:28px;align-items:start}
.df-grid>div:first-child{position:sticky;top:20px}
.df-grid>div{min-width:0}
.df-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:10px}
@media (max-width:560px){.df-svg{min-width:500px}}
.df-svg{width:100%;height:auto;display:block;background:var(--df-card);border:1px solid var(--df-line);border-radius:4px}
.df-svg text{font-family:inherit;fill:var(--df-ink)}
.df-node{cursor:pointer;transition:opacity .15s}
.df-node rect{fill:var(--t);stroke:var(--c);stroke-width:1.5}
.df-node .df-ico{fill:none;stroke:var(--c);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.df-node .df-t{font-size:16.5px;font-weight:600}
.df-node .df-t3{font-size:15.5px;font-weight:600}
.df-node .df-s{font-size:14px;fill:var(--df-ink2)}
.df-node .df-s3{font-size:13.5px;fill:var(--df-ink2)}
.df-node.on rect{stroke-width:3}
.df-node.dim{opacity:.38}
.df-node:focus{outline:none}
.df-node:focus-visible rect,.df-node.picked rect{stroke:var(--df-ink);stroke-width:2.5}
.df-edge{fill:none;stroke:#B4C0D0;stroke-width:2}
.df-edge.on{stroke-width:3.5}
.df-edge.fwd,.df-edge.rev{stroke-dasharray:7 5;animation:df-march .7s linear infinite}
.df-edge.rev{animation-direction:reverse}
@keyframes df-march{to{stroke-dashoffset:-12}}
@media (prefers-reduced-motion:reduce){.df-edge.fwd,.df-edge.rev{animation:none;stroke-dasharray:none}}
.df-packet{pointer-events:none}
.df-dot{pointer-events:none;filter:drop-shadow(0 0 6px currentColor)}
.df-dot rect{fill:#fff;stroke-width:2}
.df-packet rect{fill:#fff;stroke-width:1.6}
.df-packet text{font-size:14px;font-weight:600;fill:var(--df-ink)}
.df .df-packet text.df-badge-t{font-size:13px;font-weight:700;fill:#fff}
.df-pico{fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.df-carry{display:inline-flex;align-items:center;gap:6px;margin:8px 0 0;font-size:.95rem;font-weight:600;border:1.5px solid var(--df-line);border-radius:3px;padding:3px 8px;background:#fff}
.df-carry[hidden]{display:none}
.df-carry svg{width:17px;height:17px;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.df-zone{fill:none;stroke:#8A99AD;stroke-dasharray:5 4}
.df-zone-l{font-size:13.5px;fill:var(--df-ink2);letter-spacing:.05em}
${Object.entries(KINDS).map(([k, v]) => `.df-k-${k}{--c:${v.color};--t:${v.tint}}`).join('\n')}
.df-info{margin-top:10px;font-size:.95rem;color:var(--df-ink2);border-top:1px dashed var(--df-line);padding-top:10px}
.df-info b{color:var(--df-ink)}
.df-info[hidden]{display:none}
.df-keyfold{margin-top:12px;border-top:1px dashed var(--df-line);padding-top:10px}
.df-keyfold summary{cursor:pointer;font-size:.95rem;color:var(--df-ink2);list-style:none;display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--df-line);border-radius:999px;background:var(--df-card)}
.df-keyfold summary::-webkit-details-marker{display:none}
.df-keyfold summary::before{content:'+';font-weight:700}
.df-keyfold[open] summary::before{content:'−'}
.df-hint{margin:10px 0 0;font-size:.95rem;color:var(--df-ink2)}
.df-stepfold{margin-top:14px}
.df-stepfold summary{cursor:pointer;font-size:.95rem;color:var(--df-ink2);list-style:none;display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--df-line);border-radius:999px;background:var(--df-card)}
.df-stepfold summary::-webkit-details-marker{display:none}
.df-stepfold summary::before{content:'+';font-weight:700}
.df-stepfold[open] summary::before{content:'−'}
/* the tag on the drawing already says what moves, so the step card does not repeat it */
.df-cap .df-carry{display:none!important}
/* the everything list: one line per send */
.df .df-all-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:6px 10px}
.df .df-all-who{font-size:.95rem}
.df .df-all-what{display:contents}
.df .df-all-step{margin-left:auto}
.df-allview .df-stepfold{display:none}
/* progress dots: done, now, still to come */
.df-dots{display:inline-flex;gap:5px;align-items:center;margin-right:4px}
.df-dots i{width:8px;height:8px;border-radius:50%;background:var(--df-line);display:block}
.df-dots i.done{background:color-mix(in srgb,var(--df-ink2) 55%,transparent)}
.df-dots i.now{width:22px;border-radius:4px;background:var(--a,var(--df-ink))}
/* the step list: finished steps get a tick and fade, steps to come stay plain */
.df-steps button.done{opacity:.55}
.df-steps button.done .df-num{font-size:0}
.df-steps button.done .df-num::before{content:'✓';font-size:.95rem}
.df-legend{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;align-items:center}
.df-credit{margin:56px 0 0;text-align:right;font-size:.85rem;color:var(--df-ink2)}
.df-allview :is(.df-cap,.df-nav,.df-item,.df-steps,.df-only-steps){display:none}
.df:not(.df-allview) .df-only-all{display:none}
.df-key .df-ln{width:34px;height:10px}
.df-ln path{fill:none;stroke-width:3;stroke-linecap:round}
.df-ln-now{stroke:#3B82F6;stroke-dasharray:7 5}
.df-ln-past{stroke:#3B82F6;opacity:.4}
.df-ln-all{stroke:#3B82F6}
.df-ln-idle{stroke:#8A99AD;stroke-width:2}
.df-ln .df-ln-out{fill:rgba(190,18,60,.12);stroke:rgba(190,18,60,.55);stroke-width:1.2}
.df-outzone{fill:rgba(190,18,60,.06);stroke:rgba(190,18,60,.45);stroke-width:1.2}
.df .df-svg text.df-outzone-l{paint-order:stroke;font-size:14px;font-weight:600;letter-spacing:.1em;fill:#E0607E}
.df .df-svg text.df-out-l{font-size:13px;font-weight:700;letter-spacing:.01em;fill:#E0607E}
/* a send picked in the everything view: the rest steps back */
.df-pick .df-edge.on:not(.df-hot),.df-pick .df-packet:not(.df-hot){opacity:.14}
.df-pick .df-node:not(.df-hot){opacity:.35}
.df-pick .df-edge.df-hot{stroke-width:5}
.df-all-row[aria-pressed="true"]{border-color:var(--a);box-shadow:inset 3px 0 0 var(--a),0 0 0 3px color-mix(in srgb,var(--a) 22%,transparent)}
.df-all-row:hover{border-color:color-mix(in srgb,var(--a) 60%,var(--df-line))}
.df-all-list{display:grid;gap:6px}
.df-all-row{display:grid;gap:3px;padding:7px 10px;cursor:pointer;border:1px solid var(--df-line);border-left:3px solid var(--a);border-radius:8px;background:var(--df-card)}
.df-all-who{font-weight:600;font-size:1rem}
.df-all-who span{color:var(--df-ink2);font-weight:500;padding:0 6px}
.df-all-what{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:.95rem}
.df-all-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:6px;border:1.5px solid var(--a);font-weight:600}
.df-all-chip svg{width:15px;height:15px;fill:none;stroke:var(--a);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.df-all-step{color:var(--df-ink2);font-size:.85rem}
.df-credit a{color:var(--df-ink2);text-decoration:none;border-bottom:1px solid var(--df-line)}
.df-credit a:hover{color:var(--df-ink);border-bottom-color:var(--df-ink)}
.df-legend small{font-size:.85rem;text-transform:uppercase;letter-spacing:.06em;color:var(--df-ink2);margin-right:2px}
.df-key{display:inline-flex;align-items:center;gap:6px;font-size:.88rem;border:1px solid var(--df-line);border-radius:3px;padding:3px 8px 3px 6px;background:var(--df-card);color:var(--df-ink)}
.df-key svg{width:16px;height:16px;flex:none}
.df-key.act{border-color:transparent;color:#fff}
.df-seg{display:flex;flex-wrap:wrap;border:1px solid var(--df-line);border-radius:3px;overflow:hidden;background:var(--df-card);width:max-content;max-width:100%;margin-bottom:12px}
.df-seg button{font:inherit;font-size:.95rem;border:0;border-right:1px solid var(--df-line);background:transparent;padding:8px 12px;cursor:pointer;color:var(--df-ink)}
.df-seg button:last-child{border-right:0}
.df-seg button[aria-pressed="true"]{background:var(--df-ink);color:#fff}
.df-cap{background:var(--df-card);border:1px solid var(--df-line);border-left:5px solid var(--df-ink);border-radius:4px;padding:12px 14px;min-height:112px}
.df-caphead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.df-count{color:var(--df-ink2);font-size:.85rem;text-transform:uppercase;letter-spacing:.05em}
.df-act{display:inline-flex;align-items:center;gap:5px;color:#fff;font-size:.85rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-radius:3px;padding:3px 8px 3px 6px}
.df-act svg{width:15px;height:15px}
.df-text{margin:6px 0 0;font-size:1.05rem}
.df-nav{display:grid;grid-template-columns:auto auto auto 1fr;gap:8px;margin:0 0 12px}
.df-nav button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:42px;font-weight:600;white-space:nowrap}
@media (max-width:480px){.df-nav{grid-template-columns:1fr 1fr}}
.df-nav button svg{width:17px;height:17px;flex:none;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.df-nav button:disabled{opacity:.35}
.df-motion{margin-top:14px;display:inline-flex;align-items:center;gap:10px;font:inherit;font-size:.95rem;color:var(--df-ink2);background:none;border:0;padding:4px 0;cursor:pointer}
.df-motion b{color:var(--df-ink)}
.df-switch{width:36px;height:20px;border-radius:999px;background:var(--df-line);position:relative;flex:none;transition:background .15s}
.df-switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:left .15s}
.df-motion[aria-checked="true"] .df-switch{background:var(--df-ink)}
.df-motion[aria-checked="true"] .df-switch::after{left:18px}
.df-motion[hidden]{display:none}
.df-nav button{font:inherit;font-size:.95rem;border:1px solid var(--df-line);background:var(--df-card);border-radius:3px;padding:7px 11px;cursor:pointer;color:var(--df-ink)}
.df-nav button:disabled{opacity:.4;cursor:default}
.df-nav .df-next{background:var(--df-ink);border-color:var(--df-ink);color:#fff}
.df-play{display:inline-flex;align-items:center;gap:6px}
.df-play svg{width:16px;height:16px}
.df-time{display:inline-flex;align-items:center;gap:5px;color:var(--df-ink2);font-size:.85rem}
.df-time[hidden]{display:none}
.df-time svg{width:15px;height:15px}
.df-leaves,.df-ifnot{display:flex;align-items:flex-start;gap:7px;margin:8px 0 0;font-size:.95rem;border-radius:3px;padding:6px 9px}
.df-leaves[hidden],.df-ifnot[hidden]{display:none}
.df-leaves{background:#FDECEC;color:#9B1C1C;font-weight:600}
.df-ifnot{background:#FFF6E0;color:#7A4B00}
.df-leaves svg,.df-ifnot svg{width:17px;height:17px;flex:none;margin-top:2px}
.df-item{margin-top:14px}
.df-item-h{font-size:.85rem;text-transform:uppercase;letter-spacing:.05em;color:var(--df-ink2);margin:0 0 6px;font-weight:600}
.df-item-card{background:var(--df-card);border:1px solid var(--df-line);border-top:4px solid var(--df-line);border-radius:4px;font-size:.95rem}
.df-item-card.empty{padding:12px 14px;color:var(--df-ink2)}
.df-item-title{display:flex;align-items:center;gap:8px;padding:10px 14px;font-weight:600;border-bottom:1px solid var(--df-line);background:var(--df-head)}
.df-item-title svg{width:18px;height:18px;flex:none}
.df-item-fields{display:grid;grid-template-columns:minmax(80px,auto) minmax(0,1fr);gap:4px 14px;padding:10px 14px;margin:0}
.df-item-fields dt{color:var(--df-ink2);font-size:.88rem}
.df-item-fields dd{margin:0;overflow-wrap:anywhere}
.df-item-body{margin:0;padding:10px 14px;white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;border-top:1px solid var(--df-line)}
.df-item-fields + .df-item-body{border-top:1px dashed var(--df-line)}
.df-item-title + .df-item-body{border-top:0}
.df-edge.trail{stroke-width:2.6;opacity:.4}
.df-node.seen{opacity:.72}
.df-steps{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:3px}
.df-steps button{font:inherit;font-size:.95rem;text-align:left;width:100%;border:1px solid transparent;background:transparent;border-radius:3px;padding:5px 8px;cursor:pointer;color:var(--df-ink2);display:grid;grid-template-columns:26px 18px minmax(0,1fr);gap:8px;align-items:start}
.df-steps button[aria-current="step"]{background:var(--df-head);border-color:var(--df-line);color:var(--df-ink);font-weight:600}
.df-chip{width:26px;height:26px;border-radius:3px;display:grid;place-items:center;color:#fff}
.df-chip svg{width:15px;height:15px}
.df-num{color:var(--df-ink2);font-variant-numeric:tabular-nums}
@media (max-width:860px){.df-grid{grid-template-columns:minmax(0,1fr)}.df-grid>div:first-child{position:static}.df-svg{max-height:none}}

/* ---- look: soft gradients, see-through panels, faint texture; light and dark ---- */
.df{
  --df-ink:#121726;--df-ink2:#4b5468;--df-line:rgba(18,24,48,.15);--df-head:rgba(18,24,48,.045);
  --df-card:rgba(255,255,255,.93);--df-solid:#ffffff;--df-node:#ffffff;--df-edge:rgba(18,24,48,.26);
  --df-glow:0 1px 0 rgba(255,255,255,1) inset,0 1px 3px rgba(18,24,48,.08),0 24px 50px -24px rgba(40,48,110,.42);
  --df-leaves-bg:#fdecee;--df-leaves-ink:#9f1239;--df-ifnot-bg:#fff6e0;--df-ifnot-ink:#7a4b00;
  --df-dots:rgba(18,24,48,.07);--df-node-tint:13%;--df-node-on:20%;
  --df-node-shadow:drop-shadow(0 1px 1px rgba(18,24,48,.06)) drop-shadow(0 8px 14px color-mix(in srgb,var(--c) 16%,transparent));
  font-family:"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
}
.df [class^="df-k-"],.df [class*=" df-k-"]{--cs:var(--c)}
@media (prefers-color-scheme:dark){html:not([data-df-theme="light"]) .df{
  --df-ink:#e9ebf3;--df-ink2:#9ca3b8;--df-line:rgba(255,255,255,.09);--df-head:rgba(255,255,255,.045);
  --df-card:rgba(23,25,41,.58);--df-solid:#161828;--df-node:#14162a;--df-edge:rgba(255,255,255,.18);
  --df-glow:0 1px 0 rgba(255,255,255,.06) inset,0 24px 60px -30px rgba(0,0,0,.75);
  --df-leaves-bg:rgba(239,68,68,.13);--df-leaves-ink:#fca5a5;--df-ifnot-bg:rgba(245,158,11,.12);--df-ifnot-ink:#fcd34d;
  --df-dots:rgba(255,255,255,.035);--df-node-tint:10%;--df-node-on:18%;--df-node-shadow:none;
}
html:not([data-df-theme="light"]) .df [class^="df-k-"],html:not([data-df-theme="light"]) .df [class*=" df-k-"]{--cs:color-mix(in srgb,var(--c) 58%,white)}}
html[data-df-theme="dark"] .df{
  --df-ink:#e9ebf3;--df-ink2:#9ca3b8;--df-line:rgba(255,255,255,.09);--df-head:rgba(255,255,255,.045);
  --df-card:rgba(23,25,41,.58);--df-solid:#161828;--df-node:#14162a;--df-edge:rgba(255,255,255,.18);
  --df-glow:0 1px 0 rgba(255,255,255,.06) inset,0 24px 60px -30px rgba(0,0,0,.75);
  --df-leaves-bg:rgba(239,68,68,.13);--df-leaves-ink:#fca5a5;--df-ifnot-bg:rgba(245,158,11,.12);--df-ifnot-ink:#fcd34d;
  --df-dots:rgba(255,255,255,.035);--df-node-tint:10%;--df-node-on:18%;--df-node-shadow:none;
}
html[data-df-theme="dark"] .df [class^="df-k-"],html[data-df-theme="dark"] .df [class*=" df-k-"]{--cs:color-mix(in srgb,var(--c) 58%,white)}
.df :is(.df-svg,.df-cap,.df-item-card,.df-seg,.df-key,.df-nav button){
  background:var(--df-card);-webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%);
  border-color:var(--df-line);box-shadow:var(--df-glow)}
.df .df-svg{border-radius:10px;background:radial-gradient(var(--df-dots) 1px,transparent 1.4px) 0 0/18px 18px,linear-gradient(180deg,color-mix(in srgb,var(--df-solid) 18%,transparent),transparent 40%),var(--df-card)}
.df :is(.df-cap,.df-item-card){border-radius:10px}
.df :is(.df-seg,.df-key,.df-nav button,.df-carry){border-radius:8px}
.df .df-node rect{fill:color-mix(in srgb,var(--c) var(--df-node-tint),var(--df-node));stroke:var(--cs);filter:var(--df-node-shadow)}
.df .df-node .df-ico{stroke:var(--cs)}
.df .df-node.on rect{fill:color-mix(in srgb,var(--c) var(--df-node-on),var(--df-node));filter:drop-shadow(0 6px 14px color-mix(in srgb,var(--c) 35%,transparent))}
.df .df-edge{stroke:var(--df-edge)}
.df .df-zone{stroke:var(--df-ink2);opacity:.55}
.df .df-packet rect,.df .df-dot rect{fill:var(--df-solid)}
/* an icon's own rectangles are outlines: the box and tag fills must not cover the icon's lines (mail, table-2) */
.df .df-node .df-ico rect,.df .df-node.on .df-ico rect,.df .df-packet .df-pico rect{fill:none!important;filter:none!important;stroke:inherit!important;stroke-width:inherit!important}
.df .df-carry{background:var(--df-solid)}
.df .df-key svg{color:var(--cs,currentColor)}
.df .df-key.act{box-shadow:none;border-color:transparent}
.df .df-leaves{background:var(--df-leaves-bg);color:var(--df-leaves-ink)}
.df .df-ifnot{background:var(--df-ifnot-bg);color:var(--df-ifnot-ink)}
.df .df-seg button[aria-pressed="true"],.df .df-nav .df-next{background:var(--df-ink);color:var(--df-solid);border-color:var(--df-ink)}
.df .df-steps button[aria-current="step"]{background:var(--df-card);border-color:var(--df-line);box-shadow:var(--df-glow)}
.df{--a-ink-mix:black;--a-ink-amt:22%}
@media (prefers-color-scheme:dark){html:not([data-df-theme="light"]) .df{--a-ink-mix:white;--a-ink-amt:45%}}
html[data-df-theme="dark"] .df{--a-ink-mix:white;--a-ink-amt:45%}
.df :is(.df-act,.df-chip,.df-key.act){background:color-mix(in srgb,var(--a) 14%,transparent)!important;color:color-mix(in srgb,var(--a),var(--a-ink-mix) var(--a-ink-amt))!important;border:1px solid color-mix(in srgb,var(--a) 30%,transparent)!important;box-shadow:none}
.df .df-chip{border-radius:7px}
.df .df-act{border-radius:999px;padding:2px 9px 2px 7px}
.df .df-cap{border:1.5px solid color-mix(in srgb,var(--a) 62%,var(--df-line));background:linear-gradient(180deg,color-mix(in srgb,var(--a) 13%,transparent),color-mix(in srgb,var(--a) 4%,transparent)),var(--df-card);box-shadow:inset 4px 0 0 var(--a),0 0 0 4px color-mix(in srgb,var(--a) 10%,transparent),0 14px 36px -18px color-mix(in srgb,var(--a) 75%,transparent)}
.df .df-cap .df-text{font-size:1.2rem;font-weight:600;line-height:1.35}
.df .df-cap.df-pulse{animation:df-cap-pulse .7s ease-out}
@keyframes df-cap-pulse{0%{box-shadow:inset 4px 0 0 var(--a),0 0 0 0 color-mix(in srgb,var(--a) 55%,transparent),0 14px 36px -18px color-mix(in srgb,var(--a) 75%,transparent)}100%{box-shadow:inset 4px 0 0 var(--a),0 0 0 4px color-mix(in srgb,var(--a) 10%,transparent),0 14px 36px -18px color-mix(in srgb,var(--a) 75%,transparent)}}
@media (prefers-reduced-motion:reduce){.df .df-cap.df-pulse{animation:none}}
.df .df-steps button[aria-current="step"]{border-color:color-mix(in srgb,var(--a) 55%,var(--df-line));background:linear-gradient(90deg,color-mix(in srgb,var(--a) 14%,transparent),transparent 70%),var(--df-card);box-shadow:inset 3px 0 0 var(--a)}
.df .df-item-card{border-top:1px solid var(--df-line);box-shadow:inset 0 2px 0 color-mix(in srgb,var(--a) 70%,transparent),var(--df-glow)}
.df .df-item-h,.df .df-legend small,.df .df-count{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,monospace;letter-spacing:.08em}
`;

// The diagram as a block of markup, with its own styles and script. prefix must be unique on the page.
export function renderFragment(spec, prefix = 'df') {
  if (!ID.test(prefix)) fail(`the block id "${prefix}" must be lower-case letters, digits and hyphens`);
  const c = compile(spec);
  const usedActions = [];
  c.scenarios.forEach((s) => s.steps.forEach((st) => { if (!usedActions.includes(st.action)) usedActions.push(st.action); }));
  const usedKinds = [];
  Object.values(c.nodes).forEach((n) => { if (!usedKinds.includes(n.kind)) usedKinds.push(n.kind); });

  const markers = usedActions
    .map((a) => `<marker id="${prefix}-m-${a}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker>`)
    .join('');
  const zones = c.zones
    .map((z) => {
      const top = c.rowY[z.from] - ZONE_TOP;
      const bottom = c.rowY[z.to] + NODE_H + ZONE_BOTTOM;
      return `<rect class="df-zone" x="4" y="${num(top)}" width="${num(c.width - 8)}" height="${num(bottom - top)}" rx="4"/><text class="df-zone-l" x="14" y="${num(bottom - 8)}">${esc(z.label)}</text>`;
    })
    .join('');
  const outZone = c.outsideRegion
    ? `<rect class="df-outzone" x="${num(c.outsideRegion.x)}" y="${num(c.outsideRegion.y)}" width="${num(c.outsideRegion.w)}" height="${num(c.outsideRegion.h)}" rx="8"/>`
    : '';
  const edges = c.edges.map((e) => `<path class="df-edge" data-edge="${e.id}" d="${e.d}"${e.tag ? ` data-tag="${num(e.tag[0])},${num(e.tag[1])}"` : ''}/>`).join('');
  const nodes = Object.values(c.nodes)
    .map((n) => {
      const tcls = n.n === 3 ? 'df-t3' : 'df-t';
      return (
        `<g class="df-node df-k-${n.kind}" style="--c:${n.color};--t:${n.tint}" data-node="${n.id}" tabindex="0" role="button" aria-label="${esc(n.label)}">` +
        `<rect x="${num(n.x)}" y="${num(n.y)}" width="${num(n.w)}" height="${n.h}" rx="4"/>` +
        `<g class="df-ico" transform="translate(${num(n.cx - 11)} ${num(n.y + 10)}) scale(.9167)">${iconShapes(n.icon)}</g>` +
        `<text class="${tcls}" x="${num(n.cx)}" y="${num(n.y + 53)}" text-anchor="middle">${esc(n.label)}</text>` +
        (n.outside ? `<text class="df-out-l" x="${num(n.x + 6)}" y="${num(n.y + 17)}">OUTSIDE</text>` : '') +
        (n.sub ? `<text class="${n.n === 3 ? 'df-s3' : 'df-s'}" x="${num(n.cx)}" y="${num(n.y + 72)}" text-anchor="middle">${esc(n.sub)}</text>` : '') +
        '</g>'
      );
    })
    .join('');
  const seg = c.scenarios.length > 1
    ? `<div class="df-seg" role="group" aria-label="Scenario">${c.scenarios.map((s, k) => `<button type="button" data-s="${s.id}" aria-pressed="${k === 0}">${esc(s.label)}</button>`).join('')}</div>`
    : '';
  const partKeys = usedKinds.map((k) => `<span class="df-key df-kind">${iconSvg(KINDS[k].icon)}<span>${esc(KINDS[k].label)}</span></span>`).join('');
  const stepKeys = usedActions.map((a) => `<span class="df-key act" style="--a:${ACTIONS[a].color}">${iconSvg(ACTIONS[a].icon)}${esc(ACTIONS[a].label)}</span>`).join('');
  const runtime = fs.readFileSync(path.join(HERE, 'runtime.mjs'), 'utf8').replace(/^export /gm, '');
  const title = esc(c.title || 'Data flow');

  return `<style>${CSS}</style>
<div class="df" id="${prefix}">
  <div class="df-grid" style="--df-w:${num(c.width * 1.3)}px">
    <div>
      <div class="df-scroll"><svg class="df-svg" viewBox="0 0 ${num(c.width)} ${num(c.height)}" role="img" aria-label="${title}">
        <defs>${markers}</defs>
        ${zones}
        ${outZone}
        <g class="df-edges">${edges}</g>
        ${nodes}
        <g class="df-packets"></g>
      </svg></div>
      <p class="df-info" aria-live="polite" hidden></p>
      <details class="df-keyfold"><summary>Key: what the colours, icons and lines mean</summary>
      <p class="df-hint">Tap any box to see what it is.</p>
      <div class="df-legend"><small>Parts</small>${partKeys}</div>
      <div class="df-legend"><small>Steps</small>${stepKeys}</div>
      <div class="df-legend df-linekey"><small>Lines</small><span class="df-key df-only-steps"><svg viewBox="0 0 34 10" class="df-ln"><path d="M1 5H33" class="df-ln-all"/></svg>Bold: data goes along this line in this step</span><span class="df-key df-only-steps"><svg viewBox="0 0 34 10" class="df-ln"><path d="M1 5H33" class="df-ln-past"/></svg>Faint: used in an earlier step</span><span class="df-key df-only-all"><svg viewBox="0 0 34 10" class="df-ln"><path d="M1 5H33" class="df-ln-all"/></svg>Coloured: carries data, in the sender's colour</span><span class="df-key"><svg viewBox="0 0 34 10" class="df-ln"><path d="M1 5H33" class="df-ln-idle"/></svg>Grey: joined, no data in this view</span>${c.outsideRegion || Object.values(c.nodes).some((n) => n.outside) ? '<span class="df-key"><svg viewBox="0 0 34 14" class="df-ln"><rect x="1" y="1" width="32" height="12" rx="3" class="df-ln-out"/></svg>Red: outside your system; data sent there leaves you</span>' : ''}</div>
      </details>
    </div>
    <div>
      <div class="df-seg df-view" role="group" aria-label="View"><button type="button" data-view="steps" aria-pressed="true">Step by step</button><button type="button" data-view="all" aria-pressed="false">Everything at once</button></div>
      ${seg}
      <div class="df-nav"><button type="button" class="df-restart" title="Back to step 1 (Home key)">${iconSvg('rotate-ccw')}<span>Start over</span></button><button type="button" class="df-back" title="Previous step (left arrow key)">${iconSvg('chevron-left')}<span>Back</span></button><button type="button" class="df-play" aria-pressed="false" title="Run the steps by themselves"></button><button type="button" class="df-next" title="Next step (right arrow key)"><span>Next step</span>${iconSvg('chevron-right')}</button></div>
      <div class="df-cap" aria-live="polite"><div class="df-caphead"><span class="df-count"></span><span class="df-dots" aria-hidden="true"></span><span class="df-act"></span><span class="df-time" hidden></span></div><p class="df-text"></p><p class="df-carry" hidden></p><p class="df-leaves" hidden></p><p class="df-ifnot" hidden></p></div>
      <section class="df-item" aria-live="polite"><h4 class="df-item-h">What moves in this step</h4><div class="df-item-card"></div></section>
      <details class="df-stepfold"><summary class="df-stepfold-s">All steps</summary><ol class="df-steps"></ol></details>
      <button type="button" class="df-motion" role="switch" aria-checked="false" title="Make the tags travel along their lines"><span class="df-switch" aria-hidden="true"></span><span>Moving tags: <b class="df-motion-state">off</b></span></button>
      <section class="df-all" hidden><h4 class="df-item-h">Everything sent, line by line</h4><div class="df-all-list"></div></section>
    </div>
  </div>
  ${c.credit ? `<p class="df-credit">Made with <a href="${CREDIT.repo}" target="_blank" rel="noopener">Dataflowgram</a> by <a href="${CREDIT.site}" target="_blank" rel="noopener">Russell Miller</a> · <a href="${CREDIT.site}" target="_blank" rel="noopener">russellmiller.io</a> · <a href="${CREDIT.linkedin}" target="_blank" rel="noopener">LinkedIn</a> · Free for personal use · Companies: <a href="mailto:${CREDIT.email}?subject=Dataflowgram%20licence">${CREDIT.email}</a></p>` : ''}
</div>
<script>
(function(){
${runtime}
mount(document.getElementById(${JSON.stringify(prefix)}), ${pageData(c)}, ${JSON.stringify(prefix)});
})();
</script>
`;
}

// A whole page that holds one diagram. Light or dark follows the computer's setting; the button
// in the top right switches it, and "theme": "light" or "dark" in the description fixes the start.
// The page around one or more diagrams: fonts, theme switch, background, heading.
function pageShell({ title, intro, theme, body, extraCss = '', extraScript = '' }) {
  const start = theme === 'light' || theme === 'dark' ? ` data-df-theme="${theme}"` : '';
  return `<!doctype html>
<html lang="en"${start}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title || 'Data flow')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap">
<script>
(function(){try{var q=/[?&]theme=(light|dark)/.exec(location.search);var s=q?q[1]:localStorage.getItem('df-theme');if(s==='light'||s==='dark')document.documentElement.setAttribute('data-df-theme',s);}catch(e){}})();
</script>
<style>
*{box-sizing:border-box}
:root{--pg-wash:linear-gradient(135deg,#e4e2fb 0%,#eceff8 42%,#dff2ee 100%);--pg-bg:#eef0f7;--pg-ink:#121726;--pg-ink2:#545d72;--pg-dot:rgba(18,24,48,.085);--pg-glow1:rgba(99,102,241,.20);--pg-glow2:rgba(20,184,166,.14);--pg-line:rgba(18,24,48,.12);color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-df-theme="light"]){--pg-wash:none;--pg-bg:#0b0c16;--pg-ink:#e9ebf3;--pg-ink2:#9ca3b8;--pg-dot:rgba(255,255,255,.065);--pg-glow1:rgba(124,92,255,.24);--pg-glow2:rgba(20,184,166,.10);--pg-line:rgba(255,255,255,.16);color-scheme:dark}}
:root[data-df-theme="dark"]{--pg-wash:none;--pg-bg:#0b0c16;--pg-ink:#e9ebf3;--pg-ink2:#9ca3b8;--pg-dot:rgba(255,255,255,.065);--pg-glow1:rgba(124,92,255,.24);--pg-glow2:rgba(20,184,166,.10);--pg-line:rgba(255,255,255,.16);color-scheme:dark}
body{margin:0;min-height:100vh;color:var(--pg-ink);font-family:"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5;
  background-color:var(--pg-bg);
  background-image:radial-gradient(70% 45% at 50% -8%,var(--pg-glow1),transparent 70%),radial-gradient(45% 35% at 95% 30%,var(--pg-glow2),transparent 70%),radial-gradient(var(--pg-dot) 1px,transparent 1.4px),var(--pg-wash);
  background-size:100% 100%,100% 100%,24px 24px,100% 100%;background-repeat:no-repeat,no-repeat,repeat,no-repeat;background-attachment:fixed,fixed,fixed,fixed}
main{max-width:1720px;margin:0 auto;padding:28px clamp(16px,3vw,48px) 56px}
.pg-top{display:flex;align-items:center;justify-content:space-between;gap:16px}
.pg-kicker{display:flex;align-items:center;gap:12px;margin:0;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.82rem;letter-spacing:.14em;text-transform:uppercase;color:var(--pg-ink2)}
.pg-kicker::before{content:"";width:34px;height:1.5px;background:currentColor}
h1{font-family:"Inter",ui-sans-serif,system-ui,sans-serif;font-weight:650;font-size:clamp(2rem,4.2vw,3rem);line-height:1.08;letter-spacing:-.03em;margin:14px 0 0}
.lede{color:var(--pg-ink2);max-width:680px;margin:12px 0 28px;font-size:1.08rem}
.pg-mode{white-space:nowrap;flex:none;font:inherit;font-size:.9rem;display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;cursor:pointer;color:var(--pg-ink);
  background:color-mix(in srgb,var(--pg-bg) 60%,transparent);border:1px solid var(--pg-line);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.pg-mode svg{width:16px;height:16px}
${extraCss}</style>
</head>
<body>
<main>
<div class="pg-top"><p class="pg-kicker">Interactive data flow</p>
<button type="button" class="pg-mode" aria-label="Switch light or dark">${iconSvg('sun-moon')}<span>Light / dark</span></button></div>
<h1>${esc(title || 'Data flow')}</h1>
${intro ? `<p class="lede">${esc(intro)}</p>` : ''}
${body}
</main>
<script>
(function(){var b=document.querySelector('.pg-mode');if(!b)return;b.addEventListener('click',function(){
var r=document.documentElement;var cur=r.getAttribute('data-df-theme')||(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
var next=cur==='dark'?'light':'dark';r.setAttribute('data-df-theme',next);try{localStorage.setItem('df-theme',next);}catch(e){}});})();
${extraScript}</script>
</body>
</html>
`;
}

export function renderPage(spec) {
  const c = compile(spec);
  return pageShell({ title: c.title, intro: c.intro, theme: spec.theme, body: renderFragment(spec, 'df') });
}

// Several diagrams in one page, one tab each: a set of flows for one client or one system.
// book = { title, intro, theme, diagrams: [spec, ...] }. Each tab can be linked as #tab=<number>.
// A hidden tab is moved off screen rather than removed, so its drawing keeps its size and shape.
export function renderBook(book) {
  const specs = (book && book.diagrams) || [];
  if (specs.length === 0) fail('a book needs at least 1 diagram in "diagrams"');
  const compiled = specs.map((s) => compile(s)); // checks every diagram before any is drawn
  const tabs = compiled.map((c, k) => `<button type="button" class="pg-tab" data-tab="${k + 1}" aria-pressed="${k === 0}">${esc(c.title || `Diagram ${k + 1}`)}</button>`).join('');
  const panels = specs.map((s, k) => {
    const c = compiled[k];
    const lede = c.intro ? `<p class="pg-panel-lede">${esc(c.intro)}</p>` : '';
    return `<section class="pg-panel${k === 0 ? '' : ' pg-off'}" data-panel="${k + 1}" aria-label="${esc(c.title || '')}">${lede}${renderFragment({ ...s, credit: k === specs.length - 1 && s.credit !== false }, 'd' + (k + 1))}</section>`;
  }).join('\n');
  const extraCss = '.pg-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 22px}\n'
    + '.pg-tab{font:inherit;font-size:.95rem;padding:8px 14px;border-radius:999px;cursor:pointer;color:var(--pg-ink);background:color-mix(in srgb,var(--pg-bg) 60%,transparent);border:1px solid var(--pg-line);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}\n'
    + '.pg-tab[aria-pressed="true"]{background:var(--pg-ink);color:var(--pg-bg);border-color:var(--pg-ink)}\n'
    + '.pg-off{position:absolute;left:-20000px;top:0;width:calc(100vw - 96px);max-width:1624px;visibility:hidden}\n'
    + '.pg-panel-lede{color:var(--pg-ink2);margin:0 0 16px;max-width:760px}\n';
  const extraScript = '(function(){var bs=document.querySelectorAll(".pg-tab");function show(n){bs.forEach(function(b){b.setAttribute("aria-pressed",b.getAttribute("data-tab")===String(n)?"true":"false");});'
    + 'document.querySelectorAll(".pg-panel").forEach(function(p){p.classList.toggle("pg-off",p.getAttribute("data-panel")!==String(n));});'
    + 'try{history.replaceState(null,"","#tab="+n);}catch(e){}}'
    + 'bs.forEach(function(b){b.addEventListener("click",function(){show(b.getAttribute("data-tab"));});});'
    + 'var m=/[#&]tab=(\\d+)/.exec(location.hash||"");if(m&&document.querySelector("[data-panel=\\""+m[1]+"\\"]"))show(m[1]);})();\n';
  return pageShell({ title: book.title, intro: book.intro, theme: book.theme, body: `<nav class="pg-tabs" aria-label="Diagrams">${tabs}</nav>\n${panels}`, extraCss, extraScript });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, a, b, c] = process.argv.slice(2);
  try {
    if (cmd === 'icons') {
      const names = Object.keys(ICONS).filter((n) => n.includes((a || '').toLowerCase()));
      console.log(names.length ? names.join('\n') : `no icon name contains "${a}"`);
    } else if (cmd === 'check' && a) {
      const out = compile(JSON.parse(fs.readFileSync(a, 'utf8')));
      const steps = out.scenarios.reduce((t, s) => t + s.steps.length, 0);
      console.log(`ok: ${Object.keys(out.nodes).length} parts, ${out.edges.length} lines, ${out.scenarios.length} scenarios, ${steps} steps`);
      if (out.warnings.length) console.log(`warning: ${out.warnings.length} thing${out.warnings.length === 1 ? '' : 's'} to fix\n  ` + out.warnings.join('\n  '));
    } else if (cmd === 'book' && a && b) {
      const book = JSON.parse(fs.readFileSync(a, 'utf8'));
      const dir = path.dirname(path.resolve(a));
      // a diagram may be written in the book, or named by its file next to the book
      book.diagrams = (book.diagrams || []).map((d) => (typeof d === 'string' ? JSON.parse(fs.readFileSync(path.resolve(dir, d), 'utf8')) : d));
      fs.writeFileSync(b, renderBook(book));
      console.log(`written: ${b} (${book.diagrams.length} diagrams)`);
    } else if ((cmd === 'build' || cmd === 'fragment') && a && b) {
      const spec = JSON.parse(fs.readFileSync(a, 'utf8'));
      fs.writeFileSync(b, cmd === 'build' ? renderPage(spec) : renderFragment(spec, c || 'df'));
      console.log(`written: ${b}`);
    } else {
      console.error('usage:\n  node dataflow.mjs build <spec.json> <out.html>\n  node dataflow.mjs book <book.json> <out.html>      several diagrams, one tab each\n  node dataflow.mjs fragment <spec.json> <out.html> [block id]\n  node dataflow.mjs check <spec.json>\n  node dataflow.mjs icons <word>');
      process.exit(2);
    }
  } catch (err) {
    console.error(err instanceof SpecError || err instanceof SyntaxError ? err.message : err);
    process.exit(1);
  }
}
