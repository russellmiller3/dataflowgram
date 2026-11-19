// Mark-up, used the way a reader uses it: real mouse presses, drags and typing in headless Chrome.
// 19 November 2026, owner: "buttons not working again. click button but mouse cursor doesn't change and when you click
// on page it just highlights text. always test first and build tests". The title and intro took no marks and a click
// there selected text, and on a page with no tabs the drawing layer covered the page's own buttons.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderBook, renderPage, readNotes } from './dataflow.mjs';
import { execFileSync } from 'node:child_process';
import { openPage, canDrive, CHROME } from './drive.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const example = () => JSON.parse(fs.readFileSync(path.join(HERE, '..', 'examples', 'notes-inbox.json'), 'utf8'));
const skip = !canDrive() && 'needs Google Chrome and Node 22 or later';
const write = (html) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'df-mk-')), 'page.html'); fs.writeFileSync(f, html); return f; };
const marks = (page) => page.evaluate("JSON.parse(document.getElementById('df-marks').textContent).items || []");

test('a reader marks the title, a diagram and a page tab; every click there shows the crosshair and selects no text', { skip }, async () => {
  const book = { title: 'Deck title', intro: 'Intro words for the deck', diagrams: [example(), { title: 'Plan', intro: 'The plan', html: '<p style="height:300px">Plan text to mark</p>' }] };
  const page = await openPage(write(renderBook(book)));
  try {
    await page.click(...await page.centre('.pg-markup'));
    // every part of the page a reader can see either takes a mark (crosshair) or is a working button
    for (const where of ['.pg-kicker', 'h1', '.lede', '.pg-panel:not(.pg-off) [data-node]', '.pg-panel:not(.pg-off) .pg-panel-lede']) {
      const [x, y] = await page.centre(where);
      const u = await page.under(x, y);
      assert.equal(u && u.cursor, 'crosshair', where + ' shows the crosshair, not ' + JSON.stringify(u));
    }
    for (const button of ['.pg-print', '.pg-theme', '.pg-tab[data-tab="2"]', '.mk-done']) {
      const [x, y] = await page.centre(button);
      assert.ok((await page.under(x, y)).button, button + ' can still be pressed while marking');
    }
    // a Note on the title
    await page.click(...await page.centre('h1'));
    await page.type('rename this');
    assert.equal(await page.selectedText(), '', 'no text highlighted');
    // a Note on a box in the diagram: the first click finishes the open note, the second starts the new one
    const [nx, ny] = await page.centre('.pg-panel:not(.pg-off) [data-node]');
    await page.click(nx, ny + 200);
    await page.click(nx, ny);
    await page.type('why here');
    // Move this: box a thing, then click where it goes; Delete this: box a thing
    await page.click(...await page.centre('.mk-bar [data-tool="move"]'));
    await page.drag(nx - 40, ny - 25, nx + 40, ny + 25);
    await page.click(nx + 150, ny + 120);
    await page.click(...await page.centre('.mk-bar [data-tool="del"]'));
    await page.drag(nx - 40, ny + 80, nx + 40, ny + 130);
    // a Note on a page tab of your own
    await page.click(...await page.centre('.pg-tab[data-tab="2"]'));
    await page.click(...await page.centre('.mk-bar [data-tool="note"]'));
    await page.click(...await page.centre('.pg-panel:not(.pg-off) p'));
    await page.type('move to week 2');
    await page.click(...await page.centre('.mk-done'));
    const items = await marks(page);
    const said = items.map((it) => [it.type, it.anchor, it.text || ''].join(':'));
    assert.deepEqual(said, ['note:head:rename this', 'note:p1:why here', 'move:p1:', 'del:p1:', 'note:p2:move to week 2'], 'every mark was saved where it was made');
    assert.equal(await page.selectedText(), '', 'still no text highlighted');
    assert.equal(await page.evaluate("document.querySelector('.pg-sendnotes').hidden"), false, 'Save a copy shows once there are marks');
    assert.deepEqual(page.errors, [], 'no page errors');
    // reading the copy back names the title mark as being on the title
    const html = await page.evaluate('document.documentElement.outerHTML');
    const notes = readNotes(html, book.diagrams);
    assert.equal(notes[0].diagram, 'Page title and intro');
    assert.equal(notes[0].text, 'rename this');
  } finally { await page.close(); }
});

test('a page with 2 tabs prints as exactly 2 pages, with no page for the title alone', { skip }, async () => {
  // 19 November 2026: making the title markable put it on a printed page of its own (11 pages, not 10)
  const book = { title: 'Deck title', intro: 'Intro words', diagrams: [example(), { title: 'Plan', intro: 'The plan', html: '<p>Plan text</p>' }] };
  const file = write(renderBook(book));
  const pdf = file.replace(/\.html$/, '.pdf');
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=2000', '--print-to-pdf=' + pdf, 'file://' + file], { stdio: 'ignore', timeout: 60000 });
  const pages = (fs.readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
  assert.equal(pages, 2, 'one printed page per tab');
});

test('on a page with no tabs, the page buttons still work while marking', { skip }, async () => {
  const page = await openPage(write(renderPage(example())));
  try {
    await page.click(...await page.centre('.pg-markup'));
    for (const button of ['.pg-markup', '.pg-print', '.pg-theme']) {
      const [x, y] = await page.centre(button);
      assert.ok((await page.under(x, y)).button, button + ' can still be pressed while marking');
    }
    const [x, y] = await page.centre('h1');
    assert.equal((await page.under(x, y)).cursor, 'crosshair', 'the title takes marks');
    await page.click(x, y);
    await page.type('shorter title');
    assert.equal(await page.selectedText(), '');
    const items = await marks(page);
    assert.equal(items.length, 1);
    assert.equal(items[0].text, 'shorter title');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});
