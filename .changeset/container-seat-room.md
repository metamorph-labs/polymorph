---
'@polymorph/recipes': patch
---

Collapsible, Accordion, SplitPane and MasterDetailPage give a field or a Button at the edge of a
region that clips its whole seat shadow, and room for a control's focus mark drawn a
`--pm-space-1` gap outside it. Each region is larger than its content by `--pm-space-2` where the
member owns the space past it, and negative margins take that back, so nothing moves.

- Collapsible's region and Accordion's panel: at both sides. The block axis is unchanged, so the
  height Radix measures and the open and close animations run to are the same. A control at the
  top of an Accordion panel or the bottom of a Collapsible region still has its seat cut there.
- SplitPane: at the seam, inside the divider's column. The outer sides are the edges of the
  region the split fills and get no room, because a pane drawn past them would make that region
  scroll.
- MasterDetailPage: every side of the list pane and the detail with one pane, and in the split
  the list pane's side at the seam and the detail's start side, inside its gutter.
