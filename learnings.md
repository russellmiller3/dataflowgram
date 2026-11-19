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
