// Opens a page in headless Google Chrome and uses it the way a person does: real mouse presses, drags and typing,
// sent through Chrome's own remote-control channel (the DevTools protocol). Used by the tests, so a test proves a
// click works rather than that a button exists, and by tools/shoot.mjs to record the moving pictures.
// Needs Google Chrome and Node 22 or later (for its built-in WebSocket). Nothing to install.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const canDrive = () => fs.existsSync(CHROME) && typeof WebSocket === 'function';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openPage(file, { width = 1200, height = 900, hash = '' } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df-drive-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, `--window-size=${width},${height}`, 'about:blank'],
  { stdio: 'ignore' });
  // Chrome writes the port it chose into the profile folder
  let port = 0;
  for (let k = 0; k < 100 && !port; k++) {
    await pause(100);
    try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch (e) { /* not yet */ }
  }
  if (!port) { chrome.kill(); throw new Error('Chrome did not start'); }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  let next = 0;
  const waiting = new Map();
  const errors = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((ok) => { const id = ++next; waiting.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file://' + file + hash });
  await pause(1200);

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'page script failed');
    return r.result.result.value;
  };
  let mx = 0;
  let my = 0;
  const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
  const page = {
    errors,
    evaluate,
    // the middle of the first element a CSS selector finds, scrolled into view, in window pixels
    async centre(selector) {
      const at = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null;
        e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (!at) throw new Error('not on the page: ' + selector);
      return at;
    },
    async moveTo(x, y, steps = 1) {
      for (let k = 1; k <= steps; k++) await mouse('mouseMoved', mx + ((x - mx) * k) / steps, my + ((y - my) * k) / steps, 0);
      mx = x; my = y;
    },
    async click(x, y) { await page.moveTo(x, y); await mouse('mousePressed', x, y, 1); await mouse('mouseReleased', x, y, 0); await pause(60); },
    async drag(x1, y1, x2, y2, steps = 8, onStep) {
      await page.moveTo(x1, y1);
      await mouse('mousePressed', x1, y1, 1);
      for (let k = 1; k <= steps; k++) {
        const x = x1 + ((x2 - x1) * k) / steps;
        const y = y1 + ((y2 - y1) * k) / steps;
        await mouse('mouseMoved', x, y, 1);
        if (onStep) await onStep(k);
      }
      await mouse('mouseReleased', x2, y2, 0);
      mx = x2; my = y2;
      await pause(60);
    },
    async type(text) { await send('Input.insertText', { text }); await pause(30); },
    // what a person sees under the pointer: the element there and the pointer's shape
    async under(x, y) {
      return evaluate(`(() => { const e = document.elementFromPoint(${x}, ${y}); return e ? { tag: e.tagName, cls: String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className), cursor: getComputedStyle(e).cursor, button: !!e.closest('button') } : null; })()`);
    },
    selectedText: () => evaluate('String(window.getSelection())'),
    async shot(file2, clip) {
      const r = await send('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: clip.scale || 1 } } : { format: 'png' });
      fs.writeFileSync(file2, Buffer.from(r.result.data, 'base64'));
    },
    async close() { try { ws.close(); } catch (e) { /* already closed */ } chrome.kill(); await pause(100); fs.rmSync(profile, { recursive: true, force: true }); },
  };
  return page;
}
