---
name: dataflowgram
description: Build an interactive, step-by-step data-flow diagram as one HTML page - boxes for each part of a system, lines between them, and a step list that shows what moves where, in which direction, and why. A tag rides each line naming what moves, a side panel shows a sample of the real item, data that leaves the owner's system is flagged, and a Play button runs the steps. Use when the user asks for a data flow, "how the data travels", "walk me through what happens when...", an interactive diagram of a process, or a step-by-step system explainer.
---

# Data flow with interactive steps

**What it makes.** One HTML page, or a block to paste into a page. The reader presses Next step or Play:

- the line that moves data lights up in the step's colour, with an arrow for the direction;
- a tag with an icon rides the line and names what moves ("Q3 letter PDF", "2 new rows");
- a side panel shows a sample of the real item: the email, the row, the request;
- a red note appears when data leaves the owner's system, such as to a payment provider or an AI model;
- earlier steps stay faintly coloured, so the last step shows the whole path.

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

**Label sizes that fit:** a row of 1 part fits a label of 22 characters, a row of 2 fits 19, a row of 3 fits 14. The second line fits 30, 24 and 17. The check names any label that is too long.

## Credit and licence

Every diagram shows a small credit in its lower right corner, linked to the author's site. The licence (PolyForm Noncommercial 1.0.0 with one added term) requires the credit to stay. Only a commercial licence from the author allows `"credit": false`. Personal and noncommercial use is free; use at or for a company needs a commercial licence from rmiller@zavient.com.

## Rules for a good diagram

- **One step, one action.** If a step both reads and writes, split it into 2 steps.
- **Every step that moves data gets a `carry` tag** naming the thing itself, not the action.
- **Give the steps that matter an `item`.** A real-looking sample is what makes the diagram click.
- **Name what leaves.** If data goes to another company, make that part `outside` so the reader sees the warning.
- **Text is readable:** labels render at about 15 pixels on a computer screen. On a phone the drawing shrinks to fit.

## Tests

`node --test <skill>/scripts/dataflow.test.mjs` runs 21 tests. They step through scenarios and check which line lights and in which direction, the trail, the leaving warning, the side panel, links to a step, the tag fade, the credit line, that boxes do not overlap, that text from the description cannot break the page, and that a wrong description is refused with a message that names the fault.

Icons: [Lucide](https://lucide.dev) 1.75.0, ISC licence, stored in `<skill>/assets/` so no internet is needed. To update them, download the `lucide-static` package and run `node <skill>/scripts/make-icons.mjs <icon-nodes.json> <version>`.
