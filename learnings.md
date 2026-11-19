# Learnings

## 19 November 2026: calmer to read

- **The light page had no depth, and panels blended into it.** Fix: a diagonal colour wash behind the light
  page (lavender to grey to mint), and near-solid white panels (93% opaque, was 74%) with a firmer edge and
  a deeper shadow. The dark page is unchanged.
- **Too much on screen at once.** The key (parts, steps, lines) and the "tap a box" hint now fold behind one
  "Key" button, closed by default. The full step list folds behind "All N steps"; a row of progress dots
  beside "Step 4 of 8" shows where you are. Finished steps in the list get a tick and fade. The step card no
  longer repeats the tag that the drawing already shows. In "Everything at once", each send is one line.

- **Tags did not say which step they belong to.** Every tag on the drawing now starts with a filled number
  badge in the sender's colour: the step number in the step view, every step that sends it in "Everything
  at once" ("1, 3"; a long list shortens to "1, 4 +2"). The gap between side-by-side boxes grew 30 units
  to fit the badge.

- **The step buttons did not match, and Motion sat among them.** Fix: one row of 4 buttons of one size and
  shape, each an icon plus a word (Start over, Back, Play, Next step); Next step is the only filled one.
  Start over goes back to step 1 (the Home key does the same) and greys out on step 1. Motion became a
  labelled switch, "Moving tags: off", below the step list.
- **A later style rule silently beat the new padding**, so "Start over" wrapped onto 2 lines and the row ran
  5 pixels past the panel. Fix: one padding rule, words kept on one line. Checked on a screenshot.
- **On a phone the page ran past the screen edge.** The stacked column was a plain `1fr`, which grows to
  its widest item. Fix: `minmax(0,1fr)`, and the 4 step buttons go 2 by 2 below 480 pixels. Checked inside
  390-pixel frames: headless Chrome keeps a wider minimum window, so a 390-pixel window screenshot lies.

no trigger: design requests from Russell, not a repeated mistake; no single tool action shows them starting.

Tests: 40 of 40 pass.

## 18 November 2026: building it for a real client set (Rellim, 7 diagrams)

- **Fixed-width boxes refused real words.** All 7 of the client's diagrams failed the label check, by 1 to
  4 characters. Fix: a box grows to fit its longest label or second line, up to a cap (320, 280 and 220
  units for rows of 1, 2 and 3). Every box in a row size shares one width, so the drawing stays even.
- **Tall diagrams were shrunk until the text was unreadable.** A height cap made the drawing fit the
  screen, which scaled box text below 13 pixels. Fix: no height cap; the type inside the drawing went up
  (labels 16.5, second lines and tags 14), and the side panel's widest size went from 560 to 440 pixels.
  Measured for the 7 client diagrams at a 1,440-pixel window: labels 15.6 to 20.6 pixels, small text 13.6
  to 17.5 pixels.
- **Words under a shaded region collided with lines.** "OUTSIDE YOUR SYSTEM" sat in the gap below the
  region, where lines and tags run, and a line crossed it. Fix: the region is shading only; each outside
  box carries "OUTSIDE" inside its own top-left corner; the legend names the shading.
- **A client's descriptions had no tags.** 72 data-moving steps carried no `carry`, so the page showed no
  data moving at all. Fix in the client's files: a tag on every step, and 7 sample items. Fix in the
  builder (commit 9131442): `check` now warns, naming each step, when a step moves data with no tag. It
  warns rather than refuses, so existing descriptions still build. Proven: with the warning switched off,
  its test failed. 36 tests pass.
- **A ship went through a refused gate.** The ship gate refused commit 9131442 (no record changed), but the
  command piped the gate into a filter, so the filter's exit status let the merge and push go ahead. The
  record was added straight after, in this entry. Rule: run the ship gate on its own line, never piped.
- **A client needs one page, not 7.** New `book` command: several diagrams, one tab each, every diagram
  checked before any is drawn, hidden tabs kept off screen (not removed) so their drawings keep their size.
- **The light theme looked flat beside the dark one.** Fix: a dot grid inside the drawing, boxes tinted 13%
  with a soft shadow in their own colour, a cooler page grey with brighter colour glows.

Tests: 35 of 35 pass (run through Runner).

## 19 November 2026: no phone layout

- **Russell: "phone view not needed."** These pages are read on a laptop or desktop. Do not test, screenshot or fix
  phone widths. The phone fix already shipped stays, because it costs nothing.

- **People who cannot describe their process got no help.** The skill now has Claude guess first: read what exists, show
  a rough sketch in the chat with `?` on each guess, ask at most 3 questions with choices, then build. People correct a
  picture faster than they describe one from memory. The test count in the skill file was also out of date (21, now 40).
- **The guess-first sketch needed a set shape.** A cramped first example (side-by-side boxes, steps on the lines) was hard to
  scan. The skill and the README now show one shape: one part per line, blank space between parts, numbered steps, side
  trips as one line out and one back, ❓ on guesses, and lettered choices for the questions.
- **The README sketch was too simple to show the method.** It now uses the notes-inbox example: 8 steps, side trips to
  the lists and the AI model, and 3 guesses with lettered questions. Client names stay out of the public README.
- **The sketch was a single column, unlike the finished page.** It now uses the same boxes in the same rows as the page,
  with a numbered arrow for each step, and a separate arrow each way on a two-way line. Plain digits only: emoji and
  circled digits are wider in some fonts and push the lines out of place. Columns checked by a script before shipping.
- **Visual changes go to Russell before they go public.** The page-like sketch was pushed before he saw it; he asked to
  see it first. From now on a look-and-feel change is shown in chat and pushed only after his yes.
