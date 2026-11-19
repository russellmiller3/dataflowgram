---
name: dataflowgram
description: Build an interactive, step-by-step data-flow diagram as one HTML page - boxes for each part of a system, lines between them, and a step list that shows what moves where, in which direction, and why. A tag rides each line naming what moves, a side panel shows a sample of the real item, data that leaves the owner's system is flagged, and a Play button runs the steps. Use when the user asks for a data flow, "how the data travels", "walk me through what happens when...", an interactive diagram of a process, or a step-by-step system explainer.
---

# Data flow with interactive steps

**What it makes.** One HTML page, or a block to paste into a page. The reader presses Next step or Play:

- the line that moves data lights up in the colour of the part that sends it, with an arrow for the direction;
- a tag with an icon sits on the line and names what moves ("Q3 letter PDF →", "2 new rows ↓"), with an arrow for its direction;
- nothing moves by default. The "Motion" switch makes the tag travel its line; a computer set to reduce motion keeps it off;
- a side panel shows a sample of the real item: the email, the row, the request;
- a red note appears when data leaves the owner's system, such as to a payment provider or an AI model;
- earlier steps stay faintly coloured, so the last step shows the whole path;
- the "Everything at once" switch shows a still picture: every line lit, every item named on it with an arrow for its direction, and a list of who sends what to whom. A line used both ways is drawn as 2 lanes.

**Colour means "which part".** Each part gets its own colour, and data takes the colour of the part that sends it. No 2 parts joined by a line share a colour, and neither do 2 parts that send to the same part. A part keeps the colour of its kind when that colour is free. The builder does this; do not set colours by hand.

**Why a description file, not hand-written markup.** The builder places every box, spreads the lines so none overlap, checks that every label fits its box, and refuses a step that names a line that does not exist.

## How to use it

`<skill>` below is the folder that holds this file.

1. Write a description file (JSON). Copy one from `<skill>/examples/` and change it.
2. Check it: `node <skill>/scripts/dataflow.mjs check spec.json`
3. Build it:
   - a whole page: `node <skill>/scripts/dataflow.mjs build spec.json out.html`
   - a block for another page: `node <skill>/scripts/dataflow.mjs fragment spec.json block.html <block-id>`. Give each block on one page its own id.
4. Find an icon: `node <skill>/scripts/dataflow.mjs icons <word>` lists Lucide icon names that contain the word.
5. Link to one step: add `#<block-id>=<scenario id>.<step number>` to the page address. A whole page uses the block id `df`.
6. Link to the still picture of everything: add `#<block-id>=all`.
7. Several diagrams in one page, one tab each: write a book file `{ "title": "...", "intro": "...", "diagrams": ["a.json", "b.json"] }` (file names next to the book, or the descriptions themselves), then run `node <skill>/scripts/dataflow.mjs book book.json out.html`. Link to a tab with `#tab=<number>`. Inside a book, diagram number k has the block id `d<k>`.

## The description file

| Field | What it holds |
|---|---|
| `title`, `intro` | Page heading and one line under it |
| `rows` | Part names, top to bottom, 1 to 3 parts in each row |
| `parts` | For each part: `label`, `sub` (second line), `kind`, optional `icon`, `info` (shown when the box is tapped), optional `outside` (true or false) |
| `lines` | Pairs of parts joined by a line: parts side by side in one row, or in neighbouring rows |
| `zones` | Optional dashed frames: `{ "label": "...", "rows": [first, last] }`, rows counted from 1 |
| `scenarios` | Each has `id`, `label` and `steps` |

**Each step:**

| Field | What it holds |
|---|---|
| `action` | One of: start, send, check, read, search, think, write, save, reply. Each has its own colour and icon |
| `text` | What happens. The first sentence is the step's name in the list |
| `flow` | Data that moves: `"a>b"` one way, `"a<>b"` both ways. Or `at`: the part that works with no data moving |
| `carry` | `{ "icon": "...", "label": "..." }`: the tag that rides the line. 22 characters at most |
| `item` | A sample of the real item for the side panel: `{ "title": "...", "fields": [["name", "value"], ...], "body": "..." }` |
| `time` | How long the step takes, such as "about 2 seconds" |
| `ifNot` | What happens when the step's check fails |

**Kinds of part, each with a colour and a default icon:** person, mail, program, ai, store, files, outside, web, output, time. Parts of kind `outside` and `web` count as outside the owner's system; set `"outside": true` on any other part (an AI model at an outside company, say) to flag data sent to it.

**Tags:** the check warns, naming the step, when a step moves data but has no `carry` tag.

