// Tests for the data-flow builder. Each test uses the builder the way a person would and checks the result.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, renderFragment, renderPage, KINDS, ACTIONS, colourParts, regionOf, gapFor, boxWidth, renderBook } from './dataflow.mjs';
import { stepView, shortText, readLink, tagOpacity, dotPosition, dotOpacity, tagRides, tagWidth, overview, freeSpot, lanesOf, arrowLabel, moves } from './runtime.mjs';
import { cleanIcon } from './make-icons.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const example = () => JSON.parse(fs.readFileSync(path.join(HERE, '..', 'examples', 'notes-inbox.json'), 'utf8'));

// A small description that shares no word with the example, so a pass is not tied to one diagram.
const tiny = () => ({
  title: 'Order to shelf',
  rows: [['till'], ['stock', 'printer']],
  parts: {
    till: { label: 'Till', kind: 'person' },
    stock: { label: 'Stock list', kind: 'store' },
    printer: { label: 'Label printer', kind: 'output', icon: 'printer' },
  },
  lines: [['till', 'stock'], ['stock', 'printer']],
  scenarios: [{
    id: 'sale',
    label: 'A sale',
    steps: [
      { action: 'send', flow: ['till>stock'], text: 'The till sends the sale. Stock falls by 1.' },
      { action: 'read', flow: ['stock>till'], text: 'The till reads the new count.' },
      { action: 'write', flow: ['stock<>printer'], text: 'The printer and the list swap data.' },
      { action: 'check', at: ['till'], text: 'The till checks its drawer.' },
    ],
  }],
});

test('stepping through a scenario lights the right line, in the right direction, with the right boxes', () => {
  const c = compile(tiny());
  const edge = (a, b) => c.edges.find((e) => e.from === a && e.to === b).id;
  const s1 = stepView(c, 'sale', 0);
  assert.deepEqual(s1.edges, { [edge('till', 'stock')]: 'f' });
  assert.deepEqual(s1.nodes, ['till', 'stock']);
  assert.equal(s1.action, 'send');
  assert.equal(s1.first, true);
  assert.equal(s1.last, false);
  // the same line, data moving the other way
  const s2 = stepView(c, 'sale', 1);
  assert.deepEqual(s2.edges, { [edge('till', 'stock')]: 'b' });
  assert.deepEqual(s2.nodes, ['stock', 'till']);
  // both ways
  assert.deepEqual(stepView(c, 'sale', 2).edges, { [edge('stock', 'printer')]: 'x' });
  // a step with no moving data lights only the part that works
  const s4 = stepView(c, 'sale', 3);
  assert.deepEqual(s4.edges, {});
  assert.deepEqual(s4.nodes, ['till']);
  assert.equal(s4.last, true);
  assert.equal(s4.count, 4);
});

test('a press past either end stays on the first or last step', () => {
  const c = compile(tiny());
  assert.equal(stepView(c, 'sale', 99).index, 3);
  assert.equal(stepView(c, 'sale', -5).index, 0);
  assert.throws(() => stepView(c, 'refund', 0), /unknown scenario: refund/);
});

test('the step list shows the first sentence of each step', () => {
  assert.equal(shortText('The till sends the sale. Stock falls by 1.'), 'The till sends the sale');
  assert.equal(shortText('How much did we pay? The ledger knows.'), 'How much did we pay?');
  assert.equal(shortText('No full stop here'), 'No full stop here');
});

test('every box sits inside the drawing and no 2 boxes overlap', () => {
  for (const spec of [tiny(), example()]) {
    const c = compile(spec);
    const boxes = Object.values(c.nodes);
    for (const n of boxes) {
      assert.ok(n.x >= 0 && n.x + n.w <= c.width, `${n.id} is inside the width`);
      assert.ok(n.y >= 0 && n.y + n.h <= c.height, `${n.id} is inside the height`);
    }
    for (const a of boxes) for (const b of boxes) {
      if (a.id >= b.id) continue;
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      assert.ok(apart, `${a.id} and ${b.id} do not overlap`);
    }
  }
});

test('every line starts on the edge of its first box and ends on the edge of its second box', () => {
  const onBorder = (pt, n) => {
    const [x, y] = pt;
    const inX = x >= n.x - 0.01 && x <= n.x + n.w + 0.01;
    const inY = y >= n.y - 0.01 && y <= n.y + n.h + 0.01;
    const onSide = Math.abs(x - n.x) < 0.01 || Math.abs(x - (n.x + n.w)) < 0.01;
    const onTopBottom = Math.abs(y - n.y) < 0.01 || Math.abs(y - (n.y + n.h)) < 0.01;
    return (inX && onTopBottom) || (inY && onSide);
  };
  for (const spec of [tiny(), example()]) {
    const c = compile(spec);
    for (const e of c.edges) {
      assert.ok(onBorder(e.start, c.nodes[e.from]), `${e.from}>${e.to} starts on ${e.from}`);
      assert.ok(onBorder(e.end, c.nodes[e.to]), `${e.from}>${e.to} ends on ${e.to}`);
    }
  }
});

