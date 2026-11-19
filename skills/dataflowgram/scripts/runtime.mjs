// The part of a data-flow diagram that runs in the reader's browser.
// The builder copies this file into each page it makes. The tests import it directly.

// What the diagram shows at one step. No page needed: this is plain data in, plain data out.
export function stepView(data, scenarioId, index) {
  const scn = data.scenarios.find((s) => s.id === scenarioId);
  if (!scn) throw new Error('unknown scenario: ' + scenarioId);
  const i = Math.max(0, Math.min(index, scn.steps.length - 1));
  const st = scn.steps[i];
  const edges = {};
  st.edges.forEach((pair) => { edges[pair[0]] = pair[1]; });
  // the trail: lines and parts used by earlier steps, each line in the colour of its latest action
  const trail = {};
  const trailFocus = {}; // edge id -> the focus part of the latest earlier step that used it
  const seen = [];
  scn.steps.slice(0, i).forEach((prev) => {
    prev.edges.forEach((pair) => { if (!(pair[0] in edges)) { trail[pair[0]] = prev.action; trailFocus[pair[0]] = prev.focus; } });
    prev.nodes.forEach((n) => { if (st.nodes.indexOf(n) < 0 && seen.indexOf(n) < 0) seen.push(n); });
  });
  return {
    scenario: scn.id,
    index: i,
    count: scn.steps.length,
    action: st.action,
    text: st.text,
    edges, // edge id -> 'f' (along the line), 'b' (against it) or 'x' (both ways)
    nodes: st.nodes.slice(),
    focus: st.focus, // the part that sends the data: its colour is the step's colour
    trailFocus,
    trail, // edge id -> the action of the latest earlier step that used it
    seen, // parts used by earlier steps and not by this one
    carry: st.carry || null, // what travels on the line: { label, icon }
    item: st.item || null, // a sample of the real item: { title, icon, fields, body }
    leaves: (st.leaves || []).slice(), // parts outside the owner's system that receive data
    time: st.time || '',
    ifNot: st.ifNot || '',
    first: i === 0,
    last: i === scn.steps.length - 1,
  };
}

// The first sentence of a step, for the step list.
export function shortText(text) {
  const m = /^(.*?[.?!])(\s|$)/.exec(text);
  return (m ? m[1] : text).replace(/\.$/, '');
}

// How visible a travelling tag is at time t (0 to 1) in its loop. A one-way tag fades in as it
// leaves and fades out as it arrives, so it never jumps back to the start. A tag that goes there
// and back, or one that does not move, stays fully visible.
export function tagOpacity(t, dir, stationary) {
  if (stationary || dir === 'x') return 1;
  const EDGE = 0.18;
  return Math.max(0, Math.min(1, t / EDGE, (1 - t) / EDGE));
}

// Everything a scenario sends, grouped by line: for the view that shows all of it at once, with no movement.
// Each line lists its sends in step order; the same thing sent the same way twice is listed once, with both steps.
export function overview(data, scenarioId) {
  const scn = data.scenarios.find((s) => s.id === scenarioId);
  if (!scn) throw new Error('unknown scenario: ' + scenarioId);
  const wires = [];
  const byEdge = {};
  scn.steps.forEach((st, k) => {
    (st.flows || []).forEach((f) => {
      let wire = byEdge[f.edge];
      if (!wire) { wire = byEdge[f.edge] = { edge: f.edge, sends: [] }; wires.push(wire); }
      const label = st.carry ? st.carry.label : '';
      const key = f.from + '>' + f.to + '|' + f.dir + '|' + label;
      let send = wire.sends.find((s) => s.key === key);
      if (!send) {
        send = { key, from: f.from, to: f.to, dir: f.dir, label, icon: st.carry ? st.carry.icon : '', text: st.text, steps: [] };
        wire.sends.push(send);
      }
      send.steps.push(k + 1);
    });
  });
  return wires;
}

