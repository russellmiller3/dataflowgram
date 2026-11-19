// Tests for the data-flow builder. Each test uses the builder the way a person would and checks the result.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, renderFragment, renderPage, KINDS, ACTIONS } from './dataflow.mjs';
import { stepView, shortText, readLink, tagOpacity } from './runtime.mjs';
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
  assert.match(html, /class="df-node df-k-mail" data-node="inbox"/);
  assert.match(html, /class="df-node df-k-ai" data-node="model"/);
  assert.ok(html.includes(`.df-k-mail{--c:${KINDS.mail.color}`));
  // one arrowhead per action used, in that action's colour
  for (const a of ['send', 'check', 'read', 'think', 'write', 'save', 'reply']) {
    assert.ok(html.includes(`id="demo-m-${a}"`), `arrowhead for ${a}`);
    assert.ok(html.includes(`fill="${ACTIONS[a].color}"`), `colour for ${a}`);
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
  bad((s) => { s.parts.stock.label = 'A label that is far too long to fit'; }, /has 35 characters; a row of 2 fits 19/);
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
  assert.match(on, /<p class="df-credit"><a href="https:\/\/russellmiller\.io" target="_blank" rel="noopener">Made with Dataflowgram · Russell Miller, product manager<\/a><\/p>/);
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