test('a tag on a line between 2 boxes in one row sits outside both boxes', () => {
  for (const spec of [example(), tiny()]) {
    const c = compile(spec);
    const sideBySide = c.edges.filter((e) => e.sameRow);
    for (const e of sideBySide) {
      const [x, y] = e.tag;
      for (const n of [c.nodes[e.from], c.nodes[e.to]]) {
        const inside = x > n.x && x < n.x + n.w && y + 13 > n.y && y - 13 < n.y + n.h;
        assert.ok(!inside, `tag of ${e.from}-${e.to} is clear of ${n.id}`);
      }
      assert.ok(y - 13 >= 0 && y + 13 <= c.height, 'tag is inside the drawing');
    }
  }
  // the example has a side-by-side line, so this test is not empty
  assert.ok(compile(example()).edges.some((e) => e.sameRow));
});

test('2 lines that leave the same side of a box leave from different points', () => {
  const c = compile(example());
  const fromHub = c.edges.filter((e) => e.from === 'hub' && c.nodes[e.to].row > c.nodes.hub.row).map((e) => e.start[0]);
  assert.equal(fromHub.length, 3);
  assert.equal(new Set(fromHub.map((x) => x.toFixed(1))).size, 3);
});

test('the page gives each kind of part and each kind of step its own colour and icon', () => {
  const html = renderFragment(example(), 'demo');
  // each part carries its kind's class, and the kind's colour is in the styles
  assert.match(html, /class="df-node df-k-mail"[^>]* data-node="inbox"/);
  assert.match(html, /class="df-node df-k-ai"[^>]* data-node="model"/);
  assert.ok(html.includes(`.df-k-mail{--c:${KINDS.mail.color}`));
  // one arrowhead per action used; it takes the colour of the line it sits on
  for (const a of ['send', 'check', 'read', 'think', 'write', 'save', 'reply']) {
    assert.ok(html.includes(`id="demo-m-${a}"`), `arrowhead for ${a}`);
    assert.ok(html.includes(`fill="context-stroke"`), `the arrowhead for ${a} takes the colour of its line`);
  }
  assert.ok(!html.includes('id="demo-m-search"'), 'no arrowhead for an action the diagram does not use');
  // the icon a part asks for is the icon drawn: the phone's shape is in its box
  const phone = /data-node="phone".*?<\/g><text/s.exec(html)[0];
  assert.match(phone, /<rect width="14" height="20" x="5" y="2" rx="2" ry="2"\/><path d="M12 18h\.01"\/>/);
  const colours = new Set(Object.values(ACTIONS).map((a) => a.color));
  assert.equal(colours.size, Object.keys(ACTIONS).length, 'no 2 actions share a colour');
});

test('a whole page and a block both build, and 2 blocks on one page do not share ids', () => {
  const page = renderPage(example());
  assert.match(page, /^<!doctype html>/);
  assert.match(page, /<h1>A notes inbox with AI<\/h1>/);
  const a = renderFragment(example(), 'one');
  const b = renderFragment(tiny(), 'two');
  assert.ok(a.includes('id="one"') && !a.includes('id="two"'));
  assert.ok(b.includes('id="two-m-send"') && !b.includes('id="one-m-send"'));
});

test('text from the description cannot break out of the page', () => {
  const spec = tiny();
  spec.parts.till.label = '<b>Till</b>';
  spec.parts.till.info = '</script><img src=x onerror=alert(1)>';
  spec.scenarios[0].steps[0].text = '</script><script>alert(1)</script> end.';
  const html = renderFragment(spec, 'x');
  assert.ok(html.includes('&lt;b&gt;Till&lt;/b&gt;'));
  assert.ok(!html.includes('<b>Till</b>'));
  assert.ok(!html.includes('</script><img'));
  assert.ok(!html.includes('</script><script>alert'));
  assert.equal(html.split('</script>').length, 2, 'exactly 1 closing script tag');
});

test('a wrong description is refused with a message that names the fault', () => {
  const bad = (change, pattern) => {
    const spec = tiny();
    change(spec);
    assert.throws(() => compile(spec), pattern);
  };
  bad((s) => { s.rows[1] = ['stock', 'printer', 'bin']; s.parts.bin = { label: 'Bin', kind: 'store' }; s.lines.push(['stock', 'bin']); }, /crosses another part in row 2/);
  bad((s) => { s.rows.push(['bin']); s.parts.bin = { label: 'Bin', kind: 'store' }; s.lines.push(['till', 'bin']); }, /joins rows 1 and 3/);
  bad((s) => { s.lines.push(['till', 'ghost']); }, /"ghost", which is not a part/);
  bad((s) => { s.rows[1] = ['stock', 'printer', 'a', 'b']; }, /must hold 1 to 3 parts; it holds 4/);
  bad((s) => { s.parts.till.kind = 'wizard'; }, /kind "wizard"/);
  bad((s) => { s.parts.till.icon = 'not-an-icon'; }, /icon "not-an-icon" is not in the Lucide set/);
  bad((s) => { s.parts.stock.label = 'A label that is far, far too long to fit any box'; }, /has 48 characters; a row of 2 fits 27/);
  bad((s) => { s.scenarios[0].steps[0].action = 'teleport'; }, /action "teleport" is not known/);
  bad((s) => { s.scenarios[0].steps[0].flow = ['till>printer']; }, /no line joins "till" and "printer"/);
  bad((s) => { s.scenarios[0].steps[0].flow = ['till-stock']; }, /must read "part>part"/);
  bad((s) => { delete s.scenarios[0].steps[3].at; }, /give "flow" .* or "at"/);
  bad((s) => { s.parts.spare = { label: 'Spare', kind: 'store' }; }, /"spare" is described but not placed/);
  bad((s) => { s.lines.push(['stock', 'till']); }, /joined twice/);
});

