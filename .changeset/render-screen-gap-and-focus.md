---
'@polymorph/mcp': patch
---

**`render_screen` reports two more layout faults.**

- `no-gap`: a member that touches another member with nothing between them, in a box that lays its
  children out in flow, as a field placed directly above a Table in a Card does, or a member whose
  own border lies against the inside of a box's border with no inset. A member that paints nothing,
  such as a Table or an Image's frame, a member's own parts, members in a flex or grid container,
  and a bar that runs edge to edge are not reported.
- `unseen-focus`: a control that, given keyboard focus, draws no mark, draws only an outline under
  2px, or draws an outline under 3:1 against what it is drawn on or cut by a box that cannot scroll
  to it. A mark on the box around the control, such as a field's frame, counts.

The page gives each control keyboard focus after the picture is taken, so the pictures are
unchanged, and puts focus and scroll positions back afterwards.
