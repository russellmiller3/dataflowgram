// Lets a reader mark up the page itself: arrows, circles, boxes, typed notes and pen marks, drawn straight on top of
// any tab. "Save a copy with my notes" downloads the same page with the marks inside it, to email back.
// No outside library: marks sit in a clear layer over each tab, stored as fractions of that tab's size.
(function () {
  var holder = document.getElementById('df-marks');
  // each saved copy carries its own name, so a copy someone sends back never shows this browser's marks for the original
  var copyId = '';
  try { copyId = (JSON.parse(holder ? holder.textContent : '{}') || {}).copy || ''; } catch (e) { copyId = ''; }
  var KEY = 'df-marks:' + document.title + (copyId ? ':' + copyId : '');
  var NS = 'http://www.w3.org/2000/svg';
  var KINDS = [['arrow', 'Arrow'], ['ellipse', 'Circle'], ['rect', 'Box'], ['note', 'Note'], ['pen', 'Pen']];

  // Saved marks: those inside this file (a copy someone sent back), then any made in this browser.
  function load() {
    var d = {};
    try { d = JSON.parse(holder ? holder.textContent : '{}') || {}; } catch (e) { d = {}; }
    try {
      var here = JSON.parse(window.localStorage.getItem(KEY) || 'null');
      if (here && Array.isArray(here.items)) d.items = here.items;
    } catch (e) { /* storage blocked: the marks in the file still show */ }
    if (!Array.isArray(d.items)) d.items = [];
    d.v = 2;
    return d;
  }
  var data = load();
  var undoStack = [];
  var tool = 'arrow';
  var on = false;
  var sel = -1;
  var pendingFocus = null;

  function save() {
    if (holder) holder.textContent = JSON.stringify(data);
    try { window.localStorage.setItem(KEY, JSON.stringify({ items: data.items })); } catch (e) { /* the file copy still carries them */ }
    refreshButtons();
  }
  function remember() { undoStack.push(JSON.stringify(data.items)); if (undoStack.length > 100) undoStack.shift(); }

  // Each tab is one anchor; a page with no tabs uses the whole page.
  function anchors() {
    var p = document.querySelectorAll('.pg-panel');
    return p.length ? Array.prototype.slice.call(p) : [document.querySelector('main')];
  }
  function idOf(a) { return a.classList.contains('pg-panel') ? 'p' + a.getAttribute('data-panel') : 'main'; }
  function anchorById(id) { return anchors().filter(function (a) { return idOf(a) === id; })[0]; }
  function size(a) { return { w: a.offsetWidth || 1, h: a.offsetHeight || 1 }; }

  function layerOf(a) {
    var l = a.querySelector(':scope > .mk-layer');
    if (l) return l;
    l = document.createElement('div');
    l.className = 'mk-layer';
    var mid = 'mk-head-' + idOf(a);
    l.innerHTML = '<svg class="mk-svg" xmlns="' + NS + '"><defs><marker id="' + mid + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="mk-head"/></marker></defs><g class="mk-g"></g></svg>';
    a.appendChild(l);
    l.addEventListener('pointerdown', down);
    // the browser moves the keyboard to the page when the click ends; hand it back to the new note
    l.addEventListener('click', function () { if (pendingFocus) { pendingFocus.focus(); pendingFocus = null; } });
    return l;
  }

  // Draw every mark in pixels for the tab's current size, so arrowheads and circles never stretch.
  function render() {
    anchors().forEach(function (a) {
      var l = layerOf(a);
      var g = l.querySelector('.mk-g');
      var s = size(a);
      var mid = 'mk-head-' + idOf(a);
      g.innerHTML = '';
      l.querySelectorAll('.mk-note').forEach(function (n) { n.remove(); });
      data.items.forEach(function (it, i) {
        if (it.anchor !== idOf(a)) return;
        var X = function (f) { return f * s.w; };
        var Y = function (f) { return f * s.h; };
        var el;
        if (it.type === 'note') {
          el = document.createElement('div');
          el.className = 'mk-note' + (i === sel ? ' mk-sel' : '');
          el.style.left = X(it.x1) + 'px';
          el.style.top = Y(it.y1) + 'px';
          el.textContent = it.text || '';
          el.contentEditable = on ? 'true' : 'false';
          el.dataset.i = i;
          el.addEventListener('input', function () { data.items[i].text = el.textContent; save(); });
          el.addEventListener('blur', function () { if (!el.textContent.trim() && data.items[i] === it) { remember(); data.items.splice(i, 1); sel = -1; save(); render(); } });
          l.appendChild(el);
          return;
        }
        if (it.type === 'arrow') {
          el = document.createElementNS(NS, 'line');
          el.setAttribute('x1', X(it.x1)); el.setAttribute('y1', Y(it.y1));
          el.setAttribute('x2', X(it.x2)); el.setAttribute('y2', Y(it.y2));
          el.setAttribute('marker-end', 'url(#' + mid + ')');
        } else if (it.type === 'ellipse') {
          el = document.createElementNS(NS, 'ellipse');
          el.setAttribute('cx', X((it.x1 + it.x2) / 2)); el.setAttribute('cy', Y((it.y1 + it.y2) / 2));
          el.setAttribute('rx', Math.abs(X(it.x2) - X(it.x1)) / 2); el.setAttribute('ry', Math.abs(Y(it.y2) - Y(it.y1)) / 2);
        } else if (it.type === 'rect') {
          el = document.createElementNS(NS, 'rect');
          el.setAttribute('x', Math.min(X(it.x1), X(it.x2))); el.setAttribute('y', Math.min(Y(it.y1), Y(it.y2)));
          el.setAttribute('width', Math.abs(X(it.x2) - X(it.x1))); el.setAttribute('height', Math.abs(Y(it.y2) - Y(it.y1)));
          el.setAttribute('rx', 4);
        } else if (it.type === 'pen') {
          el = document.createElementNS(NS, 'polyline');
          el.setAttribute('points', (it.points || []).map(function (p) { return X(p[0]) + ',' + Y(p[1]); }).join(' '));
        } else return;
        el.setAttribute('class', 'mk-shape' + (i === sel ? ' mk-sel' : ''));
        el.setAttribute('data-i', i);
        g.appendChild(el);
      });
    });
  }

  // Where a mark sits on a diagram, in the drawing's own units, so the notes command can name the box under it.
  function tagDiagram(it) {
    var a = anchorById(it.anchor);
    if (!a) return;
    var r = a.getBoundingClientRect();
    var s = size(a);
    var key = function (fx, fy) {
      var cx = r.left + fx * s.w, cy = r.top + fy * s.h;
      var svgs = a.querySelectorAll('.df-svg');
      for (var k = 0; k < svgs.length; k += 1) {
        var b = svgs[k].getBoundingClientRect();
        if (cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom && svgs[k].getScreenCTM()) {
          var m = svgs[k].getScreenCTM().inverse();
          var p = new DOMPoint(cx, cy).matrixTransform(m);
          var block = svgs[k].closest('.df');
          return { on: block ? block.id : '', pt: [Math.round(p.x), Math.round(p.y)] };
        }
      }
      return null;
    };
    var at, from;
    if (it.type === 'arrow') { from = key(it.x1, it.y1); at = key(it.x2, it.y2); }
    else if (it.type === 'pen') {
      var ps = it.points || [[0, 0]];
      at = key(ps.reduce(function (t, p) { return t + p[0]; }, 0) / ps.length, ps.reduce(function (t, p) { return t + p[1]; }, 0) / ps.length);
    } else if (it.type === 'note') at = key(it.x1, it.y1);
    else at = key((it.x1 + it.x2) / 2, (it.y1 + it.y2) / 2);
    delete it.on; delete it.at; delete it.from;
    if (at) { it.on = at.on; it.at = at.pt; }
    if (from) { it.on = it.on || from.on; it.from = from.pt; }
  }

  var drag = null;
  function frac(a, e) {
    var r = a.getBoundingClientRect();
    var s = size(a);
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / s.w)), Math.max(0, Math.min(1, (e.clientY - r.top) / s.h))];
  }
  function down(e) {
    if (!on || e.button !== 0) return;
    var a = e.currentTarget.parentNode;
    var hit = e.target.closest('[data-i]');
    var p = frac(a, e);
    if (hit) {
      sel = Number(hit.getAttribute('data-i'));
      // clicking into a note being typed only moves the cursor
      if (data.items[sel].type === 'note' && document.activeElement === hit) return;
      remember();
      drag = { a: a, mode: 'move', start: p, orig: JSON.parse(JSON.stringify(data.items[sel])) };
      render();
      if (data.items[sel].type === 'note') {
        var n = a.querySelector('.mk-note[data-i="' + sel + '"]');
        if (n) setTimeout(function () { n.focus(); }, 0);
      }
      e.preventDefault();
      return;
    }
    remember();
    var it = { anchor: idOf(a), type: tool, x1: p[0], y1: p[1], x2: p[0], y2: p[1] };
    if (tool === 'pen') it.points = [p];
    if (tool === 'note') it.text = '';
    data.items.push(it);
    sel = data.items.length - 1;
    if (tool === 'note') {
      tagDiagram(it); save(); render();
      var nn = a.querySelector('.mk-note[data-i="' + sel + '"]');
      if (nn) { pendingFocus = nn; setTimeout(function () { nn.focus(); }, 0); }
      e.preventDefault();
      return;
    }
    drag = { a: a, mode: 'draw' };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    render();
  }
  function move(e) {
    if (!drag) return;
    var p = frac(drag.a, e);
    var it = data.items[sel];
    if (!it) return;
    if (drag.mode === 'draw') {
      if (it.type === 'pen') it.points.push(p);
      else { it.x2 = p[0]; it.y2 = p[1]; }
    } else {
      var dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
      var o = drag.orig;
      it.x1 = o.x1 + dx; it.y1 = o.y1 + dy;
      if ('x2' in o) { it.x2 = o.x2 + dx; it.y2 = o.y2 + dy; }
      if (o.points) it.points = o.points.map(function (q) { return [q[0] + dx, q[1] + dy]; });
    }
    render();
  }
  function up() {
    if (!drag) return;
    var it = data.items[sel];
    if (it && drag.mode === 'draw' && it.type !== 'pen') {
      var s = size(drag.a);
      // a click with no drag makes no mark
      if (Math.abs(it.x2 - it.x1) * s.w < 6 && Math.abs(it.y2 - it.y1) * s.h < 6) { data.items.splice(sel, 1); sel = -1; undoStack.pop(); }
    }
    if (data.items[sel]) tagDiagram(data.items[sel]);
    drag = null;
    save(); render();
  }
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);

  // The bar of tools shown while marking up.
  var bar = document.createElement('div');
  bar.className = 'mk-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Mark up tools');
  bar.innerHTML = KINDS.map(function (k) { return '<button type="button" data-tool="' + k[0] + '">' + k[1] + '</button>'; }).join('') +
    '<span class="mk-hint">Drag to draw. Click a mark to move it.</span>' +
    '<button type="button" data-act="undo">Undo</button><button type="button" data-act="delete">Delete</button>' +
    '<button type="button" data-act="done" class="mk-done">Done</button>';
  document.body.appendChild(bar);
  function setTool(t) {
    tool = t;
    bar.querySelectorAll('[data-tool]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tool === t ? 'true' : 'false'); });
    document.body.setAttribute('data-mk-tool', t);
  }
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tool) { setTool(b.dataset.tool); return; }
    var act = b.dataset.act;
    if (act === 'undo' && undoStack.length) { data.items = JSON.parse(undoStack.pop()); sel = -1; save(); render(); }
    else if (act === 'delete' && data.items[sel]) { remember(); data.items.splice(sel, 1); sel = -1; save(); render(); }
    else if (act === 'done') setOn(false);
  });
  function setOn(v) {
    on = v;
    sel = -1;
    document.body.classList.toggle('mk-on', on);
    render();
    refreshButtons();
  }
  document.addEventListener('keydown', function (e) {
    if (!on) return;
    var typing = document.activeElement && document.activeElement.classList.contains('mk-note');
    if (e.key === 'Escape') { if (typing) document.activeElement.blur(); else setOn(false); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && data.items[sel]) { remember(); data.items.splice(sel, 1); sel = -1; save(); render(); e.preventDefault(); }
  });

  // "Save a copy with my notes": this same page as a file, with the marks written inside it.
  function saveCopy() {
    var doc = document.documentElement.cloneNode(true);
    ['.df-packets', '.df-steps', '.df-all-list', '.df-dots', '.df-item-card'].forEach(function (q) {
      doc.querySelectorAll(q).forEach(function (el) { el.innerHTML = ''; });
    });
    doc.querySelectorAll('.mk-layer, .mk-bar').forEach(function (el) { el.remove(); });
    var body = doc.querySelector('body');
    if (body) { body.classList.remove('mk-on'); body.removeAttribute('data-mk-tool'); }
    var h = doc.querySelector('#df-marks');
    var copy = JSON.parse(JSON.stringify(data));
    copy.copy = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (h) h.textContent = JSON.stringify(copy);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['<!doctype html>\n' + doc.outerHTML], { type: 'text/html' }));
    a.download = (document.title || 'diagram') + ' - with notes.html';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function refreshButtons() {
    var n = data.items.length;
    document.querySelectorAll('.pg-markup').forEach(function (b) {
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.querySelector('span').textContent = on ? 'Marking up' : (n ? 'Mark up (' + n + ')' : 'Mark up');
    });
    document.querySelectorAll('.pg-sendnotes').forEach(function (b) { b.hidden = n === 0; });
  }

  document.querySelectorAll('.pg-markup').forEach(function (b) { b.addEventListener('click', function () { setOn(!on); }); });
  document.querySelectorAll('.pg-sendnotes').forEach(function (b) { b.addEventListener('click', saveCopy); });
  // a tab change or a new window size moves things: draw again
  window.addEventListener('resize', render);
  document.addEventListener('click', function (e) { if (e.target.closest('.pg-tab, .df-view button, .df-scen button')) setTimeout(render, 0); });
  setTool('arrow');
  render();
  refreshButtons();
})();
