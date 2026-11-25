---
'@polymorph/recipes': patch
---

A field at the edge of a Dialog's or a Drawer's body draws its whole seat shadow, so its rounded
corners stay round. The body scrolls, and a scroll container cuts what it holds at its padding
edge on both axes, so the body cut the seat at its sides, top and bottom, and the cut shadow
squared off the field's corners. Dialog's body is now larger than its content by `--pm-space-2`
on every side, inside the panel's padding, and its margins take that back, in the card, the
full-screen form and the bottom sheet. Drawer's body already had room at its sides, and takes
the same room at its top and, when a footer follows, at its end. Nothing in the body moves, and
the gaps the specs give are unchanged. ConfirmDialog renders Dialog and takes the same room.