test('a step that names what it carries shows that tag, with its icon, and a step without one shows none', () => {
  const spec = tiny();
  spec.scenarios[0].steps[0].carry = { icon: 'receipt', label: '1 sale, $4.50' };
  const c = compile(spec);
  assert.deepEqual(stepView(c, 'sale', 0).carry, { label: '1 sale, $4.50', icon: 'receipt' });
  assert.equal(stepView(c, 'sale', 1).carry, null);
  // the page receives the icon's own shapes, so it draws the right picture
  const html = renderFragment(spec, 'p');
  const data = JSON.parse(/mount\(document\.getElementById\("p"\), (.*), "p"\);/.exec(html)[1]);
  const carried = data.scenarios[0].steps[0].carry;
  assert.equal(carried.label, '1 sale, $4.50');
  assert.match(carried.icon, /^<(path|rect|circle|line|polyline)/);
  assert.equal(data.scenarios[0].steps[1].carry, null);
  assert.match(html, /class="df-packets"/);
});

test('a wrong tag is refused with a message that names the fault', () => {
  const bad = (carry, pattern, at) => {
    const spec = tiny();
    const step = spec.scenarios[0].steps[at === undefined ? 0 : at];
    step.carry = carry;
    assert.throws(() => compile(spec), pattern);
  };
  bad({ icon: 'receipt', label: 'a tag that is far too long' }, /has 26 characters; 22 fit/);
  bad({ icon: 'no-such-icon', label: 'sale' }, /icon "no-such-icon" is not in the Lucide set/);
  bad({ icon: 'receipt' }, /"carry" must be/);
  bad({ icon: 'receipt', label: 'drawer count' }, /needs a "flow"/, 3);
});

test('later steps keep a trail of the lines and parts used before, in the colour of the step that used them', () => {
  const c = compile(tiny());
  const edge = (a, b) => c.edges.find((e) => e.from === a && e.to === b).id;
  assert.deepEqual(stepView(c, 'sale', 0).trail, {});
  // step 2 uses the same line as step 1, so that line is lit now, not faded into the trail
  assert.deepEqual(stepView(c, 'sale', 1).trail, {});
  // step 3 lights stock-printer; till-stock was used by steps 1 (send) and 2 (read), so it trails in "read"
  const s3 = stepView(c, 'sale', 2);
  assert.deepEqual(s3.trail, { [edge('till', 'stock')]: 'read' });
  assert.deepEqual(s3.seen, ['till']);
  // step 4 works at the till only; both earlier lines trail, and the till is lit, not "seen"
  const s4 = stepView(c, 'sale', 3);
  assert.deepEqual(Object.keys(s4.trail).sort(), [edge('till', 'stock'), edge('stock', 'printer')].sort());
  assert.deepEqual(s4.seen, ['stock', 'printer']);
});

test('a step that sends data out of the owner\'s system is flagged, and data coming in is not', () => {
  const spec = tiny();
  spec.parts.printer = { label: 'Card processor', kind: 'outside' };
  spec.scenarios[0].steps[2].flow = ['stock>printer'];
  spec.scenarios[0].steps.push({ action: 'read', flow: ['printer>stock'], text: 'The processor answers.' });
  spec.scenarios[0].steps.push({ action: 'think', flow: ['stock<>printer'], text: 'They talk both ways.' });
  const c = compile(spec);
  assert.deepEqual(stepView(c, 'sale', 2).leaves, ['Card processor']);
  assert.deepEqual(stepView(c, 'sale', 4).leaves, []);
  assert.deepEqual(stepView(c, 'sale', 5).leaves, ['Card processor']);
  assert.deepEqual(stepView(c, 'sale', 0).leaves, []);
  // a part can say it is inside, whatever its kind
  spec.parts.printer.outside = false;
  assert.deepEqual(stepView(compile(spec), 'sale', 2).leaves, []);
});

