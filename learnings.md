# Learnings

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
  data moving at all. Fix in the client's files: a tag on every step, and 7 sample items. The skill's rules
  already say every moving step gets a tag; the check does not enforce it yet.
- **A client needs one page, not 7.** New `book` command: several diagrams, one tab each, every diagram
  checked before any is drawn, hidden tabs kept off screen (not removed) so their drawings keep their size.
- **The light theme looked flat beside the dark one.** Fix: a dot grid inside the drawing, boxes tinted 13%
  with a soft shadow in their own colour, a cooler page grey with brighter colour glows.

Tests: 35 of 35 pass (run through Runner).
