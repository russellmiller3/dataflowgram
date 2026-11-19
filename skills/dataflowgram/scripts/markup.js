// Lets a reader mark up the page itself with 3 marks that say what they want: a Note (a question, with an optional
// arrow to the thing it asks about), Move this (a box around a thing, with an arrow to where it should go) and
// Delete this (a box with an X over the thing). "Save a copy with my notes" downloads the page with the marks inside.
// No outside library: marks sit in a clear layer over each tab, stored as fractions of that tab's size.
(function () {
  var holder = document.getElementById('df-marks');
  // each saved copy carries its own name, so a copy someone sends back never shows this browser's marks for the original
  var copyId = '';
  try { copyId = (JSON.parse(holder ? holder.textContent : '{}') || {}).copy || ''; } catch (e) { copyId = ''; }
  var KEY = 'df-marks:' + document.title + (copyId ? ':' + copyId : '');
  var NS = 'http://www.w3.org/2000/svg';
  var TOOLS = [['note', 'Note'], ['move', 'Move this'], ['del', 'Delete this']];
  var HINTS = {
    note: 'Click the thing, then type. Drag the note away and an arrow follows.',
    move: 'Box it, then click where it goes.',
    del: 'Box the thing to delete.',
  };

  function load() {
    var d = {};
    try { d = JSON.parse(holder ? holder.textContent : '{}') || {}; } catch (e) { d = {}; }
    try {
      var here = JSON.parse(window.localStorage.getItem(KEY) || 'null');
      if (here && Array.isArray(here.items)) d.items = here.items;
    } catch (e) { /* storage blocked: the marks in the file still show */ }
    if (!Array.isArray(d.items)) d.items = [];
    d.v = 3;
    return d;
  }
  var data = load();
  var undoStack = [];
  var tool = 'note';
  var on = false;
  var sel = -1;
  var aiming = -1; // a Move mark waiting for the click that says where to
  var pendingFocus = null;

  function save() {
    if (holder) holder.textContent = JSON.stringify(data);
    try { window.localStorage.setItem(KEY, JSON.stringify({ items: data.items })); } catch (e) { /* the file copy still carries them */ }
    refreshButtons();
  }
  function remember() { undoStack.push(JSON.stringify(data.items)); if (undoStack.length > 100) undoStack.shift(); }
  function drop(i) { data.items.splice(i, 1); sel = -1; aiming = -1; }
  // A note is done when the reader moves on: an empty note goes away.
  // Returns the place of a note that went away, or -1.
  function finish(i) {
    var it = data.items[i];
    if (!it || it.type !== 'note') return -1;
    if (!String(it.text || '').trim()) { data.items.splice(i, 1); return i; }
    tagDiagram(it);
    return -1;
  }
  // Select mark i (or none: -1), finishing the note selected before. Returns i, moved down if an earlier mark went away.
  function select(i) {
    if (sel >= 0 && sel !== i) {
      var gone = finish(sel);
      if (gone >= 0 && i > gone) i -= 1;
      if (gone >= 0 && aiming > gone) aiming -= 1;
    }
    sel = i;
    return i;
  }

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
    var id = idOf(a);
    l.innerHTML = '<svg class="mk-svg" xmlns="' + NS + '"><defs>' +
      '<marker id="mk-ah-' + id + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="mk-ah"/></marker>' +
      '<marker id="mk-mh-' + id + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="mk-mh"/></marker>' +
      '</defs><g class="mk-g"></g></svg>';
    a.appendChild(l);
    l.addEventListener('pointerdown', down);
    // the browser moves the keyboard to the page when the click ends; hand it back to the new note
    l.addEventListener('click', function () { if (pendingFocus) { pendingFocus.focus(); pendingFocus = null; } });
    return l;
  }

  function svgEl(name, attrs, cls) {
    var el = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (cls) el.setAttribute('class', cls);
    return el;
  }
  // where a line from the middle of a box towards a point leaves the box
  function edge(r, tx, ty) {
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return [cx, cy];
    var s = Math.min(dx ? (r.w / 2) / Math.abs(dx) : Infinity, dy ? (r.h / 2) / Math.abs(dy) : Infinity);
    return [cx + dx * s, cy + dy * s];
  }
  function inside(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  // Draw every mark in pixels for the tab's current size, so arrowheads never stretch.
  function render() {
    anchors().forEach(function (a) {
      var l = layerOf(a);
      var g = l.querySelector('.mk-g');
      var s = size(a);
      var id = idOf(a);
      var X = function (f) { return f * s.w; };
      var Y = function (f) { return f * s.h; };
      g.innerHTML = '';
      // nothing reacts to a note leaving the page, so removing the one being typed in cannot start a second redraw
      l.querySelectorAll('.mk-note').forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
      data.items.forEach(function (it, i) {
        if (it.anchor !== id) return;
        var mine = i === sel ? ' mk-sel' : '';
        if (it.type === 'note') {
          var n = document.createElement('div');
          n.className = 'mk-note' + mine;
          n.style.left = X(it.x1) + 'px';
          n.style.top = Y(it.y1) + 'px';
          n.textContent = it.text || '';
          n.contentEditable = on ? 'true' : 'false';
          n.dataset.i = i;
          n.addEventListener('input', function () { it.text = n.textContent; save(); });
          l.appendChild(n);
          if (it.tip) {
            // a dot marks the spot the note is about; once the note is dragged away, an arrow runs back to the dot
            var r = { x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight };
            var tx = X(it.tip[0]), ty = Y(it.tip[1]);
            if (!inside(r, tx, ty)) {
              var e = edge(r, tx, ty);
              if (Math.hypot(e[0] - tx, e[1] - ty) > 28) {
                g.appendChild(svgEl('line', { x1: e[0], y1: e[1], x2: tx, y2: ty, 'marker-end': 'url(#mk-ah-' + id + ')', 'data-i': i }, 'mk-note-line'));
              } else g.appendChild(svgEl('circle', { cx: tx, cy: ty, r: 4.5, 'data-i': i }, 'mk-note-dot'));
            }
            if (on && i === sel) g.appendChild(svgEl('circle', { cx: tx, cy: ty, r: 7, 'data-i': i, 'data-h': 'tip' }, 'mk-handle'));
          }
          return;
        }
        var x = Math.min(X(it.x1), X(it.x2)), y = Math.min(Y(it.y1), Y(it.y2));
        var w = Math.abs(X(it.x2) - X(it.x1)), h = Math.abs(Y(it.y2) - Y(it.y1));
        if (it.type === 'del') {
          g.appendChild(svgEl('rect', { x: x, y: y, width: w, height: h, rx: 4, 'data-i': i }, 'mk-del' + mine));
          g.appendChild(svgEl('path', { d: 'M' + x + ' ' + y + 'L' + (x + w) + ' ' + (y + h) + 'M' + (x + w) + ' ' + y + 'L' + x + ' ' + (y + h), 'data-i': i }, 'mk-del-x'));
          var t = svgEl('text', { x: x + 4, y: y - 6, 'data-i': i }, 'mk-del-t');
          t.textContent = 'Delete';
          g.appendChild(t);
        } else if (it.type === 'move') {
          g.appendChild(svgEl('rect', { x: x, y: y, width: w, height: h, rx: 6, 'data-i': i }, 'mk-move' + mine));
          if (it.to) {
            var mx = X(it.to[0]), my = Y(it.to[1]);
            var from = edge({ x: x, y: y, w: w, h: h }, mx, my);
            if (!inside({ x: x, y: y, w: w, h: h }, mx, my)) {
              g.appendChild(svgEl('line', { x1: from[0], y1: from[1], x2: mx, y2: my, 'marker-end': 'url(#mk-mh-' + id + ')', 'data-i': i }, 'mk-move-line'));
            }
            var mt = svgEl('text', { x: mx + 8, y: my + 5, 'data-i': i }, 'mk-move-t');
            mt.textContent = 'Move here';
            g.appendChild(mt);
            if (on && i === sel && aiming !== i) g.appendChild(svgEl('circle', { cx: mx, cy: my, r: 7, 'data-i': i, 'data-h': 'to' }, 'mk-handle mk-handle-move'));
          }
        }
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
          var p = new DOMPoint(cx, cy).matrixTransform(svgs[k].getScreenCTM().inverse());
          var block = svgs[k].closest('.df');
          return { on: block ? block.id : '', pt: [Math.round(p.x), Math.round(p.y)] };
        }
      }
      return null;
    };
    var at = null, from = null;
    if (it.type === 'note') at = it.tip ? key(it.tip[0], it.tip[1]) : key(it.x1, it.y1);
    else if (it.type === 'move') { from = key((it.x1 + it.x2) / 2, (it.y1 + it.y2) / 2); if (it.to) at = key(it.to[0], it.to[1]); }
    else at = key((it.x1 + it.x2) / 2, (it.y1 + it.y2) / 2);
    delete it.on; delete it.at; delete it.from;
    if (from) { it.on = from.on; it.from = from.pt; }
    if (at) { it.on = it.on || at.on; it.at = at.pt; }
  }

  var drag = null;
  function frac(a, e) {
    var r = a.getBoundingClientRect();
    var s = size(a);
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / s.w)), Math.max(0, Math.min(1, (e.clientY - r.top) / s.h))];
  }
  function far(a, p, q) { var s = size(a); return Math.abs(p[0] - q[0]) * s.w > 6 || Math.abs(p[1] - q[1]) * s.h > 6; }

  function down(e) {
    if (!on || e.button !== 0) return;
    var a = e.currentTarget.parentNode;
    var layer = e.currentTarget;
    var p = frac(a, e);
    // the click that says where a Move mark should go
    if (aiming >= 0 && data.items[aiming]) {
      data.items[aiming].to = p;
      tagDiagram(data.items[aiming]);
      aiming = -1;
      save(); render();
      e.preventDefault();
      return;
    }
    var hit = e.target.closest('[data-i]');
    if (hit) {
      var i = Number(hit.getAttribute('data-i'));
      var handle = hit.getAttribute('data-h');
      // a press inside the note being typed: a short click moves the text cursor, a drag moves the note
      if (data.items[i].type === 'note' && !handle && document.activeElement === hit) {
        drag = { a: a, layer: layer, mode: 'shift', soft: true, start: p, orig: JSON.parse(JSON.stringify(data.items[i])), moved: false };
        return;
      }
      remember();
      i = select(i);
      if (i < 0) { render(); return; }
      drag = { a: a, mode: handle ? 'handle' : 'shift', handle: handle, start: p, orig: JSON.parse(JSON.stringify(data.items[i])), moved: false };
      layer.setPointerCapture(e.pointerId);
      e.preventDefault();
      render();
      return;
    }
    // a click on empty space while a note is open finishes that note; it does not start another
    if (tool === 'note' && data.items[sel] && data.items[sel].type === 'note') {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      select(-1); save(); render();
      e.preventDefault();
      return;
    }
    remember();
    select(-1);
    var it = { anchor: idOf(a), type: tool, x1: p[0], y1: p[1], x2: p[0], y2: p[1] };
    if (tool === 'note') { it.text = ''; it.tip = null; }
    data.items.push(it);
    sel = data.items.length - 1;
    drag = { a: a, mode: 'draw', start: p, moved: false };
    layer.setPointerCapture(e.pointerId);
    e.preventDefault();
    render();
  }
  function move(e) {
    var it;
    if (aiming >= 0 && !drag) {
      it = data.items[aiming];
      var a0 = it && anchorById(it.anchor);
      if (a0) { it.to = frac(a0, e); render(); }
      return;
    }
    if (!drag) return;
    var p = frac(drag.a, e);
    it = data.items[sel];
    if (!it) return;
    if (drag.soft && !drag.moved) {
      if (!far(drag.a, p, drag.start)) return; // still a click: leave the typing alone
      remember();
      var s0 = window.getSelection();
      if (s0) s0.removeAllRanges();
      try { drag.layer.setPointerCapture(e.pointerId); } catch (err) { /* the move still follows the pointer */ }
    }
    if (far(drag.a, p, drag.start)) drag.moved = true;
    if (drag.mode === 'draw') {
      if (it.type === 'note') {
        // dragging out from the thing: the arrow points back at where the press began
        if (drag.moved) { it.tip = drag.start; it.x1 = p[0]; it.y1 = p[1]; }
      } else { it.x2 = p[0]; it.y2 = p[1]; }
    } else if (drag.mode === 'handle') {
      it[drag.handle] = p;
    } else {
      var dx = p[0] - drag.start[0], dy = p[1] - drag.start[1], o = drag.orig;
      it.x1 = o.x1 + dx; it.y1 = o.y1 + dy;
      if (it.type !== 'note') { it.x2 = o.x2 + dx; it.y2 = o.y2 + dy; }
      if (it.type === 'move' && o.to) it.to = [o.to[0] + dx, o.to[1] + dy];
      // a note moves on its own; its arrow keeps pointing at the same thing
    }
    render();
  }
  function up() {
    if (!drag) return;
    var it = data.items[sel];
    var d = drag;
    drag = null;
    if (d.soft && !d.moved) return; // a click inside the note being typed: the cursor moved, nothing else
    if (!it) { render(); return; }
    if (d.mode === 'draw') {
      if (it.type === 'note') {
        if (!d.moved) {
          // a click on the thing: the dot sits on the spot clicked, and the note opens just beside it, ready to type
          var sz = size(d.a);
          it.tip = [it.x1, it.y1];
          it.x1 = Math.min(1, it.x1 + 14 / sz.w);
          it.y1 = Math.min(1, it.y1 + 10 / sz.h);
        }
        tagDiagram(it); save(); render();
        typeInto(d.a, sel);
        return;
      }
      if (!d.moved) { drop(sel); undoStack.pop(); render(); return; } // a click with no drag makes no box
      if (it.type === 'move') { aiming = sel; it.to = [it.x2, it.y2]; }
    } else if (!d.moved) undoStack.pop();
    tagDiagram(it);
    save(); render();
    // a note clicked, moved or re-aimed is ready for typing again
    if (it.type === 'note') typeInto(d.a, sel);
  }
  // Put the keyboard in note i, after the redraw has made its box, with the cursor at the end of the text.
  function typeInto(a, i) {
    var n = a.querySelector('.mk-note[data-i="' + i + '"]');
    if (!n) return;
    pendingFocus = n;
    var go = function () {
      if (!n.isConnected) return;
      n.focus();
      var r = document.createRange();
      r.selectNodeContents(n);
      r.collapse(false);
      var s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    };
    go();
    setTimeout(go, 0);
  }
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);

  // The bar of tools shown while marking up.
  var bar = document.createElement('div');
  bar.className = 'mk-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Mark up tools');
  bar.innerHTML = TOOLS.map(function (k) { return '<button type="button" data-tool="' + k[0] + '" class="mk-t-' + k[0] + '">' + k[1] + '</button>'; }).join('') +
    '<span class="mk-hint"></span>' +
    '<button type="button" data-act="undo">Undo</button><button type="button" data-act="remove">Remove mark</button>' +
    '<button type="button" data-act="clear">Clear all</button>' +
    '<button type="button" data-act="done" class="mk-done">Done</button>';
  document.body.appendChild(bar);
  function setTool(t) {
    tool = t;
    aiming = -1;
    if (sel >= 0) { select(-1); save(); render(); }
    bar.querySelectorAll('[data-tool]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tool === t ? 'true' : 'false'); });
    bar.querySelector('.mk-hint').textContent = HINTS[t];
    document.body.setAttribute('data-mk-tool', t);
  }
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tool) { setTool(b.dataset.tool); return; }
    var act = b.dataset.act;
    if (act === 'undo' && undoStack.length) { data.items = JSON.parse(undoStack.pop()); sel = -1; aiming = -1; save(); render(); }
    else if (act === 'remove' && data.items[sel]) { remember(); drop(sel); save(); render(); }
    else if (act === 'clear' && data.items.length) {
      // every mark on every tab; Undo brings them all back
      var n = data.items.length;
      if (!window.confirm('Remove all ' + n + ' mark' + (n === 1 ? '' : 's') + ' on every tab? Undo brings them back.')) return;
      remember(); data.items = []; sel = -1; aiming = -1; save(); render();
    }
    else if (act === 'done') setOn(false);
  });
  function setOn(v) {
    on = v;
    select(-1);
    aiming = -1;
    document.body.classList.toggle('mk-on', on);
    makeRoom();
    save();
    render();
  }
  document.addEventListener('keydown', function (e) {
    if (!on) return;
    var typing = document.activeElement && document.activeElement.classList.contains('mk-note');
    if (e.key === 'Escape') {
      if (typing) document.activeElement.blur();
      else if (aiming >= 0) { aiming = -1; render(); }
      else setOn(false);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && data.items[sel]) { remember(); drop(sel); save(); render(); e.preventDefault(); }
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
  // the page moves down by the strip's real height (one row on a wide window, two on a narrow one), so it covers nothing
  function makeRoom() { document.body.style.paddingTop = on ? bar.offsetHeight + 'px' : ''; }
  window.addEventListener('resize', function () { makeRoom(); render(); });
  document.addEventListener('click', function (e) { if (e.target.closest('.pg-tab, .df-view button, .df-scen button')) setTimeout(render, 0); });
  setTool('note');
  render();
  refreshButtons();
})();