test('a step can show a sample of the real item, its time and what happens if its check fails', () => {
  const spec = tiny();
  Object.assign(spec.scenarios[0].steps[0], {
    carry: { icon: 'receipt', label: '1 sale' },
    item: { title: 'Sale #1042', fields: [['Item', 'Blue mug'], ['Price', '$4.50']], body: ['Paid by card.', 'Thank you.'] },
    time: 'about 1 second',
    ifNot: 'the till shows "card declined" and nothing is saved.',
  });
  const c = compile(spec);
  const v = stepView(c, 'sale', 0);
  assert.equal(v.item.title, 'Sale #1042');
  assert.deepEqual(v.item.fields, [['Item', 'Blue mug'], ['Price', '$4.50']]);
  assert.equal(v.item.body, 'Paid by card.\nThank you.');
  assert.equal(v.item.icon, 'receipt', 'the item takes the tag\'s icon when it names none');
  assert.equal(v.time, 'about 1 second');
  assert.match(v.ifNot, /card declined/);
  const s2 = stepView(c, 'sale', 1);
  assert.equal(s2.item, null);
  assert.equal(s2.time, '');
  assert.equal(s2.ifNot, '');
  // the page receives the item, with its icon drawn as shapes
  const html = renderFragment(spec, 'q');
  const data = JSON.parse(/mount\(document\.getElementById\("q"\), (.*), "q"\);/.exec(html)[1]);
  assert.equal(data.scenarios[0].steps[0].item.fields[1][1], '$4.50');
  assert.match(data.scenarios[0].steps[0].item.icon, /^<(path|rect|circle|line|polyline)/);
  assert.match(html, /class="df-item-card"/);
  assert.match(html, /class="df-play"/);
});

test('a wrong item, time or if-not is refused with a message that names the fault', () => {
  const bad = (extra, pattern) => {
    const spec = tiny();
    Object.assign(spec.scenarios[0].steps[0], extra);
    assert.throws(() => compile(spec), pattern);
  };
  bad({ item: { fields: [] } }, /"item" must have a "title"/);
  bad({ item: { title: 'x', fields: [['only one']] } }, /item field 1 must be \[name, value\]/);
  bad({ item: { title: 'x', fields: Array.from({ length: 9 }, (_, k) => ['f' + k, 'v']) } }, /at most 8/);
  bad({ item: { title: 'x', body: 'y'.repeat(601) } }, /body has 601 characters; 600 fit/);
  bad({ item: { title: 'x', icon: 'nope' } }, /icon "nope" is not in the Lucide set/);
  bad({ time: 'about forty-five seconds, roughly' }, /"time" has 33 characters; 30 fit/);
  bad({ ifNot: 'z'.repeat(161) }, /"ifNot" has 161 characters; 160 fit/);
});

test('the everything-at-once view lists what every line carries, each way, with the steps that send it', () => {
  const data = compile({
    title: 'T', rows: [['a', 'b'], ['c']],
    parts: { a: { label: 'A', kind: 'program' }, b: { label: 'B', kind: 'outside' }, c: { label: 'C', kind: 'store' } },
    lines: [['a', 'b'], ['a', 'c']],
    scenarios: [{ id: 's', label: 'S', steps: [
      { action: 'send', flow: ['a>b'], text: 'A asks B', carry: { icon: 'package', label: 'question' } },
      { action: 'reply', flow: ['b>a'], text: 'B answers A', carry: { icon: 'package', label: 'answer' } },
      { action: 'send', flow: ['a>b'], text: 'A asks B again', carry: { icon: 'package', label: 'question' } },
      { action: 'write', flow: ['a>c'], text: 'A saves the answer to C.' },
      { action: 'think', at: ['a'], text: 'A works alone' },
    ] }],
  });
  const wires = overview(data, 's');
  assert.equal(wires.length, 2, 'only the 2 lines that carry data; the step with no flow adds none');
  const ab = wires[0].sends;
  assert.deepEqual(ab.map((s) => [s.from, s.to, s.label, s.steps]), [['a', 'b', 'question', [1, 3]], ['b', 'a', 'answer', [2]]]);
  assert.notEqual(ab[0].dir, ab[1].dir, 'the two ways along one line are told apart');
  const ac = wires[1].sends;
  assert.deepEqual([ac[0].from, ac[0].to, ac[0].label, ac[0].steps], ['a', 'c', '', [4]]);
  assert.equal(ac[0].text, 'A saves the answer to C.', 'a send with no tag keeps its sentence, so the list can still say what it is');
  assert.throws(() => overview(data, 'nope'), /unknown scenario/);
  // the page carries the switch and the list the view fills
  const html = renderFragment({ title: 'T', rows: [['a', 'b']], parts: { a: { label: 'A', kind: 'program' }, b: { label: 'B', kind: 'outside' } }, lines: [['a', 'b']], scenarios: [{ id: 's', label: 'S', steps: [{ action: 'send', flow: ['a>b'], text: 'x' }] }] }, 'df');
  assert.match(html, /data-view="all"[^>]*>Everything at once</);
  assert.match(html, /class="df-all" hidden/);
});

test('in the everything-at-once view, each tag carries an arrow that points the way its data goes', () => {
  // a line drawn left to right (dx 100): data along it goes right, data against it goes left
  assert.equal(arrowLabel('card charge', 'f', 100, 0), 'card charge \u2192');
  assert.equal(arrowLabel('approved', 'b', 100, 0), '\u2190 approved');
  // a line drawn top to bottom (dy 100): along it is down, against it is up
  assert.equal(arrowLabel('email', 'f', 0, 100), 'email \u2193');
  assert.equal(arrowLabel('reply', 'b', 0, 100), 'reply \u2191');
  // a line drawn right to left or bottom to top flips them
  assert.equal(arrowLabel('a', 'f', -100, 0), '\u2190 a');
  assert.equal(arrowLabel('a', 'f', 0, -100), 'a \u2191');
  // data that goes both ways in one step shows a two-headed arrow
  assert.equal(arrowLabel('text and fields', 'x', 100, 0), 'text and fields \u2194');
  assert.equal(arrowLabel('sync', 'x', 0, 100), 'sync \u2195');
});

