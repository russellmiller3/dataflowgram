// Builds the live demo pages in docs/ from the example descriptions, and the gallery page that links them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from '../skills/dataflowgram/scripts/dataflow.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ex = path.join(root, 'skills/dataflowgram/examples');
const docs = path.join(root, 'docs');
fs.mkdirSync(path.join(docs, 'examples'), { recursive: true });

const names = ['online-order', 'notes-inbox', 'support-triage', 'sign-up'];
const cards = names.map((n) => {
  const spec = JSON.parse(fs.readFileSync(path.join(ex, n + '.json'), 'utf8'));
  fs.writeFileSync(path.join(docs, 'examples', n + '.html'), renderPage(spec));
  const steps = spec.scenarios.reduce((t, s) => t + s.steps.length, 0);
  return `<a class="card" href="examples/${n}.html"><img src="images/${n}.png" alt="${spec.title}"><b>${spec.title}</b><span>${steps} steps · ${spec.intro}</span></a>`;
});

fs.writeFileSync(path.join(docs, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dataflowgram</title>
<meta name="description" content="Interactive, step-by-step data-flow diagrams, built by Claude from a short description.">
<style>
*{box-sizing:border-box}
body{margin:0;background:#E9EFF6;color:#14233A;font-family:"Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;line-height:1.5;font-size:16px}
main{max-width:1040px;margin:0 auto;padding:32px 16px 60px}
h1{font-size:2rem;line-height:1.2;margin:0}
p{max-width:680px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin-top:24px}
.card{display:flex;flex-direction:column;gap:6px;background:#fff;border:1px solid #C9D4E2;border-radius:4px;padding:12px;color:inherit;text-decoration:none}
.card:hover{border-color:#14233A}
.card img{width:100%;border:1px solid #E1E8F0;border-radius:3px}
.card b{font-size:1.1rem}
.card span{color:#51627A;font-size:.95rem}
a{color:#1D4ED8}
</style></head>
<body><main>
<h1>Dataflowgram</h1>
<p>Interactive data-flow diagrams for Claude. Describe the parts and the steps; get a page where each step lights the line that moves, names what is moving, and shows a sample of the real item. Open an example and press Play.</p>
<p><a href="https://github.com/russellmiller3/dataflowgram">Get the skill on GitHub</a></p>
<div class="grid">
${cards.join('\n')}
</div>
</main></body></html>
`);
console.log('docs built:', names.length, 'examples');