// A line that carries data both ways is drawn as separate lanes, one per direction, so the reader sees
// which way each thing goes. Returns the lanes for one line: its direction ('f' along the line, 'b'
// against it, 'x' both ways in one step), its sends, and its distance from the middle of the line.
// Whether the picture moves. Movement is off unless the reader switches it on, and it stays off for a
// reader whose computer asks for reduced motion. (18 November 2026: "the animation is distracting to my
// ADHD brain. Make that optional, and by default just have the label there with clear arrows.")
export function moves(readerSwitchedOn, computerAsksForLess) {
  return !!readerSwitchedOn && !computerAsksForLess;
}

// The words on a still tag, with an arrow that points the way the data goes on the page.
// dir is 'f' (along the line), 'b' (against it) or 'x' (both ways); dx and dy run from the line's start to its end.
export function arrowLabel(label, dir, dx, dy) {
  const flat = Math.abs(dx) > Math.abs(dy);
  if (dir === 'x') return label + (flat ? ' \u2194' : ' \u2195');
  const sign = (flat ? dx : dy) * (dir === 'b' ? -1 : 1);
  if (flat) return sign >= 0 ? label + ' \u2192' : '\u2190 ' + label;
  return label + (sign >= 0 ? ' \u2193' : ' \u2191');
}

// The words on a tag's number badge: the step, or the steps, that send this item.
export function stepBadge(steps) {
  const list = (steps || []).filter((n) => Number.isFinite(n));
  if (list.length === 0) return '';
  if (list.length <= 2) return list.join(', ');
  return list.slice(0, 2).join(', ') + ' +' + (list.length - 2);
}

export function lanesOf(sends) {
  const dirs = ['f', 'x', 'b'].filter((d) => sends.some((s) => s.dir === d));
  const GAP = 34;
  return dirs.map((d, k) => ({ dir: d, sends: sends.filter((s) => s.dir === d), offset: (k - (dirs.length - 1) / 2) * GAP }));
}

// Picks a place for a still tag so that it covers no tag placed before it. 'spots' are the candidate
// centres in order of preference; 'placed' holds the boxes already taken. Returns the first free spot,
// or the first spot when none is free.
export function freeSpot(spots, width, height, placed) {
  const PAD = 4;
  const hits = (s) => placed.some((b) => Math.abs(s.x - b.x) < (width + b.w) / 2 + PAD && Math.abs(s.y - b.y) < (height + b.h) / 2 + PAD);
  const pick = spots.find((s) => !hits(s)) || spots[0];
  placed.push({ x: pick.x, y: pick.y, w: width, h: height });
  return pick;
}

// Where the travelling dot sits on its line, 0 (start) to 1 (end), at time t (0 to 1).
// Forward lines run start to end, reply lines end to start, two-way lines go out and come back.
export function dotPosition(t, dir) {
  if (dir === 'b') return 1 - t;
  if (dir === 'x') return t < 0.5 ? t * 2 : 2 - t * 2;
  return t;
}

// The dot fades in at the start of each trip and out at the end, so it never pops.
// A tag exists to show data moving, so it rides its line. It stands still beside the line only
// when the line is far shorter than the tag (3 boxes in one row with a long tag).
export function tagRides(lineLength, tagWidth) {
  return lineLength >= tagWidth * 0.6;
}

// The width of a tag, from its words, when the page cannot measure the text.
export function tagWidth(label) {
  return label.length * 7.7 + 34;
}

export function dotOpacity(t, dir) {
  if (dir === 'x') return 1;
  const EDGE = 0.15;
  return Math.max(0, Math.min(1, t / EDGE, (1 - t) / EDGE));
}

// Reads a link to one step: "#<diagram id>=<scenario id>.<step number>".
export function readLink(hash, prefix, data) {
  const m = new RegExp('[#&]' + prefix + '=([a-z][a-z0-9-]*)\\.(\\d+)').exec(hash || '');
  if (!m) return null;
  const scn = data.scenarios.find((s) => s.id === m[1]);
  if (!scn) return null;
  return { scenario: scn.id, index: Math.max(0, Math.min(Number(m[2]) - 1, scn.steps.length - 1)) };
}

