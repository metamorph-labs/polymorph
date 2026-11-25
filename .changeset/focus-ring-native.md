---
'@polymorph/native': patch
---

**The SwiftUI and Compose focus ring follows the web's placements.** `pmFocusRing` draws the ring
in `border.focusSolid`, which now meets 3:1 on every background and wash, at the new
`focus.offset`, minus the width, so it covers the part's border instead of surrounding it. An
invalid field and OTPInput's caret cell on a wrong code draw it inside the danger border. Compose
also places it by the part's shape, as the web does: inside a solid fill with a gap, in the
fill's label colour (the solid Button, a selected day, the current SectionNav and
TableOfContents item); and around a part that cannot hold the line, `spacing.s1` out in the
focus colour: a control too small for it (Checkbox, Radio, Switch, Slider's thumb, Carousel's
dots) and a part whose box is its text (a link, a tab, a disclosure's trigger, a step, a sort
header). A system whose
`overrides.focus.offset` is 0 or more draws every ring outside, in the focus colour. Compose's
date field takes `border.focusSolid` on its focused border.
