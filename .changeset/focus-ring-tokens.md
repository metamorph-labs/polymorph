---
'@polymorph/engine': patch
'@polymorph/theme': patch
---

**The focus tokens place the ring inside the control's edge.** `--pm-focus-width` is 2px at the
`soft` and `standard` temperaments and 3px at `stark` (it was 2, 3 and 4px), and
`--pm-focus-offset` is minus the width at every geometry (it was 0, and 2px at `round`). A new
flag, `--pm-focus-place`, says which side of the edge the ring is on (`inside` or `outside`, read
from the offset; `focus.place` in the token document), and the focus convention branches on it.

**The focus colour meets 3:1.** `border.focusSolid`, the colour the ring is drawn in, is held to
3:1 by the WCAG contrast ratio on every background, on the accent and status washes at rest,
hovered and pressed, and on the selected surfaces, in both modes. It was held to a lightness
difference of 0.08, which let a 2px line reach 2.56:1. A hued palette takes the accent's step 9
where that passes, and otherwise the first later step of the solid ladder that passes in both
modes; an ink palette draws it in the reference's two ring greys swapped, L 0.556 in light mode
and L 0.708 in dark mode. Among the shipped palettes the colour moves for `neutral` and `zinc`
(both modes), and for `cobalt`, `petrol` and `verdigris`, which move one step along the ramp,
to L 0.588 (`cobalt` keeps step 9 in dark mode in the `stark` systems). A pinned
`border.focusSolid` under 3:1 is refused at admission with the measured ratio. `border.focus`,
the half-alpha focus colour, stays a token and a pin with its own floor; nothing in the
vocabulary draws in it.

A system file's `overrides.focus.offset` now takes minus the width, which states the default, or
0 to 4px, which moves every ring outside the control with that much air. It is judged against the
merged width, the file's or the temperament's: an offset further in than the width, or one between
minus the width and 0, is refused with the reason. To restore a ring outside the control, set
`"focus": { "offset": 0 }` or more under `overrides`.

`GEOMETRY_FOCUS_OFFSET` is removed, because the offset no longer depends on geometry.
`focusPx(temperament, overrides.focus)` returns the derived width and offset in px. The pairing
table gains a third kind, `focus`, measured by the WCAG ratio (`minRatio`, `FOCUS_MIN_RATIO`), and
`pairingMeasure` writes any pair's measure and floor as the reports do.
