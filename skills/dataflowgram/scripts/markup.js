// Lets a reader mark up each diagram (arrows, circles, boxes, typed notes, freehand) and send the page back with the marks inside it.
// Runs in the page after the diagrams. Uses marker.js 3 (linkware licence: its link shows while editing).
(function () {
  if (!window.markerjs3) return;
  var MJ = window.markerjs3;
  // A new note starts empty, so what the reader types is the whole note (marker.js starts it with the word "Text").
  ['TextMarker', 'CalloutMarker'].forEach(function (k) { if (MJ[k]) MJ[k].DEFAULT_TEXT = ''; });
  var marksEl = document.getElementById('df-marks');
  var STORE_KEY = 'df-marks:' + document.title;

  // Saved marks: those inside this file (a copy someone sent back), then any made in this browser.
  function load() {
    var marks = {};
    try { marks = JSON.parse(marksEl ? marksEl.textContent : '{}') || {}; } catch (e) { marks = {}; }
    try {
      var here = JSON.parse(window.localStorage.getItem(STORE_KEY) || 'null');
      if (here && typeof here === 'object') Object.keys(here).forEach(function (k) { marks[k] = here[k]; });
    } catch (e) { /* storage blocked: the marks in the file still show */ }
    return marks;
  }
  var marks = load();
  function save() {
    if (marksEl) marksEl.textContent = JSON.stringify(marks);
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(marks)); } catch (e) { /* the file copy still carries them */ }
    refreshBadges();
  }
  function countOf(id) { return marks[id] && marks[id].markers ? marks[id].markers.length : 0; }

  // A picture of the drawing as it shows now, with every colour written into it so it looks the same as an image.
  var PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity',
    'font-size', 'font-weight', 'font-family', 'text-anchor', 'dominant-baseline', 'display', 'visibility'];
  function snapshot(svg) {
    var vb = svg.viewBox.baseVal;
    var copy = svg.cloneNode(true);
    var from = svg.querySelectorAll('*');
    var to = copy.querySelectorAll('*');
    for (var i = 0; i < from.length; i += 1) {
      var cs = window.getComputedStyle(from[i]);
      var s = '';
      PROPS.forEach(function (p) { var v = cs.getPropertyValue(p); if (v) s += p + ':' + v + ';'; });
      to[i].setAttribute('style', s);
    }
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.setAttribute('width', vb.width);
    copy.setAttribute('height', vb.height);
    var bg = window.getComputedStyle(svg).backgroundColor || '#fff';
    copy.setAttribute('style', 'background:' + bg);
    var back = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    back.setAttribute('x', vb.x); back.setAttribute('y', vb.y);
    back.setAttribute('width', vb.width); back.setAttribute('height', vb.height);
    back.setAttribute('fill', bg);
    copy.insertBefore(back, copy.firstChild);
    var img = new Image();
    img.width = vb.width; img.height = vb.height;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copy));
    return img;
  }

  var TOOLS = [
    ['ArrowMarker', 'Arrow'], ['EllipseFrameMarker', 'Circle'], ['FrameMarker', 'Box'],
    ['CalloutMarker', 'Note'], ['TextMarker', 'Text'], ['FreehandMarker', 'Pen'],
  ];

  function openEditor(block) {
    var id = block.id;
    // mark up the still picture of everything, so the marks always sit on the same drawing
    var all = block.querySelector('.df-view [data-view="all"]');
    if (all) all.click();
    var img = snapshot(block.querySelector('.df-svg'));
    var shade = document.createElement('div');
    shade.className = 'df-mk-shade';
    shade.innerHTML = '<div class="df-mk-box" role="dialog" aria-label="Mark up this diagram">' +
      '<div class="df-mk-bar">' + TOOLS.map(function (t) { return '<button type="button" data-tool="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
      '<span class="df-mk-gap"></span><button type="button" data-act="undo">Undo</button><button type="button" data-act="delete">Delete</button>' +
      '<button type="button" data-act="cancel">Cancel</button><button type="button" data-act="done" class="df-mk-main">Done</button></div>' +
      '<p class="df-mk-help">Pick a tool, then draw on the diagram. Note and Text: click, then type. Done keeps your marks.</p>' +
      '<div class="df-mk-area"></div></div>';
    document.body.appendChild(shade);
    var area = new MJ.MarkerArea();
    // put back earlier marks once the picture is showing (set up before the editor starts, or the moment is missed)
    var restored = false;
    function restore() { if (!restored && marks[id]) { restored = true; area.restoreState(marks[id], false); } }
    area.addEventListener('areashow', restore);
    area.targetImage = img;
    shade.querySelector('.df-mk-area').appendChild(area);
    shade.querySelector('.df-mk-bar').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tool) { area.createMarker(b.dataset.tool); return; }
      var act = b.dataset.act;
      if (act === 'undo') area.undo();
      else if (act === 'delete') area.deleteSelectedMarkers();
      else if (act === 'done') { area.switchToSelectMode(); marks[id] = area.getState(); save(); shade.remove(); }
      else if (act === 'cancel') shade.remove();
    });
  }

  // "Save a copy with my notes": this same page as a file, with the marks written inside it.
  function saveCopy() {
    var doc = document.documentElement.cloneNode(true);
    // drop what the page draws for itself when it opens, so the copy starts clean
    ['.df-packets', '.df-steps', '.df-all-list', '.df-dots', '.df-item-card'].forEach(function (sel) {
      doc.querySelectorAll(sel).forEach(function (el) { el.innerHTML = ''; });
    });
    doc.querySelectorAll('.df-mk-shade, .df-mk-open').forEach(function (el) { el.remove(); });
    var holder = doc.querySelector('#df-marks');
    if (holder) holder.textContent = JSON.stringify(marks);
    var html = '<!doctype html>\n' + doc.outerHTML;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = (document.title || 'diagram') + ' - with notes.html';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function refreshBadges() {
    document.querySelectorAll('.df-mk-open').forEach(function (b) {
      var n = countOf(b.dataset.for);
      b.querySelector('span').textContent = n ? 'Mark up (' + n + ')' : 'Mark up';
    });
    var total = Object.keys(marks).reduce(function (t, k) { return t + countOf(k); }, 0);
    document.querySelectorAll('.pg-sendnotes').forEach(function (b) { b.hidden = total === 0; });
  }

  document.querySelectorAll('.df').forEach(function (block) {
    var frame = block.querySelector('.df-scroll');
    if (!frame || !block.id) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'df-mk-open';
    b.dataset.for = block.id;
    b.title = 'Draw arrows, circles and notes on this diagram';
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg><span>Mark up</span>';
    b.addEventListener('click', function () { openEditor(block); });
    frame.appendChild(b);
  });
  document.querySelectorAll('.pg-sendnotes').forEach(function (b) { b.addEventListener('click', saveCopy); });
  refreshBadges();
})();