test('a line that carries data both ways is split into one lane per direction, set apart from each other', () => {
  const oneWay = lanesOf([{ dir: 'f', label: 'a' }, { dir: 'f', label: 'b' }]);
  assert.equal(oneWay.length, 1);
  assert.equal(oneWay[0].offset, 0, 'a one-way line stays where it is');
  assert.equal(oneWay[0].sends.length, 2);
  const twoWay = lanesOf([{ dir: 'f', label: 'question' }, { dir: 'b', label: 'answer' }, { dir: 'f', label: 'again' }]);
  assert.equal(twoWay.length, 2, 'one lane out, one lane back');
  assert.deepEqual(twoWay.map((l) => l.sends.map((s) => s.label)), [['question', 'again'], ['answer']]);
  assert.ok(Math.abs(twoWay[0].offset - twoWay[1].offset) >= 30, 'the lanes sit far enough apart for a tag on each');
  assert.equal(twoWay[0].offset, -twoWay[1].offset, 'they sit evenly either side of the middle');
  // a send that goes both ways in one step gets its own middle lane
  assert.deepEqual(lanesOf([{ dir: 'f' }, { dir: 'x' }, { dir: 'b' }]).map((l) => l.dir), ['f', 'x', 'b']);
});

test('in the everything-at-once view, a tag never lands on a tag placed before it', () => {
  const placed = [];
  const spots = [{ x: 100, y: 100 }, { x: 100, y: 130 }, { x: 100, y: 160 }];
  const overlap = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
  const first = freeSpot(spots, 120, 26, placed);
  const second = freeSpot(spots, 120, 26, placed);
  const third = freeSpot(spots, 120, 26, placed);
  assert.deepEqual(first, { x: 100, y: 100 }, 'the first tag takes the preferred place');
  assert.notDeepEqual(second, first, 'the second tag moves off the first');
  assert.equal(overlap(placed[0], placed[1]) || overlap(placed[1], placed[2]) || overlap(placed[0], placed[2]), false);
  assert.equal(third.y, 160);
  // a tag far to the side is free to take the preferred place
  assert.deepEqual(freeSpot([{ x: 400, y: 100 }, { x: 400, y: 130 }], 120, 26, placed), { x: 400, y: 100 });
  // with no free place left, it still gets a place instead of vanishing
  assert.deepEqual(freeSpot([{ x: 100, y: 100 }], 120, 26, placed), { x: 100, y: 100 });
});

test('the check names every step that moves data but carries no tag', () => {
  // 18 November 2026: a client's 72 moving steps had no tags, and nothing said so
  const spec = { title: 'T', rows: [['a', 'b']], parts: { a: { label: 'A', kind: 'program' }, b: { label: 'B', kind: 'store' } }, lines: [['a', 'b']],
    scenarios: [{ id: 's', label: 'S', steps: [
      { action: 'send', flow: ['a>b'], text: 'A sends to B', carry: { icon: 'package', label: 'one row' } },
      { action: 'write', flow: ['a>b'], text: 'A writes again' },
      { action: 'think', at: ['a'], text: 'A works alone' },
    ] }] };
  const c = compile(spec);
  assert.equal(c.warnings.length, 1, 'only the moving step with no tag is named; a step with no flow is fine');
  assert.match(c.warnings[0], /scenario "s", step 2 moves data but names nothing/);
  // the public examples carry a tag on every moving step
  assert.deepEqual(compile(example()).warnings, []);
});

