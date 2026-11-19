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
<meta name="description" content="Interactive, step-by-step data-flow diagrams, built by any AI agent from a short description.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap">
<script>
(function(){try{var q=/[?&]theme=(light|dark)/.exec(location.search);var s=q?q[1]:localStorage.getItem('df-theme');if(s==='light'||s==='dark')document.documentElement.setAttribute('data-df-theme',s);}catch(e){}})();
</script>
<style>
*{box-sizing:border-box}
:root{--wash:linear-gradient(135deg,#e4e2fb 0%,#eceff8 42%,#dff2ee 100%);--bg:#eef0f7;--ink:#141824;--ink2:#596174;--dot:rgba(20,24,36,.075);--g1:rgba(99,102,241,.13);--g2:rgba(20,184,166,.09);--line:rgba(18,24,48,.15);--card:rgba(255,255,255,.93);--glow:0 1px 0 rgba(255,255,255,1) inset,0 1px 3px rgba(18,24,48,.08),0 24px 50px -24px rgba(40,48,110,.42);color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-df-theme="light"]){--wash:none;--bg:#0b0c16;--ink:#e9ebf3;--ink2:#9ca3b8;--dot:rgba(255,255,255,.065);--g1:rgba(124,92,255,.24);--g2:rgba(20,184,166,.10);--line:rgba(255,255,255,.09);--card:rgba(23,25,41,.58);--glow:0 1px 0 rgba(255,255,255,.06) inset,0 24px 60px -30px rgba(0,0,0,.75);color-scheme:dark}}
:root[data-df-theme="dark"]{--wash:none;--bg:#0b0c16;--ink:#e9ebf3;--ink2:#9ca3b8;--dot:rgba(255,255,255,.065);--g1:rgba(124,92,255,.24);--g2:rgba(20,184,166,.10);--line:rgba(255,255,255,.09);--card:rgba(23,25,41,.58);--glow:0 1px 0 rgba(255,255,255,.06) inset,0 24px 60px -30px rgba(0,0,0,.75);color-scheme:dark}
body{margin:0;min-height:100vh;color:var(--ink);font-family:"Inter",ui-sans-serif,system-ui,sans-serif;line-height:1.5;font-size:16px;background-color:var(--bg);
  background-image:radial-gradient(70% 45% at 50% -8%,var(--g1),transparent 70%),radial-gradient(45% 35% at 95% 30%,var(--g2),transparent 70%),radial-gradient(var(--dot) 1px,transparent 1.4px),var(--wash);
  background-size:100% 100%,100% 100%,24px 24px,100% 100%;background-repeat:no-repeat,no-repeat,repeat,no-repeat;background-attachment:fixed,fixed,fixed,fixed}
main{max-width:1080px;margin:0 auto;padding:36px 16px 64px}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px}
.kicker{display:flex;align-items:center;gap:12px;margin:0;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.82rem;letter-spacing:.14em;text-transform:uppercase;color:var(--ink2)}
.kicker::before{content:"";width:34px;height:1.5px;background:currentColor}
h1{font-family:"Inter",ui-sans-serif,system-ui,sans-serif;font-weight:650;font-size:clamp(2.2rem,5vw,3.4rem);line-height:1.05;letter-spacing:-.03em;margin:14px 0 0}
.lede{color:var(--ink2);max-width:680px;margin:14px 0 8px;font-size:1.1rem}
.links{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 0}
.pill{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;color:var(--ink);text-decoration:none;font:inherit;font-size:.95rem;cursor:pointer;
  background:var(--card);border:1px solid var(--line);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.pill.main{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr));gap:22px;margin-top:36px;align-items:start}
.card{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;color:inherit;text-decoration:none;background:var(--card);border:1px solid var(--line);box-shadow:var(--glow);
  -webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%);transition:border-color .15s,transform .15s}
.card:hover{border-color:color-mix(in srgb,var(--ink) 28%,var(--line));transform:translateY(-1px)}
.card img{width:100%;border-radius:8px;border:1px solid var(--line)}
.card b{font-size:1.1rem;font-weight:600;letter-spacing:-.01em;padding:4px 4px 0}
.card span{color:var(--ink2);font-size:.95rem;padding:0 4px 4px}
</style></head>
<body><main>
<div class="top"><p class="kicker">Interactive data flow</p><button type="button" class="pill" id="mode">Light / dark</button></div>
<h1>Dataflowgram</h1>
<p class="lede">Interactive data-flow diagrams for any AI agent. Describe the parts and the steps; get a page where each step lights the line that moves, names what is moving, and shows a sample of the real item. Open an example and press Play.</p>
<div class="links"><a class="pill main" href="https://github.com/russellmiller3/dataflowgram">Get the skill on GitHub</a><a class="pill" href="examples/online-order.html">See an example</a></div>
<div class="grid">
${cards.join('\n')}
</div>
</main>
<script>
document.getElementById('mode').addEventListener('click',function(){var r=document.documentElement;var cur=r.getAttribute('data-df-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var n=cur==='dark'?'light':'dark';r.setAttribute('data-df-theme',n);try{localStorage.setItem('df-theme',n);}catch(e){}});
</script>
</body></html>
`);
console.log('docs built:', names.length, 'examples');
