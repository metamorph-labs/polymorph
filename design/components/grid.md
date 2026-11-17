# Grid

A grid of equal tracks for card fields, stat rows and form pairs. It is deliberately simple:
tracks are equal, gaps are tokens, and the archetype or screen decides how many columns, not
breakpoint props on each instance.

## API (delta from `stack.md`)

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `columns` | `1 \| 2 \| 3 \| 4 \| 6 \| 12` | `2` | the **ceiling**, not a guarantee *(container-first: N where the container has room, `ceil(N/2)` in the middle band, 1 below it; the table under "Responsive law")* |
| `gap` / `p` / `px` / `py` / `patch` | as Stack | `gap` also sets row gap | |
| `as` | `'div' \| 'section' \| 'ul'` | `'div'` | |

No `areas` and no per-cell spans. A screen that needs them is an archetype or a `<Bespoke>`
zone. Children fill tracks in order. Tracks use `minmax(0, 1fr)`, so content never overflows
its track, and truncation stays the cell owner's decision.

## Responsive law

`columns` is the most columns this Grid will draw. The width of its **container** decides how
many it draws, never the viewport, because a Grid in a drawer and a Grid on a page have
different widths at the same moment (members adapt to their container, `docs/layout.md`).

| Container width | Columns | `columns=` 1 · 2 · 3 · 4 · 6 · 12 |
| --- | --- | --- |
| ≥ `44rem` | N | 1 · 2 · 3 · 4 · 6 · 12 |
| `28rem`–`44rem` | `ceil(N/2)` | 1 · 1 · 2 · 2 · 3 · 6 |
| < `28rem` | 1 | 1 · 1 · 1 · 1 · 1 · 1 |

`44rem` / `28rem` are rem literals with a comment in the stylesheet, not tokens. A breakpoint
is geometry, not theme. One that scaled with density would change the layout for a user who
only changed how compact their controls are (the shell's reasoning; `docs/layout.md`).

**Mechanism.** The Grid element declares `container-type: inline-size`, the template is
`repeat(12, minmax(0, 1fr))` at every count, and each **child** carries
`grid-column: span 12/N`. This is necessary because a container query is answered by the
nearest *ancestor* container, so no element can size itself from its own width. The tracks are
on the grid, so the grid cannot respond to its own query, but its children can. The spans
change nothing visually, because every count the API allows divides twelve, and so does every
halved count. Twelve tracks with `span 12/N` give exactly the widths and gutters of
`repeat(N, …)`. The only alternative is a wrapper element around every Grid in the system.

There are no breakpoint props, so every screen built on Grid works on a phone without
per-instance changes. Archetypes may set a *region's* count. The Dashboard stat row does, in
its own stylesheet, on the same ladder.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| 2/3/4 columns | six Cards | cells per row *(measured from the boxes, not from `grid-template-columns`, because the template is twelve tracks at every count and the visible row is what matters)* |
| gapped | `gap={5}` | both axes |
| twelve-col | `columns={12}` | — |
| patched | `patch={{ gap: 2 }}` | inventory rung 3 |

`requiredSelectors`: —.

`layout.test.tsx` asserts the ceiling ladder at three container widths for all six counts,
plus the identity above (`12/N` spans = `repeat(N, …)` geometry at full width). A fixture
cannot show a width it was not given, so the container widths are covered by the tests.

Everything else: exactly `stack.md`.
