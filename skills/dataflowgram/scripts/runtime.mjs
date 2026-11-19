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
  const seen = [];
  scn.steps.slice(0, i).forEach((prev) => {
    prev.edges.forEach((pair) => { if (!(pair[0] in edges)) trail[pair[0]] = prev.action; });
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
  const next = q('.df-next');
  const play = q('.df-play');
  const info = q('.df-info');
  const card = q('.df-item-card');
  const edgeLayer = q('.df-edges');
  const packetLayer = q('.df-packets');
  const svg = q('.df-svg');
  const NS = 'http://www.w3.org/2000/svg';
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let packets = [];
  let timer = null;

  // A tag that rides along a line: an icon and a few words, in the step's colour.
  function makePacket(path, dir, carry, color) {
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
    g.appendChild(icon);
    g.appendChild(text);
    packetLayer.appendChild(g);
    let tw = 0;
    try { tw = text.getComputedTextLength(); } catch (e) { tw = 0; }
    if (!tw) tw = carry.label.length * 6.9; // the panel is hidden, so measure by count
    const w = tw + 34;
    rect.setAttribute('x', String(-w / 2));
    rect.setAttribute('width', String(w));
    icon.setAttribute('transform', 'translate(' + (-w / 2 + 7) + ' -7) scale(.5833)');
    text.setAttribute('x', String(-w / 2 + 26));
    const tag = path.getAttribute('data-tag');
    const fixed = tag ? tag.split(',').map(Number) : null;
    return { g, path, dir, w, len: path.getTotalLength(), fixed };
  }

  function place(pk, t) {
    let f = t;
    if (pk.dir === 'b') f = 1 - t;
    if (pk.dir === 'x') f = t < 0.5 ? t * 2 : 2 - t * 2;
    if (still) f = 0.5;
    const pt = pk.fixed ? { x: pk.fixed[0], y: pk.fixed[1] } : pk.path.getPointAtLength(pk.len * (0.12 + 0.76 * f));
    const vb = svg.viewBox.baseVal;
    const x = Math.max(pk.w / 2 + 2, Math.min(vb.width - pk.w / 2 - 2, pt.x));
    pk.g.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
    pk.g.style.opacity = String(tagOpacity(t, pk.dir, !!pk.fixed || still));
  }

  function tick(now) {
    const t = (now % 2200) / 2200;
    packets.forEach((pk) => place(pk, t));
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
    card.style.borderTopColor = v.item ? color : '';
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

  function draw() {
    const v = stepView(data, cur, i);
    i = v.index; // a press past the last step stays on the last step
    const act = data.actions[v.action];
    packetLayer.innerHTML = '';
    packets = [];
    qa('.df-edge').forEach((p) => {
      p.classList.remove('on', 'fwd', 'rev', 'trail');
      p.style.stroke = '';
      p.removeAttribute('marker-end');
      p.removeAttribute('marker-start');
    });
    Object.keys(v.trail).forEach((id) => {
      const p = q('[data-edge="' + id + '"]');
      p.classList.add('trail');
      p.style.stroke = data.actions[v.trail[id]].color;
    });
    Object.keys(v.edges).forEach((id) => {
      const p = q('[data-edge="' + id + '"]');
      const dir = v.edges[id];
      const marker = 'url(#' + prefix + '-m-' + v.action + ')';
      p.classList.add('on');
      p.style.stroke = act.color;
      if (dir !== 'b') p.setAttribute('marker-end', marker);
      if (dir !== 'f') p.setAttribute('marker-start', marker);
      if (dir === 'f') p.classList.add('fwd');
      if (dir === 'b') p.classList.add('rev');
      edgeLayer.appendChild(p); // the moving line is drawn above the idle lines
      if (v.carry) packets.push(makePacket(p, dir, v.carry, act.color));
    });
    packets.forEach((pk) => place(pk, 0.5));
    qa('.df-node').forEach((g) => {
      const id = g.getAttribute('data-node');
      const on = v.nodes.indexOf(id) >= 0;
      const seen = v.seen.indexOf(id) >= 0;
      g.classList.toggle('on', on);
      g.classList.toggle('seen', !on && seen);
      g.classList.toggle('dim', !on && !seen);
    });
    q('.df-count').textContent = 'Step ' + (v.index + 1) + ' of ' + v.count;
    const badge = q('.df-act');
    badge.innerHTML = act.icon + '<span></span>';
    badge.lastChild.textContent = act.label;
    badge.style.background = act.color;
    setNote('.df-time', !!v.time, data.ui.clock, v.time);
    q('.df-cap').style.borderLeftColor = act.color;
    const chip = q('.df-carry');
    if (v.carry) {
      chip.hidden = false;
      chip.style.borderColor = act.color;
      chip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"></svg><span></span>';
      chip.firstChild.innerHTML = v.carry.icon;
      chip.firstChild.style.stroke = act.color;
      chip.lastChild.textContent = 'Carries: ' + v.carry.label;
    } else {
      chip.hidden = true;
    }
    setNote('.df-leaves', v.leaves.length > 0, data.ui.out, 'Leaves your system: sent to ' + v.leaves.join(' and ') + '.');
    setNote('.df-ifnot', !!v.ifNot, data.ui.branch, 'If not: ' + v.ifNot);
    q('.df-text').textContent = v.text;
    showItem(v, act.color);
    back.disabled = v.first;
    next.disabled = v.last;
    qa('.df-steps button').forEach((b, k) => {
      if (k === v.index) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
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
    scn.steps.forEach((st, k) => {
      const act = data.actions[st.action];
      const li = document.createElement('li');
      const b = document.createElement('button');
      const chip = document.createElement('span');
      const num = document.createElement('span');
      const txt = document.createElement('span');
      chip.className = 'df-chip';
      chip.style.background = act.color;
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

  qa('.df-seg button').forEach((b) => {
    b.setAttribute('aria-pressed', b.getAttribute('data-s') === cur ? 'true' : 'false');
    b.addEventListener('click', () => {
      stop();
      cur = b.getAttribute('data-s');
      i = 0;
      qa('.df-seg button').forEach((o) => o.setAttribute('aria-pressed', o === b ? 'true' : 'false'));
      build();
      draw();
    });
  });
  back.addEventListener('click', () => { stop(); if (i > 0) { i -= 1; draw(); } });
  next.addEventListener('click', () => { stop(); i += 1; draw(); });
  play.addEventListener('click', () => { if (timer) stop(); else start(); });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { stop(); i += 1; draw(); }
    if (e.key === 'ArrowLeft' && i > 0) { stop(); i -= 1; draw(); }
  });
  qa('.df-node').forEach((g) => {
    function pick() {
      const n = data.nodes[g.getAttribute('data-node')];
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
}