**Label sizes that fit:** boxes grow to fit their words, up to a cap. A row of 1 part fits a label of 31 characters, a row of 2 fits 27, a row of 3 fits 22. The second line fits 40, 35 and 27. Shorter words keep the boxes narrow, which keeps the whole diagram easy to take in. The check names any label that is too long.

## Credit and licence

Every diagram shows a small credit in its lower right corner, linked to the author's site. The licence (PolyForm Noncommercial 1.0.0 with one added term) requires the credit to stay. Only a commercial licence from the author allows `"credit": false`. Personal and noncommercial use is free; use at or for a company needs a commercial licence from rmiller@zavient.com.

## When the user cannot describe the process well

Most people cannot list the parts and steps of a process from memory, but they can spot what is wrong in a picture of it. So guess first, show the guess, and let the user correct it:

1. **Read before you ask.** Collect what already exists: code, documents, an email thread, a screenshot, notes from a call. Ask only for what none of these says.
2. **Show a rough sketch in the chat** before you write any description file, in a code block, in the shape below. Use 8 steps at most. Put ❓ on each part or step you guessed.
3. **Ask 3 questions at most, about the ❓ marks only.** Number them, and give each lettered choices, so the user answers "1a 2b 3a". Never ask "describe the process".

The sketch shape keeps it easy to scan:

- One part per line, with its emoji, and one main path from top to bottom.
- A blank line, a `│` and a `▼` between parts, so each part stands alone.
- Each step on its own line, numbered 1️⃣ 2️⃣ 3️⃣, naming what moves.
- A side trip (to an AI model, a payment provider) is 2 lines: one going out `──▶`, one coming back `◀──`. Mark a part run by another company "(outside)".
- At most 60 characters wide. No side-by-side boxes.

```
  📧  Customer
        │
        │   1️⃣  sends an email
        ▼
  📥  support@ inbox
        │
        │   2️⃣  passes the email on
        ▼
  ⚙️  Sorting program   ❓
        │
        │   3️⃣  email text   ──▶  🤖 AI model  (outside)
        │   4️⃣  "urgent" tag ◀──  🤖 AI model
        │
        │   5️⃣  urgent emails only   ❓
        ▼
  👤  On-call person
```

Questions for that sketch: "1. Who handles step 2? a) a program b) a person reads the inbox first", and so on.
4. **Redraw once** if the answers change more than 2 parts or steps. Then build the page.
5. **Keep a guess visible.** If a step is still a guess, say so in its text ("assumed: ...") and list it for the user when you hand over the page.

The finished page is also a check: the user steps through it, and every step they stop at is a correction.

## Starting from a codebase

When the user points at code ("draw the data flow of the checkout folder"), read before you write the description file:

1. **Find where the flow starts:** the route, the form handler, the job, the webhook or the scheduled task the user named.
2. **Follow one request through.** Each call that crosses a boundary is a line: a database read or write, a queue, a file store, another service, an outside company's API, an email or a message sent to a person.
3. **Each boundary is a part.** Name it by what it is to the reader ("Orders table", "Payment provider"), not by its class or file name.
4. **Each crossing is a step,** in the order the code runs. The `carry` tag names the thing sent, taken from the real fields ("$19.00 card charge", "order #1042").
5. **Mark what leaves.** Any part run by another company is `outside`: payment, email, AI model, analytics. Say what data goes to it.
6. **Build each `item` from the real shape:** the actual field names, with made-up values. Never copy real customer data or a secret into the page.
7. **One scenario per path.** The main path first; a failed payment or a retry is a second scenario, or an `ifNot` line on the step.
8. **Say what you could not see.** If a step depends on code or settings you did not read, tell the user; do not invent it.

## Rules for a good diagram

- **One step, one action.** If a step both reads and writes, split it into 2 steps.
- **Every step that moves data gets a `carry` tag** naming the thing itself, not the action.
- **Give the steps that matter an `item`.** A real-looking sample is what makes the diagram click.
- **Name what leaves.** If data goes to another company, make that part `outside` so the reader sees the warning.
- **Text is readable:** labels render at about 15 pixels on a computer screen. On a phone the drawing shrinks to fit.

## Tests

`node --test <skill>/scripts/dataflow.test.mjs` runs 40 tests. They step through scenarios and check which line lights and in which direction, the trail, the leaving warning, the side panel, links to a step, the tag fade, the credit line, that boxes do not overlap, that text from the description cannot break the page, and that a wrong description is refused with a message that names the fault.

Icons: [Lucide](https://lucide.dev) 1.75.0, ISC licence, stored in `<skill>/assets/` so no internet is needed. To update them, download the `lucide-static` package and run `node <skill>/scripts/make-icons.mjs <icon-nodes.json> <version>`.