- **The guess-first sketch now matches the page and stays straight.** Russell picked the two-sided layout. On screen an
  emoji is 19 pixels where 2 letters are 18, so an emoji left of a line bends that line. Rule: every row a line passes
  through has the same number of emoji to its left; no emoji inside boxes; the gap between side-by-side boxes widens
  until each arrow label fits on its arrow. New checker names every line that would bend; its test failed when the
  checker was broken on purpose. The khan skill now ships in the package, with no personal names. Tests: 41 of 41.
- **The step buttons moved down whenever a step had more text,** so the reader had to click a different spot each
  time. Fix: the buttons sit above the step card, in the same place on every step. Checked on a 1-line and a
  4-line step. Tests: 42 of 42.
- **The copy-install step left out the khan skill.** It copied only the diagram skill. Fix: the README copies both, and
  tells other agents where the khan instructions are.
- **Icons with a rectangle showed as empty squares** (mail, table-2 and 32 others on one client page). The box and tag
  styles fill every rectangle, and that fill covered the icon lines drawn under it. Fix: an icon's own rectangles are
  outlines only. Measured in a browser: 34 of 34 icon rectangles filled before, 0 after. Tests: 43 of 43.
- **A person belongs at the top of the diagram.** On a client tab the person sat in the bottom row, under the hub, so
  the reader started in the middle of the story. New rule in the skill: the person goes in row 1, what they talk to
  directly goes below, then the program and its storage. The check now warns when no person is in the top row; its
  test failed when the warning was switched off. Tests: 44 of 44.
- **The system a person talks to sat off to the side,** so the eye had to hunt for where the person's question went
  (Copilot at the left of its row, under a centred person). Rule: it goes straight below the person, in the same
  column. The check now warns when the first thing a person talks to is not directly below them; it caught 2 more
  diagrams (a client briefing tab and the sign-up example), both fixed. Its test failed with the check switched off.
  Tests: 45 of 45.
- **Every diagram names its source** (Russell: "always source, even if it's a footnote so we dont get
  sharpshooter'd"). New `source` field, shown as a footnote under the diagram; the check warns when it is missing.
  All 4 examples and all 7 client tabs now carry one, with what was added by us marked. Tests: 46 of 46.
- **Outer boxes sat 10 units from the drawing's edge,** so they looked jammed against their frame. Fix: 24 units on every
  side, for every diagram. The spacing test now checks a margin of 20 to 30 units, equal on both sides, top and bottom.
- **A Print button: one page per diagram.** Each page faces the way its drawing does (wider than tall prints sideways),
  shows everything at once, lists every step under the drawing (3 columns sideways, 2 upright), and keeps the source and
  a credit line. The drawing gets shorter as the step list grows, so every page fits. Checked by printing to PDF: the
  7-tab client page gives 7 pages (5 sideways, 2 upright), each example 1 page. First tries spilled 1 to 4 pages: a
  credit pinned to the page edge landed mid-page on upright pages, so each page now carries its own credit line.
  Tests: 47 of 47.
- **Mark up: a reader draws on a diagram and sends it back.** Built on marker.js 3 (linkware, stored in the skill so pages
  work offline). Arrows, circles, boxes, typed notes and pen marks; "Save a copy with my notes" downloads the same page
  with the marks inside; the `notes` command reads each mark and the box it points at. Chosen over a Capsule file because
  Capsule needs its app installed. Checked by hand in a browser: marks drawn, kept, saved in a copy, read back with
  browser storage empty. Faults found and fixed on the way: notes started with the word "Text"; the copy kept the page's
  own button; saved marks did not reappear (they were restored before the editor was ready). Tests: 48 of 48.
- **Page tabs: a book can stand in for a slide deck.** A tab may hold plain page markup (a plan and timeline, screen
  sketches) instead of a diagram, named by `htmlFile` in the book. `printScale` shrinks a long tab to one sheet. Checked by
  printing a 10-tab client page to PDF: first 13 pages (3 page tabs spilled, and their narrow-screen layout stacked the
  cards on paper); with print layouts and scales set, 10 pages. Tests: 49 of 49; the new test fails when the print scale
  is removed.
- **Book tabs stand apart from the page and shimmer on hover.** The old tabs were a see-through fill the same colour
  as the page, so they read as text, not buttons. Now: a solid tinted fill and a firmer edge; under the mouse a moving
  steel-and-teal sheen (first tried pastel opal colours; the owner found them too soft) (still when the computer asks for less motion). Checked in a browser, light and dark. Not yet published:
  a change to how public pages look waits for the owner to see it.
- **Background in blue tones, slower hover sheen.** The page and website wash moved from lavender and indigo to
  blue and teal, in light and dark; the tab hover sheen now takes 8 seconds a pass instead of 3. Owner asked for both.
  README pictures and the moving demo retaken in the new colours.
- **Long step sentences no longer push a diagram onto a second printed page.** The drawing height on paper counted
  steps, not the lines they wrap to. A client tab with 4 walkthroughs and a long source printed on 2 pages. It now
  counts wrapped lines (about 55 characters a line) and the source footnote. Checked: client page 10 tabs = 10 pages;
  each of the 4 examples 1 page. The test fails under the old rule.
- **Walkthrough choices look like tabs; the view switch moved down.** The walkthrough buttons were styled like the
  play controls, so choosing what to watch looked the same as running it. They are now underlined tabs under a
  "Walkthrough" label. "Step by step / Everything at once" moved below the steps, beside "Moving tags", since both only
  change how the diagram is shown. Checked in a browser: switching walkthrough and view both work. Tests 49 of 49.
  README pictures retaken with the new controls.
