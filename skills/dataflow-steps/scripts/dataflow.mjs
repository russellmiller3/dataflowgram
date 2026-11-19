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

const W = 400;
const PAD = 10;
const GAPX = 8;
const NODE_H = 86;
const ROW_GAP = 64;
const ZONE_TOP = 12;
const ZONE_BOTTOM = 24;
// The longest label and second line that fit a box, by how many boxes share the row.
const LIMITS = { 1: { label: 22, sub: 30 }, 2: { label: 19, sub: 24 }, 3: { label: 14, sub: 17 } };
const ID = /^[a-z][a-z0-9-]*$/;
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
export function compile(spec) {
  if (!spec || typeof spec !== 'object') fail('the description must be an object');
  const { rows, parts, lines = [], zones = [], scenarios } = spec;
  if (!Array.isArray(rows) || rows.length === 0) fail('"rows" must list at least 1 row of part names');
  if (!parts || typeof parts !== 'object') fail('"parts" must describe each part');
  if (!Array.isArray(scenarios) || scenarios.length === 0) fail('"scenarios" must hold at least 1 scenario');

  // ---- parts and their place
  const nodes = {};
  rows.forEach((row, r) => {
    if (!Array.isArray(row) || row.length < 1 || row.length > 3) fail(`row ${r + 1} must hold 1 to 3 parts; it holds ${Array.isArray(row) ? row.length : 0}`);
    const n = row.length;
    const w = n === 1 ? 240 : (W - 2 * PAD - (n - 1) * GAPX) / n;
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
      const x = n === 1 ? (W - w) / 2 : PAD + c * (w + GAPX);
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
      const lit = [];
      (st.flow || []).forEach((f) => {
        const m = /^([a-z][a-z0-9-]*)\s*(<>|>)\s*([a-z][a-z0-9-]*)$/.exec(String(f));
        if (!m) fail(`${where}: flow "${f}" must read "part>part" (one way) or "part<>part" (both ways)`);
        const [, a, op, b] = m;
        if (!nodes[a]) fail(`${where}: flow "${f}" names "${a}", which is not a part`);
        if (!nodes[b]) fail(`${where}: flow "${f}" names "${b}", which is not a part`);
        const edge = edges.find((e) => e.key === [a, b].sort().join('|'));
        if (!edge) fail(`${where}: no line joins "${a}" and "${b}"; add ["${a}", "${b}"] to "lines"`);
        stepEdges.push([edge.id, op === '<>' ? 'x' : edge.from === a ? 'f' : 'b']);
        [a, b].forEach((id) => { if (!lit.includes(id)) lit.push(id); });
      });
      (st.at || []).forEach((id) => {
        if (!nodes[id]) fail(`${where}: "at" names "${id}", which is not a part`);
        if (!lit.includes(id)) lit.push(id);
      });
      if (lit.length === 0) fail(`${where}: give "flow" (data that moves) or "at" (the part that works)`);
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
      return { action: st.action, text: String(st.text), edges: stepEdges, nodes: lit, carry, leaves, item, time, ifNot };
    });
    return { id: s.id, label: s.label, steps };
  });

  return { title: spec.title || '', intro: spec.intro || '', width: W, height, nodes, edges, zones: zoneList, rowY, scenarios: scns };
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
.df-grid{display:grid;grid-template-columns:minmax(0,480px) minmax(0,1fr);gap:28px;align-items:start}
.df-grid>div{min-width:0}
.df-svg{width:100%;height:auto;display:block;background:var(--df-card);border:1px solid var(--df-line);border-radius:4px}
.df-svg text{font-family:inherit;fill:var(--df-ink)}
.df-node{cursor:pointer;transition:opacity .15s}
.df-node rect{fill:var(--t);stroke:var(--c);stroke-width:1.5}
.df-node .df-ico{fill:none;stroke:var(--c);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.df-node .df-t{font-size:15px;font-weight:600}
.df-node .df-t3{font-size:13.5px;font-weight:600}
.df-node .df-s{font-size:12.5px;fill:var(--df-ink2)}
.df-node .df-s3{font-size:11.5px;fill:var(--df-ink2)}
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
.df-packet rect{fill:#fff;stroke-width:1.6}
.df-packet text{font-size:12.5px;font-weight:600;fill:var(--df-ink)}
.df-pico{fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.df-carry{display:inline-flex;align-items:center;gap:6px;margin:8px 0 0;font-size:.95rem;font-weight:600;border:1.5px solid var(--df-line);border-radius:3px;padding:3px 8px;background:#fff}
.df-carry[hidden]{display:none}
.df-carry svg{width:17px;height:17px;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.df-zone{fill:none;stroke:#8A99AD;stroke-dasharray:5 4}
.df-zone-l{font-size:12px;fill:var(--df-ink2);letter-spacing:.05em}
${Object.entries(KINDS).map(([k, v]) => `.df-k-${k}{--c:${v.color};--t:${v.tint}}`).join('\n')}
.df-info{margin-top:10px;font-size:.95rem;color:var(--df-ink2);border-top:1px dashed var(--df-line);padding-top:10px}
.df-info b{color:var(--df-ink)}
.df-legend{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;align-items:center}
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
.df-nav{display:flex;gap:8px;margin-top:10px}
.df-nav button{font:inherit;font-size:.95rem;border:1px solid var(--df-line);background:var(--df-card);border-radius:3px;padding:7px 14px;cursor:pointer;color:var(--df-ink)}
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
@media (max-width:820px){.df-grid{grid-template-columns:1fr}}
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
    .map((a) => `<marker id="${prefix}-m-${a}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${ACTIONS[a].color}"/></marker>`)
    .join('');
  const zones = c.zones
    .map((z) => {
      const top = c.rowY[z.from] - ZONE_TOP;
      const bottom = c.rowY[z.to] + NODE_H + ZONE_BOTTOM;
      return `<rect class="df-zone" x="4" y="${num(top)}" width="${W - 8}" height="${num(bottom - top)}" rx="4"/><text class="df-zone-l" x="14" y="${num(bottom - 8)}">${esc(z.label)}</text>`;
    })
    .join('');
  const edges = c.edges.map((e) => `<path class="df-edge" data-edge="${e.id}" d="${e.d}"${e.tag ? ` data-tag="${num(e.tag[0])},${num(e.tag[1])}"` : ''}/>`).join('');
  const nodes = Object.values(c.nodes)
    .map((n) => {
      const tcls = n.n === 3 ? 'df-t3' : 'df-t';
      return (
        `<g class="df-node df-k-${n.kind}" data-node="${n.id}" tabindex="0" role="button" aria-label="${esc(n.label)}">` +
        `<rect x="${num(n.x)}" y="${num(n.y)}" width="${num(n.w)}" height="${n.h}" rx="4"/>` +
        `<g class="df-ico" transform="translate(${num(n.cx - 11)} ${num(n.y + 10)}) scale(.9167)">${iconShapes(n.icon)}</g>` +
        `<text class="${tcls}" x="${num(n.cx)}" y="${num(n.y + 53)}" text-anchor="middle">${esc(n.label)}</text>` +
        (n.sub ? `<text class="${n.n === 3 ? 'df-s3' : 'df-s'}" x="${num(n.cx)}" y="${num(n.y + 72)}" text-anchor="middle">${esc(n.sub)}</text>` : '') +
        '</g>'
      );
    })
    .join('');
  const seg = c.scenarios.length > 1
    ? `<div class="df-seg" role="group" aria-label="Scenario">${c.scenarios.map((s, k) => `<button type="button" data-s="${s.id}" aria-pressed="${k === 0}">${esc(s.label)}</button>`).join('')}</div>`
    : '';
  const partKeys = usedKinds.map((k) => `<span class="df-key" style="color:${KINDS[k].color}">${iconSvg(KINDS[k].icon)}<span style="color:var(--df-ink)">${esc(KINDS[k].label)}</span></span>`).join('');
  const stepKeys = usedActions.map((a) => `<span class="df-key act" style="background:${ACTIONS[a].color}">${iconSvg(ACTIONS[a].icon)}${esc(ACTIONS[a].label)}</span>`).join('');
  const runtime = fs.readFileSync(path.join(HERE, 'runtime.mjs'), 'utf8').replace(/^export /gm, '');
  const title = esc(c.title || 'Data flow');

  return `<style>${CSS}</style>
<div class="df" id="${prefix}">
  <div class="df-grid">
    <div>
      <svg class="df-svg" viewBox="0 0 ${W} ${num(c.height)}" role="img" aria-label="${title}">
        <defs>${markers}</defs>
        ${zones}
        <g class="df-edges">${edges}</g>
        ${nodes}
        <g class="df-packets"></g>
      </svg>
      <p class="df-info" aria-live="polite">Tap any box to see what it is.</p>
      <div class="df-legend"><small>Parts</small>${partKeys}</div>
      <div class="df-legend"><small>Steps</small>${stepKeys}</div>
    </div>
    <div>
      ${seg}
      <div class="df-cap" aria-live="polite"><div class="df-caphead"><span class="df-count"></span><span class="df-act"></span><span class="df-time" hidden></span></div><p class="df-text"></p><p class="df-carry" hidden></p><p class="df-leaves" hidden></p><p class="df-ifnot" hidden></p></div>
      <div class="df-nav"><button type="button" class="df-back">Back</button><button type="button" class="df-play" aria-pressed="false"></button><button type="button" class="df-next">Next step</button></div>
      <section class="df-item" aria-live="polite"><h4 class="df-item-h">What moves in this step</h4><div class="df-item-card"></div></section>
      <ol class="df-steps"></ol>
    </div>
  </div>
</div>
<script>
(function(){
${runtime}
mount(document.getElementById(${JSON.stringify(prefix)}), ${pageData(c)}, ${JSON.stringify(prefix)});
})();
</script>
`;
}

// A whole page that holds one diagram.
export function renderPage(spec) {
  const c = compile(spec);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.title || 'Data flow')}</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#E9EFF6;color:#14233A;font-family:"Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;line-height:1.5}
main{max-width:1040px;margin:0 auto;padding:28px 16px 60px}
h1{font-size:1.7rem;line-height:1.2;margin:0}
.lede{color:#51627A;max-width:680px;margin:8px 0 20px}
</style>
</head>
<body>
<main>
<h1>${esc(c.title || 'Data flow')}</h1>
${c.intro ? `<p class="lede">${esc(c.intro)}</p>` : ''}
${renderFragment(spec, 'df')}
</main>
</body>
</html>
`;
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
    } else if ((cmd === 'build' || cmd === 'fragment') && a && b) {
      const spec = JSON.parse(fs.readFileSync(a, 'utf8'));
      fs.writeFileSync(b, cmd === 'build' ? renderPage(spec) : renderFragment(spec, c || 'df'));
      console.log(`written: ${b}`);
    } else {
      console.error('usage:\n  node dataflow.mjs build <spec.json> <out.html>\n  node dataflow.mjs fragment <spec.json> <out.html> [block id]\n  node dataflow.mjs check <spec.json>\n  node dataflow.mjs icons <word>');
      process.exit(2);
    }
  } catch (err) {
    console.error(err instanceof SpecError || err instanceof SyntaxError ? err.message : err);
    process.exit(1);
  }
}