test('a book puts several diagrams in one page, one tab each, each working on its own', () => {
  const a = example();
  const b = { ...example(), title: 'Second flow' };
  const html = renderBook({ title: 'Client set', intro: 'All flows', diagrams: [a, b] });
  assert.match(html, /<h1>Client set<\/h1>/);
  assert.equal((html.match(/class="pg-tab"/g) || []).length, 2, 'one tab per diagram');
  assert.match(html, /data-tab="2" aria-pressed="false">Second flow</);
  // each diagram has its own block id, so their steps, links and buttons do not collide
  assert.match(html, /id="d1"/);
  assert.match(html, /id="d2"/);
  assert.equal((html.match(/mount\(document\.getElementById\("d[12]"\)/g) || []).length, 2, 'each diagram is started');
  // the second tab starts hidden off screen, not removed
  assert.match(html, /class="pg-panel pg-off" data-panel="2"/);
  // the credit appears once, at the end
  assert.equal((html.match(/class="df-credit"/g) || []).length, 1);
  // a bad diagram anywhere in the book stops the build before anything is written
  const broken = { ...example(), rows: [['nope']] };
  assert.throws(() => renderBook({ title: 'x', diagrams: [a, broken] }));
  assert.throws(() => renderBook({ title: 'x', diagrams: [] }), /at least 1 diagram/);
});

test('boxes grow to fit their words, share one width per row size, and stop at a cap', () => {
  // 18 November 2026: Jason's diagrams had second lines 1 to 4 characters too long for fixed boxes
  assert.equal(boxWidth(2, ['A'], ['short']), 200, 'short words keep the narrow box');
  const w = boxWidth(2, ['Claude'], ['reads PDFs and writes reports']);
  assert.ok(w > 200 && w >= 29 * 7.2 + 28, `a 29-character second line widens the box to ${w}`);
  assert.equal(boxWidth(3, ['x'.repeat(60)], ['']), 220, 'never wider than the cap');
  const c = compile({ title: 'T', rows: [['a', 'b'], ['c', 'd']], parts: {
    a: { label: 'A', kind: 'program' }, b: { label: 'B', kind: 'outside' },
    c: { label: 'C', kind: 'store', sub: 'reads PDFs and writes reports' }, d: { label: 'D', kind: 'store' } },
    lines: [['a', 'b'], ['a', 'c']], scenarios: [{ id: 's', label: 'S', steps: [{ action: 'send', flow: ['a>b'], text: 'x' }] }] });
  assert.equal(c.nodes.a.w, c.nodes.c.w, 'every box in a row of 2 has the same width');
  assert.ok(c.nodes.a.w >= 29 * 7.2 + 28);
});

test('boxes in a row sit just far enough apart to read the data between them, and no further', () => {
  // 18 November 2026: "boxes should be closer together because it is easier to scan all at once,
  // but just wide enough for the data flow to be easy to see"
  const mk = (label) => compile({ title: 'T', rows: [['a', 'b']], parts: { a: { label: 'A', kind: 'program' }, b: { label: 'B', kind: 'outside' } }, lines: [['a', 'b']],
    scenarios: [{ id: 's', label: 'S', steps: [{ action: 'send', flow: ['a>b'], text: 'x', carry: { icon: 'package', label } }] }] });
  const gapOf = (c) => c.nodes.b.x - (c.nodes.a.x + c.nodes.a.w);
  const short = mk('id');
  const long = mk('x'.repeat(22));
  assert.ok(gapOf(long) > gapOf(short), 'a longer tag gets a wider gap');
  // the longest tag, with its arrow, fits with at least 30 units of line showing on each side
  const tagWide = tagWidth('x'.repeat(22)) + 14;
  assert.ok(gapOf(long) >= tagWide + 60, `gap ${gapOf(long)} holds a ${tagWide} tag with line each side`);
  assert.ok(gapOf(long) <= tagWide + 80, 'and is no wider than that needs');
  assert.ok(gapOf(short) <= 160, 'a short tag keeps the boxes close');
  // the drawing is only as wide as its row: no empty band at either side
  assert.ok(short.nodes.a.x <= 12 && short.width - (short.nodes.b.x + short.nodes.b.w) <= 12);
  // a row of 3 is capped so the drawing stays compact
  assert.equal(gapFor(22, 3), 170);
  assert.equal(gapFor(22, 2), gapOf(long));
});

test('parts outside the owner system get one shaded region when they sit together, and a mark each when they do not', () => {
  const box = (x, y, outside) => ({ x, y, w: 100, h: 80, outside });
  // 2 outside parts stacked on the right, inside parts on the left: one region around the 2
  const r = regionOf([box(0, 0, false), box(300, 0, true), box(0, 200, false), box(300, 200, true)]);
  assert.ok(r, 'a region is drawn');
  assert.ok(r.x < 300 && r.x + r.w > 400 && r.y < 0 && r.y + r.h > 280, 'it holds both outside parts');
  assert.ok(r.y + r.h <= 280 + 10, 'and hugs them: no band below for words');
  assert.ok(r.x > 100, 'it stops short of the inside parts');
  // an inside part between 2 outside parts: no single region is honest
  assert.equal(regionOf([box(300, 0, true), box(300, 200, false), box(300, 400, true)]), null);
  assert.equal(regionOf([box(0, 0, false)]), null, 'no outside parts, no region');
  // on a page: every outside part carries its own OUTSIDE mark inside its box, with or without a region;
  // the region is shading only, with no words in the gaps where lines and tags run
  const spec = (rows) => ({ title: 'T', rows, parts: { a: { label: 'A', kind: 'program' }, b: { label: 'B', kind: 'outside' }, c: { label: 'C', kind: 'outside' }, d: { label: 'D', kind: 'store' } },
    lines: [['a', 'b']], scenarios: [{ id: 's', label: 'S', steps: [{ action: 'send', flow: ['a>b'], text: 'x' }] }] });
  const together = renderFragment(spec([['a', 'b'], ['d', 'c']]), 'df');
  assert.match(together, /class="df-outzone"/);
  assert.doesNotMatch(together, /class="df-outzone-l"/);
  assert.equal((together.match(/class="df-out-l"/g) || []).length, 2);
  assert.match(together, /Red: outside your system/, 'the legend names the shading');
  const split = renderFragment(spec([['b', 'a'], ['d', 'c']]), 'df');
  assert.doesNotMatch(split, /class="df-outzone"/);
  assert.equal((split.match(/class="df-out-l"/g) || []).length, 2, 'each of the 2 outside parts is marked');
});

test('nothing moves unless the reader switches movement on, and never when the computer asks for less', () => {
  assert.equal(moves(false, false), false, 'off by default');
  assert.equal(moves(true, false), true, 'on when the reader asks');
  assert.equal(moves(true, true), false, 'a computer set to reduce motion wins');
  assert.equal(moves(undefined, false), false);
  // the page carries the switch, and it starts off
  const html = renderFragment(example(), 'demo');
  assert.match(html, /class="df-motion" aria-pressed="false"[^>]*>Motion: off</);
});

test('the page explains what a dashed, a faint, a coloured and a grey line mean', () => {
  const html = renderFragment(example(), 'demo');
  assert.match(html, /Bold: data goes along this line in this step/);
  assert.match(html, /Faint: used in an earlier step/);
  assert.match(html, /Coloured: carries data, in the sender's colour/);
  assert.match(html, /Grey: joined, no data in this view/);
});

test('no two parts joined by a line share a colour, so data from each sender can be told apart', () => {
  // 3 programs in a chain, all one kind: the old rule made all 3 the same colour
  const chain = colourParts(['a', 'b', 'c'], { a: 'program', b: 'program', c: 'program' }, [['a', 'b'], ['b', 'c']]);
  assert.equal(chain.a.color, KINDS.program.color, 'the first part keeps its kind colour');
  assert.notEqual(chain.a.color, chain.b.color);
  assert.notEqual(chain.b.color, chain.c.color);
  assert.notEqual(chain.a.color, chain.c.color, 'two parts that both send to b differ too');
  // 2 outside systems that both talk to one shop: their replies must not look alike
  const shop = colourParts(['mail', 'shop', 'pay'], { mail: 'outside', shop: 'program', pay: 'outside' }, [['shop', 'mail'], ['shop', 'pay']]);
  assert.notEqual(shop.mail.color, shop.pay.color);
  // parts with no line between them, and no shared neighbour, keep their kind colour
  const apart = colourParts(['x', 'y'], { x: 'store', y: 'store' }, []);
  assert.equal(apart.x.color, KINDS.store.color);
  assert.equal(apart.y.color, KINDS.store.color);
  // on a real diagram: every line joins 2 different colours, and each box carries its colour on the page
  const c = compile(example());
  c.edges.forEach((e) => assert.notEqual(c.nodes[e.from].color, c.nodes[e.to].color, `${e.from} and ${e.to} share a colour`));
  const html = renderFragment(example(), 'demo');
  Object.values(c.nodes).forEach((n) => assert.ok(html.includes(`style="--c:${n.color};--t:${n.tint}" data-node="${n.id}"`), `${n.id} carries its colour`));
});

test('each step takes the colour of the part that SENDS the data, and its trail remembers earlier senders', () => {
  const spec = {
    title: 'T', rows: [['a', 'b'], ['c']],
    parts: { a: { label: 'A', kind: 'program' }, b: { label: 'B', kind: 'outside' }, c: { label: 'C', kind: 'store' } },
    lines: [['a', 'b'], ['a', 'c']],
    scenarios: [{ id: 's', label: 'S', steps: [
      { action: 'send', flow: ['a>b'], text: 'A sends to B' },
      { action: 'reply', flow: ['b>a'], text: 'B answers A' },
      { action: 'write', flow: ['a>c'], text: 'A saves to C' },
      { action: 'think', at: ['a'], text: 'A works alone' },
    ] }],
  };
  const data = compile(spec);
  assert.equal(stepView(data, 's', 0).focus, 'a', 'the sender, not the receiver (18 November 2026)');
  assert.equal(stepView(data, 's', 1).focus, 'b', 'a reply takes the colour of the part that replies');
  assert.equal(stepView(data, 's', 2).focus, 'a');
  assert.equal(stepView(data, 's', 3).focus, 'a', 'a step with no flow focuses the part that works');
  // at step 3 the a-b line is trail, and it keeps the sender of the latest step that used it
  const v = stepView(data, 's', 2);
  const abEdge = Object.keys(v.trailFocus)[0];
  assert.equal(v.trailFocus[abEdge], 'b');
});

test('between 2 boxes in one row, even the longest tag travels the line; it never stands still beside it', () => {
  // 18 November 2026: tags on side-by-side lines were parked above the line to stop them covering labels.
  // That removed the movement the tag exists to show. The row must leave room for the tag to travel.
  const c = compile({ title: 'T', rows: [['a', 'b']], parts: { a: { label: 'A', kind: 'program' }, b: { label: 'B', kind: 'outside' } }, lines: [['a', 'b']],
    scenarios: [{ id: 's', label: 'S', steps: [{ action: 'send', flow: ['a>b'], text: 'A sends to B', carry: { icon: 'package', label: 'x'.repeat(22) } }] }] });
  const lineLength = c.nodes.b.x - (c.nodes.a.x + c.nodes.a.w);
  const longest = tagWidth(c.scenarios[0].steps[0].carry.label);
  assert.ok(tagRides(lineLength, longest), `a ${longest}-wide tag must ride a ${lineLength}-long line`);
  assert.equal(tagRides(8, longest), false, 'a line far shorter than the tag is the only case that parks it');
});

test('the travelling dot runs the way the data goes, and side-by-side boxes leave room to see it', () => {
  assert.equal(dotPosition(0, 'f'), 0);
  assert.equal(dotPosition(1, 'f'), 1);
  assert.ok(dotPosition(0.25, 'f') < dotPosition(0.75, 'f'), 'a forward dot moves start to end');
  assert.ok(dotPosition(0.25, 'b') > dotPosition(0.75, 'b'), 'a reply dot moves end to start');
  assert.equal(dotPosition(0.5, 'x'), 1);
  assert.equal(dotPosition(0.999, 'x') < 0.01, true, 'a two-way dot comes back');
  assert.equal(dotOpacity(0, 'f'), 0);
  assert.equal(dotOpacity(0.5, 'f'), 1);
  assert.equal(dotOpacity(1, 'b'), 0);
  // two boxes in one row: the gap between them is wide enough for a line, an arrowhead and the dot
  const c = compile({ title: 'T', rows: [['a', 'b']], parts: { a: { label: 'A', kind: 'program' }, b: { label: 'B', kind: 'program' } }, lines: [['a', 'b']], scenarios: [{ id: 's', label: 'S', steps: [{ action: 'send', flow: ['a>b'], text: 'A sends to B' }] }] });
  const [left, right] = [c.nodes.a, c.nodes.b];
  assert.ok(right.x - (left.x + left.w) >= 48, `gap is ${right.x - (left.x + left.w)}`);
});

test('a one-way tag fades in as it leaves and out as it arrives, so it never jumps back to the start', () => {
  assert.equal(tagOpacity(0, 'f', false), 0);
  assert.equal(tagOpacity(1, 'f', false), 0);
  assert.equal(tagOpacity(0.5, 'f', false), 1);
  assert.ok(tagOpacity(0.05, 'b', false) > 0 && tagOpacity(0.05, 'b', false) < 1);
  assert.ok(tagOpacity(0.95, 'f', false) > 0 && tagOpacity(0.95, 'f', false) < 1);
  // the moment the loop restarts, the tag is invisible on both sides of the jump
  assert.ok(tagOpacity(0.999, 'f', false) < 0.01 && tagOpacity(0.001, 'f', false) < 0.01);
  // there-and-back tags and tags that do not move never fade
  assert.equal(tagOpacity(0, 'x', false), 1);
  assert.equal(tagOpacity(0.99, 'f', true), 1);
});

test('every diagram carries the credit link in the lower right unless the description turns it off', () => {
  const on = renderFragment(tiny(), 'c1');
  const credit = /<p class="df-credit">(.*?)<\/p>/.exec(on);
  assert.ok(credit, 'the credit is on the page');
  assert.equal(credit[1].replace(/<[^>]+>/g, ''), 'Made with Dataflowgram by Russell Miller · russellmiller.io · LinkedIn · Free for personal use · Companies: rmiller@zavient.com');
  assert.match(credit[1], /href="https:\/\/www\.linkedin\.com\/in\/russellmiller"/);
  assert.match(credit[1], /href="https:\/\/russellmiller\.io"/);
  assert.match(credit[1], /href="mailto:rmiller@zavient\.com\?subject=Dataflowgram%20licence"/);
  assert.match(renderPage(example()), /class="df-credit"/, 'a whole page carries it too');
  const spec = tiny();
  spec.credit = false;
  assert.ok(!renderFragment(spec, 'c2').includes('class="df-credit"'));
  spec.credit = 'no';
  assert.throws(() => compile(spec), /"credit" must be true or false/);
});

test('a link can open the diagram at one step of one scenario', () => {
  const c = compile(tiny());
  assert.deepEqual(readLink('#df=sale.3', 'df', c), { scenario: 'sale', index: 2 });
  assert.deepEqual(readLink('#other=x.1&df=sale.99', 'df', c), { scenario: 'sale', index: 3 });
  assert.equal(readLink('#df=refund.1', 'df', c), null);
  assert.equal(readLink('#tab', 'df', c), null);
  assert.equal(readLink('#dfx=sale.2', 'df', c), null);
});

test('an icon that holds anything but plain shapes is refused', () => {
  assert.deepEqual(cleanIcon('dot', [['circle', { cx: '12', cy: '12', r: '3', key: 'abc' }]]), [['circle', { cx: '12', cy: '12', r: '3' }]]);
  assert.throws(() => cleanIcon('bad', [['script', {}]]), /shape not allowed: script/);
  assert.throws(() => cleanIcon('bad', [['path', { d: 'M0 0', onload: 'alert(1)' }]]), /attribute not allowed: onload/);
  assert.throws(() => cleanIcon('bad', [['path', { d: 'M0 0"/><script>' }]]), /value not allowed in d/);
  assert.throws(() => cleanIcon('bad', [['path', { d: 'M0 0', 'xlink:href': 'http://x' }]]), /attribute not allowed/);
});