// Wires one diagram on the page. root is the element the builder wrote.
export function mount(root, data, prefix) {
  const q = (s) => root.querySelector(s);
  const qa = (s) => [].slice.call(root.querySelectorAll(s));
  let cur = data.scenarios[0].id;
  let i = 0;
  const link = readLink(window.location.hash, prefix, data);
  if (link) { cur = link.scenario; i = link.index; }
  const list = q('.df-steps');
  const back = q('.df-back');
  const restart = q('.df-restart');
  const next = q('.df-next');
  const play = q('.df-play');
  const info = q('.df-info');
  const card = q('.df-item-card');
  const edgeLayer = q('.df-edges');
  const packetLayer = q('.df-packets');
  const svg = q('.df-svg');
  const NS = 'http://www.w3.org/2000/svg';
  const asksForLess = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let motionOn = false; // the reader's choice; kept for the next visit where the browser allows it
  try { motionOn = window.localStorage.getItem('df-motion') === 'on'; } catch (e) { motionOn = false; }
  const quiet = () => !moves(motionOn, asksForLess);
  let packets = [];
  let timer = null;

  // A tag that rides along a line: an icon and a few words, in the step's colour.
  function makePacket(path, dir, carry, color, badge) {
    // badge: the step number(s) this item moves in, drawn as a filled pill at the tag's left end
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'df-packet');
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('rx', '3');
    rect.setAttribute('height', '26');
    rect.setAttribute('y', '-13');
    rect.style.stroke = color;
    const icon = document.createElementNS(NS, 'g');
    icon.setAttribute('class', 'df-pico');
    icon.innerHTML = carry.icon;
    icon.style.stroke = color;
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('y', '4.4');
    text.textContent = carry.label;
    g.appendChild(rect);
    let pill = null;
    let pillText = null;
    if (badge) {
      pill = document.createElementNS(NS, 'rect');
      pill.setAttribute('class', 'df-badge');
      pill.setAttribute('rx', '9');
      pill.setAttribute('height', '18');
      pill.setAttribute('y', '-9');
      pill.style.fill = color;
      pillText = document.createElementNS(NS, 'text');
      pillText.setAttribute('class', 'df-badge-t');
      pillText.setAttribute('y', '4.6');
      pillText.setAttribute('text-anchor', 'middle');
      pillText.textContent = badge;
      g.appendChild(pill);
      g.appendChild(pillText);
    }
    g.appendChild(icon);
    g.appendChild(text);
    packetLayer.appendChild(g);
    let tw = 0;
    try { tw = text.getComputedTextLength(); } catch (e) { tw = 0; }
    let bw = 0;
    if (badge) {
      try { bw = pillText.getComputedTextLength(); } catch (e) { bw = 0; }
      bw = Math.max(18, (bw || badge.length * 7.4) + 10);
    }
    const lead = badge ? bw + 6 : 0; // room the badge takes at the left
    const w = (tw ? tw + 34 : tagWidth(carry.label)) + lead; // the panel is hidden, so measure by count
    rect.setAttribute('x', String(-w / 2));
    rect.setAttribute('width', String(w));
    if (badge) {
      pill.setAttribute('x', String(-w / 2 + 4));
      pill.setAttribute('width', String(bw));
      pillText.setAttribute('x', String(-w / 2 + 4 + bw / 2));
    }
    icon.setAttribute('transform', 'translate(' + (-w / 2 + 7 + lead) + ' -7) scale(.5833)');
    text.setAttribute('x', String(-w / 2 + 26 + lead));
    const tag = path.getAttribute('data-tag');
    const len0 = path.getTotalLength();
    // The tag rides its line. Only when the line is far shorter than the tag does it sit beside the line instead.
    const fixed = tag && !tagRides(len0, w) ? tag.split(',').map(Number) : null;
    return { g, path, dir, w, len: path.getTotalLength(), fixed };
  }

  function place(pk, t) {
    let f = t;
    if (pk.dir === 'b') f = 1 - t;
    if (pk.dir === 'x') f = t < 0.5 ? t * 2 : 2 - t * 2;
    if (quiet()) f = 0.5;
    const pt = pk.fixed ? { x: pk.fixed[0], y: pk.fixed[1] } : pk.path.getPointAtLength(pk.len * (0.12 + 0.76 * f));
    const vb = svg.viewBox.baseVal;
    const x = Math.max(pk.w / 2 + 2, Math.min(vb.width - pk.w / 2 - 2, pt.x));
    pk.g.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
    pk.g.style.opacity = String(tagOpacity(t, pk.dir, !!pk.fixed || quiet()));
  }

  // A glowing dot that travels the whole lit line, so the direction of travel is plain even on a short line.
  let dots = [];
  function makeDot(path, dir, color, carry) {
    // The thing that travels: the item's own icon in a small chip, so the reader sees the data
    // itself go from one box to the next. A step with no item shows a plain dot.
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'df-dot');
    g.style.color = color;
    if (carry) {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', '-15'); r.setAttribute('y', '-15');
      r.setAttribute('width', '30'); r.setAttribute('height', '30'); r.setAttribute('rx', '8');
      r.style.stroke = color;
      const icon = document.createElementNS(NS, 'g');
      icon.setAttribute('class', 'df-pico');
      icon.setAttribute('transform', 'translate(-9 -9) scale(.75)');
      icon.innerHTML = carry.icon;
      icon.style.stroke = color;
      g.appendChild(r);
      g.appendChild(icon);
    } else {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', '6');
      c.style.fill = color;
      g.appendChild(c);
    }
    packetLayer.appendChild(g);
    return { g, path, dir, len: path.getTotalLength() };
  }
  function placeDot(d, t) {
    const pt = d.path.getPointAtLength(d.len * dotPosition(t, d.dir));
    d.g.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
    d.g.style.opacity = quiet() ? '0' : String(dotOpacity(t, d.dir));
  }

  function tick(now) {
    const t = (now % 2200) / 2200;
    packets.forEach((pk) => place(pk, t));
    const td = (now % 1800) / 1800;
    dots.forEach((d) => placeDot(d, td));
    window.requestAnimationFrame(tick);
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // The side panel: a sample of the real item that moves in this step.
  function showItem(v, color) {
    card.innerHTML = '';
    card.style.setProperty('--a', v.item ? color : 'transparent');
    card.classList.toggle('empty', !v.item);
    if (!v.item) {
      card.textContent = v.carry ? v.carry.label : 'No item moves in this step.';
      return;
    }
    const head = el('div', 'df-item-title');
    const ico = document.createElementNS(NS, 'svg');
    ico.setAttribute('viewBox', '0 0 24 24');
    ico.setAttribute('fill', 'none');
    ico.setAttribute('stroke-width', '2');
    ico.setAttribute('stroke-linecap', 'round');
    ico.setAttribute('stroke-linejoin', 'round');
    ico.setAttribute('aria-hidden', 'true');
    ico.style.stroke = color;
    ico.innerHTML = v.item.icon;
    head.appendChild(ico);
    head.appendChild(el('span', '', v.item.title));
    card.appendChild(head);
    if (v.item.fields.length) {
      const dl = el('dl', 'df-item-fields');
      v.item.fields.forEach((pair) => {
        dl.appendChild(el('dt', '', pair[0]));
        dl.appendChild(el('dd', '', pair[1]));
      });
      card.appendChild(dl);
    }
    if (v.item.body) card.appendChild(el('pre', 'df-item-body', v.item.body));
  }

  function setNote(sel, show, icon, text) {
    const p = q(sel);
    p.hidden = !show;
    if (!show) return;
    p.innerHTML = icon + '<span></span>';
    p.lastChild.textContent = text;
  }

  let view = 'steps'; // 'steps' (one step at a time, moving) or 'all' (everything at once, still)
  const allBox = q('.df-all');
  const allList = q('.df-all-list');
  function toneOfNode(id, fallback) {
    const g = id ? q('[data-node="' + id + '"]') : null;
    const c = g ? window.getComputedStyle(g).getPropertyValue('--cs').trim() : '';
    return c || fallback;
  }

  // The whole scenario at once: every used line lit, every thing it carries named on it, nothing moving.
  function drawAll() {
    const wires = overview(data, cur);
    const anyAction = Object.keys(data.actions)[0];
    const marker = 'url(#' + prefix + '-m-' + anyAction + ')';
    packetLayer.innerHTML = '';
    packets = [];
    dots = [];
    allList.innerHTML = '';
    root.classList.remove('df-pick');
    qa('.df-hot').forEach((h) => h.classList.remove('df-hot'));
    qa('.df-lane').forEach((l) => l.remove());
    qa('.df-edge').forEach((p) => {
      p.classList.remove('on', 'fwd', 'rev', 'trail');
      p.style.stroke = '';
      p.style.visibility = '';
      p.removeAttribute('marker-end');
      p.removeAttribute('marker-start');
    });
    const used = {};
    const placedTags = [];
    // the boxes are taken too: a still tag must not cover a box's words
    qa('.df-node').forEach((g) => {
      const r = g.querySelector('rect');
      if (!r) return;
      const w = Number(r.getAttribute('width'));
      const h = Number(r.getAttribute('height'));
      placedTags.push({ x: Number(r.getAttribute('x')) + w / 2, y: Number(r.getAttribute('y')) + h / 2, w, h: h - 8 });
    });
    const vb = svg.viewBox.baseVal;
    wires.forEach((wire) => {
      const p = q('[data-edge="' + wire.edge + '"]');
      const len = p.getTotalLength();
      const start = p.getPointAtLength(0);
      const end = p.getPointAtLength(len);
      const flat = Math.abs(end.x - start.x) > Math.abs(end.y - start.y); // a line between 2 boxes in one row
      const lanes = lanesOf(wire.sends);
      if (lanes.length > 1) p.style.visibility = 'hidden'; // its lanes are drawn in its place
      lanes.forEach((lane) => {
        const ox = flat ? 0 : lane.offset;
        const oy = flat ? lane.offset : 0;
        let line = p;
        if (lanes.length > 1) {
          line = p.cloneNode(false);
          line.removeAttribute('data-edge');
          line.removeAttribute('data-tag');
          line.setAttribute('class', 'df-edge df-lane');
          line.style.visibility = '';
          line.setAttribute('transform', 'translate(' + ox + ' ' + oy + ')');
        }
        line.classList.add('on');
        line.style.stroke = toneOfNode(lane.sends[0].from, '');
        if (lane.dir !== 'b') line.setAttribute('marker-end', marker);
        if (lane.dir !== 'f') line.setAttribute('marker-start', marker);
        edgeLayer.appendChild(line);
        lane.sends.forEach((s) => { s.line = line; });
        const named = lane.sends.filter((s) => s.label);
        named.forEach((s, j) => {
          // the tag itself says which way it goes, because a wide tag can cover its line's arrowhead
          const pk = makePacket(p, 'f', { label: arrowLabel(s.label, lane.dir, end.x - start.x, end.y - start.y), icon: s.icon }, toneOfNode(s.from, ''), stepBadge(s.steps));
          // candidate places: on its own lane first, then a little off it
          const spots = [];
          const stack = (j - (named.length - 1) / 2) * 30; // tags that share a lane start stacked around its middle
          const along = flat ? [stack, 0, -15, 15, -30, 30] : [stack, 0, -15, 15, -30, 30, -45, 45];
          along.forEach((d) => {
            [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8].forEach((f) => {
              const pt = p.getPointAtLength(len * f);
              // on an upright line the tag sits beside its lane, on the outer side, so 2 lanes never share words
              const side = !flat && lanes.length > 1 && lane.offset !== 0 ? Math.sign(lane.offset) * (pk.w / 2 - 12) : 0;
              const x = pt.x + ox + side;
              spots.push({ x: Math.max(pk.w / 2 + 2, Math.min(vb.width - pk.w / 2 - 2, x)), y: pt.y + oy + d });
            });
          });
          // last resort on a crowded upright line: slide the tag sideways, outward first, until it is clear
          if (!flat) {
            const out = Math.sign(lane.offset) || 1;
            const mid = p.getPointAtLength(len * 0.5);
            [stack, 0, -15, 15].forEach((d) => {
              [30, 60, 90, 120, 160, 200, -30, -60, -90, -120, -160, -200].forEach((dx) => {
                const x = mid.x + ox + out * dx;
                spots.push({ x: Math.max(pk.w / 2 + 2, Math.min(vb.width - pk.w / 2 - 2, x)), y: mid.y + oy + d });
              });
            });
          }
          const at = freeSpot(spots, pk.w, 26, placedTags);
          pk.g.setAttribute('transform', 'translate(' + at.x.toFixed(1) + ' ' + at.y.toFixed(1) + ')');
          pk.g.style.opacity = '1';
          s.tag = pk.g;
        });
      });
      wire.sends.forEach((s) => {
        used[s.from] = true;
        used[s.to] = true;
        const row = el('div', 'df-all-row');
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-pressed', 'false');
        const pick = () => {
          const was = row.getAttribute('aria-pressed') === 'true';
          qa('.df-hot').forEach((h) => h.classList.remove('df-hot'));
          qa('.df-all-row').forEach((r) => r.setAttribute('aria-pressed', 'false'));
          root.classList.toggle('df-pick', !was);
          if (was) return; // a second press on the same row shows everything again
          row.setAttribute('aria-pressed', 'true');
          if (s.line) s.line.classList.add('df-hot');
          if (s.tag) s.tag.classList.add('df-hot');
          [s.from, s.to].forEach((id) => { const g = q('[data-node="' + id + '"]'); if (g) g.classList.add('df-hot'); });
        };
        row.addEventListener('click', pick);
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        row.style.setProperty('--a', toneOfNode(s.from, 'currentColor'));
        const who = el('div', 'df-all-who');
        who.appendChild(document.createTextNode(data.nodes[s.from].label));
        who.appendChild(el('span', '', s.dir === 'x' ? '\u2194' : '\u2192'));
        who.appendChild(document.createTextNode(data.nodes[s.to].label));
        const what = el('div', 'df-all-what');
        if (s.label) {
          const chip = el('span', 'df-all-chip');
          chip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"></svg><span></span>';
          chip.firstChild.innerHTML = s.icon;
          chip.lastChild.textContent = s.label;
          what.appendChild(chip);
        } else {
          what.appendChild(el('span', '', shortText(s.text)));
        }
        what.appendChild(el('span', 'df-all-step', (s.steps.length > 1 ? 'steps ' : 'step ') + s.steps.join(', ')));
        row.appendChild(who);
        row.appendChild(what);
        allList.appendChild(row);
      });
    });
    qa('.df-node').forEach((g) => {
      const on = !!used[g.getAttribute('data-node')];
      g.classList.toggle('on', false);
      g.classList.toggle('seen', false);
      g.classList.toggle('dim', !on);
    });
  }

  function setView(name) {
    view = name === 'all' ? 'all' : 'steps';
    if (view === 'all') stop();
    root.classList.toggle('df-allview', view === 'all');
    allBox.hidden = view !== 'all';
    qa('.df-view button').forEach((b) => b.setAttribute('aria-pressed', b.getAttribute('data-view') === view ? 'true' : 'false'));
    draw();
  }

  function draw() {
    if (view === 'all') { drawAll(); return; }
    const v = stepView(data, cur, i);
    i = v.index; // a press past the last step stays on the last step
    const act = data.actions[v.action];
    // One colour per step: the colour of the part that sends the data. The line, the dot,
    // the tag, the step card and the list row all take it, so the eye links them at once.
    const toneOf = (id) => {
      const g = id ? q('[data-node="' + id + '"]') : null;
      const c = g ? window.getComputedStyle(g).getPropertyValue('--cs').trim() : '';
      return c || act.color;
    };
    const tone = toneOf(v.focus);
    packetLayer.innerHTML = '';
    packets = [];
    dots = [];
    root.classList.remove('df-pick');
    qa('.df-hot').forEach((h) => h.classList.remove('df-hot'));
    qa('.df-lane').forEach((l) => l.remove());
    qa('.df-edge').forEach((p) => {
      p.classList.remove('on', 'fwd', 'rev', 'trail');
      p.style.stroke = '';
      p.style.visibility = '';
      p.removeAttribute('marker-end');
      p.removeAttribute('marker-start');
    });
    Object.keys(v.trail).forEach((id) => {
      const p = q('[data-edge="' + id + '"]');
      p.classList.add('trail');
      p.style.stroke = toneOf(v.trailFocus[id]);
    });
    Object.keys(v.edges).forEach((id) => {
      const p = q('[data-edge="' + id + '"]');
      const dir = v.edges[id];
      const marker = 'url(#' + prefix + '-m-' + v.action + ')';
      p.classList.add('on');
      p.style.stroke = tone;
      if (dir !== 'b') p.setAttribute('marker-end', marker);
      if (dir !== 'f') p.setAttribute('marker-start', marker);
      if (!quiet() && dir === 'f') p.classList.add('fwd');
      if (!quiet() && dir === 'b') p.classList.add('rev');
      edgeLayer.appendChild(p); // the moving line is drawn above the idle lines
      if (v.carry) {
        // with movement off, the tag stands on its line and carries an arrow for the direction
        let carry = v.carry;
        if (quiet()) {
          const a = p.getPointAtLength(0);
          const b = p.getPointAtLength(p.getTotalLength());
          carry = { label: arrowLabel(v.carry.label, dir, b.x - a.x, b.y - a.y), icon: v.carry.icon };
        }
        packets.push(makePacket(p, dir, carry, tone, String(v.index + 1)));
      }
      const riding = v.carry && !packets[packets.length - 1].fixed; // a tag that travels the line already shows the movement
      if (!riding) dots.push(makeDot(p, dir, tone, null));
    });
    packets.forEach((pk) => place(pk, 0.5));
    dots.forEach((d) => placeDot(d, 0.5));
    qa('.df-node').forEach((g) => {
      const id = g.getAttribute('data-node');
      const on = v.nodes.indexOf(id) >= 0;
      const seen = v.seen.indexOf(id) >= 0;
      g.classList.toggle('on', on);
      g.classList.toggle('seen', !on && seen);
      g.classList.toggle('dim', !on && !seen);
    });
    q('.df-count').textContent = 'Step ' + (v.index + 1) + ' of ' + v.count;
    const dotsBox = q('.df-dots');
    if (dotsBox) {
      dotsBox.innerHTML = '';
      for (let k = 0; k < v.count; k++) {
        const d = document.createElement('i');
        if (k < v.index) d.className = 'done';
        if (k === v.index) d.className = 'now';
        dotsBox.appendChild(d);
      }
    }
    const badge = q('.df-act');
    badge.innerHTML = act.icon + '<span></span>';
    badge.lastChild.textContent = act.label;
    badge.style.setProperty('--a', act.color);
    setNote('.df-time', !!v.time, data.ui.clock, v.time);
    const capBox = q('.df-cap');
    capBox.style.setProperty('--a', tone);
    capBox.classList.remove('df-pulse');
    void capBox.offsetWidth; // restart the pulse so each step change draws the eye
    if (!quiet()) capBox.classList.add('df-pulse');
    const chip = q('.df-carry');
    if (v.carry) {
      chip.hidden = false;
      chip.style.borderColor = tone;
      chip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"></svg><span></span>';
      chip.firstChild.innerHTML = v.carry.icon;
      chip.firstChild.style.stroke = tone;
      chip.lastChild.textContent = 'Carries: ' + v.carry.label;
    } else {
      chip.hidden = true;
    }
    setNote('.df-leaves', v.leaves.length > 0, data.ui.out, 'Leaves your system: sent to ' + v.leaves.join(' and ') + '.');
    setNote('.df-ifnot', !!v.ifNot, data.ui.branch, 'If not: ' + v.ifNot);
    q('.df-text').textContent = v.text;
    showItem(v, tone);
    back.disabled = v.first;
    if (restart) restart.disabled = v.first;
    next.disabled = v.last;
    qa('.df-steps button').forEach((b, k) => {
      if (k === v.index) { b.setAttribute('aria-current', 'step'); b.style.setProperty('--a', tone); }
      else b.removeAttribute('aria-current');
      b.classList.toggle('done', k < v.index);
    });
    root.setAttribute('data-scenario', v.scenario);
    root.setAttribute('data-step', String(v.index + 1));
    root.setAttribute('data-action', v.action);
    if (timer && v.last) stop();
  }

  function setPlayLabel(on) {
    play.innerHTML = (on ? data.ui.pause : data.ui.play) + '<span></span>';
    play.lastChild.textContent = on ? 'Pause' : 'Play';
    play.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function stop() {
    if (timer) window.clearInterval(timer);
    timer = null;
    setPlayLabel(false);
  }
  function start() {
    const scn = data.scenarios.find((s) => s.id === cur);
    if (i >= scn.steps.length - 1) i = 0; // at the end, Play starts again from step 1
    draw();
    setPlayLabel(true);
    timer = window.setInterval(() => { i += 1; draw(); }, 2600);
  }

  function build() {
    list.innerHTML = '';
    const scn = data.scenarios.find((s) => s.id === cur);
    const foldLabel = q('.df-stepfold-s');
    if (foldLabel) foldLabel.textContent = 'All ' + scn.steps.length + ' steps';
    scn.steps.forEach((st, k) => {
      const act = data.actions[st.action];
      const li = document.createElement('li');
      const b = document.createElement('button');
      const chip = document.createElement('span');
      const num = document.createElement('span');
      const txt = document.createElement('span');
      chip.className = 'df-chip';
      chip.style.setProperty('--a', act.color);
      chip.innerHTML = act.icon;
      chip.setAttribute('title', act.label);
      num.className = 'df-num';
      num.textContent = String(k + 1);
      txt.textContent = shortText(st.text);
      b.type = 'button';
      b.appendChild(chip);
      b.appendChild(num);
      b.appendChild(txt);
      b.addEventListener('click', () => { stop(); i = k; draw(); });
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  qa('.df-seg:not(.df-view) button').forEach((b) => {
    b.setAttribute('aria-pressed', b.getAttribute('data-s') === cur ? 'true' : 'false');
    b.addEventListener('click', () => {
      stop();
      cur = b.getAttribute('data-s');
      i = 0;
      qa('.df-seg:not(.df-view) button').forEach((o) => o.setAttribute('aria-pressed', o === b ? 'true' : 'false'));
      build();
      draw();
    });
  });
  qa('.df-view button').forEach((b) => b.addEventListener('click', () => setView(b.getAttribute('data-view'))));
  const motionBtn = q('.df-motion');
  const showMotion = () => {
    motionBtn.setAttribute('aria-checked', motionOn ? 'true' : 'false');
    const state = motionBtn.querySelector('.df-motion-state');
    if (state) state.textContent = motionOn ? 'on' : 'off';
    motionBtn.hidden = asksForLess; // nothing to switch when the computer asks for no movement
  };
  motionBtn.addEventListener('click', () => {
    motionOn = !motionOn;
    try { window.localStorage.setItem('df-motion', motionOn ? 'on' : 'off'); } catch (e) { /* the choice lasts for this visit only */ }
    showMotion();
    draw();
  });
  showMotion();
  if (new RegExp('[#&]' + prefix + '=all\\b').test(window.location.hash || '')) setView('all');
  back.addEventListener('click', () => { stop(); if (i > 0) { i -= 1; draw(); } });
  if (restart) restart.addEventListener('click', () => { stop(); i = 0; draw(); });
  next.addEventListener('click', () => { stop(); i += 1; draw(); });
  play.addEventListener('click', () => { if (timer) stop(); else start(); });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { stop(); i += 1; draw(); }
    if (e.key === 'ArrowLeft' && i > 0) { stop(); i -= 1; draw(); }
    if (e.key === 'Home') { stop(); i = 0; draw(); }
  });
  qa('.df-node').forEach((g) => {
    function pick() {
      const n = data.nodes[g.getAttribute('data-node')];
      info.hidden = false;
      info.innerHTML = '';
      const b = document.createElement('b');
      b.textContent = n.label + '. ';
      info.appendChild(b);
      info.appendChild(document.createTextNode(n.info || 'No note for this part.'));
      qa('.df-node').forEach((o) => o.classList.toggle('picked', o === g));
    }
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
    });
  });
  setPlayLabel(false);
  build();
  draw();
  window.requestAnimationFrame(tick);
  if (window.MutationObserver) new MutationObserver(() => draw()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-df-theme'] });
}
