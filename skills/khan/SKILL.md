---
name: khan
description: Re-explain the current work/topic Khan-Academy-and-Feynman style — plain words, one sustained vivid metaphor, a worked example, diagrams, emoji as concept-markers, easy-to-scan formatting. Never talks down, never hides real complexity. Use when the user says "khan", "explain like Khan Academy", "feynman this", or asks for a from-scratch teaching pass on the current topic.
---

# Khan — teach it, don't just state it

**Announce:** "I'm using the khan skill."

## What this is (and the two traps it kills)

Most "simple explanations" fail in one of two opposite ways:
- **Dumbing down** — real complexity gets deleted so the explanation is easy but wrong-shaped.
  The reader nods along and still can't use the idea.
- **Talking down** — the complexity survives, but wrapped in "as you may know," over-explained
  basics, and a tone that assumes the reader is slow. Insulting AND still hard to follow.

**Khan + Feynman is a third thing: full complexity, fully walkable.** Sal Khan's move is to
build from what a smart beginner already has and walk ONE concrete example step by step,
never skipping to the abstraction first. Richard Feynman's move (the "Feynman Technique") is
sharper: **explain it in plain words with no jargon-as-crutch — and if the plain explanation
reveals a gap, that gap is the real content, not something to paper over.** If you can't say it
plainly, you don't fully understand it yet; find the gap and say so.

Combined: nothing gets deleted, nothing gets condescended. It gets **re-routed through a
metaphor and a worked example** so the hard part is walkable instead of hidden.

## The method — five passes

### 1. Pick ONE sustained metaphor (not a grab-bag)
One vivid, physical, concrete metaphor for the WHOLE topic — not a fresh analogy per
paragraph. Every mechanism in the topic should map onto a piece of the metaphor.

### 2. Build from bedrock (what does the reader already have?)
Start from what's already known — don't re-explain things already flagged as known this
session (check for an explicit "already known" list in context). Add ONE new plain-words layer
at a time. Never open with the abstraction or the jargon term first.

### 3. Walk ONE concrete worked example, step by step
Not "here's how X works in general" — trace an actual instance through the mechanism, the way
Khan works one problem on the board instead of describing the method abstractly. If there's a
real number, computation, or trace available, use the real one, not a made-up placeholder.

### 4. Name the hard part OUT LOUD — never smooth over it
Every real topic has a piece that's genuinely counterintuitive, unresolved, or subtle. Find it
and spotlight it explicitly ("here's the part that's actually tricky, and here's why") instead
of gliding past it for a tidier narrative. If something is a genuinely open question, say so —
a false, tidy resolution is worse than an honest gap.

### 5. Diagram anything with a shape, top to bottom
A flow, a comparison, a hierarchy, a before/after, a timeline → a compact vertical ASCII diagram,
start at the top and result at the bottom, never a paragraph describing the shape in prose.
Keep the same emoji for each actor through the whole story. Tables never teach: a table is a
reference that goes last, after the idea has landed. Never open with a glossary, a role list or a
bullet inventory. Render an SVG only when the user asks for one.

## Output shape

- **Open** with the metaphor in one line — name it before using it.
- **Body**: walk the metaphor + the worked example together. Emoji as CONSISTENT concept
  markers tied to the metaphor (same symbol = same concept every time it appears) — not decoration, not one-off.
- **Flag the hard part** explicitly, its own visually distinct line/section.
- **Close** with what this unlocks or why it mattered for the real work — tie the lesson back
  to the actual task, don't leave it floating as trivia.
- Bullets, short lines, bold load-bearing words throughout — Easy-to-scan formatting is not
  optional here just because the content is a "lesson." A wall of teaching prose is still a
  wall.

## Guardrails (so it's teaching, not either trap)

- **Never delete real complexity to make it simple.** If the true mechanism has five moving
  parts, the metaphor needs five moving parts too — route complexity through the metaphor,
  don't cut it.
- **Never talk down.** No "as you know," no re-explaining what's already established as known,
  no baby-voice tone. Peer-level teaching: assume real intelligence, zero prior exposure to
  THIS specific topic.
- **One metaphor, sustained.** Mixing metaphors mid-explanation defeats the point — the reader
  has to re-orient every time the picture changes.
- **The hard part is the point, not the flaw.** A khan explanation that resolves cleanly with
  no flagged tension probably skipped something — go back and find what's actually subtle.
- **Still terse-per-line even though it's a lesson.** Short sentences, bullets, diagrams. Depth
  of content ≠ length of paragraphs.

## When NOT to use it

A quick factual answer or a one-line status update doesn't need the khan treatment — this is
for when the user explicitly wants to build real understanding of a mechanism, a failure, or a
design, not for routine status turns. If in doubt, it's explicitly triggered by "khan" (or
equivalent phrasing) — don't apply it unprompted to every explanation.

## With Dataflowgram

This skill ships with Dataflowgram. When the dataflowgram skill shows a guess-first sketch, it uses this skill's method: one metaphor carried through every box, one real example followed through every step, and the tricky part named out loud. Use it on its own for any explanation: say "khan" or "explain this like Khan Academy".
